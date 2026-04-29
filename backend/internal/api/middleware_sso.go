package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/api/userctx"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/services"
)

// SSOAuth is a Phase 6 OIDC stub. It accepts a Bearer token whose
// payload is a base64-url-encoded JSON object with `sub` and `email`
// fields. The middleware decodes the payload, resolves the `sub` to a
// known user, and attaches it to the request context.
//
// This is a demo-only implementation:
//   - it does NOT verify a JWS signature
//   - it does NOT validate `exp` / `nbf` / `aud` / `iss`
//   - real OIDC validation belongs in the production-hardening phase
//
// Behaviour rules:
//   - When the `Authorization: Bearer <token>` header is present, the
//     payload is decoded. If the payload is well-formed and the `sub`
//     resolves to a known user, that user is injected.
//   - When the token is malformed (cannot be split, cannot be base64
//     decoded, or the JSON is invalid), the middleware returns 401.
//   - When the header is absent entirely, the middleware falls back to
//     the legacy MockAuth behaviour so the demo flows still work.
//   - When `cfg.Enabled == false`, the middleware also falls back to
//     MockAuth even if a Bearer token was sent.
//   - When `cfg.AllowedDomains` is non-empty, the email's domain must
//     match one of the allowed domains; otherwise 401.
func SSOAuth(identity *services.Identity, cfg models.SSOConfig) func(http.Handler) http.Handler {
	mock := MockAuth(identity)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !cfg.Enabled {
				mock(next).ServeHTTP(w, r)
				return
			}
			authz := r.Header.Get("Authorization")
			if authz == "" {
				mock(next).ServeHTTP(w, r)
				return
			}
			if !strings.HasPrefix(authz, "Bearer ") {
				writeUnauthorized(w, "invalid authorization scheme")
				return
			}
			token := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
			if token == "" {
				writeUnauthorized(w, "missing bearer token")
				return
			}
			claims, err := decodeStubBearer(token)
			if err != nil {
				writeUnauthorized(w, "invalid bearer token")
				return
			}
			if len(cfg.AllowedDomains) > 0 {
				domain := emailDomain(claims.Email)
				if !contains(cfg.AllowedDomains, domain) {
					writeUnauthorized(w, "email domain not allowed")
					return
				}
			}
			user, ok := identity.Resolve(claims.Sub)
			if !ok || user.ID == "" {
				writeUnauthorized(w, "unknown subject")
				return
			}
			ctx := userctx.With(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// stubClaims is the minimum claim set the demo SSO stub honours. A
// real OIDC integration would also enforce `iss`, `aud`, `exp`, etc.
type stubClaims struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
}

// decodeStubBearer accepts either a single base64-url payload (the
// demo path) or a JWT-shaped `header.payload.signature` triple — in the
// latter case we decode only the middle segment and ignore signature
// verification, exactly as the godoc warns above.
func decodeStubBearer(token string) (stubClaims, error) {
	parts := strings.Split(token, ".")
	var payload string
	switch len(parts) {
	case 1:
		payload = parts[0]
	case 3:
		payload = parts[1]
	default:
		return stubClaims{}, errInvalidBearer
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		// Some emitters use standard padded base64. Try that as a fallback.
		raw, err = base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return stubClaims{}, err
		}
	}
	var c stubClaims
	if err := json.Unmarshal(raw, &c); err != nil {
		return stubClaims{}, err
	}
	if c.Sub == "" {
		return stubClaims{}, errInvalidBearer
	}
	return c, nil
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}

func emailDomain(email string) string {
	at := strings.LastIndex(email, "@")
	if at < 0 || at == len(email)-1 {
		return ""
	}
	return strings.ToLower(email[at+1:])
}

func contains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if strings.EqualFold(h, needle) {
			return true
		}
	}
	return false
}

// errInvalidBearer is a sentinel for decode-side issues; we don't
// surface it directly to clients, only the response message.
var errInvalidBearer = errStr("invalid bearer token")

type errStr string

func (e errStr) Error() string { return string(e) }
