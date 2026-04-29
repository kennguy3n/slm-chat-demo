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
	audit *AuditService
}

func NewKApps(s *store.Memory) *KApps {
	return &KApps{
		store: s,
		now:   time.Now,
		idGen: defaultIDGen,
	}
}

// WithAudit attaches an AuditService so KApp mutations record audit
// entries. Callers that don't need audit recording can leave it unset —
// the service handles a nil receiver.
func (k *KApps) WithAudit(a *AuditService) *KApps {
	k.audit = a
	return k
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
	saved := k.store.CreateTask(t)
	k.audit.Record(models.AuditEventTaskCreated, models.AuditObjectTask, saved.ID, actor, map[string]any{
		"title":       saved.Title,
		"channelId":   saved.ChannelID,
		"status":      string(saved.Status),
		"aiGenerated": saved.AIGenerated,
	})
	return saved, nil
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
	eventType := models.AuditEventTaskUpdated
	details := map[string]any{}
	if in.Status != nil {
		details["status"] = string(*in.Status)
		if *in.Status == models.TaskStatusDone {
			eventType = models.AuditEventTaskClosed
		}
	}
	if in.Note != "" {
		details["note"] = in.Note
	}
	k.audit.Record(eventType, models.AuditObjectTask, updated.ID, actor, details)
	return updated, nil
}

// DeleteTask removes a task from the store. Returns ErrNotFound when the task
// does not exist.
func (k *KApps) DeleteTask(id string) error {
	if !k.store.DeleteTask(id) {
		return ErrNotFound
	}
	k.audit.Record(models.AuditEventTaskClosed, models.AuditObjectTask, id, "", map[string]any{
		"reason": "deleted",
	})
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
	k.audit.Record(models.AuditEventApprovalDecisioned, models.AuditObjectApproval, updated.ID, actor, map[string]any{
		"decision": string(in.Decision),
		"status":   string(updated.Status),
		"note":     in.Note,
	})
	return updated, nil
}

// ---------- Approvals (create) ----------

// CreateApprovalInput is the validated payload for POST /api/kapps/approvals.
type CreateApprovalInput struct {
	ChannelID      string
	TemplateID     string
	Title          string
	Requester      string
	Approvers      []string
	Fields         models.ApprovalFields
	SourceThreadID string
	AIGenerated    bool
	Actor          string
}

// CreateApproval validates and persists a new approval card with status
// `pending` and an empty decision log. Phase 3 — completes the approval
// submit flow (PROPOSAL.md §5.3).
func (k *KApps) CreateApproval(in CreateApprovalInput) (models.Approval, error) {
	if strings.TrimSpace(in.Title) == "" {
		return models.Approval{}, errors.New("kapps: title is required")
	}
	if strings.TrimSpace(in.ChannelID) == "" {
		return models.Approval{}, errors.New("kapps: channelId is required")
	}
	requester := in.Requester
	if requester == "" {
		requester = in.Actor
	}
	if requester == "" {
		requester = "user"
	}
	templateID := in.TemplateID
	if templateID == "" {
		templateID = "vendor_contract_v1"
	}
	approvers := in.Approvers
	if approvers == nil {
		approvers = []string{}
	}
	a := models.Approval{
		ID:             k.idGen("appr"),
		ChannelID:      in.ChannelID,
		TemplateID:     templateID,
		Title:          strings.TrimSpace(in.Title),
		Requester:      requester,
		Approvers:      approvers,
		Fields:         in.Fields,
		Status:         models.ApprovalStatusPending,
		DecisionLog:    []models.ApprovalDecisionEntry{},
		SourceThreadID: in.SourceThreadID,
		AIGenerated:    in.AIGenerated,
	}
	saved := k.store.CreateApproval(a)
	actor := in.Actor
	if actor == "" {
		actor = requester
	}
	k.audit.Record(models.AuditEventApprovalSubmitted, models.AuditObjectApproval, saved.ID, actor, map[string]any{
		"templateId":  saved.TemplateID,
		"title":       saved.Title,
		"requester":   saved.Requester,
		"channelId":   saved.ChannelID,
		"aiGenerated": saved.AIGenerated,
	})
	return saved, nil
}

// ---------- Artifacts ----------

// CreateArtifactInput is the validated payload for POST /api/kapps/artifacts.
type CreateArtifactInput struct {
	ChannelID      string
	Type           models.ArtifactType
	Title          string
	TemplateID     string
	SourceThreadID string
	Author         string
	Body           string
	Summary        string
	SourcePins     []models.ArtifactSourcePin
	AIGenerated    bool
	Actor          string
}

