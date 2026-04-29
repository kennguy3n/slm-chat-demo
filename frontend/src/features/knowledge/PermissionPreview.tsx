import { useMemo } from 'react';
import type { ConnectorFile, SelectedSource } from '../../types/knowledge';

interface Props {
  sources: SelectedSource[];
  // Connector files visible from the current channel — used both to
  // resolve the connector name for file selections and to surface
  // "X files reachable" counts when no specific file was picked but
  // a channel scope was.
  connectorFiles?: ConnectorFile[];
  onConfirm: () => void;
  onCancel: () => void;
}

interface SummaryRow {
  key: string;
  kind: 'channel' | 'thread' | 'file';
  label: string;
  detail?: string;
}

// PermissionPreview renders the "AI will read from…" sheet that fires
// after the SourcePicker confirms and before the AI Employee actually
// dispatches a recipe run. It is the user-visible expression of
// PROPOSAL.md §7 rule 4 ("show sources before generation") and the
// final consent gate before any inference reads source content.
//
// Phase 5 keeps inference on-device — the badge "0 bytes will leave
// this device" is asserted unconditionally because the routing layer
// only allows local Ollama for source-grounded actions.
export function PermissionPreview({
  sources,
  connectorFiles = [],
  onConfirm,
  onCancel,
}: Props) {
  const filesByID = useMemo(() => {
    const map: Record<string, ConnectorFile> = {};
    for (const f of connectorFiles) map[f.id] = f;
    return map;
  }, [connectorFiles]);

  const rows: SummaryRow[] = useMemo(() => {
    const out: SummaryRow[] = [];
    for (const s of sources) {
      if (s.kind === 'channel') {
        out.push({
          key: `c-${s.id}`,
          kind: 'channel',
          label: `#${s.name}`,
          detail: 'channel messages',
        });
      } else if (s.kind === 'thread') {
        out.push({
          key: `t-${s.id}`,
          kind: 'thread',
          label: s.name,
          detail: s.parentChannelName
            ? `thread in #${s.parentChannelName}`
            : 'thread',
        });
      } else if (s.kind === 'file') {
        const file = filesByID[s.id];
        const connectorName = s.connectorName ?? file?.connectorId ?? 'Drive';
        out.push({
          key: `f-${s.id}`,
          kind: 'file',
          label: s.name,
          detail: connectorName,
        });
      }
    }
    return out;
  }, [sources, filesByID]);

  const fileCount = rows.filter((r) => r.kind === 'file').length;
  const channelCount = rows.filter((r) => r.kind === 'channel').length;
  const threadCount = rows.filter((r) => r.kind === 'thread').length;

  return (
    <section
      className="permission-preview"
      data-testid="permission-preview"
      aria-labelledby="permission-preview-heading"
    >
      <header className="permission-preview__header">
        <h3 id="permission-preview-heading">AI will read from</h3>
        <span
          className="permission-preview__egress-badge"
          data-testid="permission-preview-egress"
        >
          0 bytes will leave this device
        </span>
      </header>

      <p className="permission-preview__summary">
        {summaryLine(channelCount, threadCount, fileCount)}
      </p>

      <ul
        className="permission-preview__list"
        data-testid="permission-preview-list"
      >
        {rows.map((r) => (
          <li
            key={r.key}
            className={`permission-preview__row permission-preview__row--${r.kind}`}
            data-testid={`permission-preview-row-${r.kind}-${r.key}`}
          >
            <span className="permission-preview__kind">{r.kind}</span>
            <span className="permission-preview__label">{r.label}</span>
            {r.detail && (
              <span className="permission-preview__detail">{r.detail}</span>
            )}
          </li>
        ))}
      </ul>

      <footer className="permission-preview__actions">
        <button
          type="button"
          className="permission-preview__cancel"
          onClick={onCancel}
          data-testid="permission-preview-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="permission-preview__confirm"
          onClick={onConfirm}
          disabled={rows.length === 0}
          data-testid="permission-preview-confirm"
        >
          Confirm and run
        </button>
      </footer>
    </section>
  );
}

function summaryLine(channels: number, threads: number, files: number): string {
  const parts: string[] = [];
  if (channels) parts.push(`${channels} channel${channels === 1 ? '' : 's'}`);
  if (threads) parts.push(`${threads} thread${threads === 1 ? '' : 's'}`);
  if (files) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  if (parts.length === 0) return 'No sources selected.';
  return `${parts.join(' · ')}. Inference runs on-device only.`;
}
