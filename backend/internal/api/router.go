package api

import (
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/handlers"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// Deps bundles the services every handler needs. The Phase 0 backend is
// intentionally data-only: AI inference now lives in the Electron main
// process (frontend/electron/inference/) and reaches Ollama directly.
type Deps struct {
	Identity      *services.Identity
	Workspaces    *services.Workspace
	Chat          *services.Chat
	KApps         *services.KApps
	Audit         *services.AuditService
	AIEmployees   *services.AIEmployeeService
	RecipeRuns    *services.RecipeRunService
	Connectors    *services.ConnectorService
	Retrieval     *services.RetrievalService
	Knowledge     *services.KnowledgeService
	Policy        *services.PolicyService
	Encryption    *services.EncryptionKeyService
	TenantStorage *services.TenantStorageService
	// Store is needed by the SCIM handler for direct user CRUD that
	// sits outside the Identity service's resolution semantics.
	Store *store.Memory
}

// NewRouter wires the chi router with CORS, JSON content-type, mock auth, and
// every Phase 0 data endpoint. Inference / model-control / artifact routes
// are no longer served here — the Electron main process owns them.
func NewRouter(d Deps) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-User-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(JSONContentType)

	chatH := handlers.NewChat(d.Chat)
	wsH := handlers.NewWorkspace(d.Workspaces, d.Identity)
	kH := handlers.NewKApps(d.KApps)
	aH := handlers.NewArtifacts(d.KApps)
	fH := handlers.NewForms(d.KApps)
	pH := handlers.NewPrivacy()
	auH := handlers.NewAudit(d.Audit, d.KApps)
	aiEmpH := handlers.NewAIEmployees(d.AIEmployees)
	rrH := handlers.NewRecipeRuns(d.RecipeRuns, d.AIEmployees)
	connH := handlers.NewConnectors(d.Connectors)
	retH := handlers.NewRetrieval(d.Retrieval)
	kgH := handlers.NewKnowledge(d.Knowledge)
	polH := handlers.NewPolicy(d.Policy)
	encH := handlers.NewEncryption(d.Encryption)
	tsH := handlers.NewTenantStorage(d.TenantStorage)
	scimH := handlers.NewSCIM(d.Store)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	// Phase 6 — SCIM v2 user provisioning. Mounted outside the
	// MockAuth-protected `/api` group because SCIM clients
	// authenticate with their own bearer token in production.
	r.Route("/api/scim/v2", func(r chi.Router) {
		r.Get("/Users", scimH.List)
		r.Post("/Users", scimH.Create)
		r.Get("/Users/{id}", scimH.Get)
		r.Patch("/Users/{id}", scimH.Patch)
		r.Put("/Users/{id}", scimH.Patch)
		r.Delete("/Users/{id}", scimH.Delete)
	})

	r.Route("/api", func(r chi.Router) {
		// Phase 6 — when SSO_ENABLED=true, swap MockAuth for the
		// Bearer-token SSO stub. The stub falls back to MockAuth when
		// no Authorization header is supplied so the demo flows
		// continue to work without SSO setup.
		if os.Getenv("SSO_ENABLED") == "true" {
			cfg := models.SSOConfig{Enabled: true}
			if d.Store != nil {
				if c, ok := d.Store.GetSSOConfig("ws_acme"); ok {
					cfg = c
					cfg.Enabled = true
				}
			}
			r.Use(SSOAuth(d.Identity, cfg))
		} else {
			r.Use(MockAuth(d.Identity))
		}
		// Phase 6 §7.2 — structural-only request logging. Records
		// method, path, status, latency, request id, user id; never
		// logs request or response bodies.
		r.Use(StructuralLogger)

		// Identity / workspaces / channels.
		r.Get("/users/me", wsH.Me)
		r.Get("/users", wsH.Users)
		r.Get("/workspaces", wsH.List)
		r.Get("/workspaces/{id}/channels", wsH.Channels)
		r.Get("/workspaces/{id}/domains", wsH.Domains)
		r.Get("/domains/{id}/channels", wsH.DomainChannels)

		// Chats / messages / threads.
		r.Get("/chats", chatH.List)
		r.Get("/chats/{chatId}/messages", chatH.Messages)
		r.Get("/threads/{threadId}/messages", chatH.ThreadMessages)
		r.Get("/threads/{threadId}/linked-objects", kH.LinkedObjects)

		// KApps — seed cards plus Phase 3 task lifecycle + approval
		// decisions. Inference-driven flows (extract tasks, approval
		// prefill, artifact draft) still live in the Electron main process.
		r.Get("/kapps/cards", kH.Cards)
		r.Get("/kapps/tasks", kH.ListTasks)
		r.Post("/kapps/tasks", kH.CreateTask)
		r.Patch("/kapps/tasks/{id}", kH.UpdateTask)
		r.Patch("/kapps/tasks/{id}/status", kH.UpdateTaskStatus)
		r.Delete("/kapps/tasks/{id}", kH.DeleteTask)
		r.Post("/kapps/approvals", kH.CreateApproval)
		r.Post("/kapps/approvals/{id}/decide", kH.SubmitApprovalDecision)

		// Artifacts CRUD + versioning. AI drafting itself runs in the
		// Electron main process; the renderer hands the streamed body
		// here to persist it.
		r.Get("/kapps/artifacts", aH.List)
		r.Post("/kapps/artifacts", aH.Create)
		r.Get("/kapps/artifacts/{id}", aH.Get)
		r.Patch("/kapps/artifacts/{id}", aH.Update)
		r.Get("/kapps/artifacts/{id}/versions/{version}", aH.GetVersion)
		r.Post("/kapps/artifacts/{id}/versions", aH.CreateVersion)

		// Forms intake — templates + form instances.
		r.Get("/kapps/form-templates", fH.Templates)
		r.Get("/kapps/forms", fH.List)
		r.Post("/kapps/forms", fH.Create)

		// Privacy preview is still hosted here since it's a static
		// declaration about the on-device guarantee.
		r.Get("/privacy/egress-preview", pH.EgressPreview)

		// Audit log — immutable event log for KApp mutations
		// (Phase 3). ?objectId=… and ?objectKind=… filter to a
		// single object; ?channelId=… returns all entries for
		// objects in the channel.
		r.Get("/audit", auH.List)
		// Phase 6 — JSON / CSV download for compliance exports.
		r.Get("/audit/export", auH.Export)

		// AI Employees — Phase 4 workspace-scoped personas
		// (Kara Ops AI, Nina PM AI, Mika Sales AI) with allowed
		// channels and authorised recipe lists.
		r.Get("/ai-employees", aiEmpH.List)
		r.Get("/ai-employees/{id}", aiEmpH.Get)
		r.Patch("/ai-employees/{id}/channels", aiEmpH.UpdateChannels)
		r.Patch("/ai-employees/{id}/recipes", aiEmpH.UpdateRecipes)
		r.Patch("/ai-employees/{id}/budget", aiEmpH.UpdateBudget)
		r.Post("/ai-employees/{id}/budget/increment", aiEmpH.IncrementBudgetUsage)

		// AI Employee recipe-run queue — the renderer records a run
		// when a recipe is kicked off (executor lives in the Electron
		// main process); GET returns the queue + completion log so the
		// right-rail Queue view stays in sync across refreshes.
		r.Get("/ai-employees/{id}/queue", rrH.List)
		r.Post("/ai-employees/{id}/queue", rrH.Record)

		// Connectors — Phase 5 mocked external integrations
		// (Drive, OneDrive, GitHub). One seeded Google Drive
		// connector ships per workspace; channel-scoped
		// attachment is the privacy boundary.
		r.Get("/connectors", connH.List)
		r.Get("/connectors/{id}", connH.Get)
		r.Get("/connectors/{id}/files", connH.Files)
		r.Post("/connectors/{id}/channels", connH.Attach)
		r.Delete("/connectors/{id}/channels/{channelId}", connH.Detach)
		r.Get("/channels/{channelId}/connector-files", connH.ChannelFiles)
		r.Post("/connectors/{id}/sync-acl", connH.SyncACL)

		// Retrieval — Phase 5 per-channel keyword index. The
		// renderer (re-)indexes a channel before running an AI
		// action, then queries the index to ground inference
		// in real source content.
		r.Post("/channels/{channelId}/index", retH.Index)
		r.Get("/channels/{channelId}/search", retH.Search)

		// Knowledge graph — Phase 5 workspace-scoped entity
		// extraction (decisions / owners / risks / requirements /
		// deadlines) over channel messages. The renderer hits
		// these from the right-rail KnowledgeGraphPanel.
		r.Post("/channels/{channelId}/knowledge/extract", kgH.Extract)
		r.Get("/channels/{channelId}/knowledge", kgH.List)
		r.Get("/knowledge/{id}", kgH.Get)

		// Phase 6 — per-workspace AI compute policy (server tier
		// allow/deny lists, redaction enforcement, daily egress cap).
		r.Get("/workspaces/{id}/policy", polH.Get)
		r.Patch("/workspaces/{id}/policy", polH.Update)

		// Phase 6 — per-tenant encryption keys (AES-256-GCM stub).
		r.Get("/workspaces/{id}/encryption-keys", encH.List)
		r.Post("/workspaces/{id}/encryption-keys", encH.Generate)
		r.Post("/workspaces/{id}/encryption-keys/rotate", encH.Rotate)

		// Phase 6 — per-tenant storage config stub.
		r.Get("/workspaces/{id}/storage", tsH.Get)
		r.Patch("/workspaces/{id}/storage", tsH.Update)
	})

	return r
}