// CreateArtifact persists a new artifact with v1 populated from the input
// body. Phase 3 — backs the Docs/Artifacts KApp.
func (k *KApps) CreateArtifact(in CreateArtifactInput) (models.Artifact, error) {
	if strings.TrimSpace(in.Title) == "" {
		return models.Artifact{}, errors.New("kapps: title is required")
	}
	if strings.TrimSpace(in.ChannelID) == "" {
		return models.Artifact{}, errors.New("kapps: channelId is required")
	}
	if !validArtifactType(in.Type) {
		return models.Artifact{}, fmt.Errorf("%w: unknown artifact type", ErrInvalidStatus)
	}
	author := in.Author
	if author == "" {
		author = in.Actor
	}
	if author == "" {
		author = "user"
	}
	now := k.now()
	sourceRefs := []models.ArtifactSourceRef{}
	if in.SourceThreadID != "" {
		sourceRefs = append(sourceRefs, models.ArtifactSourceRef{
			Kind: "thread",
			ID:   in.SourceThreadID,
			Note: "Source thread",
		})
	}
	v1 := models.ArtifactVersion{
		Version:    1,
		CreatedAt:  now,
		Author:     author,
		Summary:    in.Summary,
		Body:       in.Body,
		SourcePins: in.SourcePins,
	}
	a := models.Artifact{
		ID:          k.idGen("art"),
		ChannelID:   in.ChannelID,
		Type:        in.Type,
		Title:       strings.TrimSpace(in.Title),
		TemplateID:  in.TemplateID,
		SourceRefs:  sourceRefs,
		Versions:    []models.ArtifactVersion{v1},
		Status:      models.ArtifactStatusDraft,
		AIGenerated: in.AIGenerated,
	}
	saved := k.store.CreateArtifact(a)
	k.audit.Record(models.AuditEventArtifactCreated, models.AuditObjectArtifact, saved.ID, author, map[string]any{
		"type":        string(saved.Type),
		"title":       saved.Title,
		"channelId":   saved.ChannelID,
		"aiGenerated": saved.AIGenerated,
	})
	return saved, nil
}

// GetArtifact returns the full artifact (with version bodies and source pins)
// or ErrNotFound.
func (k *KApps) GetArtifact(id string) (models.Artifact, error) {
	a, ok := k.store.GetArtifact(id)
	if !ok {
		return models.Artifact{}, ErrNotFound
	}
	return a, nil
}

// ListArtifacts returns artifacts (without bodies) scoped to a channel.
func (k *KApps) ListArtifacts(channelID string) []models.Artifact {
	return k.store.ListArtifacts(channelID)
}

// UpdateArtifactInput captures the patchable subset of an artifact. Used by
// PATCH /api/kapps/artifacts/{id}.
type UpdateArtifactInput struct {
	Title  *string
	Status *models.ArtifactStatus
	URL    *string
	Actor  string
}

// UpdateArtifact applies the patch and validates the requested status
// transition (draft → in_review → published, or any → draft). Returns
// ErrInvalidStatus on illegal transitions.
func (k *KApps) UpdateArtifact(id string, in UpdateArtifactInput) (models.Artifact, error) {
	if in.Status != nil && !validArtifactStatus(*in.Status) {
		return models.Artifact{}, ErrInvalidStatus
	}
	var transitionErr error
	updated, ok := k.store.UpdateArtifact(id, func(a *models.Artifact) {
		if in.Status != nil && !validArtifactTransition(a.Status, *in.Status) {
			transitionErr = ErrInvalidStatus
			return
		}
		if in.Title != nil {
			a.Title = strings.TrimSpace(*in.Title)
		}
		if in.URL != nil {
			a.URL = *in.URL
		}
		if in.Status != nil {
			a.Status = *in.Status
		}
	})
	if !ok {
		return models.Artifact{}, ErrNotFound
	}
	if transitionErr != nil {
		return models.Artifact{}, transitionErr
	}
	actor := in.Actor
	if actor == "" {
		actor = "user"
	}
	if in.Status != nil {
		k.audit.Record(models.AuditEventArtifactStatusChanged, models.AuditObjectArtifact, updated.ID, actor, map[string]any{
			"status": string(updated.Status),
		})
	}
	return updated, nil
}

// CreateArtifactVersionInput drives POST /api/kapps/artifacts/{id}/versions.
type CreateArtifactVersionInput struct {
	Author     string
	Summary    string
	Body       string
	SourcePins []models.ArtifactSourcePin
	Actor      string
}

