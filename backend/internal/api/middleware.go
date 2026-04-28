package api

import (
	"net/http"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// MockAuth reads X-User-ID from the request and resolves it through the
// Identity service. If the header is missing or unknown, the configured demo
// user is injected. The resolved user is attached to the request context.
func MockAuth(identity *services.Identity) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			uid := r.Header.Get("X-User-ID")
			user, _ := identity.Resolve(uid)
			ctx := userctx.With(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// JSONContentType sets Content-Type: application/json on every response.
func JSONContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}
