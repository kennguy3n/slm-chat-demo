package handlers

import "net/http"

// AI is a placeholder for the AI policy / runtime endpoints introduced in
// Phase 1 (POST /api/ai/route, /api/ai/run, /api/ai/stream). Phase 0 only
// exposes a no-op stub so the route surface in ARCHITECTURE.md section 3.3 is
// reachable.
type AI struct{}

func NewAI() *AI { return &AI{} }

func (h *AI) NotImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"status": "not_implemented",
		"phase":  "1",
	})
}
