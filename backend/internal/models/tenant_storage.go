package models

import "time"

// TenantStorageConfig describes the per-workspace data-isolation
// posture. Phase 6 ships only the model + handlers — actual physical
// isolation (separate PostgreSQL cluster, dedicated S3 bucket) is
// deferred to the production-hardening phase.
type TenantStorageConfig struct {
	WorkspaceID     string    `json:"workspaceId"`
	DatabaseRegion  string    `json:"databaseRegion"`
	StorageBucket   string    `json:"storageBucket"`
	Dedicated       bool      `json:"dedicated"`
	EncryptionKeyID string    `json:"encryptionKeyId"`
	UpdatedAt       time.Time `json:"updatedAt"`
}
