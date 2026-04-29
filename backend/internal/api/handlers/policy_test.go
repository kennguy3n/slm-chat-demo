package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestPolicyGetReturnsSeeded(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_acme/policy", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Policy models.WorkspacePolicy `json:"policy"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Policy.WorkspaceID != "ws_acme" {
		t.Errorf("expected ws_acme, got %q", resp.Policy.WorkspaceID)
	}
	if resp.Policy.AllowServerCompute {
		t.Errorf("seed should keep server compute disabled by default")
	}
	if !resp.Policy.RequireRedaction {
		t.Errorf("seed should require redaction")
	}
	if len(resp.Policy.ServerAllowedTasks) == 0 {
		t.Errorf("expected non-empty seeded allow list")
	}
}

func TestPolicyPatchUpdatesFields(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{
		"allowServerCompute": true,
		"serverAllowedTasks": ["draft_artifact"],
		"serverDeniedTasks": ["translate"],
		"maxEgressBytesPerDay": 999,
		"requireRedaction": false
	}`)
	rec := doRequest(t, h, http.MethodPatch, "/api/workspaces/ws_acme/policy", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Policy models.WorkspacePolicy `json:"policy"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !resp.Policy.AllowServerCompute {
		t.Errorf("expected AllowServerCompute=true after patch")
	}
	if resp.Policy.RequireRedaction {
		t.Errorf("expected RequireRedaction=false after patch")
	}
	if resp.Policy.MaxEgressBytesPerDay != 999 {
		t.Errorf("expected MaxEgressBytesPerDay=999, got %d", resp.Policy.MaxEgressBytesPerDay)
	}
	if len(resp.Policy.ServerAllowedTasks) != 1 || resp.Policy.ServerAllowedTasks[0] != "draft_artifact" {
		t.Errorf("expected allow list [draft_artifact], got %v", resp.Policy.ServerAllowedTasks)
	}
	if resp.Policy.UpdatedBy != "user_alice" {
		t.Errorf("expected UpdatedBy=user_alice, got %q", resp.Policy.UpdatedBy)
	}

	// Re-fetch to confirm persistence.
	rec = doGet(t, h, "/api/workspaces/ws_acme/policy", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("re-fetch: %d", rec.Code)
	}
	var refetched struct {
		Policy models.WorkspacePolicy `json:"policy"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &refetched)
	if !refetched.Policy.AllowServerCompute {
		t.Errorf("patch did not persist")
	}
}

func TestPolicyPatchUnknownWorkspaceReturns404(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"allowServerCompute": true}`)
	rec := doRequest(t, h, http.MethodPatch, "/api/workspaces/ws_unknown/policy", "user_alice", body)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPolicyGetUnknownWorkspaceReturns404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_unknown/policy", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
