package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestThreadSummaryReturnsPromptAndSources(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/summarize-thread", map[string]any{
		"threadId": "msg_eng_root",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Prompt          string           `json:"prompt"`
		Sources         []map[string]any `json:"sources"`
		ThreadID        string           `json:"threadId"`
		ChannelID       string           `json:"channelId"`
		Model           string           `json:"model"`
		Tier            string           `json:"tier"`
		Reason          string           `json:"reason"`
		MessageCount    int              `json:"messageCount"`
		ComputeLocation string           `json:"computeLocation"`
		DataEgressBytes int              `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(body.Prompt, "Summarise the following thread") {
		t.Errorf("expected summarise prompt, got %q", body.Prompt)
	}
	if body.ThreadID != "msg_eng_root" {
		t.Errorf("expected threadId echo, got %q", body.ThreadID)
	}
	if body.ChannelID == "" {
		t.Errorf("expected channelId in response")
	}
	if body.MessageCount == 0 {
		t.Errorf("expected non-zero messageCount")
	}
	if len(body.Sources) == 0 {
		t.Errorf("expected at least one source message")
	}
	if body.Model == "" {
		t.Errorf("expected non-empty model")
	}
	if body.Tier == "" {
		t.Errorf("expected non-empty tier")
	}
	if body.Reason == "" {
		t.Errorf("expected non-empty reason")
	}
	if body.ComputeLocation != "on_device" {
		t.Errorf("expected on_device, got %q", body.ComputeLocation)
	}
	if body.DataEgressBytes != 0 {
		t.Errorf("expected zero egress, got %d", body.DataEgressBytes)
	}
}

func TestThreadSummaryDoesNotRunInference(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/summarize-thread", map[string]any{
		"threadId": "msg_eng_root",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var raw map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &raw)
	if _, ok := raw["summary"]; ok {
		t.Errorf("response unexpectedly contains a 'summary' field; the thread-summary endpoint should not run inference")
	}
	if _, ok := raw["output"]; ok {
		t.Errorf("response unexpectedly contains an 'output' field")
	}
}

func TestThreadSummaryRequiresThreadID(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/summarize-thread", map[string]any{})
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestThreadSummary404OnUnknownThread(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/summarize-thread", map[string]any{
		"threadId": "thread_does_not_exist",
	})
	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", rec.Code)
	}
}
