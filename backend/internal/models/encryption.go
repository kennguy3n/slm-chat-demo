package models

import "time"

// TenantEncryptionKey is a per-workspace data-at-rest key stub. Phase 6
// generates random 32-byte AES-256-GCM keys and stores their material
// in memory; full integration with the store-layer encrypt/decrypt
// path is deferred to the PostgreSQL phase.
type TenantEncryptionKey struct {
	WorkspaceID string    `json:"workspaceId"`
	KeyID       string    `json:"keyId"`
	Algorithm   string    `json:"algorithm"`
	CreatedAt   time.Time `json:"createdAt"`
	RotatedAt   time.Time `json:"rotatedAt,omitempty"`
	Active      bool      `json:"active"`
}
