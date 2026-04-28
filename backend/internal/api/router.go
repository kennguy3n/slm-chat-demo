package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/handlers"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/inference"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// Deps bundles the services every handler needs.
type Deps struct {
	Identity     *services.Identity
	Workspaces   *services.Workspace
	Chat         *services.Chat
	KApps        *services.KApps
	Inference    inference.Adapter
	ModelStatus  inference.StatusProvider // optional; nil → static stub status
	ModelLoader  inference.Loader         // optional; nil → /load, /unload return 503
	DefaultModel string
	DefaultQuant string
}

// NewRouter wires the chi router with CORS, JSON content-type, mock auth, and
// every Phase 0 endpoint group.
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
	aiH := handlers.NewAI(d.Inference)
	aiSummary := handlers.NewAISummary(d.Chat, d.Inference, d.Identity)
	kH := handlers.NewKApps(d.KApps)
	artH := handlers.NewArtifacts()
	mH := handlers.NewModel(d.ModelStatus, d.ModelLoader, d.DefaultModel, d.DefaultQuant)
	pH := handlers.NewPrivacy()

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

		// Chats / messages / threads.
		r.Get("/chats", chatH.List)
		r.Get("/chats/{chatId}/messages", chatH.Messages)
		r.Get("/chats/unread-summary", aiSummary.UnreadSummary)
		r.Get("/threads/{threadId}/messages", chatH.ThreadMessages)

		// AI surface — Phase 0 ships mocked /run and a hardcoded /route
		// decision. /stream returns the same shape as /run for now.
		r.Post("/ai/route", aiH.Route)
		r.Post("/ai/run", aiH.Run)
		r.Post("/ai/stream", aiH.Stream)

		// KApps — Phase 0 ships GET /api/kapps/cards (seeded sample
		// cards). Task / approval extraction stubs land in Phase 3.
		r.Get("/kapps/cards", kH.Cards)
		r.Post("/kapps/tasks/extract", kH.NotImplemented)
		r.Post("/kapps/approvals/prefill", kH.NotImplemented)

		// Artifacts — Phase 3 stubs.
		r.Post("/artifacts/draft", artH.NotImplemented)
		r.Post("/artifacts/publish", artH.NotImplemented)

		// Local model / privacy.
		r.Get("/model/status", mH.Status)
		r.Post("/model/load", mH.Load)
		r.Post("/model/unload", mH.Unload)
		r.Get("/privacy/egress-preview", pH.EgressPreview)
	})

	return r
}