// CreateArtifactVersion appends a new immutable version, auto-incrementing the
// version number. Empty bodies are allowed (callers may still record
// metadata-only revisions) but the body is normally required for diffs.
func (k *KApps) CreateArtifactVersion(id string, in CreateArtifactVersionInput) (models.ArtifactVersion, error) {
	author := in.Author
	if author == "" {
		author = in.Actor
	}
	if author == "" {
		author = "user"
	}
	now := k.now()
	var added models.ArtifactVersion
	_, ok := k.store.UpdateArtifact(id, func(a *models.Artifact) {
		next := 1
		for _, v := range a.Versions {
			if v.Version >= next {
				next = v.Version + 1
			}
		}
		added = models.ArtifactVersion{
			Version:    next,
			CreatedAt:  now,
			Author:     author,
			Summary:    in.Summary,
			Body:       in.Body,
			SourcePins: in.SourcePins,
		}
		a.Versions = append(a.Versions, added)
	})
	if !ok {
		return models.ArtifactVersion{}, ErrNotFound
	}
	k.audit.Record(models.AuditEventArtifactVersionAdded, models.AuditObjectArtifact, id, author, map[string]any{
		"version": added.Version,
		"summary": added.Summary,
	})
	return added, nil
}

// GetArtifactVersion fetches a single artifact version with its full body.
func (k *KApps) GetArtifactVersion(id string, version int) (models.ArtifactVersion, error) {
	a, ok := k.store.GetArtifact(id)
	if !ok {
		return models.ArtifactVersion{}, ErrNotFound
	}
	for _, v := range a.Versions {
		if v.Version == version {
			return v, nil
		}
	}
	return models.ArtifactVersion{}, ErrNotFound
}

// ---------- Forms ----------

// CreateFormInput drives POST /api/kapps/forms.
type CreateFormInput struct {
	ChannelID      string
	TemplateID     string
	Title          string
	Fields         map[string]string
	SourceThreadID string
	Status         models.FormStatus
	AIGenerated    bool
}

// CreateForm validates and persists a Form intake instance. The TemplateID
// must reference a seeded template (otherwise the renderer cannot lay out
// the form).
func (k *KApps) CreateForm(in CreateFormInput) (models.Form, error) {
	if strings.TrimSpace(in.ChannelID) == "" {
		return models.Form{}, errors.New("kapps: channelId is required")
	}
	if strings.TrimSpace(in.TemplateID) == "" {
		return models.Form{}, errors.New("kapps: templateId is required")
	}
	tmpl, ok := k.store.GetFormTemplate(in.TemplateID)
	if !ok {
		return models.Form{}, ErrNotFound
	}
	title := in.Title
	if title == "" {
		title = tmpl.Title
	}
	status := in.Status
	if status == "" {
		status = models.FormStatusDraft
	}
	fields := in.Fields
	if fields == nil {
		fields = map[string]string{}
	}
	f := models.Form{
		ID:             k.idGen("form"),
		ChannelID:      in.ChannelID,
		TemplateID:     in.TemplateID,
		Title:          title,
		Fields:         fields,
		SourceThreadID: in.SourceThreadID,
		Status:         status,
		AIGenerated:    in.AIGenerated,
	}
	saved := k.store.CreateForm(f)
	k.audit.Record(models.AuditEventFormSubmitted, models.AuditObjectForm, saved.ID, "", map[string]any{
		"templateId":  saved.TemplateID,
		"title":       saved.Title,
		"channelId":   saved.ChannelID,
		"status":      string(saved.Status),
		"aiGenerated": saved.AIGenerated,
	})
	return saved, nil
}

// ListForms returns all forms scoped to a channel.
func (k *KApps) ListForms(channelID string) []models.Form {
	return k.store.ListForms(channelID)
}

// ListFormTemplates returns the seeded templates (vendor / expense / access).
func (k *KApps) ListFormTemplates() []models.FormTemplate {
	return k.store.ListFormTemplates()
}

func validArtifactType(t models.ArtifactType) bool {
	switch t {
	case models.ArtifactTypePRD,
		models.ArtifactTypeRFC,
		models.ArtifactTypeProposal,
		models.ArtifactTypeSOP,
		models.ArtifactTypeQBR:
		return true
	}
	return false
}

func validArtifactStatus(s models.ArtifactStatus) bool {
	switch s {
	case models.ArtifactStatusDraft,
		models.ArtifactStatusInReview,
		models.ArtifactStatusPublished:
		return true
	}
	return false
}

func validArtifactTransition(from, to models.ArtifactStatus) bool {
	if from == to {
		return true
	}
	switch from {
	case models.ArtifactStatusDraft:
		return to == models.ArtifactStatusInReview || to == models.ArtifactStatusPublished
	case models.ArtifactStatusInReview:
		return to == models.ArtifactStatusPublished || to == models.ArtifactStatusDraft
	case models.ArtifactStatusPublished:
		// Published is terminal but we still allow re-opening to draft for
		// the demo so reviewers can iterate on a published doc.
		return to == models.ArtifactStatusDraft
	}
	return false
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
