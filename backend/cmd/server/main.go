// Command server is the entry point for the KChat SLM demo backend. It
// boots an in-memory store, seeds the demo data, and serves the data-
// only REST API on :8080.
//
// AI inference no longer lives here — the canonical inference router
// runs inside the Electron main process (frontend/electron/inference/)
// and talks directly to Ollama. This binary now only owns chat /
// workspace / KApp data, exactly the shape the Electron renderer
// fetches via /api/chats, /api/threads/*, /api/workspaces and
// /api/kapps/cards.
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
	audit := services.NewAudit(mem)
	kapps := services.NewKApps(mem).WithAudit(audit)
	aiEmployees := services.NewAIEmployeeService(mem)
	recipeRuns := services.NewRecipeRunService(mem)
	connectors := services.NewConnectorService(mem)
	retrieval := services.NewRetrievalService(mem)
	knowledge := services.NewKnowledgeService(mem)
	policy := services.NewPolicyService(mem)
	encryption := services.NewEncryptionKeyService(mem)
	tenantStorage := services.NewTenantStorageService(mem)

	r := api.NewRouter(api.Deps{
		Identity:      identity,
		Workspaces:    workspaces,
		Chat:          chat,
		KApps:         kapps,
		Audit:         audit,
		AIEmployees:   aiEmployees,
		RecipeRuns:    recipeRuns,
		Connectors:    connectors,
		Retrieval:     retrieval,
		Knowledge:     knowledge,
		Policy:        policy,
		Encryption:    encryption,
		TenantStorage: tenantStorage,
		Store:         mem,
	})

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("kchat-slm-demo backend listening on %s (data-only)", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
