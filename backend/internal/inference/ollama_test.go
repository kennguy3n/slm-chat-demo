package inference_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

func TestOllamaAdapterName(t *testing.T) {
	a := inference.NewOllamaAdapter("")
	if a.Name() != "ollama" {
		t.Errorf("expected name=ollama, got %q", a.Name())
	}
}

func TestOllamaAdapterRunMapsResponseFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/generate" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method %s", r.Method)
		}
		var body struct {
			Model  string `json:"model"`
			Prompt string `json:"prompt"`
			Stream bool   `json:"stream"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if body.Stream {
			t.Errorf("expected stream=false")
		}
		if body.Model != "gemma-4-e2b" {
			t.Errorf("expected default model, got %q", body.Model)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model":          body.Model,
			"response":       "Hello, world!",
			"done":           true,
			"eval_count":     17,
			"total_duration": int64(150 * time.Millisecond),
		})
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	resp, err := a.Run(context.Background(), inference.Request{
		TaskType: inference.TaskTypeSummarize,
		Prompt:   "summarize",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if !resp.OnDevice {
		t.Errorf("expected onDevice=true")
	}
	if resp.Output != "Hello, world!" {
		t.Errorf("unexpected output %q", resp.Output)
	}
	if resp.TokensUsed != 17 {
		t.Errorf("expected eval_count=17, got %d", resp.TokensUsed)
	}
	if resp.LatencyMS != 150 {
		t.Errorf("expected latency=150ms, got %d", resp.LatencyMS)
	}
	if resp.Model != "gemma-4-e2b" {
		t.Errorf("expected default model echoed back, got %q", resp.Model)
	}
}

func TestOllamaAdapterRunRespectsModelOverride(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model string `json:"model"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Model != "gemma-4-e4b" {
			t.Errorf("expected override model gemma-4-e4b, got %q", body.Model)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"model": body.Model, "response": "ok", "done": true,
		})
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	resp, err := a.Run(context.Background(), inference.Request{
		TaskType: inference.TaskTypeDraftArtifact,
		Model:    "gemma-4-e4b",
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if resp.Model != "gemma-4-e4b" {
		t.Errorf("expected response model=gemma-4-e4b, got %q", resp.Model)
	}
}

func TestOllamaAdapterRunReturnsErrorOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"boom"}`))
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	_, err := a.Run(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error on 500 response")
	}
}

func TestOllamaAdapterRunReturnsErrorOnBadJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "not json")
	}))
	defer srv.Close()
	a := inference.NewOllamaAdapter(srv.URL)
	_, err := a.Run(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error on bad JSON")
	}
}

func TestOllamaAdapterRunReturnsErrorWhenOllamaDown(t *testing.T) {
	a := inference.NewOllamaAdapter("http://127.0.0.1:1") // unroutable port
	a.HTTPClient = &http.Client{Timeout: 200 * time.Millisecond}
	_, err := a.Run(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error when ollama is down")
	}
}

func TestOllamaAdapterRunRespectsContextCancellation(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(2 * time.Second):
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := a.Run(ctx, inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error when context cancelled")
	}
}

func TestOllamaAdapterStreamProducesChunksAndDoneSentinel(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Stream bool `json:"stream"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if !body.Stream {
			t.Errorf("expected stream=true")
		}
		w.Header().Set("Content-Type", "application/x-ndjson")
		flusher, _ := w.(http.Flusher)
		frames := []string{
			`{"response":"Hello","done":false}`,
			`{"response":", ","done":false}`,
			`{"response":"world!","done":false}`,
			`{"response":"","done":true,"eval_count":3}`,
		}
		for _, f := range frames {
			fmt.Fprintln(w, f)
			if flusher != nil {
				flusher.Flush()
			}
		}
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	ch, err := a.Stream(context.Background(), inference.Request{
		TaskType: inference.TaskTypeSummarize,
		Prompt:   "hi",
	})
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	var deltas []string
	gotDone := false
	for c := range ch {
		if c.Done {
			gotDone = true
			continue
		}
		deltas = append(deltas, c.Delta)
	}
	if !gotDone {
		t.Errorf("expected a final Done chunk")
	}
	got := strings.Join(deltas, "")
	if got != "Hello, world!" {
		t.Errorf("unexpected concatenated stream output %q", got)
	}
}

func TestOllamaAdapterStreamErrorsOnHTTPFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	a := inference.NewOllamaAdapter(srv.URL)
	_, err := a.Stream(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error from Stream on HTTP failure")
	}
}

func TestOllamaAdapterStreamSkipsMalformedFrames(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "garbage line")
		fmt.Fprintln(w, `{"response":"good","done":false}`)
		fmt.Fprintln(w, `{"done":true}`)
	}))
	defer srv.Close()
	a := inference.NewOllamaAdapter(srv.URL)
	ch, err := a.Stream(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	var got []string
	doneSeen := false
	for c := range ch {
		if c.Done {
			doneSeen = true
			continue
		}
		got = append(got, c.Delta)
	}
	if !doneSeen {
		t.Errorf("expected done sentinel")
	}
	if len(got) != 1 || got[0] != "good" {
		t.Errorf("expected one good chunk, got %v", got)
	}
}

