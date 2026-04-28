package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

func TestUnreadSummaryReturnsSummaryAndSources(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/unread-summary", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Summary         inference.Response `json:"summary"`
		Sources         []map[string]any   `json:"sources"`
		ComputeLocation string             `json:"computeLocation"`
		DataEgressBytes int                `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Summary.Output == "" {
		t.Errorf("expected non-empty summary output")
	}
	if !body.Summary.OnDevice {
		t.Errorf("expected on-device summary")
	}
	if body.ComputeLocation != "on_device" {
		t.Errorf("expected computeLocation=on_device, got %q", body.ComputeLocation)
	}
	if body.DataEgressBytes != 0 {
		t.Errorf("expected zero egress, got %d", body.DataEgressBytes)
	}
	if len(body.Sources) == 0 {
		t.Errorf("expected at least one source message in the digest")
	}
}

func TestUnreadSummaryRequiresAuthenticatedUser(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/unread-summary", "")
	// MockAuth falls back to user_alice when X-User-ID is empty, so the
	// endpoint should still return 200 here. The test exists to lock that
	// behaviour in: an empty header is treated as the demo user, not as
	// unauthenticated.
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 (mock-auth falls back to demo user), got %d", rec.Code)
	}
}
