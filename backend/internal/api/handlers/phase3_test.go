package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

// ------------------------------------------------------------------
// Phase 3 — approvals submit, artifacts CRUD + versions, forms intake
// ------------------------------------------------------------------

func TestCreateApprovalPersistsPendingCard(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{
		"channelId": "ch_vendor_management",
		"templateId": "vendor_contract_v1",
		"title": "Q4 logging vendor contract",
		"requester": "user_alice",
		"approvers": ["user_dave","user_eve"],
		"fields": {
			"vendor": "Acme Logging",
			"amount": "$48,000",
			"justification": "Quarterly retention upgrade",
			"risk": "low"
		},
		"sourceThreadId": "msg_vend_root",
		"aiGenerated": true
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/approvals", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Approval models.Approval `json:"approval"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Approval.ID == "" {
		t.Fatalf("expected approval id, got empty")
	}
	if resp.Approval.Status != models.ApprovalStatusPending {
		t.Errorf("expected pending, got %q", resp.Approval.Status)
	}
	if resp.Approval.Fields.Vendor != "Acme Logging" {
		t.Errorf("expected vendor field carried, got %+v", resp.Approval.Fields)
	}
	if resp.Approval.SourceThreadID != "msg_vend_root" {
		t.Errorf("expected source thread carried")
	}
	if !resp.Approval.AIGenerated {
		t.Errorf("expected aiGenerated true")
	}

	// linked-objects should now include the new approval card.
	rec = doGet(t, h, "/api/threads/msg_vend_root/linked-objects", "user_alice")
	var linked struct {
		Cards []models.Card `json:"cards"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &linked)
	found := false
	for _, c := range linked.Cards {
		if c.Kind == models.CardKindApproval && c.Approval != nil && c.Approval.ID == resp.Approval.ID {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected linked-objects to include new approval %s", resp.Approval.ID)
	}
}

func TestCreateApprovalRejectsMissingTitle(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_vendor_management","title":""}`)
	rec := doRequest(t, h, "POST", "/api/kapps/approvals", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestArtifactCRUDLifecycle(t *testing.T) {
	h := newTestServer()

	// Create an artifact with a body and source pin.
	create := bytes.NewBufferString(`{
		"channelId": "ch_engineering",
		"type": "PRD",
		"title": "Latency SLA PRD",
		"sourceThreadId": "msg_eng_root",
		"author": "user_alice",
		"body": "# Goal\nKeep p99 latency under 200ms.\n",
		"summary": "Initial draft",
		"sourcePins": [
			{"sectionId":"goal","sourceMessageId":"msg_eng_root","sourceThreadId":"msg_eng_root","sender":"user_alice","excerpt":"Kicking off"}
		],
		"aiGenerated": true
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/artifacts", "user_alice", create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var c struct {
		Artifact models.Artifact `json:"artifact"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &c)
	id := c.Artifact.ID
	if id == "" || c.Artifact.Status != models.ArtifactStatusDraft {
		t.Fatalf("expected draft artifact, got %+v", c.Artifact)
	}
	if len(c.Artifact.Versions) != 1 || c.Artifact.Versions[0].Version != 1 {
		t.Fatalf("expected v1, got %+v", c.Artifact.Versions)
	}
	if len(c.Artifact.Versions[0].SourcePins) != 1 {
		t.Errorf("expected source pin carried into v1")
	}

	// List should include the new artifact (with bodies stripped).
	rec = doGet(t, h, "/api/kapps/artifacts?channelId=ch_engineering", "user_alice")
	var l struct {
		Artifacts []models.Artifact `json:"artifacts"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &l)
	found := false
	for _, a := range l.Artifacts {
		if a.ID == id {
			found = true
			if len(a.Versions) > 0 && a.Versions[0].Body != "" {
				t.Errorf("list response should strip version bodies")
			}
		}
	}
	if !found {
		t.Errorf("expected created artifact in list")
	}

	// Get returns full body.
	rec = doGet(t, h, "/api/kapps/artifacts/"+id, "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var g struct {
		Artifact models.Artifact `json:"artifact"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &g)
	if g.Artifact.Versions[0].Body == "" {
		t.Errorf("expected body in get response")
	}

	// Add a new version.
	v2 := bytes.NewBufferString(`{
		"author": "user_dave",
		"summary": "Tighten SLA",
		"body": "# Goal\nKeep p99 latency under 150ms.\n",
		"sourcePins": [{"sectionId":"goal","sourceMessageId":"msg_eng_r1","excerpt":"tighten"}]
	}`)
	rec = doRequest(t, h, "POST", "/api/kapps/artifacts/"+id+"/versions", "user_alice", v2)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var vv struct {
		Version models.ArtifactVersion `json:"version"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &vv)
	if vv.Version.Version != 2 {
		t.Errorf("expected version 2, got %d", vv.Version.Version)
	}

	// GetVersion fetches v2 body.
	rec = doGet(t, h, "/api/kapps/artifacts/"+id+"/versions/2", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var gv struct {
		Version models.ArtifactVersion `json:"version"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &gv)
	if gv.Version.Body == "" {
		t.Errorf("expected v2 body, got empty")
	}

	// Patch — transition draft → in_review.
	patch := bytes.NewBufferString(`{"status":"in_review"}`)
	rec = doRequest(t, h, "PATCH", "/api/kapps/artifacts/"+id, "user_alice", patch)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var p struct {
		Artifact models.Artifact `json:"artifact"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if p.Artifact.Status != models.ArtifactStatusInReview {
		t.Errorf("expected in_review, got %q", p.Artifact.Status)
	}

	// Publish.
	pub := bytes.NewBufferString(`{"status":"published"}`)
	rec = doRequest(t, h, "PATCH", "/api/kapps/artifacts/"+id, "user_alice", pub)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	if p.Artifact.Status != models.ArtifactStatusPublished {
		t.Errorf("expected published, got %q", p.Artifact.Status)
	}
}

func TestArtifactCreateRejectsUnknownType(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_engineering","type":"BOGUS","title":"x"}`)
	rec := doRequest(t, h, "POST", "/api/kapps/artifacts", "user_alice", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestArtifactGetReturns404OnUnknown(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/artifacts/art_does_not_exist", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestArtifactVersionGet404OnUnknownVersion(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/artifacts/art_inline_translation_prd/versions/99", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestFormTemplatesSeeded(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/kapps/form-templates", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp struct {
		Templates []models.FormTemplate `json:"templates"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	ids := map[string]bool{}
	for _, t := range resp.Templates {
		ids[t.ID] = true
	}
	for _, want := range []string{"vendor_onboarding_v1", "expense_report_v1", "access_request_v1"} {
		if !ids[want] {
			t.Errorf("missing template %q", want)
		}
	}
}

func TestCreateFormPersistsPrefilledFields(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{
		"channelId": "ch_vendor_management",
		"templateId": "vendor_onboarding_v1",
		"fields": {"vendor":"Acme","amount":"$48,000","compliance":"SOC2"},
		"sourceThreadId": "msg_vend_root",
		"aiGenerated": true
	}`)
	rec := doRequest(t, h, "POST", "/api/kapps/forms", "user_alice", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var c struct {
		Form models.Form `json:"form"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &c)
	if c.Form.ID == "" || c.Form.Status != models.FormStatusDraft {
		t.Fatalf("expected draft form with id, got %+v", c.Form)
	}
	if c.Form.Fields["vendor"] != "Acme" {
		t.Errorf("expected vendor field carried")
	}
	if c.Form.Title == "" {
		t.Errorf("expected title from template default")
	}

	rec = doGet(t, h, "/api/kapps/forms?channelId=ch_vendor_management", "user_alice")
	var l struct {
		Forms []models.Form `json:"forms"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &l)
	if len(l.Forms) == 0 {
		t.Errorf("expected at least one form in list")
	}
}

func TestCreateFormRejectsUnknownTemplate(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"channelId":"ch_vendor_management","templateId":"bogus_v1"}`)
	rec := doRequest(t, h, "POST", "/api/kapps/forms", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
