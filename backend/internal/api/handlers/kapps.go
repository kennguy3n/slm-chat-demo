package handlers

import (
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// KApps exposes the KApp object endpoints. The Phase 0 backend is data-
// only: GET /api/kapps/cards returns the four seeded sample cards from
// store.seedCards. Inference-driven flows (POST /api/kapps/tasks/extract,
// approval prefill) moved to the Electron main process — see
// frontend/electron/inference/tasks.ts and ipc-handlers.ts.
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
