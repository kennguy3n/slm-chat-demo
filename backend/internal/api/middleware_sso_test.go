package api_test

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

func ssoTestIdentity() *services.Identity {
	mem := store.NewMemory()
	store.Seed(mem)
	return services.NewIdentity(mem, "user_alice")
}

func encodeStubToken(sub, email string) string {
	payload := []byte(`{"sub":"` + sub + `","email":"` + email + `"}`)
	return base64.RawURLEncoding.EncodeToString(payload)
}

func TestSSOAuthAcceptsValidBearer(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: true, AllowedDomains: []string{"example.com"}}

	var captured models.User
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userctx.From(r.Context())
		captured = u
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+encodeStubToken("user_bob", "bob@example.com"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	if captured.ID != "user_bob" {
		t.Errorf("expected user_bob, got %q", captured.ID)
	}
}

func TestSSOAuthRejectsInvalidToken(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: true}
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer not-base64-!!!")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestSSOAuthRejectsUnknownSubject(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: true}
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+encodeStubToken("user_ghost", "ghost@example.com"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestSSOAuthRejectsDisallowedDomain(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: true, AllowedDomains: []string{"acme.example.com"}}
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+encodeStubToken("user_alice", "alice@evil.com"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestSSOAuthFallsBackToMockWhenNoHeader(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: true}

	var captured models.User
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userctx.From(r.Context())
		captured = u
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("X-User-ID", "user_carol")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if captured.ID != "user_carol" {
		t.Errorf("expected MockAuth fallback to resolve user_carol, got %q", captured.ID)
	}
}

func TestSSOAuthDisabledIgnoresBearer(t *testing.T) {
	identity := ssoTestIdentity()
	cfg := models.SSOConfig{Enabled: false}

	var captured models.User
	handler := api.SSOAuth(identity, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userctx.From(r.Context())
		captured = u
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+encodeStubToken("user_bob", "bob@example.com"))
	req.Header.Set("X-User-ID", "user_carol")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if captured.ID != "user_carol" {
		t.Errorf("expected MockAuth (X-User-ID=user_carol) to win, got %q", captured.ID)
	}
}
