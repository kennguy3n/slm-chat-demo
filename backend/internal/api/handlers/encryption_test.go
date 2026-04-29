package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
)

type encKeysList struct {
	Keys []models.TenantEncryptionKey `json:"keys"`
}

type encKeyResp struct {
	Key models.TenantEncryptionKey `json:"key"`
}

func TestEncryptionListReturnsSeededKey(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/workspaces/ws_acme/encryption-keys", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var list encKeysList
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(list.Keys) != 1 {
		t.Fatalf("expected one seeded key, got %d", len(list.Keys))
	}
	k := list.Keys[0]
	if !k.Active {
		t.Errorf("seeded key should be active")
	}
	if k.Algorithm != "aes-256-gcm" {
		t.Errorf("expected aes-256-gcm, got %q", k.Algorithm)
	}
}

func TestEncryptionGenerateAddsNewActiveAndDemotesPrior(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, http.MethodPost, "/api/workspaces/ws_acme/encryption-keys", "user_alice", nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var created encKeyResp
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !created.Key.Active {
		t.Errorf("new key should be active")
	}
	if created.Key.KeyID == "" {
		t.Errorf("expected non-empty keyID")
	}

	rec = doGet(t, h, "/api/workspaces/ws_acme/encryption-keys", "user_alice")
	var list encKeysList
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Keys) != 2 {
		t.Fatalf("expected 2 keys after generate, got %d", len(list.Keys))
	}
	activeCount := 0
	for _, k := range list.Keys {
		if k.Active {
			activeCount++
		}
	}
	if activeCount != 1 {
		t.Errorf("expected exactly one active key, got %d", activeCount)
	}
}

func TestEncryptionRotateMarksOldInactive(t *testing.T) {
	h := newTestServer()
	rec := doRequest(t, h, http.MethodPost, "/api/workspaces/ws_acme/encryption-keys/rotate", "user_alice", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("rotate: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var rotated encKeyResp
	_ = json.Unmarshal(rec.Body.Bytes(), &rotated)
	if !rotated.Key.Active {
		t.Errorf("rotated key should be active")
	}

	rec = doGet(t, h, "/api/workspaces/ws_acme/encryption-keys", "user_alice")
	var list encKeysList
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Keys) != 2 {
		t.Fatalf("expected 2 keys after rotate, got %d", len(list.Keys))
	}
	for _, k := range list.Keys {
		if k.KeyID == "key_acme_seed" && k.Active {
			t.Errorf("seeded key should be inactive after rotate")
		}
		if k.KeyID == "key_acme_seed" && k.RotatedAt.IsZero() {
			t.Errorf("rotated seeded key should carry a RotatedAt timestamp")
		}
	}
}

func TestEncryptionGenerateForUnknownWorkspaceStillSucceeds(t *testing.T) {
	// Generating a key creates the workspace's first entry in the
	// in-memory map. There's no implicit workspace registry the
	// service consults, so we accept this in the demo phase.
	h := newTestServer()
	rec := doRequest(t, h, http.MethodPost, "/api/workspaces/ws_other/encryption-keys", "user_alice", nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}
}
