import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  exportAuditLog as defaultExportAuditLog,
  fetchAuditLog,
} from '../../api/auditApi';
import type { AuditEntry, AuditEventType, AuditObjectKind } from '../../types/audit';

interface Props {
  objectId: string;
  objectKind?: AuditObjectKind;
  // Optional injected fetcher for tests.
  injectedFetch?: typeof fetchAuditLog;
  // Optional injected exporter for tests — defaults to the real
  // exportAuditLog which hits /api/audit/export.
  injectedExport?: typeof defaultExportAuditLog;
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
  injectedExport,
  initialEntries,
}: Props) {
  const fetcher = injectedFetch ?? fetchAuditLog;
  const exporter = injectedExport ?? defaultExportAuditLog;
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);

  async function handleExport(format: 'json' | 'csv') {
    setExporting(format);
    setExportError(null);
    try {
      const url = await exporter(format, { objectId, objectKind });
      // Trigger a download via a hidden anchor. We use a manual
      // anchor (rather than window.open) so the filename hint from
      // the Content-Disposition header is honoured.
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export.${format}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Release the blob shortly after the download starts.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }
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
        <div className="audit-log-panel__export" data-testid="audit-export">
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={exporting !== null}
            data-testid="audit-export-json"
          >
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
            data-testid="audit-export-csv"
          >
            {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </header>
      {exportError && (
        <p className="audit-log-panel__error" role="alert" data-testid="audit-export-error">
          Export failed: {exportError}
        </p>
      )}
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
