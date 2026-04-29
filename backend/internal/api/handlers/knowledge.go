package handlers

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Knowledge exposes the Phase 5 workspace knowledge graph:
//
//	POST /api/channels/{channelId}/knowledge/extract        — (re-)run extraction
//	GET  /api/channels/{channelId}/knowledge?kind=          — list entities (optionally filtered)
//	GET  /api/knowledge/{id}                                — fetch a single entity
//
// The graph extracts five entity kinds (decision, owner, risk,
// requirement, deadline) using simple keyword heuristics over the
// channel's messages. The renderer hits these endpoints from the
// right-rail KnowledgeGraphPanel.
type Knowledge struct {
	svc *services.KnowledgeService
}

// NewKnowledge constructs the handler.
func NewKnowledge(s *services.KnowledgeService) *Knowledge {
	return &Knowledge{svc: s}
}

// Extract handles POST /api/channels/{channelId}/knowledge/extract.
func (h *Knowledge) Extract(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelId")
	entities, err := h.svc.ExtractEntities(channelID)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entities": entities})
}

// List handles GET /api/channels/{channelId}/knowledge?kind=.
func (h *Knowledge) List(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelId")
	kind := r.URL.Query().Get("kind")
	entities, err := h.svc.List(channelID, kind)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entities": entities})
}

// Get handles GET /api/knowledge/{id}.
func (h *Knowledge) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	entity, err := h.svc.Get(id)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entity": entity})
}

func (h *Knowledge) mapError(w http.ResponseWriter, err error) {
	if errors.Is(err, services.ErrNotFound) {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSONError(w, http.StatusInternalServerError, err.Error())
}
