package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

// AI wires the AI surface (POST /api/ai/route, /run, /stream). It holds an
// inference.Adapter — typically an *inference.InferenceRouter, which itself
// implements Adapter and dispatches across the configured tier-specific
// adapters.
type AI struct {
	adapter inference.Adapter
}

func NewAI(a inference.Adapter) *AI { return &AI{adapter: a} }

// runRequest is the JSON body accepted by /api/ai/route, /api/ai/run and
// /api/ai/stream.
type runRequest struct {
	TaskType  inference.TaskType `json:"taskType"`
	Prompt    string             `json:"prompt,omitempty"`
	ChannelID string             `json:"channelId,omitempty"`
	Model     string             `json:"model,omitempty"`
}

// Route returns the policy decision for an AI call. When the configured
// adapter is an InferenceRouter, the response reflects the real router
// decision (model, tier, reason). Otherwise it falls back to a static
// allow-on-device decision so the privacy strip still has something to
// render.
func (h *AI) Route(w http.ResponseWriter, r *http.Request) {
	body := decodeRunRequest(r)
	if body.TaskType == "" {
		body.TaskType = inference.TaskTypeSummarize
	}

	if router, ok := h.adapter.(*inference.InferenceRouter); ok {
		d := router.Decide(inference.Request{
			TaskType: body.TaskType,
			Prompt:   body.Prompt,
			Model:    body.Model,
		})
		if !d.Allow {
			writeJSON(w, http.StatusOK, map[string]any{
				"decision":          "deny",
				"reason":            d.Reason,
				"computeLocation":   "on_device",
				"redactionRequired": false,
				"dataEgressBytes":   0,
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"decision":          "allow",
			"model":             d.Model,
			"tier":              string(d.Tier),
			"quant":             "q4_k_m",
			"computeLocation":   "on_device",
			"redactionRequired": false,
			"dataEgressBytes":   0,
			"sourcesAllowed":    []string{},
			"reason":            d.Reason,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"decision":          "allow",
		"model":             "gemma-4-e2b",
		"quant":             "q4_k_m",
		"computeLocation":   "on_device",
		"redactionRequired": false,
		"dataEgressBytes":   0,
		"sourcesAllowed":    []string{},
		"reason":            fmt.Sprintf("Adapter %q is the only configured backend.", h.adapter.Name()),
	})
}

// Run executes the inference adapter synchronously and returns its full
// response.
func (h *AI) Run(w http.ResponseWriter, r *http.Request) {
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	body, ok := decodeRunRequestStrict(w, r)
	if !ok {
		return
	}
	if body.TaskType == "" {
		body.TaskType = inference.TaskTypeSummarize
	}
	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  body.TaskType,
		Model:     body.Model,
		Prompt:    body.Prompt,
		ChannelID: body.ChannelID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// Stream executes the inference adapter as a server-sent event (SSE) stream.
// It writes one `data:` frame per chunk and a final `data:{"done":true}` frame
// before flushing and closing.
func (h *AI) Stream(w http.ResponseWriter, r *http.Request) {
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	body, ok := decodeRunRequestStrict(w, r)
	if !ok {
		return
	}
	if body.TaskType == "" {
		body.TaskType = inference.TaskTypeSummarize
	}

	flusher, isFlusher := w.(http.Flusher)
	if !isFlusher {
		writeJSONError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, err := h.adapter.Stream(r.Context(), inference.Request{
		TaskType:  body.TaskType,
		Model:     body.Model,
		Prompt:    body.Prompt,
		ChannelID: body.ChannelID,
	})
	if err != nil {
		writeSSEEvent(w, flusher, map[string]any{"error": err.Error(), "done": true})
		return
	}

	clientGone := r.Context().Done()
	for {
		select {
		case chunk, ok := <-ch:
			if !ok {
				writeSSEEvent(w, flusher, map[string]any{"done": true})
				return
			}
			if chunk.Done {
				writeSSEEvent(w, flusher, map[string]any{"done": true})
				return
			}
			writeSSEEvent(w, flusher, map[string]any{
				"delta": chunk.Delta,
				"done":  false,
			})
		case <-clientGone:
			return
		}
	}
}

// writeSSEEvent encodes data as JSON and writes a single SSE `data:` frame.
func writeSSEEvent(w http.ResponseWriter, flusher http.Flusher, data any) {
	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
	flusher.Flush()
}

// decodeRunRequest decodes the JSON body without writing any error response.
// Used by /api/ai/route which should never 400 on a missing body.
func decodeRunRequest(r *http.Request) runRequest {
	var body runRequest
	if r.Body == nil || r.ContentLength == 0 {
		return body
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	return body
}

// decodeRunRequestStrict decodes the JSON body and writes a 400 if it is
// non-empty but malformed. Returns ok=false if the caller should stop.
func decodeRunRequestStrict(w http.ResponseWriter, r *http.Request) (runRequest, bool) {
	var body runRequest
	if r.Body == nil || r.ContentLength == 0 {
		return body, true
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return body, false
	}
	return body, true
}
