package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// TestKAppsCardsReturnsAllSeededKinds checks that the seeded card
// dataset still covers the two B2B-anchored card kinds (Approval +
// Artifact). The 2026-05-01 ground-zero LLM redesign removed the
// seed-coupled B2C task and event cards — those now come from the
// real on-device LLM at runtime (task extraction, conversation
// insights), so the assertion here is scoped to the kinds that are
// still seed-backed.
func TestKAppsCardsReturnsAllSeededKinds(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Cards) < 2 {
		t.Fatalf("expected at least 2 seeded cards, got %d", len(body.Cards))
	}
	kinds := map[models.CardKind]bool{}
	for _, c := range body.Cards {
		kinds[c.Kind] = true
	}
	want := []models.CardKind{
		models.CardKindApproval,
		models.CardKindArtifact,
	}
	for _, k := range want {
		if !kinds[k] {
			t.Errorf("expected at least one card of kind %q", k)
		}
	}
}

func TestKAppsCardsApprovalHasFieldsAndDecisionLog(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards", "user_alice")
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)

	var appr *models.Approval
	for _, c := range body.Cards {
		if c.Kind == models.CardKindApproval {
			appr = c.Approval
			break
		}
	}
	if appr == nil {
		t.Fatalf("expected at least one approval card")
	}
	if appr.Status != models.ApprovalStatusPending {
		t.Errorf("expected pending approval, got %q", appr.Status)
	}
	if appr.Fields.Vendor == "" || appr.Fields.Amount == "" {
		t.Errorf("expected approval fields to be populated, got %+v", appr.Fields)
	}
	if appr.DecisionLog == nil {
		t.Errorf("expected decision log slice to exist (even if empty)")
	}
}

// TestKAppsCardsFiltersByChannel exercises the channel filter on the
// cards endpoint against the B2B vendor-management channel — the
// one remaining seeded channel that backs a card after the
// 2026-05-01 ground-zero LLM redesign stripped the seed-coupled B2C
// task / event cards.
func TestKAppsCardsFiltersByChannel(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/cards?channelId=ch_vendor_management", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Cards) == 0 {
		t.Fatalf("expected at least one card for ch_vendor_management")
	}
	for _, c := range body.Cards {
		channelID := ""
		switch c.Kind {
		case models.CardKindTask:
			channelID = c.Task.ChannelID
		case models.CardKindApproval:
			channelID = c.Approval.ChannelID
		case models.CardKindArtifact:
			channelID = c.Artifact.ChannelID
		case models.CardKindEvent:
			channelID = c.Event.ChannelID
		}
		if channelID != "ch_vendor_management" {
			t.Errorf("expected only ch_vendor_management cards, got %s", channelID)
		}
	}
}

// Phase 3 — task lifecycle, approval decisions, linked-objects.

