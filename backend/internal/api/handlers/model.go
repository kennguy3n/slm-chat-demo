package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

// Model owns the /api/model/{status,load,unload} endpoints. When a real
// adapter (e.g. Ollama) is configured it returns live status; otherwise it
// falls back to the static Phase 0 stub so the privacy strip can still
// render a believable "On-device" badge.
type Model struct {
	provider     inference.StatusProvider
	loader       inference.Loader
	defaultModel string
	defaultQuant string
}

// NewModel constructs a Model handler. provider/loader may be nil; the
// handler returns the static stub when they are.
func NewModel(provider inference.StatusProvider, loader inference.Loader, defaultModel, defaultQuant string) *Model {
	if defaultModel == "" {
		defaultModel = "gemma-4-e2b"
	}
	if defaultQuant == "" {
		defaultQuant = "q4_k_m"
	}
	return &Model{
		provider:     provider,
		loader:       loader,
		defaultModel: defaultModel,
		defaultQuant: defaultQuant,
	}
}

// Status returns the current model state. Reads live data from the
// configured StatusProvider when available; falls back to a deterministic
// stub otherwise.
func (h *Model) Status(w http.ResponseWriter, r *http.Request) {
	if h.provider != nil {
		st, err := h.provider.Status(r.Context())
		if err == nil {
			if st.Model == "" {
				st.Model = h.defaultModel
			}
			if st.Quant == "" {
				st.Quant = h.defaultQuant
			}
			writeJSON(w, http.StatusOK, st)
			return
		}
	}
	writeJSON(w, http.StatusOK, inference.ModelStatus{
		Loaded:     false,
		Model:      h.defaultModel,
		Quant:      h.defaultQuant,
		RAMUsageMB: 0,
		Sidecar:    "unstarted",
	})
}

// loadRequest is the JSON body accepted by /api/model/load and /api/model/unload.
type loadRequest struct {
	Model string `json:"model,omitempty"`
}

// Load asks the configured Loader (typically OllamaAdapter) to preload the
// model. Returns 200 on success, 503 when no loader is configured.
func (h *Model) Load(w http.ResponseWriter, r *http.Request) {
	if h.loader == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "no model loader configured")
		return
	}
	body := decodeLoadBody(r)
	if body.Model == "" {
		body.Model = h.defaultModel
	}
	if err := h.loader.Load(r.Context(), body.Model); err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"loaded": true, "model": body.Model})
}

// Unload asks the configured Loader to free the model from memory.
func (h *Model) Unload(w http.ResponseWriter, r *http.Request) {
	if h.loader == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "no model loader configured")
		return
	}
	body := decodeLoadBody(r)
	if body.Model == "" {
		body.Model = h.defaultModel
	}
	if err := h.loader.Unload(r.Context(), body.Model); err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"loaded": false, "model": body.Model})
}

func decodeLoadBody(r *http.Request) loadRequest {
	var body loadRequest
	if r.Body == nil || r.ContentLength == 0 {
		return body
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	return body
}
