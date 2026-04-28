// Command server is the entry point for the KChat SLM demo backend. It boots
// an in-memory store, seeds the demo data, configures the inference router
// (Ollama when reachable, MockAdapter otherwise), and serves the REST API
// on :8080.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func main() {
	mem := store.NewMemory()
	store.Seed(mem)

	identity := services.NewIdentity(mem, "user_alice")
	workspaces := services.NewWorkspace(mem)
	chat := services.NewChat(mem)
	kapps := services.NewKApps(mem)

	mock := inference.NewMockAdapter()

	// Construct the inference router. If OLLAMA_BASE_URL is set, or the
	// daemon is reachable on the default port, prefer it for E2B; the
	// MockAdapter remains as the fallback so the demo always works without
	// a local sidecar.
	var e2b inference.Adapter = mock
	var e4b inference.Adapter = mock
	var statusProvider inference.StatusProvider
	var loader inference.Loader

	ollamaURL := os.Getenv("OLLAMA_BASE_URL")
	if ollamaURL == "" {
		ollamaURL = inference.DefaultOllamaBaseURL
	}
	ollama := inference.NewOllamaAdapter(ollamaURL)
	pingCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := ollama.Ping(pingCtx); err == nil {
		log.Printf("ollama: reachable at %s — wiring as E2B adapter", ollamaURL)
		e2b = ollama
		// Default model for E4B; the router only routes to E4B when the
		// task asks for it.
		e4bAdapter := inference.NewOllamaAdapter(ollamaURL)
		e4bAdapter.Model = "gemma-4-e4b"
		e4b = e4bAdapter
		statusProvider = ollama
		loader = ollama
	} else {
		log.Printf("ollama: unreachable at %s (%v) — using MockAdapter", ollamaURL, err)
	}

	router := inference.NewInferenceRouter(e2b, e4b, mock)

	r := api.NewRouter(api.Deps{
		Identity:     identity,
		Workspaces:   workspaces,
		Chat:         chat,
		KApps:        kapps,
		Inference:    router,
		ModelStatus:  statusProvider,
		ModelLoader:  loader,
		DefaultModel: "gemma-4-e2b",
		DefaultQuant: "q4_k_m",
	})

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("kchat-slm-demo backend listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
