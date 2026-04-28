package store

import (
	"sort"
	"sync"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// Memory is an in-memory store backed by maps with a single RWMutex. It is the
// only store implementation in Phase 0; PostgreSQL is added in a later phase.
type Memory struct {
	mu sync.RWMutex

	users      map[string]models.User
	workspaces map[string]models.Workspace
	channels   map[string]models.Channel
	messages   map[string]models.Message
	cards      []models.Card
}

// NewMemory returns an empty Memory store. Call Seed to populate it with the
// Phase 0 demo data.
func NewMemory() *Memory {
	return &Memory{
		users:      map[string]models.User{},
		workspaces: map[string]models.Workspace{},
		channels:   map[string]models.Channel{},
		messages:   map[string]models.Message{},
		cards:      []models.Card{},
	}
}

// User lookups.

func (m *Memory) GetUser(id string) (models.User, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[id]
	return u, ok
}

func (m *Memory) ListUsers() []models.User {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.User, 0, len(m.users))
	for _, u := range m.users {
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (m *Memory) PutUser(u models.User) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.users[u.ID] = u
}

// Workspace lookups.

func (m *Memory) ListWorkspaces() []models.Workspace {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Workspace, 0, len(m.workspaces))
	for _, w := range m.workspaces {
		out = append(out, w)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (m *Memory) GetWorkspace(id string) (models.Workspace, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	w, ok := m.workspaces[id]
	return w, ok
}

func (m *Memory) PutWorkspace(w models.Workspace) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.workspaces[w.ID] = w
}

// Channel lookups.

func (m *Memory) PutChannel(c models.Channel) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.channels[c.ID] = c
}

func (m *Memory) GetChannel(id string) (models.Channel, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.channels[id]
	return c, ok
}

// ListChannels returns channels filtered by workspace and (optionally) context.
// Pass an empty workspace to ignore workspace filtering, and an empty context
// to ignore context filtering.
func (m *Memory) ListChannels(workspaceID string, ctx models.Context) []models.Channel {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Channel{}
	for _, c := range m.channels {
		if workspaceID != "" && c.WorkspaceID != workspaceID {
			continue
		}
		if ctx != "" && c.Context != ctx {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// ListChannelsForUser returns channels in the requested context that include
// the given user as a member. Channels are sorted by ID for deterministic output.
func (m *Memory) ListChannelsForUser(userID string, ctx models.Context) []models.Channel {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Channel{}
	for _, c := range m.channels {
		if ctx != "" && c.Context != ctx {
			continue
		}
		if !contains(c.MemberIDs, userID) {
			continue
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Message lookups.

func (m *Memory) PutMessage(msg models.Message) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages[msg.ID] = msg
}

// GetMessage returns a single message by ID. Used by handlers that need
// to look up a specific message (translate, extract-tasks) without
// scanning every channel.
func (m *Memory) GetMessage(id string) (models.Message, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	msg, ok := m.messages[id]
	return msg, ok
}

// ListChannelMessages returns the top-level messages for a channel (i.e. messages
// whose ThreadID is empty or equal to their ID), sorted by CreatedAt.
func (m *Memory) ListChannelMessages(channelID string) []models.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Message{}
	for _, msg := range m.messages {
		if msg.ChannelID != channelID {
			continue
		}
		if msg.ThreadID != "" && msg.ThreadID != msg.ID {
			continue
		}
		out = append(out, msg)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// ListThreadMessages returns all messages belonging to a thread (root + replies),
// sorted by CreatedAt.
func (m *Memory) ListThreadMessages(threadID string) []models.Message {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := []models.Message{}
	for _, msg := range m.messages {
		if msg.ThreadID == threadID || msg.ID == threadID {
			out = append(out, msg)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

// Card lookups.

// PutCard appends a card to the in-memory card list. Cards are stored in
// insertion order so seeded sample cards render with a stable ordering in
// the demo.
func (m *Memory) PutCard(c models.Card) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cards = append(m.cards, c)
}

// ListCards returns all seeded KApp cards. Phase 0 returns every card; later
// phases will scope by channel and visibility.
func (m *Memory) ListCards() []models.Card {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.Card, len(m.cards))
	copy(out, m.cards)
	return out
}

func contains(ss []string, s string) bool {
	for _, v := range ss {
		if v == s {
			return true
		}
	}
	return false
}
