package handlers

import "net/http"

// Artifacts is a placeholder for the Phase 3 Artifacts endpoints (PRD/RFC
// drafting and publishing). Phase 0 only stubs the surface.
type Artifacts struct{}

func NewArtifacts() *Artifacts { return &Artifacts{} }

func (h *Artifacts) NotImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"status": "not_implemented",
		"phase":  "3",
	})
}
