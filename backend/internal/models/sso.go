package models

// SSOConfig describes the per-workspace OIDC stub that
// `middleware_sso.go` consults when `SSO_ENABLED=true`. The Phase 6
// implementation is intentionally a demo stub — real signature
// verification, JWKS rotation, and PKCE flows are deferred to the
// production hardening phase.
type SSOConfig struct {
	WorkspaceID    string   `json:"workspaceId"`
	Enabled        bool     `json:"enabled"`
	Issuer         string   `json:"issuer"`
	ClientID       string   `json:"clientId"`
	AllowedDomains []string `json:"allowedDomains"`
}
