import { useState } from 'react';
import { useEgressSummary } from './useEgressSummary';
import { formatEgressBytes } from './formatEgressBytes';
import type { EgressSummaryResult } from '../../types/electron';

interface Props {
  // Tests inject a static summary instead of polling the preload bridge.
  // When omitted, the panel reads via useEgressSummary().
  summaryOverride?: EgressSummaryResult;
  // Optional reset hook so tests can observe the action without an
  // Electron bridge. Defaults to calling window.electronAI.egressReset().
  onReset?: () => Promise<EgressSummaryResult | void> | void;
}

// EgressSummaryPanel surfaces the running tally of bytes that have left
// the device for the confidential server, broken down by channel and
// by model. Per PROPOSAL.md §4.3 the panel always shows a prominent
// "0 B" zero-state when nothing has been sent — this is the privacy-
// positive default.
export function EgressSummaryPanel({ summaryOverride, onReset }: Props) {
  const live = useEgressSummary();
  const summary = summaryOverride ?? live;
  const [busy, setBusy] = useState(false);
  const [resetSummary, setResetSummary] = useState<EgressSummaryResult | null>(null);

  const view = resetSummary ?? summary;

  const handleReset = async () => {
    setBusy(true);
    try {
      let next: EgressSummaryResult | void = undefined;
      if (onReset) {
        next = await onReset();
      } else if (typeof window !== 'undefined' && window.electronAI?.egressReset) {
        next = await window.electronAI.egressReset();
      }
      setResetSummary(
        next ?? {
          totalBytes: 0,
          totalRequests: 0,
          totalRedactions: 0,
          byChannel: {},
          byModel: {},
          recent: [],
        },
      );
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return (
      <aside
        className="egress-summary-panel egress-summary-panel--empty"
        data-testid="egress-summary-panel"
      >
        <h3 className="egress-summary-panel__title">Data egress</h3>
        <p className="egress-summary-panel__zero" data-testid="egress-summary-total">
          0 B
        </p>
        <p className="egress-summary-panel__hint">
          All inference is on-device. Nothing has left this machine.
        </p>
      </aside>
    );
  }

  const channels = Object.entries(view.byChannel);
  const models = Object.entries(view.byModel);

  return (
    <aside className="egress-summary-panel" data-testid="egress-summary-panel">
      <header className="egress-summary-panel__header">
        <h3 className="egress-summary-panel__title">Data egress</h3>
        <button
          type="button"
          className="egress-summary-panel__reset"
          data-testid="egress-summary-reset"
          onClick={handleReset}
          disabled={busy}
        >
          {busy ? 'Resetting…' : 'Reset'}
        </button>
      </header>
      <dl className="egress-summary-panel__totals">
        <dt>Total bytes</dt>
        <dd data-testid="egress-summary-total">
          {formatEgressBytes(view.totalBytes)}
        </dd>
        <dt>Requests</dt>
        <dd data-testid="egress-summary-requests">{view.totalRequests}</dd>
        <dt>Redactions applied</dt>
        <dd data-testid="egress-summary-redactions">{view.totalRedactions}</dd>
      </dl>

      <section
        className="egress-summary-panel__section"
        data-testid="egress-summary-by-channel"
      >
        <h4>By channel</h4>
        {channels.length === 0 ? (
          <p className="egress-summary-panel__hint">No server-routed traffic.</p>
        ) : (
          <ul>
            {channels.map(([id, agg]) => (
              <li key={id} data-testid={`egress-summary-channel-${id}`}>
                <span className="egress-summary-panel__row-key">{id}</span>
                <span className="egress-summary-panel__row-val">
                  {formatEgressBytes(agg.bytes)} · {agg.requests} req
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="egress-summary-panel__section"
        data-testid="egress-summary-by-model"
      >
        <h4>By model</h4>
        {models.length === 0 ? (
          <p className="egress-summary-panel__hint">No server-routed traffic.</p>
        ) : (
          <ul>
            {models.map(([id, agg]) => (
              <li key={id} data-testid={`egress-summary-model-${id}`}>
                <span className="egress-summary-panel__row-key">{id}</span>
                <span className="egress-summary-panel__row-val">
                  {formatEgressBytes(agg.bytes)} · {agg.requests} req
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="egress-summary-panel__section"
        data-testid="egress-summary-timeline"
      >
        <h4>Recent activity</h4>
        {view.recent.length === 0 ? (
          <p className="egress-summary-panel__hint">No events yet.</p>
        ) : (
          <ol>
            {view.recent.slice(0, 10).map((entry, idx) => (
              <li
                key={`${entry.timestamp}-${idx}`}
                data-testid="egress-summary-recent-item"
              >
                <span className="egress-summary-panel__row-key">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="egress-summary-panel__row-val">
                  {entry.taskType} · {entry.model} · {formatEgressBytes(entry.egressBytes)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