func TestOllamaAdapterPing(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.URL.Path != "/api/tags" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"models":[]}`))
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	if err := a.Ping(context.Background()); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if hits != 1 {
		t.Errorf("expected 1 hit on /api/tags, got %d", hits)
	}
}

func TestOllamaAdapterPingErrorsWhenDaemonDown(t *testing.T) {
	a := inference.NewOllamaAdapter("http://127.0.0.1:1")
	a.HTTPClient = &http.Client{Timeout: 100 * time.Millisecond}
	if err := a.Ping(context.Background()); err == nil {
		t.Fatal("expected ping to fail when ollama is unreachable")
	}
}

func TestOllamaAdapterStatusReturnsLoadedFromPS(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"models":[{"name":"gemma-4-e2b","model":"gemma-4-e2b:latest","size":4294967296}]}`))
	}))
	defer srv.Close()
	a := inference.NewOllamaAdapter(srv.URL)
	st, err := a.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if gotPath != "/api/ps" {
		t.Errorf("expected status to hit /api/ps, got %q", gotPath)
	}
	if !st.Loaded {
		t.Errorf("expected loaded=true")
	}
	if st.Model != "gemma-4-e2b" {
		t.Errorf("expected model gemma-4-e2b, got %q", st.Model)
	}
	if st.Sidecar != "running" {
		t.Errorf("expected sidecar=running, got %q", st.Sidecar)
	}
	if st.RAMUsageMB != 4096 {
		t.Errorf("expected ramUsageMB=4096 (4 GiB), got %d", st.RAMUsageMB)
	}
}

func TestOllamaAdapterStatusReportsUnloadedWhenPSEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"models":[]}`))
	}))
	defer srv.Close()
	a := inference.NewOllamaAdapter(srv.URL)
	st, err := a.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if st.Loaded {
		t.Errorf("expected loaded=false when /api/ps reports no resident models")
	}
	if st.Sidecar != "running" {
		t.Errorf("expected sidecar=running, got %q", st.Sidecar)
	}
}

func TestOllamaAdapterStatusReportsStoppedWhenDaemonDown(t *testing.T) {
	a := inference.NewOllamaAdapter("http://127.0.0.1:1")
	a.HTTPClient = &http.Client{Timeout: 100 * time.Millisecond}
	st, err := a.Status(context.Background())
	if err != nil {
		t.Fatalf("status: %v", err)
	}
	if st.Sidecar != "stopped" {
		t.Errorf("expected sidecar=stopped, got %q", st.Sidecar)
	}
}

func TestOllamaAdapterUnloadRequiresModel(t *testing.T) {
	a := inference.NewOllamaAdapter("http://127.0.0.1")
	if err := a.Unload(context.Background(), ""); err == nil {
		t.Fatal("expected error when model is empty")
	}
}

func TestOllamaAdapterLoadAndUnloadHitExpectedEndpoints(t *testing.T) {
	var loadHit, unloadHit bool
	var unloadKeepAlive *int
	var unloadDeleteSeen bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/generate":
			var body struct {
				Model     string `json:"model"`
				Prompt    string `json:"prompt"`
				Stream    bool   `json:"stream"`
				KeepAlive *int   `json:"keep_alive"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.KeepAlive != nil && *body.KeepAlive == 0 {
				unloadHit = true
				unloadKeepAlive = body.KeepAlive
			} else {
				loadHit = true
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"done": true})
		case r.Method == http.MethodDelete && r.URL.Path == "/api/delete":
			// Hitting /api/delete from Unload would be destructive (it removes
			// the model from disk). The adapter MUST NOT call this endpoint.
			unloadDeleteSeen = true
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()

	a := inference.NewOllamaAdapter(srv.URL)
	if err := a.Load(context.Background(), "gemma-4-e2b"); err != nil {
		t.Fatalf("load: %v", err)
	}
	if err := a.Unload(context.Background(), "gemma-4-e2b"); err != nil {
		t.Fatalf("unload: %v", err)
	}
	if unloadDeleteSeen {
		t.Fatal("Unload must NOT call DELETE /api/delete \u2014 that would permanently remove the model from disk")
	}
	if unloadKeepAlive == nil || *unloadKeepAlive != 0 {
		t.Errorf("expected Unload to POST /api/generate with keep_alive=0, got %v", unloadKeepAlive)
	}
	if !loadHit || !unloadHit {
		t.Errorf("expected load + unload to hit expected endpoints (load=%v, unload=%v)", loadHit, unloadHit)
	}
}

// Sanity check: OllamaAdapter satisfies the Adapter interface.
func TestOllamaAdapterSatisfiesAdapter(t *testing.T) {
	var a inference.Adapter = inference.NewOllamaAdapter("")
	if a == nil {
		t.Fatal("expected non-nil adapter")
	}
}

// Compile-time check that Status/Load/Unload satisfy the StatusProvider/Loader interfaces.
var _ inference.StatusProvider = (*inference.OllamaAdapter)(nil)
var _ inference.Loader = (*inference.OllamaAdapter)(nil)
var _ = errors.New // keep imports clean if compiler removes errors usage
