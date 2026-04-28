// Command server is the Phase 0 entry point for the KChat SLM demo backend.
// It boots an in-memory store, seeds the Phase 0 demo data, and serves the
// REST API on :8080.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func main() {
	mem := store.NewMemory()
	store.Seed(mem)

	identity := services.NewIdentity(mem, "user_alice")
	workspaces := services.NewWorkspace(mem)
	chat := services.NewChat(mem)

	r := api.NewRouter(api.Deps{
		Identity:   identity,
		Workspaces: workspaces,
		Chat:       chat,
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
