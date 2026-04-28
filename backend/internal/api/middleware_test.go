package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func TestMockAuthInjectsHeaderUser(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	id := services.NewIdentity(mem, "user_alice")

	var seenID string
	h := api.MockAuth(id)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := userctx.From(r.Context())
		if !ok {
			t.Fatalf("expected user in context")
		}
		seenID = u.ID
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-User-ID", "user_bob")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if seenID != "user_bob" {
		t.Errorf("expected handler to see user_bob, got %q", seenID)
	}
}

func TestMockAuthFallsBackToDefaultUserOnMissingHeader(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	id := services.NewIdentity(mem, "user_alice")

	var seenID string
	h := api.MockAuth(id)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userctx.From(r.Context())
		seenID = u.ID
	}))

	req := httptest.NewRequest("GET", "/", nil)
	h.ServeHTTP(httptest.NewRecorder(), req)

	if seenID != "user_alice" {
		t.Errorf("expected fallback user_alice, got %q", seenID)
	}
}

func TestMockAuthFallsBackOnUnknownUserHeader(t *testing.T) {
	mem := store.NewMemory()
	store.Seed(mem)
	id := services.NewIdentity(mem, "user_alice")

	var seenID string
	h := api.MockAuth(id)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userctx.From(r.Context())
		seenID = u.ID
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-User-ID", "user_unknown")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if seenID != "user_alice" {
		t.Errorf("expected fallback user_alice for unknown id, got %q", seenID)
	}
}
