import { useQuery } from '@tanstack/react-query';
import { fetchAuditLog } from '../../api/auditApi';
import type { AuditEntry, AuditEventType, AuditObjectKind } from '../../types/audit';

interface Props {
  objectId: string;
  objectKind?: AuditObjectKind;
  // Optional injected fetcher for tests.
  injectedFetch?: typeof fetchAuditLog;
  // Optional pre-loaded entries (for tests / Storybook).
  initialEntries?: AuditEntry[];
}

const EVENT_LABEL: Record<AuditEventType, string> = {
  'task.created': 'Task created',
  'task.updated': 'Task updated',
  'task.closed': 'Task closed',
  'approval.submitted': 'Approval submitted',
  'approval.decisioned': 'Approval decisioned',
  'artifact.created': 'Artifact created',
  'artifact.version_added': 'New artifact version',
  'artifact.status_changed': 'Artifact status changed',
  'form.submitted': 'Form submitted',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function renderDetails(details?: Record<string, unknown>): string {
  if (!details) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined || v === '') continue;
    parts.push(`${k}: ${String(v)}`);
  }
  return parts.join(' · ');
}

// AuditLogPanel renders a chronological timeline of audit entries for a
// single KApp object (task / approval / artifact / form). Mounted in
// the artifact workspace, the right rail of the thread panel, or any
// KApp card detail view. Phase 3 — backed by GET /api/audit.
export function AuditLogPanel({
  objectId,
  objectKind,
  injectedFetch,
  initialEntries,
}: Props) {
  const fetcher = injectedFetch ?? fetchAuditLog;
  const query = useQuery<AuditEntry[]>({
    queryKey: ['audit', 'object', objectId, objectKind ?? ''],
    queryFn: () => fetcher(objectId, objectKind),
    enabled: !initialEntries && Boolean(objectId),
    initialData: initialEntries,
    staleTime: 5_000,
  });

  if (query.isLoading) {
    return (
      <div className="audit-log-panel" data-testid="audit-log-panel">
        <p className="audit-log-panel__loading">Loading audit log…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="audit-log-panel" data-testid="audit-log-panel">
        <p className="audit-log-panel__error" role="alert">
          Failed to load audit log: {query.error instanceof Error ? query.error.message : String(query.error)}
        </p>
      </div>
    );
  }

  const entries = query.data ?? [];

  if (entries.length === 0) {
    return (
      <div className="audit-log-panel" data-testid="audit-log-panel">
        <p className="audit-log-panel__empty">No audit entries yet.</p>
      </div>
    );
  }

  return (
    <div className="audit-log-panel" data-testid="audit-log-panel">
      <header className="audit-log-panel__header">
        <h4>Audit log</h4>
        <span className="audit-log-panel__count">{entries.length} event{entries.length === 1 ? '' : 's'}</span>
      </header>
      <ol className="audit-log-panel__list">
        {entries.map((e) => (
          <li
            key={e.id}
            className="audit-log-panel__entry"
            data-testid={`audit-entry-${e.id}`}
            data-event-type={e.eventType}
          >
            <div className="audit-log-panel__entry-head">
              <span className="audit-log-panel__entry-event">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
              <span className="audit-log-panel__entry-actor">{e.actor}</span>
              <time className="audit-log-panel__entry-time" dateTime={e.timestamp}>
                {formatTimestamp(e.timestamp)}
              </time>
            </div>
            {e.details && Object.keys(e.details).length > 0 && (
              <p className="audit-log-panel__entry-details">{renderDetails(e.details)}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
