package services

import (
	"fmt"
	"time"

	"github.com/kennguy3n/slm-chat-demo/backend/internal/models"
	"github.com/kennguy3n/slm-chat-demo/backend/internal/store"
)

// AuditService records KApp lifecycle events to the immutable in-memory
// audit log. The log is append-only — Record always succeeds and never
// mutates an existing entry. Phase 6+ replaces the in-memory store with
// the real audit-service backed by NATS JetStream + PostgreSQL.
type AuditService struct {
	store *store.Memory
	now   func() time.Time
	idGen func(prefix string) string
}

// NewAudit constructs an AuditService backed by the given memory store.
func NewAudit(s *store.Memory) *AuditService {
	return &AuditService{
		store: s,
		now:   time.Now,
		idGen: func(prefix string) string {
			return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
		},
	}
}

// Record appends an audit entry to the immutable log. A nil-safe receiver
// makes Record a no-op when callers haven't wired in an AuditService —
// useful for tests that don't care about audit recording.
func (a *AuditService) Record(eventType models.AuditEventType, objectKind models.AuditObjectKind, objectID string, actor string, details map[string]any) {
	if a == nil {
		return
	}
	if actor == "" {
		actor = "user"
	}
	entry := models.AuditEntry{
		ID:         a.idGen("audit"),
		Timestamp:  a.now(),
		EventType:  eventType,
		ObjectKind: objectKind,
		ObjectID:   objectID,
		Actor:      actor,
		Details:    details,
	}
	a.store.AppendAuditEntry(entry)
}

// List returns audit entries filtered by objectId and objectKind. Either
// filter may be empty to disable that filter; passing both empty returns
// the full log.
func (a *AuditService) List(objectID string, objectKind string) []models.AuditEntry {
	return a.store.ListAuditEntries(objectID, objectKind)
}
