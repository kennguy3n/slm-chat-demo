package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// auditEntries decodes the GET /api/audit response.
type auditEntries struct {
	Entries []models.AuditEntry `json:"entries"`
}

func TestAuditLogRecordsTaskCreation(t *testing.T) {
	h := newTestServer()

	body := bytes.NewBufferString(`{
		"channelId": "ch_engineering_q4",
		"title": "Wire audit log",
		"owner": "user_alice"
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/tasks", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create task: expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Task models.Task `json:"task"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created task: %v", err)
	}

	rec = doGet(t, h, "/api/audit?objectId="+created.Task.ID, "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("audit list: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp auditEntries
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode audit list: %v", err)
	}
	if len(resp.Entries) != 1 {
		t.Fatalf("expected 1 audit entry for task, got %d", len(resp.Entries))
	}
	e := resp.Entries[0]
	if e.EventType != models.AuditEventTaskCreated {
		t.Errorf("expected task.created, got %q", e.EventType)
	}
	if e.ObjectKind != models.AuditObjectTask {
		t.Errorf("expected objectKind=task, got %q", e.ObjectKind)
	}
	if e.Actor != "user_alice" {
		t.Errorf("expected actor=user_alice, got %q", e.Actor)
	}
	if e.Details["title"] != "Wire audit log" {
		t.Errorf("expected title detail, got %+v", e.Details)
	}
}

func TestAuditLogRecordsApprovalDecision(t *testing.T) {
	h := newTestServer()

	createBody := bytes.NewBufferString(`{
		"channelId": "ch_vendor_management",
		"templateId": "vendor_contract_v1",
		"title": "Vendor contract",
		"requester": "user_alice",
		"fields": {"vendor":"Acme","amount":"$1000"}
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/approvals", "user_alice", createBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create approval: %d %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Approval models.Approval `json:"approval"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	approvalID := resp.Approval.ID

	decideBody := bytes.NewBufferString(`{"decision":"approve","note":"LGTM"}`)
	rec = doRequest(t, h, "POST", "/api/kapps/approvals/"+approvalID+"/decide", "user_dave", decideBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("decide: %d %s", rec.Code, rec.Body.String())
	}

	rec = doGet(t, h, "/api/audit?objectId="+approvalID+"&objectKind=approval", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("list audit: %d %s", rec.Code, rec.Body.String())
	}
	var entries auditEntries
	if err := json.Unmarshal(rec.Body.Bytes(), &entries); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(entries.Entries) != 2 {
		t.Fatalf("expected 2 entries (submit + decision), got %d: %+v", len(entries.Entries), entries.Entries)
	}
	if entries.Entries[0].EventType != models.AuditEventApprovalSubmitted {
		t.Errorf("expected approval.submitted, got %q", entries.Entries[0].EventType)
	}
	decision := entries.Entries[1]
	if decision.EventType != models.AuditEventApprovalDecisioned {
		t.Errorf("expected approval.decisioned, got %q", decision.EventType)
	}
	if decision.Actor != "user_dave" {
		t.Errorf("expected actor=user_dave, got %q", decision.Actor)
	}
	if decision.Details["decision"] != "approve" {
		t.Errorf("expected decision=approve, got %+v", decision.Details)
	}
}

func TestAuditLogRecordsArtifactPublish(t *testing.T) {
	h := newTestServer()

	createBody := bytes.NewBufferString(`{
		"channelId": "ch_engineering_q4",
		"type": "PRD",
		"title": "Audit Log",
		"body": "# Goals\n\nShip it."
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/artifacts", "user_alice", createBody)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create artifact: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Artifact models.Artifact `json:"artifact"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	artifactID := created.Artifact.ID

	patchBody := bytes.NewBufferString(`{"status":"in_review"}`)
	rec = doRequest(t, h, "PATCH", "/api/kapps/artifacts/"+artifactID, "user_alice", patchBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch artifact: %d %s", rec.Code, rec.Body.String())
	}

	publishBody := bytes.NewBufferString(`{"status":"published"}`)
	rec = doRequest(t, h, "PATCH", "/api/kapps/artifacts/"+artifactID, "user_alice", publishBody)
	if rec.Code != http.StatusOK {
		t.Fatalf("publish artifact: %d %s", rec.Code, rec.Body.String())
	}

	rec = doGet(t, h, "/api/audit?objectId="+artifactID, "user_alice")
	var entries auditEntries
	_ = json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries.Entries) != 3 {
		t.Fatalf("expected 3 entries (created, in_review, published), got %d: %+v", len(entries.Entries), entries.Entries)
	}
	if entries.Entries[0].EventType != models.AuditEventArtifactCreated {
		t.Errorf("entry 0: expected artifact.created, got %q", entries.Entries[0].EventType)
	}
	if entries.Entries[1].EventType != models.AuditEventArtifactStatusChanged {
		t.Errorf("entry 1: expected artifact.status_changed, got %q", entries.Entries[1].EventType)
	}
	if entries.Entries[1].Details["status"] != "in_review" {
		t.Errorf("entry 1: expected status=in_review, got %+v", entries.Entries[1].Details)
	}
	if entries.Entries[2].Details["status"] != "published" {
		t.Errorf("entry 2: expected status=published, got %+v", entries.Entries[2].Details)
	}
}

func TestAuditLogFilterByObjectKind(t *testing.T) {
	h := newTestServer()

	rec := doRequest(t, h, "POST", "/api/kapps/tasks", "user_alice",
		bytes.NewBufferString(`{"channelId":"ch_engineering_q4","title":"T1"}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create task: %d %s", rec.Code, rec.Body.String())
	}
	rec = doRequest(t, h, "POST", "/api/kapps/approvals", "user_alice",
		bytes.NewBufferString(`{"channelId":"ch_vendor_management","templateId":"vendor_contract_v1","title":"A1","fields":{"vendor":"X"}}`))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create approval: %d %s", rec.Code, rec.Body.String())
	}

	rec = doGet(t, h, "/api/audit?objectKind=task", "user_alice")
	var entries auditEntries
	_ = json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries.Entries) != 1 {
		t.Fatalf("expected 1 task entry, got %d", len(entries.Entries))
	}
	if entries.Entries[0].ObjectKind != models.AuditObjectTask {
		t.Errorf("expected task entry, got %q", entries.Entries[0].ObjectKind)
	}

	rec = doGet(t, h, "/api/audit?objectKind=approval", "user_alice")
	_ = json.Unmarshal(rec.Body.Bytes(), &entries)
	if len(entries.Entries) != 1 {
		t.Fatalf("expected 1 approval entry, got %d", len(entries.Entries))
	}
	if entries.Entries[0].ObjectKind != models.AuditObjectApproval {
		t.Errorf("expected approval entry, got %q", entries.Entries[0].ObjectKind)
	}
}
