package inference

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultOllamaBaseURL is the canonical address of a local Ollama daemon.
const DefaultOllamaBaseURL = "http://localhost:11434"

// OllamaAdapter speaks to a local Ollama daemon via its HTTP API. It
// implements the Adapter interface and reports OnDevice=true since the
// daemon runs on the same host as the backend.
type OllamaAdapter struct {
	BaseURL    string
	Model      string
	HTTPClient *http.Client
}

// NewOllamaAdapter constructs an adapter pointed at baseURL. Pass an empty
// string to use DefaultOllamaBaseURL. The default model is "gemma-4-e2b" so
// the demo's privacy strip shows the E2B tier.
func NewOllamaAdapter(baseURL string) *OllamaAdapter {
	if baseURL == "" {
		baseURL = DefaultOllamaBaseURL
	}
	return &OllamaAdapter{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Model:      "gemma-4-e2b",
		HTTPClient: &http.Client{Timeout: 0}, // streaming may be long-lived; rely on context for cancellation
	}
}

// Name implements Adapter.
func (o *OllamaAdapter) Name() string { return "ollama" }

// ollamaGenerateRequest is the body POSTed to /api/generate.
type ollamaGenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

// ollamaGenerateResponse is one frame of /api/generate output. When
// stream=false the daemon returns a single frame with Done=true; when
// stream=true the daemon returns NDJSON with one frame per token.
type ollamaGenerateResponse struct {
	Model         string `json:"model"`
	Response      string `json:"response"`
	Done          bool   `json:"done"`
	EvalCount     int    `json:"eval_count,omitempty"`
	TotalDuration int64  `json:"total_duration,omitempty"` // nanoseconds
	Error         string `json:"error,omitempty"`
}

// ollamaTagsResponse is the body of /api/tags.
type ollamaTagsResponse struct {
	Models []struct {
		Name string `json:"name"`
	} `json:"models"`
}

// Run implements Adapter. It POSTs to {base}/api/generate with stream=false,
// parses the single-frame response, and maps it to inference.Response.
func (o *OllamaAdapter) Run(ctx context.Context, req Request) (Response, error) {
	model := req.Model
	if model == "" {
		model = o.Model
	}
	body, err := json.Marshal(ollamaGenerateRequest{
		Model:  model,
		Prompt: req.Prompt,
		Stream: false,
	})
	if err != nil {
		return Response{}, fmt.Errorf("ollama: marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return Response{}, fmt.Errorf("ollama: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return Response{}, fmt.Errorf("ollama: do request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return Response{}, fmt.Errorf("ollama: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	var frame ollamaGenerateResponse
	if err := json.NewDecoder(resp.Body).Decode(&frame); err != nil {
		return Response{}, fmt.Errorf("ollama: decode response: %w", err)
	}
	if frame.Error != "" {
		return Response{}, fmt.Errorf("ollama: %s", frame.Error)
	}
	return Response{
		TaskType:   req.TaskType,
		Model:      model,
		Output:     frame.Response,
		TokensUsed: frame.EvalCount,
		LatencyMS:  int(time.Duration(frame.TotalDuration).Milliseconds()),
		OnDevice:   true,
	}, nil
}

// Stream implements Adapter. It POSTs to {base}/api/generate with stream=true
// and reads NDJSON frames. Each frame's Response is forwarded as a Delta;
// the final Done=true frame is forwarded as a sentinel chunk before the
// channel is closed.
func (o *OllamaAdapter) Stream(ctx context.Context, req Request) (<-chan StreamChunk, error) {
	model := req.Model
	if model == "" {
		model = o.Model
	}
	body, err := json.Marshal(ollamaGenerateRequest{
		Model:  model,
		Prompt: req.Prompt,
		Stream: true,
	})
	if err != nil {
		return nil, fmt.Errorf("ollama: marshal stream request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("ollama: build stream request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama: do stream request: %w", err)
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		return nil, fmt.Errorf("ollama: stream HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	out := make(chan StreamChunk, 8)
	go func() {
		defer close(out)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		// Token streams can be long; bump the buffer to 1 MiB per line.
		scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
			}
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var frame ollamaGenerateResponse
			if err := json.Unmarshal([]byte(line), &frame); err != nil {
				// Drop malformed lines rather than failing the whole stream.
				continue
			}
			if frame.Error != "" {
				return
			}
			if frame.Response != "" {
				select {
				case out <- StreamChunk{Delta: frame.Response, Done: false}:
				case <-ctx.Done():
					return
				}
			}
			if frame.Done {
				select {
				case out <- StreamChunk{Done: true}:
				case <-ctx.Done():
				}
				return
			}
		}
	}()
	return out, nil
}

// Ping calls GET {base}/api/tags to check whether the Ollama daemon is
// reachable. It returns a non-nil error when the daemon is unreachable or
// returns a non-2xx status.
func (o *OllamaAdapter) Ping(ctx context.Context) error {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/api/tags", nil)
	if err != nil {
		return fmt.Errorf("ollama: build ping request: %w", err)
	}
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return fmt.Errorf("ollama: ping: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ollama: ping HTTP %d", resp.StatusCode)
	}
	return nil
}

// Status returns a snapshot of the daemon's loaded models, if any. The first
// model in the list is reported as the active one. Status is what /api/model/status
// exposes when an OllamaAdapter is wired in.
func (o *OllamaAdapter) Status(ctx context.Context) (ModelStatus, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, o.BaseURL+"/api/tags", nil)
	if err != nil {
		return ModelStatus{}, fmt.Errorf("ollama: build tags request: %w", err)
	}
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return ModelStatus{Sidecar: "stopped", Model: o.Model}, nil
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return ModelStatus{Sidecar: "stopped", Model: o.Model}, nil
	}
	var tags ollamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return ModelStatus{}, fmt.Errorf("ollama: decode tags: %w", err)
	}
	loaded := len(tags.Models) > 0
	model := o.Model
	if loaded {
		model = tags.Models[0].Name
	}
	return ModelStatus{
		Loaded:  loaded,
		Model:   model,
		Quant:   "q4_k_m",
		Sidecar: "running",
	}, nil
}

