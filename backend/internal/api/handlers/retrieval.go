package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Retrieval exposes the Phase 5 per-channel retrieval index:
//
//	POST /api/channels/{channelId}/index   — (re-)build the channel's index
//	GET  /api/channels/{channelId}/search  — keyword search the channel index
//
// Indexing is cheap (it scans the in-memory message log + connector
// file excerpts) so callers can re-index on demand whenever they
// kick off a new AI action.
type Retrieval struct {
	svc *services.RetrievalService
}

// NewRetrieval constructs the handler.
func NewRetrieval(s *services.RetrievalService) *Retrieval {
	return &Retrieval{svc: s}
}

// Index handles POST /api/channels/{channelId}/index.
func (h *Retrieval) Index(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelId")
	count, err := h.svc.IndexChannel(channelID)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"channelId":  channelID,
		"chunkCount": count,
	})
}

// Search handles GET /api/channels/{channelId}/search?q=...&topK=5.
func (h *Retrieval) Search(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelId")
	query := r.URL.Query().Get("q")
	topK := 5
	if raw := r.URL.Query().Get("topK"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			topK = n
		}
	}
	results, err := h.svc.Search(channelID, query, topK)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"channelId": channelID,
		"query":     query,
		"results":   results,
	})
}

func (h *Retrieval) mapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrNotFound):
		writeJSONError(w, http.StatusNotFound, err.Error())
	default:
		writeJSONError(w, http.StatusInternalServerError, err.Error())
	}
}
