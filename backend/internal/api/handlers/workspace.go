package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Workspace exposes workspace + channel + user-directory HTTP handlers.
type Workspace struct {
	workspaces *services.Workspace
	identity   *services.Identity
}

func NewWorkspace(w *services.Workspace, id *services.Identity) *Workspace {
	return &Workspace{workspaces: w, identity: id}
}

// Me returns the current authenticated user.
func (h *Workspace) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := userctx.From(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// Users returns the full user directory. Phase 0 has a small fixed roster.
func (h *Workspace) Users(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"users": h.identity.List()})
}

// List returns all seeded workspaces.
func (h *Workspace) List(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"workspaces": h.workspaces.List()})
}

// Channels returns the channels in a workspace, optionally filtered by ?context.
func (h *Workspace) Channels(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	if _, ok := h.workspaces.Get(wsID); !ok {
		writeJSONError(w, http.StatusNotFound, "workspace not found")
		return
	}
	ctx := models.Context(r.URL.Query().Get("context"))
	if ctx != "" && ctx != models.ContextB2C && ctx != models.ContextB2B {
		writeJSONError(w, http.StatusBadRequest, "invalid context")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": h.workspaces.Channels(wsID, ctx)})
}

// Domains returns the domains under a workspace. Phase 3 added domain as a
// first-class navigation level; previously the frontend hand-grouped channels
// by their DomainID field.
func (h *Workspace) Domains(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "id")
	if _, ok := h.workspaces.Get(wsID); !ok {
		writeJSONError(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domains": h.workspaces.Domains(wsID)})
}

// DomainChannels returns the channels under a single domain. Resolves the
// domain by ID across all workspaces.
func (h *Workspace) DomainChannels(w http.ResponseWriter, r *http.Request) {
	domainID := chi.URLParam(r, "id")
	if _, _, ok := h.workspaces.FindDomain(domainID); !ok {
		writeJSONError(w, http.StatusNotFound, "domain not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": h.workspaces.ChannelsForDomain(domainID)})
}
