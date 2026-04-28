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

// AIThreadSummary backs POST /api/ai/summarize-thread, the B2B thread
// summarisation surface from PROPOSAL.md §3.3 / §5.4. It mirrors the
// no-double-inference contract of the unread-summary endpoint: the
// handler builds a prompt + source list and returns it; the frontend
// hands the same prompt to /api/ai/stream so the model runs exactly once.
type AIThreadSummary struct {
	chat    *services.Chat
	adapter inference.Adapter
}

func NewAIThreadSummary(c *services.Chat, a inference.Adapter) *AIThreadSummary {
	return &AIThreadSummary{chat: c, adapter: a}
}

// threadSummaryShortThread is the message-count threshold below which we
// hint at E2B in the response model name; longer threads get the E4B
// hint per PROPOSAL.md §2 ("B2B thread summary: E2B short threads, E4B
// primary, server only if thread > local context").
const threadSummaryShortThread = 8

// threadSummaryMaxMessages caps the number of source messages we render
// in the prompt so a runaway thread never blows up the request.
const threadSummaryMaxMessages = 30

type threadSummaryRequest struct {
	ThreadID string `json:"threadId"`
}

type threadSource struct {
	ID        string `json:"id"`
	ChannelID string `json:"channelId"`
	Sender    string `json:"sender"`
	Excerpt   string `json:"excerpt"`
}

// SummarizeThread builds a prompt + source list for the given thread and
// returns it without running inference. The frontend streams the actual
// summary via /api/ai/stream using the same prompt so the model runs
// exactly once (see ai_summary.go for the same pattern).
func (h *AIThreadSummary) SummarizeThread(w http.ResponseWriter, r *http.Request) {
	if _, ok := userctx.From(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	var body threadSummaryRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	if body.ThreadID == "" {
		writeJSONError(w, http.StatusBadRequest, "threadId is required")
		return
	}

	msgs := h.chat.ThreadMessages(body.ThreadID)
	if len(msgs) == 0 {
		writeJSONError(w, http.StatusNotFound, "thread not found")
		return
	}

	limited := msgs
	if len(limited) > threadSummaryMaxMessages {
		limited = limited[:threadSummaryMaxMessages]
	}

	var promptB strings.Builder
	promptB.WriteString("Summarise the following thread for a busy teammate. ")
	promptB.WriteString("Call out decisions made, open questions, owners, and deadlines. ")
	promptB.WriteString("Keep it to a short paragraph plus a bulleted list.\n\n")
	sources := make([]threadSource, 0, len(limited))
	for _, m := range limited {
		fmt.Fprintf(&promptB, "- %s: %s\n", m.SenderID, m.Content)
		sources = append(sources, threadSource{
			ID:        m.ID,
			ChannelID: m.ChannelID,
			Sender:    m.SenderID,
			Excerpt:   truncateForPrompt(m.Content, 160),
		})
	}

	model := "gemma-4-e2b"
	tier := "e2b"
	reason := "Short thread routed to E2B."
	if len(msgs) > threadSummaryShortThread {
		model = "gemma-4-e4b"
		tier = "e4b"
		reason = "Thread is long enough to benefit from E4B reasoning."
	}
	if router, ok := h.adapter.(*inference.InferenceRouter); ok {
		d := router.Decide(inference.Request{
			TaskType: inference.TaskTypeSummarize,
			Prompt:   promptB.String(),
		})
		if d.Allow {
			model = d.Model
			tier = string(d.Tier)
			reason = d.Reason
		}
	}

	channelID := ""
	if len(limited) > 0 {
		channelID = limited[0].ChannelID
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":          promptB.String(),
		"sources":         sources,
		"threadId":        body.ThreadID,
		"channelId":       channelID,
		"model":           model,
		"tier":            tier,
		"reason":          reason,
		"messageCount":    len(msgs),
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
	})
}
