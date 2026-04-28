package inference_test

import (
	"context"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
)

func TestMockAdapterRunReturnsOnDeviceResponseForEachTaskType(t *testing.T) {
	a := inference.NewMockAdapter()
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
			resp, err := a.Run(context.Background(), inference.Request{TaskType: tt, Prompt: "x"})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !resp.OnDevice {
				t.Errorf("expected onDevice=true")
			}
			if resp.Model == "" {
				t.Errorf("expected non-empty model")
			}
			if resp.Output == "" {
				t.Errorf("expected non-empty output for %s", tt)
			}
			if resp.TokensUsed <= 0 {
				t.Errorf("expected positive tokensUsed")
			}
		})
	}
}

func TestMockAdapterStreamReturnsChunksThenDone(t *testing.T) {
	a := inference.NewMockAdapter()
	ch, err := a.Stream(context.Background(), inference.Request{TaskType: inference.TaskTypeSummarize})
	if err != nil {
		t.Fatalf("stream error: %v", err)
	}
	chunks := 0
	gotContent := false
	gotDone := false
	for c := range ch {
		chunks++
		if c.Delta != "" {
			gotContent = true
		}
		if c.Done {
			gotDone = true
		}
	}
	if chunks == 0 {
		t.Errorf("expected at least one chunk")
	}
	if !gotContent {
		t.Errorf("expected at least one content chunk")
	}
	if !gotDone {
		t.Errorf("expected a final Done chunk")
	}
}

func TestMockAdapterRespectsRequestModelOverride(t *testing.T) {
	a := inference.NewMockAdapter()
	resp, err := a.Run(context.Background(), inference.Request{
		TaskType: inference.TaskTypeSummarize,
		Model:    "gemma-4-e4b",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Model != "gemma-4-e4b" {
		t.Errorf("expected request model to win, got %q", resp.Model)
	}
}

func TestMockAdapterName(t *testing.T) {
	a := inference.NewMockAdapter()
	if a.Name() != "mock" {
		t.Errorf("expected name=mock, got %q", a.Name())
	}
}