// Load issues a small generate call with stream=false to force Ollama to
// load the model into memory. Returns nil on success. Phase 1 keeps the
// implementation deliberately simple — no /api/pull retries.
func (o *OllamaAdapter) Load(ctx context.Context, model string) error {
	if model == "" {
		model = o.Model
	}
	body, err := json.Marshal(ollamaGenerateRequest{Model: model, Prompt: "", Stream: false})
	if err != nil {
		return err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return fmt.Errorf("ollama: load: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ollama: load HTTP %d", resp.StatusCode)
	}
	return nil
}

// Unload sends a DELETE to /api/delete for the named model. Returns nil on
// success.
func (o *OllamaAdapter) Unload(ctx context.Context, model string) error {
	if model == "" {
		return errors.New("ollama: unload requires a model name")
	}
	body, _ := json.Marshal(map[string]string{"name": model})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, o.BaseURL+"/api/delete", bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := o.client().Do(httpReq)
	if err != nil {
		return fmt.Errorf("ollama: unload: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ollama: unload HTTP %d", resp.StatusCode)
	}
	return nil
}

func (o *OllamaAdapter) client() *http.Client {
	if o.HTTPClient != nil {
		return o.HTTPClient
	}
	return http.DefaultClient
}

// ModelStatus is the shape returned by Status() and surfaced via
// /api/model/status. It is also used by the frontend's DeviceCapabilityPanel.
type ModelStatus struct {
	Loaded     bool   `json:"loaded"`
	Model      string `json:"model"`
	Quant      string `json:"quant"`
	RAMUsageMB int    `json:"ramUsageMB"`
	Sidecar    string `json:"sidecar"`
}

// StatusProvider is implemented by adapters that can report a live model
// status (the Ollama adapter does; the mock does not). The model handler
// uses this interface to decide whether to return live or stub data.
type StatusProvider interface {
	Status(ctx context.Context) (ModelStatus, error)
}

// Loader is implemented by adapters that support loading/unloading models.
type Loader interface {
	Load(ctx context.Context, model string) error
	Unload(ctx context.Context, model string) error
}