func TestLinkedObjectsReturnsSeededCards(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/threads/msg_vend_root/linked-objects", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Cards    []models.Card `json:"cards"`
		ThreadID string        `json:"threadId"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.ThreadID != "msg_vend_root" {
		t.Errorf("expected threadId echo, got %q", body.ThreadID)
	}
	if len(body.Cards) == 0 {
		t.Fatalf("expected at least one linked card")
	}
	for _, c := range body.Cards {
		if c.ThreadID != "msg_vend_root" {
			t.Errorf("expected ThreadID=msg_vend_root, got %q on %s", c.ThreadID, c.Kind)
		}
	}
}

func TestLinkedObjectsEmptyForUnknownThread(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/threads/thr_unknown/linked-objects", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if len(body.Cards) != 0 {
		t.Errorf("expected no cards for unknown thread, got %d", len(body.Cards))
	}
}

func TestCreateAndUpdateTaskLifecycle(t *testing.T) {
	h := newTestServer()

	// Create.
	body := strings.NewReader(`{"channelId":"ch_general","title":"Wire Bonsai-1.7B","owner":"user_alice"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/tasks", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Task models.Task `json:"task"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if created.Task.ID == "" {
		t.Fatalf("expected created task to have an ID")
	}
	if created.Task.Status != models.TaskStatusOpen {
		t.Errorf("expected status=open, got %q", created.Task.Status)
	}
	if len(created.Task.History) == 0 {
		t.Errorf("expected created task to have a history entry")
	}

	// List filtered by channel.
	rec = doGet(t, h, "/api/kapps/tasks?channelId=ch_general", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("list: expected 200, got %d", rec.Code)
	}
	var listed struct {
		Tasks []models.Task `json:"tasks"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &listed)
	found := false
	for _, t2 := range listed.Tasks {
		if t2.ID == created.Task.ID {
			found = true
		}
	}
	if !found {
		t.Errorf("expected newly created task in list")
	}

	// Status transition.
	statusBody := strings.NewReader(`{"status":"in_progress","note":"starting"}`)
	rec = doRequest(t, h, http.MethodPatch, "/api/kapps/tasks/"+created.Task.ID+"/status", "user_alice", statusBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("status: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var statusResp struct {
		Task models.Task `json:"task"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if statusResp.Task.Status != models.TaskStatusInProgress {
		t.Errorf("expected in_progress, got %q", statusResp.Task.Status)
	}
	if len(statusResp.Task.History) < 2 {
		t.Errorf("expected at least 2 history entries (create + transition), got %d", len(statusResp.Task.History))
	}

	// Patch fields.
	patchBody := strings.NewReader(`{"title":"Wire Bonsai-1.7B routing"}`)
	rec = doRequest(t, h, http.MethodPatch, "/api/kapps/tasks/"+created.Task.ID, "user_alice", patchBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: expected 200, got %d", rec.Code)
	}

	// Delete.
	rec = doRequest(t, h, http.MethodDelete, "/api/kapps/tasks/"+created.Task.ID, "user_alice", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", rec.Code)
	}
	rec = doRequest(t, h, http.MethodDelete, "/api/kapps/tasks/"+created.Task.ID, "user_alice", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("delete twice: expected 404, got %d", rec.Code)
	}
}

func TestCreateTaskAcceptsBrowserISOStringDueDate(t *testing.T) {
	// Regression: JavaScript's Date.toISOString() always emits ".000Z"
	// (milliseconds), which time.RFC3339 rejects. parseOptionalTime must
	// use time.RFC3339Nano so the frontend's CreateTaskForm + TaskCard
	// edits round-trip cleanly.
	h := newTestServer()
	body := strings.NewReader(`{"channelId":"ch_general","title":"Sync with PM","dueDate":"2026-05-01T00:00:00.000Z"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/tasks", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Task models.Task `json:"task"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if created.Task.DueDate == nil {
		t.Fatalf("expected dueDate to be set on created task")
	}
	if got := created.Task.DueDate.UTC().Format("2006-01-02"); got != "2026-05-01" {
		t.Errorf("expected dueDate 2026-05-01, got %s", got)
	}
}

func TestUpdateTaskAcceptsBrowserISOStringDueDate(t *testing.T) {
	h := newTestServer()
	createBody := strings.NewReader(`{"channelId":"ch_general","title":"Reschedule"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/tasks", "user_alice", createBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d", rec.Code)
	}
	var created struct {
		Task models.Task `json:"task"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	patchBody := strings.NewReader(`{"dueDate":"2026-06-15T17:30:00.000Z"}`)
	rec = doRequest(t, h, http.MethodPatch, "/api/kapps/tasks/"+created.Task.ID, "user_alice", patchBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateTaskRejectsEmptyTitle(t *testing.T) {
	h := newTestServer()
	body := strings.NewReader(`{"channelId":"ch_general","title":""}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/tasks", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty title, got %d", rec.Code)
	}
}

func TestUpdateTaskStatusRejectsUnknownStatus(t *testing.T) {
	h := newTestServer()
	body := strings.NewReader(`{"status":"on_fire"}`)
	// Status validation runs before task lookup so the path is just a
	// vehicle for the validator to reject the body.
	rec := doRequest(t, h, http.MethodPatch, "/api/kapps/tasks/task_demo/status", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestApprovalDecideAppendsLogAndUpdatesStatus(t *testing.T) {
	h := newTestServer()
	body := strings.NewReader(`{"decision":"approve","note":"LGTM"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/approvals/appr_vendor_q3_logging/decide", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Approval models.Approval `json:"approval"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Approval.Status != models.ApprovalStatusApproved {
		t.Errorf("expected approved, got %q", resp.Approval.Status)
	}
	if len(resp.Approval.DecisionLog) == 0 {
		t.Fatalf("expected decision log to be populated")
	}
	last := resp.Approval.DecisionLog[len(resp.Approval.DecisionLog)-1]
	if last.Decision != models.ApprovalDecisionApprove {
		t.Errorf("expected last decision approve, got %q", last.Decision)
	}
	if last.Actor != "user_alice" {
		t.Errorf("expected actor user_alice, got %q", last.Actor)
	}
}

func TestApprovalDecideRejectsInvalidDecision(t *testing.T) {
	h := newTestServer()
	body := strings.NewReader(`{"decision":"escalate"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/approvals/appr_vendor_q3_logging/decide", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestApprovalDecide404ForUnknownID(t *testing.T) {
	h := newTestServer()
	body := strings.NewReader(`{"decision":"approve"}`)
	rec := doRequest(t, h, http.MethodPost, "/api/kapps/approvals/appr_unknown/decide", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
