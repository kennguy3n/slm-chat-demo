package handlers

import "net/http"

// KApps is a placeholder for the Phase 3 KApps endpoints (tasks, approvals,
// forms). Phase 0 only stubs the surface.
type KApps struct{}

func NewKApps() *KApps { return &KApps{} }

func (h *KApps) NotImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"status": "not_implemented",
		"phase":  "3",
	})
}
