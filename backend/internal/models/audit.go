package models

import "time"

// AuditObjectKind enumerates the KApp object types tracked by the audit log.
type AuditObjectKind string

const (
	AuditObjectTask     AuditObjectKind = "task"
	AuditObjectApproval AuditObjectKind = "approval"
	AuditObjectArtifact AuditObjectKind = "artifact"
	AuditObjectForm     AuditObjectKind = "form"
)

// AuditEventType is the canonical event-type string written into AuditEntry.
// These match the events listed in PROPOSAL.md §6.2 / ARCHITECTURE.md §6.2 so
// the frontend timeline can render a stable label per event.
type AuditEventType string

const (
	AuditEventTaskCreated            AuditEventType = "task.created"
	AuditEventTaskUpdated            AuditEventType = "task.updated"
	AuditEventTaskClosed             AuditEventType = "task.closed"
	AuditEventApprovalSubmitted      AuditEventType = "approval.submitted"
	AuditEventApprovalDecisioned     AuditEventType = "approval.decisioned"
	AuditEventArtifactCreated        AuditEventType = "artifact.created"
	AuditEventArtifactVersionAdded   AuditEventType = "artifact.version_added"
	AuditEventArtifactStatusChanged  AuditEventType = "artifact.status_changed"
	AuditEventFormSubmitted          AuditEventType = "form.submitted"
)

// AuditEntry is one row in the immutable audit log. The log is append-only;
// entries are never mutated or removed. Phase 3 stores them in memory; Phase
// 6+ persists them via NATS JetStream + the audit-service.
type AuditEntry struct {
	ID         string          `json:"id"`
	Timestamp  time.Time       `json:"timestamp"`
	EventType  AuditEventType  `json:"eventType"`
	ObjectKind AuditObjectKind `json:"objectKind"`
	ObjectID   string          `json:"objectId"`
	Actor      string          `json:"actor"`
	Details    map[string]any  `json:"details,omitempty"`
}
