package handlers

import (
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// KApps exposes the KApp object endpoints. Phase 0 ships GET /api/kapps/cards
// (returns the four seeded sample cards from store.seedCards). The Phase 3
// task-extraction and approval-prefill endpoints remain stubbed via
// NotImplemented so the surface in ARCHITECTURE.md section 3.3 is reachable.
type KApps struct {
	kapps *services.KApps
}

func NewKApps(k *services.KApps) *KApps { return &KApps{kapps: k} }

// Cards returns every seeded KApp card. The optional ?channelId=... query
// scopes the response to a single channel, which matches the channel-scoped
// privacy promise in ARCHITECTURE.md section 7.
func (h *KApps) Cards(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	cards := h.kapps.Cards(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func (h *KApps) NotImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"status": "not_implemented",
		"phase":  "3",
	})
}
