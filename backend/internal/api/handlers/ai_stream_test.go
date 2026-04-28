package handlers_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// TestAIStreamHasSSEHeaders verifies the /api/ai/stream endpoint sets the
// canonical SSE headers required by browsers and proxies.
func TestAIStreamHasSSEHeaders(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/stream", map[string]any{"taskType": "summarize"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Errorf("expected Content-Type=text/event-stream, got %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("expected Cache-Control=no-cache, got %q", got)
	}
	if got := rec.Header().Get("Connection"); got != "keep-alive" {
		t.Errorf("expected Connection=keep-alive, got %q", got)
	}
}

// TestAIStreamEmitsAtLeastOneDeltaAndOneDoneEvent decodes the SSE stream
// body and verifies it contains at least one delta event and ends with a
// done event.
func TestAIStreamEmitsAtLeastOneDeltaAndOneDoneEvent(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/stream", map[string]any{"taskType": "summarize"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	events := parseSSEFrames(t, rec.Body.Bytes())
	if len(events) < 2 {
		t.Fatalf("expected at least 2 events (delta + done), got %d: %v", len(events), events)
	}
	gotDelta := false
	gotDone := false
	for _, e := range events {
		if v, _ := e["delta"].(string); v != "" {
			gotDelta = true
		}
		if d, _ := e["done"].(bool); d {
			gotDone = true
		}
	}
	if !gotDelta {
		t.Errorf("expected at least one delta event, got %v", events)
	}
	if !gotDone {
		t.Errorf("expected a done event, got %v", events)
	}
	last := events[len(events)-1]
	if d, _ := last["done"].(bool); !d {
		t.Errorf("expected last event to have done=true, got %v", last)
	}
}

// TestAIRouteIncludesRouterDecisionMetadata exercises the router-aware
// /api/ai/route response: it should expose a tier and a non-empty reason
// when an InferenceRouter is wired in.
func TestAIRouteIncludesRouterDecisionMetadata(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/route", map[string]any{"taskType": "summarize"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["decision"] != "allow" {
		t.Errorf("expected decision=allow, got %v", body["decision"])
	}
	if reason, _ := body["reason"].(string); reason == "" {
		t.Errorf("expected non-empty reason, got %v", body["reason"])
	}
	if tier, _ := body["tier"].(string); tier == "" {
		t.Errorf("expected non-empty tier, got %v", body["tier"])
	}
}

// parseSSEFrames extracts the JSON object embedded in each `data:` frame.
func parseSSEFrames(t *testing.T, raw []byte) []map[string]any {
	t.Helper()
	var out []map[string]any
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		var event map[string]any
		if err := json.Unmarshal([]byte(payload), &event); err != nil {
			t.Errorf("could not decode SSE frame %q: %v", payload, err)
			continue
		}
		out = append(out, event)
	}
	return out
}
