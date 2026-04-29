package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/handlers"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Deps bundles the services every handler needs. The Phase 0 backend is
// intentionally data-only: AI inference now lives in the Electron main
// process (frontend/electron/inference/) and reaches Ollama directly.
type Deps struct {
	Identity    *services.Identity
	Workspaces  *services.Workspace
	Chat        *services.Chat
	KApps       *services.KApps
	Audit       *services.AuditService
	AIEmployees *services.AIEmployeeService
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

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(MockAuth(d.Identity))

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

		// AI Employees — Phase 4 workspace-scoped personas
		// (Kara Ops AI, Nina PM AI, Mika Sales AI) with allowed
		// channels and authorised recipe lists.
		r.Get("/ai-employees", aiEmpH.List)
		r.Get("/ai-employees/{id}", aiEmpH.Get)
		r.Patch("/ai-employees/{id}/channels", aiEmpH.UpdateChannels)
		r.Patch("/ai-employees/{id}/recipes", aiEmpH.UpdateRecipes)
	})

	return r
}
