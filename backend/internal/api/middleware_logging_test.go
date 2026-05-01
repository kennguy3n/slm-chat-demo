package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
)

func TestSanitizeLogFieldsStripsSensitiveKeys(t *testing.T) {
	in := map[string]any{
		"taskId":  "task_123",
		"status":  "in_progress",
		"prompt":  "Summarize the user's email about layoffs.",
		"output":  "Layoffs are happening on Friday.",
		"body":    "Confidential message body",
		"content": "Hi all, please join the call at 3pm.",
		"text":    "Acme will close the deal next week.",
		"fields":  map[string]any{"vendor": "Acme", "amount": 1000},
		"model":   "bonsai-1.7b",
	}
	out := api.SanitizeLogFields(in)
	if out == nil {
		t.Fatalf("expected non-nil map")
	}
	for _, k := range []string{"prompt", "output", "body", "content", "text", "fields"} {
		if got, _ := out[k].(string); got != "[redacted]" {
			t.Errorf("expected key %q to be redacted, got %v", k, out[k])
		}
	}
	if out["taskId"] != "task_123" {
		t.Errorf("taskId should pass through, got %v", out["taskId"])
	}
	if out["status"] != "in_progress" {
		t.Errorf("status should pass through, got %v", out["status"])
	}
	if out["model"] != "bonsai-1.7b" {
		t.Errorf("model should pass through, got %v", out["model"])
	}
}

func TestSanitizeLogFieldsNilSafe(t *testing.T) {
	if got := api.SanitizeLogFields(nil); got != nil {
		t.Errorf("expected nil for nil input, got %+v", got)
	}
}

func TestSanitizeLogFieldsLeavesOriginalUntouched(t *testing.T) {
	in := map[string]any{"prompt": "secret prompt", "id": "abc"}
	_ = api.SanitizeLogFields(in)
	if in["prompt"] != "secret prompt" {
		t.Errorf("expected original input to be untouched, got %v", in["prompt"])
	}
}

func TestStructuralLoggerWritesStatusAndPropagates(t *testing.T) {
	called := false
	wrapped := api.StructuralLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))

	req := httptest.NewRequest("POST", "/api/anything", nil)
	rec := httptest.NewRecorder()
	wrapped.ServeHTTP(rec, req)

	if !called {
		t.Fatalf("expected wrapped handler to run")
	}
	if rec.Code != http.StatusTeapot {
		t.Errorf("expected status 418 to propagate, got %d", rec.Code)
	}
}
