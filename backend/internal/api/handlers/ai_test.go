package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

func doPost(t *testing.T, h http.Handler, target string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest("POST", target, rdr)
	req.Header.Set("X-User-ID", "user_alice")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestAIRouteReturnsAllowOnDeviceDecision(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/route", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["decision"] != "allow" {
		t.Errorf("expected decision=allow, got %v", body["decision"])
	}
	if body["computeLocation"] != "on_device" {
		t.Errorf("expected computeLocation=on_device, got %v", body["computeLocation"])
	}
	// JSON numbers decode to float64.
	if egress, _ := body["dataEgressBytes"].(float64); egress != 0 {
		t.Errorf("expected zero egress, got %v", body["dataEgressBytes"])
	}
}

func TestAIRunReturnsMockedResponseForEachTaskType(t *testing.T) {
	h := newTestServer()
	tasks := []inference.TaskType{
		inference.TaskTypeSummarize,
		inference.TaskTypeTranslate,
		inference.TaskTypeExtractTasks,
		inference.TaskTypeSmartReply,
		inference.TaskTypePrefillApproval,
		inference.TaskTypeDraftArtifact,
	}
	for _, tt := range tasks {
		t.Run(string(tt), func(t *testing.T) {
			rec := doPost(t, h, "/api/ai/run", map[string]any{
				"taskType":  string(tt),
				"prompt":    "demo prompt",
				"channelId": "ch_family",
			})
			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
			}
			var resp inference.Response
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if resp.TaskType != tt {
				t.Errorf("expected taskType %q, got %q", tt, resp.TaskType)
			}
			if !resp.OnDevice {
				t.Errorf("expected onDevice=true for %s", tt)
			}
			if resp.Output == "" {
				t.Errorf("expected non-empty output for %s", tt)
			}
			if resp.Model == "" {
				t.Errorf("expected non-empty model for %s", tt)
			}
			if resp.TokensUsed <= 0 {
				t.Errorf("expected positive tokensUsed for %s, got %d", tt, resp.TokensUsed)
			}
			if resp.LatencyMS <= 0 {
				t.Errorf("expected positive latencyMs for %s, got %d", tt, resp.LatencyMS)
			}
		})
	}
}

func TestAIRunDefaultsToSummarizeWhenTaskTypeOmitted(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/run", map[string]any{})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp inference.Response
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp.TaskType != inference.TaskTypeSummarize {
		t.Errorf("expected default summarize, got %q", resp.TaskType)
	}
}

func TestAIRunRejectsInvalidJSON(t *testing.T) {
	h := newTestServer()
	req := httptest.NewRequest("POST", "/api/ai/run", bytes.NewBufferString("not json"))
	req.Header.Set("X-User-ID", "user_alice")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", rec.Code)
	}
}

func TestAIStreamReturnsSSEContentType(t *testing.T) {
	h := newTestServer()
	rec := doPost(t, h, "/api/ai/stream", map[string]any{"taskType": "summarize"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "text/event-stream" {
		t.Errorf("expected text/event-stream, got %q", got)
	}
	body := rec.Body.String()
	if !strings.Contains(body, "data: ") {
		t.Errorf("expected SSE data frames, got %q", body)
	}
	if !strings.Contains(body, `"done":true`) {
		t.Errorf("expected a final done frame, got %q", body)
	}
}
