package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

func TestTenantStorageGetReturnsSeed(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_acme/storage", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Storage models.TenantStorageConfig `json:"storage"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Storage.WorkspaceID != "ws_acme" {
		t.Errorf("expected ws_acme, got %q", resp.Storage.WorkspaceID)
	}
	if resp.Storage.DatabaseRegion != "us-east-1" {
		t.Errorf("expected us-east-1, got %q", resp.Storage.DatabaseRegion)
	}
	if resp.Storage.Dedicated {
		t.Errorf("seed should be Dedicated=false")
	}
}

func TestTenantStoragePatchUpdates(t *testing.T) {
	h := newTestServer()
	body := bytes.NewBufferString(`{"databaseRegion":"eu-west-1","dedicated":true}`)
	rec := doRequest(t, h, http.MethodPatch, "/api/workspaces/ws_acme/storage", "user_alice", body)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Storage models.TenantStorageConfig `json:"storage"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.Storage.DatabaseRegion != "eu-west-1" {
		t.Errorf("expected eu-west-1, got %q", resp.Storage.DatabaseRegion)
	}
	if !resp.Storage.Dedicated {
		t.Errorf("expected Dedicated=true")
	}
}

func TestTenantStorageGetUnknownReturns404(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_unknown/storage", "user_alice")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
