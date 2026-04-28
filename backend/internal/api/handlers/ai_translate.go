package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// AITranslate backs POST /api/ai/translate. PROPOSAL.md §3.2 specifies an
// inline, on-device translation under each message bubble with a
// tap-to-see-original toggle; PROPOSAL.md §2 routes translate to E2B
// (short, private, latency-sensitive) with E4B as an upgrade for long
// passages.
type AITranslate struct {
	chat    *services.Chat
	adapter inference.Adapter
}

func NewAITranslate(c *services.Chat, a inference.Adapter) *AITranslate {
	return &AITranslate{chat: c, adapter: a}
}

type translateRequest struct {
	MessageID      string `json:"messageId"`
	TargetLanguage string `json:"targetLanguage"`
}

// Translate fetches the requested message, runs translation through the
// inference router, and returns both the original and the translated
// text so the caller can render the toggle without a second round trip.
func (h *AITranslate) Translate(w http.ResponseWriter, r *http.Request) {
	if _, ok := userctx.From(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	var body translateRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	if body.MessageID == "" {
		writeJSONError(w, http.StatusBadRequest, "messageId is required")
		return
	}
	target := strings.TrimSpace(body.TargetLanguage)
	if target == "" {
		target = "en"
	}

	msg, ok := h.chat.Message(body.MessageID)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "message not found")
		return
	}

	prompt := fmt.Sprintf(
		"Translate the following chat message into %s. Preserve tone, names, and emoji. "+
			"Respond with the translation only, no commentary.\n\nMessage: %s",
		target, msg.Content,
	)
	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  inference.TaskTypeTranslate,
		Prompt:    prompt,
		ChannelID: msg.ChannelID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}
	translated := strings.TrimSpace(resp.Output)
	if translated == "" {
		translated = msg.Content
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"messageId":       msg.ID,
		"channelId":       msg.ChannelID,
		"original":        msg.Content,
		"translated":      translated,
		"targetLanguage":  target,
		"model":           resp.Model,
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
	})
}
