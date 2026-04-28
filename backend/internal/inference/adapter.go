// Package inference defines the local-inference adapter contract. Phase 0 only
// declares the interface; concrete adapters (Ollama, llama.cpp, server-large)
// land in Phase 1 alongside the AI policy engine.
package inference

import "context"

// Request is the unified input to an inference adapter.
type Request struct {
	Model    string `json:"model"`
	Prompt   string `json:"prompt"`
	MaxTokens int   `json:"maxTokens"`
}

// Response is the unified output from an inference adapter.
type Response struct {
	Model       string `json:"model"`
	Output      string `json:"output"`
	TokensUsed  int    `json:"tokensUsed"`
	OnDevice    bool   `json:"onDevice"`
}

// Adapter is implemented by every inference backend: Ollama, llama.cpp,
// confidential server, etc. The Phase 0 interface is intentionally small;
// streaming and policy-routing land in Phase 1.
type Adapter interface {
	Name() string
	Run(ctx context.Context, req Request) (Response, error)
}
