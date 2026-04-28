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

// KApps exposes the KApp object endpoints. Phase 0 ships GET /api/kapps/cards
// (returns the four seeded sample cards from store.seedCards). Phase 1
// adds POST /api/kapps/tasks/extract — the B2B equivalent of the B2C
// task-extraction surface, working on a thread instead of a single
// message and returning per-task owners + due dates.
type KApps struct {
	kapps   *services.KApps
	chat    *services.Chat
	adapter inference.Adapter
}

func NewKApps(k *services.KApps) *KApps { return &KApps{kapps: k} }

// WithInference returns a copy of the receiver wired with the chat
// service and inference adapter required by the task-extract endpoint.
// The split keeps NewKApps backwards-compatible for the Phase-0 cards
// endpoint while letting Phase-1 callers opt into the extract surface.
func (h *KApps) WithInference(c *services.Chat, a inference.Adapter) *KApps {
	cp := *h
	cp.chat = c
	cp.adapter = a
	return &cp
}

// Cards returns every seeded KApp card. The optional ?channelId=... query
// scopes the response to a single channel, which matches the channel-scoped
// privacy promise in ARCHITECTURE.md section 7.
func (h *KApps) Cards(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	cards := h.kapps.Cards(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

func (h *KApps) NotImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{
		"status": "not_implemented",
		"phase":  "3",
	})
}

// kappsExtractMaxMessages caps the thread context fed into the extract
// prompt so a runaway thread can't blow up the request.
const kappsExtractMaxMessages = 30

type kappsExtractRequest struct {
	ThreadID string `json:"threadId"`
}

// KAppsExtractedTask is the per-item shape returned by /api/kapps/tasks/extract.
// Each maps cleanly onto a TaskCard once the user accepts it.
type KAppsExtractedTask struct {
	Title           string `json:"title"`
	Owner           string `json:"owner,omitempty"`
	DueDate         string `json:"dueDate,omitempty"`
	Status          string `json:"status"`
	SourceMessageID string `json:"sourceMessageId,omitempty"`
}

// ExtractTasks reads a thread and asks the model to extract actionable
// items with owners and due dates. Used by the B2B "Plan → Extract tasks"
// flow in PROPOSAL.md §3.3 / §5.4.
func (h *KApps) ExtractTasks(w http.ResponseWriter, r *http.Request) {
	if _, ok := userctx.From(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "no user in context")
		return
	}
	if h.chat == nil || h.adapter == nil {
		writeJSONError(w, http.StatusInternalServerError, "task-extract not configured")
		return
	}
	var body kappsExtractRequest
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
	if len(limited) > kappsExtractMaxMessages {
		limited = limited[:kappsExtractMaxMessages]
	}

	prompt := buildKAppsExtractPrompt(limited)
	resp, err := h.adapter.Run(r.Context(), inference.Request{
		TaskType:  inference.TaskTypeExtractTasks,
		Prompt:    prompt,
		ChannelID: limited[0].ChannelID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, err.Error())
		return
	}

	tasks := parseKAppsExtractedTasks(resp.Output, limited)
	if len(tasks) == 0 {
		tasks = []KAppsExtractedTask{{
			Title:           "Review thread for follow-ups",
			Status:          string(models.TaskStatusOpen),
			SourceMessageID: limited[len(limited)-1].ID,
		}}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tasks":           tasks,
		"threadId":        body.ThreadID,
		"channelId":       limited[0].ChannelID,
		"model":           resp.Model,
		"computeLocation": "on_device",
		"dataEgressBytes": 0,
	})
}

func buildKAppsExtractPrompt(msgs []models.Message) string {
	var b strings.Builder
	b.WriteString("Extract concrete tasks from the following work thread. ")
	b.WriteString("For each task identify the owner, the due date if mentioned, ")
	b.WriteString("and a clear title. Return one task per line as: ")
	b.WriteString("<owner> | <title> | <due if any>.\n\n")
	for _, m := range msgs {
		fmt.Fprintf(&b, "- %s: %s\n", m.SenderID, m.Content)
	}
	return b.String()
}

// parseKAppsExtractedTasks parses the model's output into B2B-shaped
// task entries. It accepts both the structured "owner | title | due"
// format (what we ask for) and the loose bullet format the MockAdapter
// emits, so the demo always renders something sensible.
func parseKAppsExtractedTasks(out string, sources []models.Message) []KAppsExtractedTask {
	var tasks []KAppsExtractedTask
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
			t := KAppsExtractedTask{
				Owner:  strings.TrimSpace(parts[0]),
				Title:  strings.TrimSpace(parts[1]),
				Status: string(models.TaskStatusOpen),
			}
			if len(parts) >= 3 {
				t.DueDate = strings.TrimSpace(parts[2])
			}
			t.SourceMessageID = matchSourceMessage(t.Title, sources)
			if t.Title == "" {
				continue
			}
			tasks = append(tasks, t)
			continue
		}
		title := line
		due := ""
		if i := strings.LastIndex(line, "(due "); i >= 0 {
			if j := strings.Index(line[i:], ")"); j > 0 {
				due = strings.TrimSpace(line[i+len("(due ") : i+j])
				title = strings.TrimSpace(line[:i])
			}
		}
		tasks = append(tasks, KAppsExtractedTask{
			Title:           title,
			DueDate:         due,
			Status:          string(models.TaskStatusOpen),
			SourceMessageID: matchSourceMessage(title, sources),
		})
	}
	return tasks
}

// matchSourceMessage tries to attribute an extracted task back to the
// source thread message that mentioned it. It picks the most recent
// message containing any meaningful word from the title; if no match is
// found, it back-links to the thread root so the privacy strip's origin
// pin still resolves.
func matchSourceMessage(title string, msgs []models.Message) string {
	if len(msgs) == 0 {
		return ""
	}
	lt := strings.ToLower(title)
	words := strings.FieldsFunc(lt, func(r rune) bool {
		return !(r >= 'a' && r <= 'z')
	})
	for i := len(msgs) - 1; i >= 0; i-- {
		content := strings.ToLower(msgs[i].Content)
		for _, w := range words {
			if len(w) >= 4 && strings.Contains(content, w) {
				return msgs[i].ID
			}
		}
	}
	return msgs[0].ID
}
