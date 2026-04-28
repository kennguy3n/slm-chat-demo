// Package inference defines the local-inference adapter contract. Phase 0
// ships a MockAdapter (mock.go) that satisfies the interface with realistic
// canned responses; concrete adapters (Ollama, llama.cpp, server-large) land
// in Phase 1 alongside the AI policy engine.
package inference

import "context"

// TaskType enumerates the canned task families the demo speaks. Real adapters
// in Phase 1+ accept a free-form prompt; the Phase 0 mock dispatches on
// TaskType to pick a realistic response.
type TaskType string

const (
	TaskTypeSummarize       TaskType = "summarize"
	TaskTypeTranslate       TaskType = "translate"
	TaskTypeExtractTasks    TaskType = "extract_tasks"
	TaskTypeSmartReply      TaskType = "smart_reply"
	TaskTypePrefillApproval TaskType = "prefill_approval"
	TaskTypeDraftArtifact   TaskType = "draft_artifact"
)

// Request is the unified input to an inference adapter. Phase 0 wires
// TaskType + Prompt + ChannelID; Phase 1+ extends with model selection,
// source picks, and streaming options.
type Request struct {
	TaskType  TaskType `json:"taskType"`
	Model     string   `json:"model,omitempty"`
	Prompt    string   `json:"prompt,omitempty"`
	ChannelID string   `json:"channelId,omitempty"`
	MaxTokens int      `json:"maxTokens,omitempty"`
}

// Response is the unified output from an inference adapter.
type Response struct {
	TaskType   TaskType `json:"taskType"`
	Model      string   `json:"model"`
	Output     string   `json:"output"`
	TokensUsed int      `json:"tokensUsed"`
	LatencyMS  int      `json:"latencyMs"`
	OnDevice   bool     `json:"onDevice"`
}

// StreamChunk is one piece of a streamed response. Real adapters yield many
// chunks per call; the Phase 0 mock yields a single chunk with Done=true.
type StreamChunk struct {
	Delta string `json:"delta"`
	Done  bool   `json:"done"`
}

// Adapter is implemented by every inference backend: Ollama, llama.cpp,
// confidential server, etc. Phase 0 ships MockAdapter; Phase 1 introduces
// router.go and the real Ollama / llama.cpp adapters.
type Adapter interface {
	// Name returns the adapter's identifier (e.g. "mock", "ollama",
	// "llamacpp").
	Name() string
	// Run executes inference synchronously and returns the full response.
	Run(ctx context.Context, req Request) (Response, error)
	// Stream executes inference and yields chunks via the returned channel.
	// The channel is closed when the stream is done (Done == true on the
	// final chunk).
	Stream(ctx context.Context, req Request) (<-chan StreamChunk, error)
}
