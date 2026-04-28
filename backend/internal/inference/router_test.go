package inference_test

import (
	"context"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

// stubAdapter implements Adapter and records which task types it sees.
type stubAdapter struct {
	name string
	last inference.Request
}

func (s *stubAdapter) Name() string { return s.name }
func (s *stubAdapter) Run(_ context.Context, req inference.Request) (inference.Response, error) {
	s.last = req
	return inference.Response{
		TaskType: req.TaskType,
		Model:    req.Model,
		Output:   "ok from " + s.name,
		OnDevice: true,
	}, nil
}
func (s *stubAdapter) Stream(_ context.Context, req inference.Request) (<-chan inference.StreamChunk, error) {
	s.last = req
	ch := make(chan inference.StreamChunk, 2)
	ch <- inference.StreamChunk{Delta: "ok from " + s.name}
	ch <- inference.StreamChunk{Done: true}
	close(ch)
	return ch, nil
}

func TestRouterRoutesShortTasksToE2B(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	e4b := &stubAdapter{name: "e4b"}
	r := inference.NewInferenceRouter(e2b, e4b, nil)

	tasks := []inference.TaskType{
		inference.TaskTypeSummarize,
		inference.TaskTypeTranslate,
		inference.TaskTypeExtractTasks,
		inference.TaskTypeSmartReply,
	}
	for _, tt := range tasks {
		t.Run(string(tt), func(t *testing.T) {
			d := r.Decide(inference.Request{TaskType: tt})
			if !d.Allow {
				t.Fatalf("expected allow=true, got reason=%q", d.Reason)
			}
			if d.Tier != inference.TierE2B {
				t.Errorf("expected E2B, got %s", d.Tier)
			}
			if d.Model != "gemma-4-e2b" {
				t.Errorf("expected gemma-4-e2b, got %q", d.Model)
			}
		})
	}
}

func TestRouterRoutesReasoningTasksToE4B(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	e4b := &stubAdapter{name: "e4b"}
	r := inference.NewInferenceRouter(e2b, e4b, nil)

	tasks := []inference.TaskType{
		inference.TaskTypeDraftArtifact,
		inference.TaskTypePrefillApproval,
	}
	for _, tt := range tasks {
		t.Run(string(tt), func(t *testing.T) {
			d := r.Decide(inference.Request{TaskType: tt})
			if !d.Allow {
				t.Fatalf("expected allow=true")
			}
			if d.Tier != inference.TierE4B {
				t.Errorf("expected E4B, got %s", d.Tier)
			}
			if d.Model != "gemma-4-e4b" {
				t.Errorf("expected gemma-4-e4b, got %q", d.Model)
			}
		})
	}
}

func TestRouterFallsBackToE2BWhenE4BUnavailable(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	r := inference.NewInferenceRouter(e2b, nil, nil)
	d := r.Decide(inference.Request{TaskType: inference.TaskTypeDraftArtifact})
	if !d.Allow {
		t.Fatalf("expected allow=true")
	}
	if d.Tier != inference.TierE2B {
		t.Errorf("expected fallback to E2B, got %s", d.Tier)
	}
	if d.Reason == "" || !contains(d.Reason, "fallback") {
		t.Errorf("expected fallback reason, got %q", d.Reason)
	}
}

func TestRouterDeniesWhenNoAdapter(t *testing.T) {
	r := inference.NewInferenceRouter(nil, nil, nil)
	d := r.Decide(inference.Request{TaskType: inference.TaskTypeSummarize})
	if d.Allow {
		t.Fatalf("expected allow=false")
	}
	if d.Reason == "" {
		t.Errorf("expected non-empty deny reason")
	}
}

func TestRouterUsesFallbackAdapterWhenNoTierConfigured(t *testing.T) {
	mock := inference.NewMockAdapter()
	r := inference.NewInferenceRouter(nil, nil, mock)
	d := r.Decide(inference.Request{TaskType: inference.TaskTypeSummarize})
	if !d.Allow {
		t.Fatalf("expected allow=true")
	}
	if d.Reason == "" || !contains(d.Reason, "fallback") {
		t.Errorf("expected fallback reason, got %q", d.Reason)
	}
}

func TestRouterRunDispatchesToCorrectAdapterAndRecordsDecision(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	e4b := &stubAdapter{name: "e4b"}
	r := inference.NewInferenceRouter(e2b, e4b, nil)

	resp, err := r.Run(context.Background(), inference.Request{
		TaskType: inference.TaskTypeDraftArtifact,
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if resp.Model != "gemma-4-e4b" {
		t.Errorf("expected response model gemma-4-e4b, got %q", resp.Model)
	}
	if e4b.last.TaskType != inference.TaskTypeDraftArtifact {
		t.Errorf("expected e4b stub to receive the request")
	}
	if e2b.last.TaskType != "" {
		t.Errorf("did not expect e2b to be hit, but it received %q", e2b.last.TaskType)
	}
	last := r.LastDecision()
	if last.Tier != inference.TierE4B || !last.Allow {
		t.Errorf("expected last decision to be allow/E4B, got %+v", last)
	}
}

func TestRouterRunReturnsErrorOnDeny(t *testing.T) {
	r := inference.NewInferenceRouter(nil, nil, nil)
	_, err := r.Run(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err == nil {
		t.Fatal("expected error when no adapter")
	}
}

func TestRouterStreamDispatchesToCorrectAdapter(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	e4b := &stubAdapter{name: "e4b"}
	r := inference.NewInferenceRouter(e2b, e4b, nil)

	ch, err := r.Stream(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err != nil {
		t.Fatalf("stream: %v", err)
	}
	got := ""
	for c := range ch {
		got += c.Delta
	}
	if got != "ok from e2b" {
		t.Errorf("expected e2b stream output, got %q", got)
	}
}

func TestRouterUserModelOverrideLocksTier(t *testing.T) {
	e2b := &stubAdapter{name: "e2b"}
	e4b := &stubAdapter{name: "e4b"}
	r := inference.NewInferenceRouter(e2b, e4b, nil)

	// summarize would normally go to E2B; force E4B by overriding model.
	d := r.Decide(inference.Request{TaskType: inference.TaskTypeSummarize, Model: "gemma-4-e4b"})
	if d.Tier != inference.TierE4B {
		t.Errorf("expected user override to force E4B, got %s", d.Tier)
	}
	if d.Model != "gemma-4-e4b" {
		t.Errorf("expected model to be the override, got %q", d.Model)
	}
}

func TestRouterSatisfiesAdapterInterface(t *testing.T) {
	var _ inference.Adapter = (*inference.InferenceRouter)(nil)
}

// contains is a tiny helper so we don't pull in strings everywhere.
func contains(s, sub string) bool {
	return len(sub) == 0 || len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
