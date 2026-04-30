package services

import (
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// Chat exposes chat lookups (channels-as-chats, channel messages, thread
// messages) for the API handlers.
type Chat struct {
	store *store.Memory
}

func NewChat(s *store.Memory) *Chat { return &Chat{store: s} }

// ChatsForUser returns channels the user is a member of in the given context.
// An empty context returns chats from both contexts.
func (c *Chat) ChatsForUser(userID string, ctx models.Context) []models.Channel {
	if ctx == "" {
		b2c := c.store.ListChannelsForUser(userID, models.ContextB2C)
		b2b := c.store.ListChannelsForUser(userID, models.ContextB2B)
		return append(b2c, b2b...)
	}
	return c.store.ListChannelsForUser(userID, ctx)
}

// ChannelMessages returns the top-level messages for a channel.
func (c *Chat) ChannelMessages(channelID string) []models.Message {
	return c.store.ListChannelMessages(channelID)
}

// AllChannelMessages returns every message in a channel, including
// thread replies, sorted by CreatedAt. Used by the Phase 7 LLM
// bridges (knowledge extraction, summarisation) where the model
// needs the full thread context — top-level messages alone don't
// carry the enriched seed content (decisions, owners, deadlines)
// that lives inside threads.
func (c *Chat) AllChannelMessages(channelID string) []models.Message {
	return c.store.ListAllChannelMessages(channelID)
}

// ThreadMessages returns the root + replies for a thread.
func (c *Chat) ThreadMessages(threadID string) []models.Message {
	return c.store.ListThreadMessages(threadID)
}

// Message returns a single message by ID. Used by the translate and
// task-extraction handlers.
func (c *Chat) Message(id string) (models.Message, bool) {
	return c.store.GetMessage(id)
}
