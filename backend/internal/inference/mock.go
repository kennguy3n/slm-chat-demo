package inference

import (
	"context"
	"fmt"
	"strings"
)

// MockAdapter is the Phase 0 inference adapter. It returns canned responses
// for each TaskType so the rest of the AI surface (privacy strip, action
// launcher, KApp prefill) can be wired end-to-end before the real Ollama /
// llama.cpp adapters land in Phase 1. Every response is reported as
// on-device with a believable token count and latency so the privacy strip
// renders 0-byte egress.
type MockAdapter struct {
	// Model is the model name reported in responses. Defaults to
	// "gemma-4-e2b" so the demo's privacy strip shows the E2B tier.
	Model string
}

// NewMockAdapter returns a MockAdapter with sensible defaults.
func NewMockAdapter() *MockAdapter {
	return &MockAdapter{Model: "gemma-4-e2b"}
}

// Name implements Adapter.
func (m *MockAdapter) Name() string { return "mock" }

// Run implements Adapter. It selects a canned output based on req.TaskType
// and returns realistic token / latency numbers. Always reports OnDevice.
func (m *MockAdapter) Run(_ context.Context, req Request) (Response, error) {
	model := req.Model
	if model == "" {
		model = m.Model
	}
	output := mockOutputFor(req)
	tokens := estimateTokens(output)
	latency := mockLatencyMS(req.TaskType, tokens)
	return Response{
		TaskType:   req.TaskType,
		Model:      model,
		Output:     output,
		TokensUsed: tokens,
		LatencyMS:  latency,
		OnDevice:   true,
	}, nil
}

// Stream implements Adapter. The Phase 0 mock returns the full response in a
// single chunk followed by a Done sentinel. Real chunked streaming over SSE
// lands in Phase 1.
func (m *MockAdapter) Stream(ctx context.Context, req Request) (<-chan StreamChunk, error) {
	resp, err := m.Run(ctx, req)
	if err != nil {
		return nil, err
	}
	ch := make(chan StreamChunk, 2)
	ch <- StreamChunk{Delta: resp.Output, Done: false}
	ch <- StreamChunk{Done: true}
	close(ch)
	return ch, nil
}

func mockOutputFor(req Request) string {
	switch req.TaskType {
	case TaskTypeSummarize:
		return "On-device summary: 3 unread threads, 1 deadline (field-trip form Friday), 1 RSVP pending, 1 reply needed."
	case TaskTypeTranslate:
		prompt := strings.TrimSpace(req.Prompt)
		if prompt == "" {
			prompt = "(no source text)"
		}
		return fmt.Sprintf("Translation (en→es): %s → \"[mocked Spanish translation of %q]\"", prompt, prompt)
	case TaskTypeExtractTasks:
		return strings.Join([]string{
			"- Submit field-trip form (due Friday)",
			"- Add sunscreen to shopping list",
			"- Set Friday reminder",
		}, "\n")
	case TaskTypeSmartReply:
		return "Suggested reply: \"Sounds good — I'll handle the form tonight and grab sunscreen on the way home.\""
	case TaskTypePrefillApproval:
		return strings.Join([]string{
			"vendor: Acme Logs",
			"amount: $42,000 / yr",
			"justification: Lowest-cost SOC 2-cleared bidder.",
			"risk: medium",
		}, "\n")
	case TaskTypeDraftArtifact:
		return strings.Join([]string{
			"# Inline translation PRD (draft v1)",
			"",
			"## Goal",
			"Per-message translation rendered under the bubble; original always one tap away.",
			"",
			"## Requirements",
			"- Locale auto-detect",
			"- On-device only",
			"- Fall back to original on low confidence",
			"",
			"## Success metric",
			"% messages translated successfully without user toggling back. Target > 90% for top 5 locales.",
		}, "\n")
	default:
		return "Mock adapter has no canned output for this task type."
	}
}

// estimateTokens approximates the token count by treating ~4 characters per
// token. The number is reported back to the UI; exact counts come from the
// real Phase 1 adapters.
func estimateTokens(s string) int {
	if s == "" {
		return 0
	}
	t := len(s) / 4
	if t == 0 {
		return 1
	}
	return t
}

// mockLatencyMS picks a plausible latency for each task type, scaled lightly
// by token count.
func mockLatencyMS(t TaskType, tokens int) int {
	base := map[TaskType]int{
		TaskTypeSummarize:       180,
		TaskTypeTranslate:       90,
		TaskTypeExtractTasks:    220,
		TaskTypeSmartReply:      80,
		TaskTypePrefillApproval: 260,
		TaskTypeDraftArtifact:   620,
	}
	b, ok := base[t]
	if !ok {
		b = 150
	}
	return b + tokens/2
}
