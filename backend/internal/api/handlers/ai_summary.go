package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// AISummary owns AI-driven chat summary endpoints. The first one is
// GET /api/chats/unread-summary which returns a digest of recent B2C chat
// messages for the authenticated user.
type AISummary struct {
	chat     *services.Chat
	adapter  inference.Adapter
	identity *services.Identity
}

func NewAISummary(c *services.Chat, a inference.Adapter, i *services.Identity) *AISummary {
	return &AISummary{chat: c, adapter: a, identity: i}
}

// unreadSummaryMaxMessages caps the number of source messages we include in
// the prompt so the demo's mock adapter never sees a runaway input.
const unreadSummaryMaxMessages = 20

// UnreadSummary collects recent B2C chat messages for the authenticated
// user, builds a summarize prompt, calls the inference adapter, and returns
// the response together with the source message IDs so the UI can back-link
// each digest item to its origin.
func (h *AISummary) UnreadSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := userctx.From(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}

	chats := h.chat.ChatsForUser(user.ID, models.ContextB2C)
	type sourceMessage struct {
		ID        string `json:"id"`
		ChannelID string `json:"channelId"`
		Sender    string `json:"sender"`
		Excerpt   string `json:"excerpt"`
	}
	var sources []sourceMessage
	var promptB strings.Builder
	promptB.WriteString("Summarise these recent unread messages into a short digest. ")
	promptB.WriteString("Call out deadlines, RSVPs, and replies needed.\n\n")
	for _, ch := range chats {
		msgs := h.chat.ChannelMessages(ch.ID)
		// Take up to the most recent few messages from each chat.
		start := 0
		if len(msgs) > 5 {
			start = len(msgs) - 5
		}
		for _, m := range msgs[start:] {
			sources = append(sources, sourceMessage{
				ID:        m.ID,
				ChannelID: m.ChannelID,
				Sender:    m.SenderID,
				Excerpt:   truncateForPrompt(m.Content, 120),
			})
			fmt.Fprintf(&promptB, "- [%s] %s: %s\n", ch.Name, m.SenderID, m.Content)
			if len(sources) >= unreadSummaryMaxMessages {
				break
			}
		}
		if len(sources) >= unreadSummaryMaxMessages {
			break
		}
	}

	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  inference.TaskTypeSummarize,
		Prompt:    promptB.String(),
		ChannelID: "", // cross-chat digest
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"summary":         resp,
		"sources":         sources,
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
	})
}

func truncateForPrompt(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
