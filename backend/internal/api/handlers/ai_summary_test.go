package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/handlers"
)

func TestUnreadSummaryReturnsPromptAndSources(t *testing.T) {
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/unread-summary", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Prompt          string           `json:"prompt"`
		Model           string           `json:"model"`
		Sources         []map[string]any `json:"sources"`
		ComputeLocation string           `json:"computeLocation"`
		DataEgressBytes int              `json:"dataEgressBytes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !strings.Contains(body.Prompt, "Summarise these recent unread messages") {
		t.Errorf("expected digest prompt to be returned, got %q", body.Prompt)
	}
	if body.Model == "" {
		t.Errorf("expected non-empty model name")
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

func TestUnreadSummaryDoesNotRunInference(t *testing.T) {
	// Regression: the digest endpoint must build a prompt + sources only.
	// Running inference here on top of the SSE stream would double-charge
	// the model (see Devin Review on PR #8). The response must NOT carry an
	// AIRunResponse-shaped "summary" field.
	h := newTestServer()
	rec := doGet(t, h, "/api/chats/unread-summary", "user_alice")
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var raw map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := raw["summary"]; ok {
		t.Errorf("response unexpectedly contains a 'summary' field; the digest endpoint should not run inference")
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

func TestTruncateForPromptHandlesMultiByteRunes(t *testing.T) {
	// Regression: truncateForPrompt used to byte-slice s[:max] which would
	// split multi-byte UTF-8 codepoints (emoji, CJK, accented letters)
	// mid-character and produce invalid UTF-8 in the source excerpts.
	// Rune-aware slicing keeps every codepoint whole.
	cases := []struct {
		name string
		in   string
		max  int
	}{
		{"emoji", strings.Repeat("🚀", 30), 5},
		{"cjk", strings.Repeat("漢字", 50), 7},
		{"latin1", strings.Repeat("café ", 40), 11},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := handlers.TruncateForPromptForTest(tc.in, tc.max)
			if !utf8.ValidString(out) {
				t.Fatalf("output is not valid UTF-8: %q", out)
			}
			runes := []rune(out)
			// Output is at most max runes plus the trailing ellipsis.
			if len(runes) > tc.max+1 {
				t.Errorf("rune length %d exceeds max %d (+ellipsis)", len(runes), tc.max)
			}
			if !strings.HasSuffix(out, "…") {
				t.Errorf("expected ellipsis on truncated output, got %q", out)
			}
		})
	}
}

func TestTruncateForPromptShortInputUnchanged(t *testing.T) {
	in := "  short string  "
	out := handlers.TruncateForPromptForTest(in, 100)
	if out != "short string" {
		t.Errorf("expected trimmed short input, got %q", out)
	}
	if strings.HasSuffix(out, "…") {
		t.Errorf("short input should not be marked as truncated: %q", out)
	}
}
