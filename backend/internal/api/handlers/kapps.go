package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

func actorFromContext(r *http.Request) string {
	if u, ok := userctx.From(r.Context()); ok {
		return u.ID
	}
	return ""
}

// KApps exposes the KApp object endpoints. The Phase 0 backend was data-
// only; Phase 3 adds task CRUD, approval decisions, and a thread-scoped
// linked-objects endpoint. AI-driven extraction (POST
// /api/kapps/tasks/extract, approval prefill, artifact draft) still lives in
// the Electron main process — see frontend/electron/inference/.
type KApps struct {
	kapps *services.KApps
}

func NewKApps(k *services.KApps) *KApps { return &KApps{kapps: k} }

// Cards returns every seeded KApp card. The optional ?channelId=... query
// scopes the response to a single channel, matching the channel-scoped
// privacy promise in ARCHITECTURE.md section 7.
func (h *KApps) Cards(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	cards := h.kapps.Cards(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards})
}

// LinkedObjects returns every KApp card attached to a thread. Phase 3
// powers the "Linked Objects" section in ThreadPanel.
func (h *KApps) LinkedObjects(w http.ResponseWriter, r *http.Request) {
	threadID := chi.URLParam(r, "threadId")
	if threadID == "" {
		writeJSONError(w, http.StatusBadRequest, "threadId is required")
		return
	}
	cards := h.kapps.LinkedObjects(threadID)
	writeJSON(w, http.StatusOK, map[string]any{"cards": cards, "threadId": threadID})
}

type createTaskBody struct {
	ChannelID       string  `json:"channelId"`
	Title           string  `json:"title"`
	Owner           string  `json:"owner,omitempty"`
	DueDate         *string `json:"dueDate,omitempty"`
	SourceThreadID  string  `json:"sourceThreadId,omitempty"`
	SourceMessageID string  `json:"sourceMessageId,omitempty"`
	Status          string  `json:"status,omitempty"`
	AIGenerated     bool    `json:"aiGenerated,omitempty"`
}

// CreateTask handles POST /api/kapps/tasks.
func (h *KApps) CreateTask(w http.ResponseWriter, r *http.Request) {
	var body createTaskBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	due, err := parseOptionalTime(body.DueDate)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid dueDate; expected RFC3339")
		return
	}
	in := services.CreateTaskInput{
		ChannelID:       body.ChannelID,
		Title:           body.Title,
		Owner:           body.Owner,
		DueDate:         due,
		SourceThreadID:  body.SourceThreadID,
		SourceMessageID: body.SourceMessageID,
		Status:          models.TaskStatus(body.Status),
		AIGenerated:     body.AIGenerated,
		Actor:           actorFromContext(r),
	}
	task, err := h.kapps.CreateTask(in)
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"task": task})
}

// ListTasks handles GET /api/kapps/tasks?channelId=...
func (h *KApps) ListTasks(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channelId")
	tasks := h.kapps.ListTasks(channelID)
	writeJSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}

type updateTaskBody struct {
	Title   *string `json:"title,omitempty"`
	Owner   *string `json:"owner,omitempty"`
	DueDate *string `json:"dueDate,omitempty"`
	// Sentinel string the client sends when it wants to clear the due
	// date. JSON-null cannot be distinguished from "absent" in Go.
	ClearDueDate bool    `json:"clearDueDate,omitempty"`
	Status       *string `json:"status,omitempty"`
	Note         string  `json:"note,omitempty"`
}

// UpdateTask handles PATCH /api/kapps/tasks/{id}.
func (h *KApps) UpdateTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body updateTaskBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	due, err := parseOptionalTime(body.DueDate)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid dueDate; expected RFC3339")
		return
	}
	var statusPtr *models.TaskStatus
	if body.Status != nil {
		s := models.TaskStatus(*body.Status)
		statusPtr = &s
	}
	in := services.UpdateTaskInput{
		Title:        body.Title,
		Owner:        body.Owner,
		DueDate:      due,
		ClearDueDate: body.ClearDueDate,
		Status:       statusPtr,
		Actor:        actorFromContext(r),
		Note:         body.Note,
	}
	task, err := h.kapps.UpdateTask(id, in)
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"task": task})
}

// UpdateTaskStatus handles PATCH /api/kapps/tasks/{id}/status. It is a
// convenience wrapper around UpdateTask for the common transition case.
func (h *KApps) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Status string `json:"status"`
		Note   string `json:"note,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	status := models.TaskStatus(body.Status)
	task, err := h.kapps.UpdateTask(id, services.UpdateTaskInput{
		Status: &status,
		Actor:  actorFromContext(r),
		Note:   body.Note,
	})
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"task": task})
}

// DeleteTask handles DELETE /api/kapps/tasks/{id} (treated as close/archive).
func (h *KApps) DeleteTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.kapps.DeleteTask(id); err != nil {
		mapKAppsError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SubmitApprovalDecision handles POST /api/kapps/approvals/{id}/decide.
func (h *KApps) SubmitApprovalDecision(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Decision string `json:"decision"`
		Note     string `json:"note,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	approval, err := h.kapps.SubmitApprovalDecision(id, services.ApprovalDecisionInput{
		Decision: models.ApprovalDecision(body.Decision),
		Note:     body.Note,
		Actor:    actorFromContext(r),
	})
	if err != nil {
		mapKAppsError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"approval": approval})
}

func parseOptionalTime(in *string) (*time.Time, error) {
	if in == nil || *in == "" {
		return nil, nil
	}
	// time.RFC3339Nano accepts both fractional and non-fractional seconds
	// when parsing (the ".999..." suffix in the layout marks the fraction
	// as optional). JavaScript's Date.toISOString() always emits ".000Z",
	// which time.RFC3339 would reject.
	t, err := time.Parse(time.RFC3339Nano, *in)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func mapKAppsError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, services.ErrNotFound):
		writeJSONError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, services.ErrInvalidStatus):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, services.ErrInvalidDecision):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	default:
		writeJSONError(w, http.StatusBadRequest, err.Error())
	}
}
