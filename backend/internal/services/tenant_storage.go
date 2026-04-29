package services

import (
	"errors"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// TenantStorageService manages the per-workspace storage configuration
// stub (database region, dedicated/shared, encryption-key binding).
// Phase 6 demo only — actual physical isolation is deferred.
type TenantStorageService struct {
	store *store.Memory
	now   func() time.Time
}

// ErrTenantStorageNotFound is returned when a workspace has no storage
// config seeded yet.
var ErrTenantStorageNotFound = errors.New("tenant storage config not found")

func NewTenantStorageService(s *store.Memory) *TenantStorageService {
	return &TenantStorageService{store: s, now: time.Now}
}

// Get returns the storage config for a workspace.
func (t *TenantStorageService) Get(workspaceID string) (models.TenantStorageConfig, error) {
	c, ok := t.store.GetTenantStorageConfig(workspaceID)
	if !ok {
		return models.TenantStorageConfig{}, ErrTenantStorageNotFound
	}
	return c, nil
}

// TenantStoragePatch is the partial-update shape accepted by Update.
type TenantStoragePatch struct {
	DatabaseRegion  *string `json:"databaseRegion,omitempty"`
	StorageBucket   *string `json:"storageBucket,omitempty"`
	Dedicated       *bool   `json:"dedicated,omitempty"`
	EncryptionKeyID *string `json:"encryptionKeyId,omitempty"`
}

// Update applies the patch to the existing storage config.
func (t *TenantStorageService) Update(workspaceID string, patch TenantStoragePatch) (models.TenantStorageConfig, error) {
	c, ok := t.store.GetTenantStorageConfig(workspaceID)
	if !ok {
		return models.TenantStorageConfig{}, ErrTenantStorageNotFound
	}
	if patch.DatabaseRegion != nil {
		c.DatabaseRegion = *patch.DatabaseRegion
	}
	if patch.StorageBucket != nil {
		c.StorageBucket = *patch.StorageBucket
	}
	if patch.Dedicated != nil {
		c.Dedicated = *patch.Dedicated
	}
	if patch.EncryptionKeyID != nil {
		c.EncryptionKeyID = *patch.EncryptionKeyID
	}
	c.UpdatedAt = t.now()
	t.store.PutTenantStorageConfig(c)
	return c, nil
}
