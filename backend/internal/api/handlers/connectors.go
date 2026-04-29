package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Connectors exposes the Phase 5 mock-connector API:
//
//	GET    /api/connectors?workspaceId=                    — list connectors
//	GET    /api/connectors/{id}                            — fetch a connector
//	GET    /api/connectors/{id}/files                      — list files in a connector
//	GET    /api/channels/{channelId}/connector-files       — files visible from a channel
//	POST   /api/connectors/{id}/channels                   — attach to channel(s)
//	DELETE /api/connectors/{id}/channels/{channelId}       — detach from a channel
//
// Phase 5 keeps connectors mocked: no real OAuth or upstream API
// calls, one seeded Google Drive connector per workspace.
type Connectors struct {
	svc *services.ConnectorService
}

// NewConnectors constructs the handler.
func NewConnectors(s *services.ConnectorService) *Connectors {
	return &Connectors{svc: s}
}

// List handles GET /api/connectors?workspaceId=.
func (h *Connectors) List(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspaceId")
	connectors := h.svc.List(workspaceID)
	writeJSON(w, http.StatusOK, map[string]any{"connectors": connectors})
}

// Get handles GET /api/connectors/{id}.
func (h *Connectors) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := h.svc.Get(id)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connector": c})
}

// Files handles GET /api/connectors/{id}/files.
func (h *Connectors) Files(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	files, err := h.svc.ListFiles(id)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}

// ChannelFiles handles GET /api/channels/{channelId}/connector-files.
// Returns files from connectors currently attached to the channel.
func (h *Connectors) ChannelFiles(w http.ResponseWriter, r *http.Request) {
	channelID := chi.URLParam(r, "channelId")
	files := h.svc.ListFilesByChannel(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"files": files})
}

type attachBody struct {
	ChannelID  string   `json:"channelId"`
	ChannelIDs []string `json:"channelIds"`
}

// Attach handles POST /api/connectors/{id}/channels. Accepts either
// a single `channelId` or a list of `channelIds` so callers can batch
// attachments. The connector is returned with its merged channel list.
func (h *Connectors) Attach(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body attachBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	targets := body.ChannelIDs
	if body.ChannelID != "" {
		targets = append([]string{body.ChannelID}, targets...)
	}
	if len(targets) == 0 {
		writeJSONError(w, http.StatusBadRequest, "channelId or channelIds is required")
		return
	}
	var connector any
	for _, cid := range targets {
		c, err := h.svc.AttachToChannel(id, cid)
		if err != nil {
			h.mapError(w, err)
			return
		}
		connector = c
	}
	writeJSON(w, http.StatusOK, map[string]any{"connector": connector})
}

// SyncACL handles POST /api/connectors/{id}/sync-acl. It refreshes
// the machine-readable ACL on every file in the connector and
// returns the updated file list. Phase 5 mocks the upstream sync;
// real OAuth ships in Phase 6+.
func (h *Connectors) SyncACL(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	files, err := h.svc.SyncACL(id)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connectorId": id,
		"files":       files,
	})
}

// Detach handles DELETE /api/connectors/{id}/channels/{channelId}.
func (h *Connectors) Detach(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	channelID := chi.URLParam(r, "channelId")
	c, err := h.svc.DetachFromChannel(id, channelID)
	if err != nil {
		h.mapError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connector": c})
}

func (h *Connectors) mapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrNotFound):
		writeJSONError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, services.ErrUnknownChannel):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, services.ErrConnectorChannelMismatch):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	default:
		writeJSONError(w, http.StatusInternalServerError, err.Error())
	}
}
