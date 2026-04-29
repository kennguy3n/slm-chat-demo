// Audit log types — mirrors backend/internal/models/audit.go.
// The audit log is append-only; entries are never mutated or removed.

export type AuditObjectKind = 'task' | 'approval' | 'artifact' | 'form';

export type AuditEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.closed'
  | 'approval.submitted'
  | 'approval.decisioned'
  | 'artifact.created'
  | 'artifact.version_added'
  | 'artifact.status_changed'
  | 'form.submitted';

export interface AuditEntry {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  objectKind: AuditObjectKind;
  objectId: string;
  actor: string;
  details?: Record<string, unknown>;
}
