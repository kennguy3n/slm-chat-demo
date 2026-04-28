package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
)

func TestSmartReplyReturnsRepliesWithPrivacyMetadata(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/smart-reply", map[string]any{
		"channelId": "ch_family",
		"messageId": "msg_fam_1",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Replies         []string `json:"replies"`
		Model           string   `json:"model"`
		ComputeLocation string   `json:"computeLocation"`
		DataEgressBytes int      `json:"dataEgressBytes"`
		ChannelID       string   `json:"channelId"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Replies) == 0 {
		t.Fatalf("expected at least one suggested reply, got 0")
	}
	if len(body.Replies) > 3 {
		t.Errorf("expected ≤3 suggested replies, got %d", len(body.Replies))
	}
	if body.Model == "" {
		t.Errorf("expected non-empty model")
	}
	if body.ComputeLocation != "on_device" {
		t.Errorf("expected on_device, got %q", body.ComputeLocation)
	}
	if body.DataEgressBytes != 0 {
		t.Errorf("expected 0 egress, got %d", body.DataEgressBytes)
	}
	if body.ChannelID != "ch_family" {
		t.Errorf("expected channelId echo, got %q", body.ChannelID)
	}
}

func TestSmartReplyRequiresChannelID(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/smart-reply", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestSmartReplyRejects404OnUnknownChannel(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/smart-reply", map[string]any{
		"channelId": "ch_does_not_exist",
	})
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}
