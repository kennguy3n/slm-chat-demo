import { useEffect, useState } from 'react';
import type { Connector, ConnectorFile } from '../../types/knowledge';
import {
  attachConnectorToChannel,
  detachConnectorFromChannel,
  fetchConnectorFiles,
  fetchConnectors,
} from '../../api/connectorApi';

interface Props {
  workspaceId: string;
  channelId: string;
  channelName?: string;
  // Test seam — lets the panel tests stub the network layer without
  // intercepting global fetch.
  api?: {
    fetchConnectors?: (workspaceId: string) => Promise<Connector[]>;
    fetchConnectorFiles?: (connectorId: string) => Promise<ConnectorFile[]>;
    attachConnectorToChannel?: (
      connectorId: string,
      channelId: string,
    ) => Promise<Connector>;
    detachConnectorFromChannel?: (
      connectorId: string,
      channelId: string,
    ) => Promise<Connector>;
  };
}

// ConnectorPanel renders in the B2B right rail and lets a workspace
// member attach / detach connectors (Phase 5 ships only the seeded
// Google Drive connector) to the currently active channel. Attachment
// is the privacy boundary — only files from connectors attached to a
// channel are visible to the SourcePicker / retrieval index for that
// channel, mirroring PROPOSAL.md §7 rule 2 ("never read across
// channels without explicit pickup").
export function ConnectorPanel({ workspaceId, channelId, channelName, api }: Props) {
  const fetchList = api?.fetchConnectors ?? fetchConnectors;
  const fetchFiles = api?.fetchConnectorFiles ?? fetchConnectorFiles;
  const attach = api?.attachConnectorToChannel ?? attachConnectorToChannel;
  const detach = api?.detachConnectorFromChannel ?? detachConnectorFromChannel;

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hydrate connector list + file counts once per workspace.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchList(workspaceId)
      .then(async (list) => {
        if (cancelled) return;
        setConnectors(list);
        const counts: Record<string, number> = {};
        for (const c of list) {
          try {
            const files = await fetchFiles(c.id);
            counts[c.id] = files.length;
          } catch {
            counts[c.id] = 0;
          }
        }
        if (cancelled) return;
        setFileCounts(counts);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, fetchList, fetchFiles]);

  async function toggleAttachment(c: Connector, attached: boolean) {
    setBusyId(c.id);
    try {
      const updated = attached
        ? await detach(c.id, channelId)
        : await attach(c.id, channelId);
      setConnectors((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="connector-panel" data-testid="connector-panel">
      <header className="connector-panel__header">
        <h3>Connectors</h3>
        {channelName && (
          <p className="connector-panel__subtitle">
            Attached to <strong>#{channelName}</strong>
          </p>
        )}
      </header>
      {loading && <p>Loading connectors…</p>}
      {error && (
        <p className="connector-panel__error" role="alert">
          {error}
        </p>
      )}
      {!loading && connectors.length === 0 && (
        <p className="connector-panel__empty">No connectors in this workspace.</p>
      )}
      <ul className="connector-panel__list">
        {connectors.map((c) => {
          const attached = c.channelIds.includes(channelId);
          const count = fileCounts[c.id] ?? 0;
          return (
            <li
              key={c.id}
              className="connector-panel__row"
              data-testid={`connector-panel-row-${c.id}`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={attached}
                  disabled={busyId === c.id}
                  onChange={() => toggleAttachment(c, attached)}
                  data-testid={`connector-panel-toggle-${c.id}`}
                />
                <span className="connector-panel__name">{c.name}</span>
                <span className="connector-panel__meta">
                  {labelForKind(c.kind)} · {count} file{count === 1 ? '' : 's'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="connector-panel__note">
        AI Employees can only read files from connectors attached to this
        channel. Detach to revoke access.
      </p>
    </section>
  );
}

function labelForKind(kind: Connector['kind']): string {
  switch (kind) {
    case 'google_drive':
      return 'Google Drive';
    case 'onedrive':
      return 'OneDrive';
    case 'github':
      return 'GitHub';
    default:
      return kind;
  }
}
