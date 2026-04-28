package services

import (
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// Workspace exposes workspace and channel lookups for the API handlers.
type Workspace struct {
	store *store.Memory
}

func NewWorkspace(s *store.Memory) *Workspace { return &Workspace{store: s} }

// List returns all seeded workspaces.
func (w *Workspace) List() []models.Workspace { return w.store.ListWorkspaces() }

// Channels returns the channels in a workspace, optionally filtered by context.
// An empty context means "any context".
func (w *Workspace) Channels(workspaceID string, ctx models.Context) []models.Channel {
	return w.store.ListChannels(workspaceID, ctx)
}

// Get returns a workspace by ID.
func (w *Workspace) Get(id string) (models.Workspace, bool) {
	return w.store.GetWorkspace(id)
}
