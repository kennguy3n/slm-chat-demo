package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// KApps exposes KApp object lookups (tasks, approvals, artifacts, events) for
// the API handlers. Phase 0 only surfaced seeded cards; Phase 3 adds the full
// task lifecycle plus approval decisions, written to the in-memory store with
// an immutable history entry per change.
type KApps struct {
	store *store.Memory
	now   func() time.Time
	idGen func(prefix string) string
}

func NewKApps(s *store.Memory) *KApps {
	return &KApps{
		store: s,
		now:   time.Now,
		idGen: defaultIDGen,
	}
}

func defaultIDGen(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
}

// ErrNotFound is returned when a KApp object lookup fails. Handlers map this
// to HTTP 404.
var ErrNotFound = errors.New("kapps: not found")

// ErrInvalidStatus is returned when a status transition is rejected. Handlers
// map this to HTTP 400.
var ErrInvalidStatus = errors.New("kapps: invalid status")

// ErrInvalidDecision is returned when an approval decision is malformed.
var ErrInvalidDecision = errors.New("kapps: invalid decision")

// Cards returns every seeded KApp card. Callers may filter by channel ID; an
// empty channelID returns the full list.
func (k *KApps) Cards(channelID string) []models.Card {
	all := k.store.ListCards()
	if channelID == "" {
		return all
	}
	out := make([]models.Card, 0, len(all))
	for _, c := range all {
		if cardChannelID(c) == channelID {
			out = append(out, c)
		}
	}
	return out
}

// LinkedObjects returns every card associated with the given thread ID. Phase
// 3 — used by `GET /api/threads/{id}/linked-objects`.
func (k *KApps) LinkedObjects(threadID string) []models.Card {
	return k.store.CardsForThread(threadID)
}

// CreateTaskInput is the payload accepted by CreateTask. The handler builds it
// from the JSON body so the service can stay free of HTTP types.
type CreateTaskInput struct {
	ChannelID       string
	Title           string
	Owner           string
	DueDate         *time.Time
	SourceThreadID  string
	SourceMessageID string
	Status          models.TaskStatus
	AIGenerated     bool
	Actor           string
}

// CreateTask validates and persists a new task. Empty Status defaults to
// "open"; an unknown status returns ErrInvalidStatus. The created task always
// gets an "open" history entry stamped with the actor.
func (k *KApps) CreateTask(in CreateTaskInput) (models.Task, error) {
	if strings.TrimSpace(in.Title) == "" {
		return models.Task{}, errors.New("kapps: title is required")
	}
	if strings.TrimSpace(in.ChannelID) == "" {
		return models.Task{}, errors.New("kapps: channelId is required")
	}
	status := in.Status
	if status == "" {
		status = models.TaskStatusOpen
	}
	if !validTaskStatus(status) {
		return models.Task{}, ErrInvalidStatus
	}
	actor := in.Actor
	if actor == "" {
		actor = "user"
	}
	now := k.now()
	t := models.Task{
		ID:              k.idGen("task"),
		ChannelID:       in.ChannelID,
		Title:           strings.TrimSpace(in.Title),
		Owner:           in.Owner,
		DueDate:         in.DueDate,
		Status:          status,
		AIGenerated:     in.AIGenerated,
		SourceThreadID:  in.SourceThreadID,
		SourceMessageID: in.SourceMessageID,
		History: []models.TaskHistoryEntry{
			{At: now, Actor: actor, Action: "created"},
		},
	}
	return k.store.CreateTask(t), nil
}

// UpdateTaskInput captures the patchable subset of a task. nil pointers leave
// the corresponding field unchanged.
type UpdateTaskInput struct {
	Title   *string
	Owner   *string
	DueDate *time.Time
	// ClearDueDate explicitly removes the due date — the JSON encoder cannot
	// distinguish "null" from "unset", so the handler sets this flag when the
	// payload sends `dueDate: null`.
	ClearDueDate bool
	Status       *models.TaskStatus
	Actor        string
	Note         string
}

