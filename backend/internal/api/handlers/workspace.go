package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Workspace exposes workspace + channel HTTP handlers.
type Workspace struct {
	workspaces *services.Workspace
}

func NewWorkspace(w *services.Workspace) *Workspace { return &Workspace{workspaces: w} }

// Me returns the current authenticated user.
func (h *Workspace) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := userctx.From(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	writeJSON(w, http.StatusOK, user)
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
