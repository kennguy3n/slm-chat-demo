package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Chat exposes chat-related HTTP handlers.
type Chat struct {
	chat *services.Chat
}

func NewChat(c *services.Chat) *Chat { return &Chat{chat: c} }

// List returns the chats (channels) for the authenticated user, optionally
// filtered by ?context=b2c|b2b.
func (h *Chat) List(w http.ResponseWriter, r *http.Request) {
	user, ok := userctx.From(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	ctx := models.Context(r.URL.Query().Get("context"))
	if ctx != "" && ctx != models.ContextB2C && ctx != models.ContextB2B {
		writeJSONError(w, http.StatusBadRequest, "invalid context")
		return
	}
	chats := h.chat.ChatsForUser(user.ID, ctx)
	writeJSON(w, http.StatusOK, map[string]any{"chats": chats})
}

// Messages returns the top-level messages for a chat.
func (h *Chat) Messages(w http.ResponseWriter, r *http.Request) {
	chatID := chi.URLParam(r, "chatId")
	msgs := h.chat.ChannelMessages(chatID)
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

// ThreadMessages returns the messages in a thread (root + replies).
func (h *Chat) ThreadMessages(w http.ResponseWriter, r *http.Request) {
	threadID := chi.URLParam(r, "threadId")
	msgs := h.chat.ThreadMessages(threadID)
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
