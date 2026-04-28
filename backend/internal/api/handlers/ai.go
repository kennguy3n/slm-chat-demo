package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

// AI wires the Phase 0 AI surface (POST /api/ai/route, /run, /stream). It
// holds an inference.Adapter so the handlers can return realistic mocked
// outputs from MockAdapter without depending on any real local sidecar.
type AI struct {
	adapter inference.Adapter
}

func NewAI(a inference.Adapter) *AI { return &AI{adapter: a} }

// runRequest is the JSON body accepted by /api/ai/run and /api/ai/stream.
type runRequest struct {
	TaskType  inference.TaskType `json:"taskType"`
	Prompt    string             `json:"prompt,omitempty"`
	ChannelID string             `json:"channelId,omitempty"`
	Model     string             `json:"model,omitempty"`
}

// Route returns the policy decision for an AI call. Phase 0 hardcodes the
// allow-on-device-zero-egress decision so the privacy strip can wire
// directly to it. Phase 1 plugs in the real AI policy engine described in
// ARCHITECTURE.md section 5.
func (h *AI) Route(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"decision":          "allow",
		"model":             "gemma-4-e2b",
		"quant":             "q4_k_m",
		"computeLocation":   "on_device",
		"redactionRequired": false,
		"dataEgressBytes":   0,
		"sourcesAllowed":    []string{},
		"phase":             "0",
	})
}

// Run executes the inference adapter synchronously and returns its full
// response. Phase 0 is wired to MockAdapter; Phase 1 swaps in the real
// adapter chosen by the policy engine.
func (h *AI) Run(w http.ResponseWriter, r *http.Request) {
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	var body runRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
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

// Stream is wired to MockAdapter for Phase 0. Real SSE token streaming lands
// in Phase 1; the Phase-0 stub returns the same shape as /run so the
// frontend can develop against the same response envelope.
func (h *AI) Stream(w http.ResponseWriter, r *http.Request) {
	h.Run(w, r)
}
