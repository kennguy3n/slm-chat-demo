package services

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// EncryptionKeyService manages per-tenant AES-256-GCM data-at-rest keys.
//
// Phase 6 demo: keys are generated and stored in memory; the actual
// encrypt/decrypt path on the storage layer is a stub that logs
// "would encrypt with key X". Full integration with a PostgreSQL
// envelope-encryption table is deferred to the production-hardening
// phase.
type EncryptionKeyService struct {
	store    *store.Memory
	now      func() time.Time
	idGen    func() string
	keyBytes func() ([]byte, error)
	// mu guards material against concurrent writes from HTTP handlers,
	// which net/http dispatches from multiple goroutines. Without it,
	// two simultaneous POSTs to the generate / rotate endpoints would
	// trigger Go's fatal `concurrent map writes` runtime error, which
	// bypasses chi's middleware.Recoverer.
	mu sync.Mutex
	// material is the in-process map of key id -> raw 32-byte material.
	// We don't expose this — it's only used by EncryptStub to demonstrate
	// the lookup path the production cipher would take. Always read /
	// written under mu.
	material map[string][]byte
}

// NewEncryptionKeyService constructs an EncryptionKeyService backed by
// the given store. The id generator and key-material RNG are
// overridable for tests.
func NewEncryptionKeyService(s *store.Memory) *EncryptionKeyService {
	return &EncryptionKeyService{
		store: s,
		now:   time.Now,
		idGen: func() string {
			return fmt.Sprintf("key_%d", time.Now().UnixNano())
		},
		keyBytes: func() ([]byte, error) {
			b := make([]byte, 32)
			if _, err := rand.Read(b); err != nil {
				return nil, err
			}
			return b, nil
		},
		material: map[string][]byte{},
	}
}

// ErrNoActiveKey is returned by GetActiveKey when the workspace has no
// active key yet (callers should call GenerateKey first).
var ErrNoActiveKey = errors.New("no active encryption key for workspace")

// GenerateKey creates a fresh 32-byte AES-256-GCM key for the given
// workspace and stores it as the new active key. Any previously active
// keys remain in the history with `Active=false`.
//
// The whole read-modify-write (ListEncryptionKeys -> demote active ->
// ReplaceEncryptionKeys -> remember material) runs under the service
// mutex so that two concurrent rotate / generate requests can't lose
// each other's writes or race the material map.
func (e *EncryptionKeyService) GenerateKey(workspaceID string) (models.TenantEncryptionKey, error) {
	if workspaceID == "" {
		return models.TenantEncryptionKey{}, errors.New("workspaceID is required")
	}
	raw, err := e.keyBytes()
	if err != nil {
		return models.TenantEncryptionKey{}, err
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	keyID := e.idGen()
	key := models.TenantEncryptionKey{
		WorkspaceID: workspaceID,
		KeyID:       keyID,
		Algorithm:   "aes-256-gcm",
		CreatedAt:   e.now(),
		Active:      true,
	}
	// If there's an existing active key, demote it before appending.
	existing := e.store.ListEncryptionKeys(workspaceID)
	updated := make([]models.TenantEncryptionKey, 0, len(existing)+1)
	for _, k := range existing {
		if k.Active {
			k.Active = false
			k.RotatedAt = key.CreatedAt
		}
		updated = append(updated, k)
	}
	updated = append(updated, key)
	e.store.ReplaceEncryptionKeys(workspaceID, updated)
	e.material[keyID] = raw
	return key, nil
}

// GetActiveKey returns the active key for the workspace.
func (e *EncryptionKeyService) GetActiveKey(workspaceID string) (models.TenantEncryptionKey, error) {
	for _, k := range e.store.ListEncryptionKeys(workspaceID) {
		if k.Active {
			return k, nil
		}
	}
	return models.TenantEncryptionKey{}, ErrNoActiveKey
}

// RotateKey demotes the current active key and generates a new one.
// Returns the new active key.
func (e *EncryptionKeyService) RotateKey(workspaceID string) (models.TenantEncryptionKey, error) {
	return e.GenerateKey(workspaceID)
}

// ListKeys returns every key (active + inactive) for the workspace,
// ordered by CreatedAt.
func (e *EncryptionKeyService) ListKeys(workspaceID string) []models.TenantEncryptionKey {
	return e.store.ListEncryptionKeys(workspaceID)
}

// EncryptStub is the demo stand-in for the real envelope-encrypt
// pipeline: it logs `would encrypt with key X` and returns a
// hex-encoded preview. Production code will replace this with an
// AES-256-GCM seal using the raw key material.
func (e *EncryptionKeyService) EncryptStub(workspaceID string, plaintext []byte) (string, error) {
	key, err := e.GetActiveKey(workspaceID)
	if err != nil {
		return "", err
	}
	e.mu.Lock()
	_, hasMaterial := e.material[key.KeyID]
	e.mu.Unlock()
	log.Printf("encryption-service: would encrypt %d bytes with key %s (workspace=%s, material=%v)", len(plaintext), key.KeyID, workspaceID, hasMaterial)
	return hex.EncodeToString(plaintext), nil
}
