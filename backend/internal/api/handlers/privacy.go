package handlers

import "net/http"

// Privacy is a placeholder for the egress-preview endpoint that ships in
// Phase 1. Phase 0 always reports zero egress.
type Privacy struct{}

func NewPrivacy() *Privacy { return &Privacy{} }

func (h *Privacy) EgressPreview(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"egressBytes": 0,
		"sources":     []string{},
		"phase":       "0",
	})
}
