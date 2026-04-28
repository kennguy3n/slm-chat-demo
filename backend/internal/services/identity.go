package services

import (
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// Identity wraps user/session lookups. Phase 0 has no real authentication; the
// service simply resolves user IDs against the in-memory store and falls back
// to a default demo user when the requested ID is unknown.
type Identity struct {
	store           *store.Memory
	defaultUserID   string
}

// NewIdentity returns an Identity service backed by the given memory store.
// defaultUserID is the user returned for requests that don't supply (or supply
// an unknown) X-User-ID header.
func NewIdentity(s *store.Memory, defaultUserID string) *Identity {
	return &Identity{store: s, defaultUserID: defaultUserID}
}

// Resolve returns the user matching id, or the default demo user when id is
// empty or unknown. The second return value indicates whether a real match
// was found.
func (i *Identity) Resolve(id string) (models.User, bool) {
	if id != "" {
		if u, ok := i.store.GetUser(id); ok {
			return u, true
		}
	}
	if u, ok := i.store.GetUser(i.defaultUserID); ok {
		return u, false
	}
	return models.User{}, false
}

// DefaultUserID exposes the configured default user for tests.
func (i *Identity) DefaultUserID() string {
	return i.defaultUserID
}

// List returns every seeded user. Phase 0 has a small fixed roster; later
// phases will replace this with a paginated directory query.
func (i *Identity) List() []models.User {
	return i.store.ListUsers()
}
