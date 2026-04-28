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

// Domains returns the domains in the given workspace. Empty slice (not nil)
// when the workspace has no domains so JSON marshaling is stable.
func (w *Workspace) Domains(workspaceID string) []models.Domain {
	ws, ok := w.store.GetWorkspace(workspaceID)
	if !ok {
		return []models.Domain{}
	}
	out := make([]models.Domain, 0, len(ws.Domains))
	for _, d := range ws.Domains {
		// Back-fill WorkspaceID for older seed data so the wire shape is
		// always complete.
		if d.WorkspaceID == "" {
			d.WorkspaceID = workspaceID
		}
		out = append(out, d)
	}
	return out
}

// FindDomain locates a domain (and its parent workspace) by domain ID.
func (w *Workspace) FindDomain(domainID string) (models.Domain, models.Workspace, bool) {
	for _, ws := range w.store.ListWorkspaces() {
		for _, d := range ws.Domains {
			if d.ID == domainID {
				if d.WorkspaceID == "" {
					d.WorkspaceID = ws.ID
				}
				return d, ws, true
			}
		}
	}
	return models.Domain{}, models.Workspace{}, false
}

// ChannelsForDomain returns the channels whose DomainID matches the given ID.
// An empty domainID returns no results — callers must validate the ID first.
func (w *Workspace) ChannelsForDomain(domainID string) []models.Channel {
	if domainID == "" {
		return []models.Channel{}
	}
	out := []models.Channel{}
	for _, c := range w.store.ListChannels("", "") {
		if c.DomainID == domainID {
			out = append(out, c)
		}
	}
	return out
}
