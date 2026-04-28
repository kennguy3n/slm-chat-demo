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
	Identity   *services.Identity
	Workspaces *services.Workspace
	Chat       *services.Chat
	KApps      *services.KApps
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
		r.Get("/threads/{threadId}/messages", chatH.ThreadMessages)

		// KApps — seed cards only. Inference-driven flows (extract tasks,
		// approval prefill) moved to the Electron main process.
		r.Get("/kapps/cards", kH.Cards)

		// Privacy preview is still hosted here since it's a static
		// declaration about the on-device guarantee.
		r.Get("/privacy/egress-preview", pH.EgressPreview)
	})

	return r
}