// UpdateTask applies a partial update + records the change in the task's
// history. Returns ErrNotFound / ErrInvalidStatus on failure.
func (k *KApps) UpdateTask(id string, in UpdateTaskInput) (models.Task, error) {
	if in.Status != nil && !validTaskStatus(*in.Status) {
		return models.Task{}, ErrInvalidStatus
	}
	actor := in.Actor
	if actor == "" {
		actor = "user"
	}
	now := k.now()
	updated, ok := k.store.UpdateTask(id, func(t *models.Task) {
		if in.Title != nil {
			t.Title = strings.TrimSpace(*in.Title)
		}
		if in.Owner != nil {
			t.Owner = *in.Owner
		}
		if in.ClearDueDate {
			t.DueDate = nil
		} else if in.DueDate != nil {
			t.DueDate = in.DueDate
		}
		if in.Status != nil && *in.Status != t.Status {
			t.History = append(t.History, models.TaskHistoryEntry{
				At:     now,
				Actor:  actor,
				Action: fmt.Sprintf("%s→%s", t.Status, *in.Status),
				Note:   in.Note,
			})
			t.Status = *in.Status
		} else {
			t.History = append(t.History, models.TaskHistoryEntry{
				At:     now,
				Actor:  actor,
				Action: "edited",
				Note:   in.Note,
			})
		}
	})
	if !ok {
		return models.Task{}, ErrNotFound
	}
	return updated, nil
}

// DeleteTask removes a task from the store. Returns ErrNotFound when the task
// does not exist.
func (k *KApps) DeleteTask(id string) error {
	if !k.store.DeleteTask(id) {
		return ErrNotFound
	}
	return nil
}

// ListTasks returns the tasks scoped to a channel.
func (k *KApps) ListTasks(channelID string) []models.Task {
	return k.store.ListTasks(channelID)
}

// ApprovalDecisionInput is the payload accepted by SubmitApprovalDecision.
type ApprovalDecisionInput struct {
	Decision models.ApprovalDecision
	Note     string
	Actor    string
}

// SubmitApprovalDecision appends a decision entry and updates the approval's
// status (approve→approved, reject→rejected). Comments are recorded without
// changing status, matching the immutable decision-log contract in
// PROPOSAL.md §6.2 / ARCHITECTURE.md §6.1.
func (k *KApps) SubmitApprovalDecision(id string, in ApprovalDecisionInput) (models.Approval, error) {
	if in.Decision != models.ApprovalDecisionApprove &&
		in.Decision != models.ApprovalDecisionReject &&
		in.Decision != models.ApprovalDecisionComment {
		return models.Approval{}, ErrInvalidDecision
	}
	actor := in.Actor
	if actor == "" {
		actor = "user"
	}
	now := k.now()
	updated, ok := k.store.UpdateApproval(id, func(a *models.Approval) {
		a.DecisionLog = append(a.DecisionLog, models.ApprovalDecisionEntry{
			At:       now,
			Actor:    actor,
			Decision: in.Decision,
			Note:     in.Note,
		})
		switch in.Decision {
		case models.ApprovalDecisionApprove:
			a.Status = models.ApprovalStatusApproved
		case models.ApprovalDecisionReject:
			a.Status = models.ApprovalStatusRejected
		}
	})
	if !ok {
		return models.Approval{}, ErrNotFound
	}
	return updated, nil
}

func validTaskStatus(s models.TaskStatus) bool {
	switch s {
	case models.TaskStatusOpen,
		models.TaskStatusInProgress,
		models.TaskStatusBlocked,
		models.TaskStatusDone:
		return true
	}
	return false
}

func cardChannelID(c models.Card) string {
	switch c.Kind {
	case models.CardKindTask:
		if c.Task != nil {
			return c.Task.ChannelID
		}
	case models.CardKindApproval:
		if c.Approval != nil {
			return c.Approval.ChannelID
		}
	case models.CardKindArtifact:
		if c.Artifact != nil {
			return c.Artifact.ChannelID
		}
	case models.CardKindEvent:
		if c.Event != nil {
			return c.Event.ChannelID
		}
	}
	return ""
}
