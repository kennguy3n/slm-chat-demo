package handlers

import "net/http"

// Model is a placeholder for the local-model status / load / unload endpoints
// that ship in Phase 1. Phase 0 returns a static "unloaded" status so the
// frontend's privacy strip can render a believable "On-device" badge.
type Model struct{}

func NewModel() *Model { return &Model{} }

// Status returns a static stubbed model status.
func (h *Model) Status(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"loaded":     false,
		"model":      "gemma-4-e2b",
		"quant":      "q4_k_m",
		"ramUsageMB": 0,
		"sidecar":    "unstarted",
		"phase":      "0",
	})
}
