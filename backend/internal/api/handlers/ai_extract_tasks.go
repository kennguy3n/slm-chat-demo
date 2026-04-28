package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// AIExtractTasks backs POST /api/ai/extract-tasks. This is the B2C
// task-extraction surface from PROPOSAL.md §3.2 / §5.2: detect actionable
// items (tasks, reminders, shopping items) in chat messages and offer
// task cards. PROPOSAL.md §2 routes extract_tasks to E2B (short, private,
// latency-sensitive) with E4B as an upgrade for multi-intent disambig.
type AIExtractTasks struct {
	chat    *services.Chat
	adapter inference.Adapter
}

func NewAIExtractTasks(c *services.Chat, a inference.Adapter) *AIExtractTasks {
	return &AIExtractTasks{chat: c, adapter: a}
}

// extractTasksContextSize is the number of trailing channel messages
// included alongside the focused message so the model can resolve
// "she", "tomorrow", etc.
const extractTasksContextSize = 4

type extractTasksRequest struct {
	ChannelID string `json:"channelId"`
	MessageID string `json:"messageId"`
}

// ExtractedTask is the per-item shape returned to the frontend. Each
// item maps cleanly onto a TaskCard once the user accepts it.
type ExtractedTask struct {
	Title   string `json:"title"`
	DueDate string `json:"dueDate,omitempty"`
	Type    string `json:"type"`
}

// ExtractTasks runs the model once on the focused message (with a small
// surrounding context) and returns a list of proposed actions. The
// parser tolerates plain bulleted output; a fallback to a static "review
// this message" task ensures the UI is never empty.
func (h *AIExtractTasks) ExtractTasks(w http.ResponseWriter, r *http.Request) {
	if _, ok := userctx.From(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "no inference adapter configured")
		return
	}
	var body extractTasksRequest
	if r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
	}
	if body.MessageID == "" && body.ChannelID == "" {
		writeJSONError(w, http.StatusBadRequest, "messageId or channelId is required")
		return
	}

	var focused models.Message
	var context []models.Message
	if body.MessageID != "" {
		m, ok := h.chat.Message(body.MessageID)
		if !ok {
			writeJSONError(w, http.StatusNotFound, "message not found")
			return
		}
		focused = m
		all := h.chat.ChannelMessages(m.ChannelID)
		context = trailingContext(all, m.ID, extractTasksContextSize)
	} else {
		all := h.chat.ChannelMessages(body.ChannelID)
		if len(all) == 0 {
			writeJSONError(w, http.StatusNotFound, "channel has no messages")
			return
		}
		focused = all[len(all)-1]
		context = trailingContext(all, focused.ID, extractTasksContextSize)
	}

	prompt := buildExtractTasksPrompt(focused, context)
	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  inference.TaskTypeExtractTasks,
		Prompt:    prompt,
		ChannelID: focused.ChannelID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}

	tasks := parseExtractedTasks(resp.Output)
	if len(tasks) == 0 {
		tasks = []ExtractedTask{{
			Title: "Review this message",
			Type:  "task",
		}}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tasks":           tasks,
		"sourceMessageId": focused.ID,
		"channelId":       focused.ChannelID,
		"model":           resp.Model,
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
	})
}

func buildExtractTasksPrompt(focused models.Message, context []models.Message) string {
	var b strings.Builder
	b.WriteString("Extract actionable items from the focused chat message. ")
	b.WriteString("For each item, pick a type: task, reminder, or shopping. ")
	b.WriteString("Return one item per line as: <type> | <title> | <due if any>.\n\n")
	if len(context) > 0 {
		b.WriteString("Recent context:\n")
		for _, m := range context {
			fmt.Fprintf(&b, "- %s: %s\n", m.SenderID, truncateForPrompt(m.Content, 200))
		}
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "Focused message from %s: %s\n", focused.SenderID, focused.Content)
	return b.String()
}

// parseExtractedTasks parses the model's output into ExtractedTask
// entries. Two formats are supported:
//
//   - "<type> | <title> | <due>" (the format we ask for in the prompt)
//   - "- <title> (due Friday)" (the bullet style emitted by MockAdapter)
//
// Anything that doesn't match either format is treated as a single
// task title with no type or due date.
func parseExtractedTasks(out string) []ExtractedTask {
	var tasks []ExtractedTask
	for _, raw := range strings.Split(out, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		line = strings.TrimLeft(line, "-*•· \t")
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		if len(parts) >= 2 {
			t := ExtractedTask{
				Type:  classifyType(strings.TrimSpace(parts[0])),
				Title: strings.TrimSpace(parts[1]),
			}
			if len(parts) >= 3 {
				t.DueDate = strings.TrimSpace(parts[2])
			}
			if t.Title == "" {
				continue
			}
			tasks = append(tasks, t)
			continue
		}
		// Fallback: extract a "(due ...)" suffix if present so the
		// MockAdapter's seeded output produces useful dueDate values.
		title := line
		due := ""
		if i := strings.LastIndex(line, "(due "); i >= 0 {
			if j := strings.Index(line[i:], ")"); j > 0 {
				due = strings.TrimSpace(line[i+len("(due ") : i+j])
				title = strings.TrimSpace(line[:i])
			}
		}
		tasks = append(tasks, ExtractedTask{
			Title:   title,
			DueDate: due,
			Type:    classifyType(title),
		})
	}
	return tasks
}

// classifyType maps a free-form hint or full task title into one of the
// three demo categories. The rules deliberately favour "task" so the
// surface always renders something usable.
func classifyType(hint string) string {
	h := strings.ToLower(hint)
	switch h {
	case "task", "reminder", "shopping":
		return h
	}
	if strings.Contains(h, "remind") {
		return "reminder"
	}
	if strings.Contains(h, "shop") || strings.Contains(h, "grocer") || strings.Contains(h, "list") {
		return "shopping"
	}
	if strings.Contains(h, "buy") || strings.Contains(h, "pick up") || strings.Contains(h, "grab") {
		return "shopping"
	}
	return "task"
}

// trailingContext returns up to n messages ending at (but not including)
// the focused message; the focused message itself is rendered separately
// in the prompt.
func trailingContext(all []models.Message, focusedID string, n int) []models.Message {
	idx := -1
	for i, m := range all {
		if m.ID == focusedID {
			idx = i
			break
		}
	}
	if idx <= 0 {
		return nil
	}
	start := idx - n
	if start < 0 {
		start = 0
	}
	return all[start:idx]
}
