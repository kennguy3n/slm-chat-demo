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

// AISmartReply backs POST /api/ai/smart-reply for the B2C composer.
//
// PROPOSAL.md §3.2 describes smart reply as 2–3 short contextual reply
// suggestions rendered inline above the composer. PROPOSAL.md §2 routes
// it to E2B (short, private, latency-sensitive). This handler builds a
// prompt from the last few messages in the channel and runs inference
// once via the configured router; suggestions are split out of the
// model's output, with a sane fallback so the UI always has something
// to render even when the mock or the model fails to follow the schema.
type AISmartReply struct {
	chat    *services.Chat
	adapter inference.Adapter
}

func NewAISmartReply(c *services.Chat, a inference.Adapter) *AISmartReply {
	return &AISmartReply{chat: c, adapter: a}
}

// smartReplyContextSize is the number of trailing messages we include in
// the prompt so the model has enough context to produce a relevant reply
// without ballooning the request.
const smartReplyContextSize = 6

// smartReplyMaxSuggestions caps the number of chips rendered above the
// composer. PROPOSAL.md §3.2 specifies 2–3 short suggestions.
const smartReplyMaxSuggestions = 3

type smartReplyRequest struct {
	ChannelID string `json:"channelId"`
	MessageID string `json:"messageId"`
}

// SmartReply returns 2–3 contextual reply suggestions for the last
// message in the channel. The response shape mirrors the digest /
// translate / extract-tasks handlers: privacy metadata is always
// included so the UI can render a PrivacyStrip without a second call.
func (h *AISmartReply) SmartReply(w http.ResponseWriter, r *http.Request) {
	if _, ok := userctx.From(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	var body smartReplyRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	if body.ChannelID == "" {
		writeJSONError(w, http.StatusBadRequest, "channelId is required")
		return
	}

	msgs := h.chat.ChannelMessages(body.ChannelID)
	if len(msgs) == 0 {
		writeJSONError(w, http.StatusNotFound, "channel has no messages")
		return
	}

	start := 0
	if len(msgs) > smartReplyContextSize {
		start = len(msgs) - smartReplyContextSize
	}
	context := msgs[start:]

	var promptB strings.Builder
	promptB.WriteString("You are drafting short, friendly reply suggestions for a chat user. ")
	promptB.WriteString("Read the recent messages and propose 2–3 short reply options. ")
	promptB.WriteString("Each option must be a single sentence. Return one option per line.\n\n")
	for _, m := range context {
		fmt.Fprintf(&promptB, "- %s: %s\n", m.SenderID, truncateForPrompt(m.Content, 200))
	}

	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  inference.TaskTypeSmartReply,
		Prompt:    promptB.String(),
		ChannelID: body.ChannelID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}

	replies := parseSmartReplies(resp.Output)
	if len(replies) == 0 {
		// The mock and small models occasionally produce a single line
		// that doesn't match the "one per line" instruction. Fall back
		// to a static set so the UI is never empty.
		replies = []string{
			"Sounds good — thanks!",
			"On it, will follow up shortly.",
			"Could you share more context?",
		}
	}
	if len(replies) > smartReplyMaxSuggestions {
		replies = replies[:smartReplyMaxSuggestions]
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"replies":         replies,
		"model":           resp.Model,
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
		"sourceMessageId": body.MessageID,
		"channelId":       body.ChannelID,
	})
}

// parseSmartReplies splits the model output into individual reply
// suggestions. It tolerates leading bullets / dashes / numbers and
// trims surrounding quotes that some models emit.
func parseSmartReplies(out string) []string {
	var replies []string
	for _, raw := range strings.Split(out, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		// Strip common bullets.
		line = strings.TrimLeft(line, "-*•· \t")
		// Strip leading "1.", "2)", etc.
		if idx := indexOfDigitPrefix(line); idx > 0 {
			line = strings.TrimSpace(line[idx:])
		}
		// Strip a leading "Suggested reply:" label that the mock emits.
		if i := strings.Index(strings.ToLower(line), "suggested reply:"); i == 0 {
			line = strings.TrimSpace(line[len("Suggested reply:"):])
		}
		line = strings.Trim(line, `"'`)
		if line == "" {
			continue
		}
		replies = append(replies, line)
	}
	return replies
}

// indexOfDigitPrefix returns the index just past a leading "1.", "1)",
// "12.", "12)" sequence, or 0 if no such prefix exists.
func indexOfDigitPrefix(s string) int {
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i == 0 {
		return 0
	}
	if i < len(s) && (s[i] == '.' || s[i] == ')') {
		return i + 1
	}
	return 0
}
