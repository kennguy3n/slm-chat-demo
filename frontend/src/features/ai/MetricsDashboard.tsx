import { useEffect, useState } from 'react';
import {
  listActivity,
  subscribeActivity,
  summarizeActivity,
  type ActivityEntry,
} from './activityLog';

interface Props {
  // Tests can inject a static set of entries to render deterministically.
  initial?: ActivityEntry[];
}

// MetricsDashboard renders the Phase 2 "Stats" surface — a compact view
// of how much on-device AI has run for the user. It reads from the
// in-process activityLog (PROPOSAL.md §4.3 privacy-strip values are
// per-card; this dashboard is per-session).
export function MetricsDashboard({ initial }: Props = {}) {
  const [entries, setEntries] = useState<ActivityEntry[]>(initial ?? listActivity());

  useEffect(() => {
    if (initial) return;
    return subscribeActivity((rows) => {
      setEntries(rows);
    });
  }, [initial]);

  const summary = summarizeActivity(entries);

  return (
    <section
      className="metrics-dashboard"
      aria-label="AI activity stats"
      data-testid="metrics-dashboard"
    >
      <header className="metrics-dashboard__header">
        <h3 className="metrics-dashboard__title">On-device AI activity</h3>
        <p className="metrics-dashboard__subtitle">All counts are local to this session.</p>
      </header>

      <ul className="metrics-dashboard__cards">
        <li className="metrics-dashboard__card" data-testid="metrics-runs">
          <span className="metrics-dashboard__value">{summary.totalRuns}</span>
          <span className="metrics-dashboard__label">AI runs</span>
        </li>
        <li className="metrics-dashboard__card" data-testid="metrics-items">
          <span className="metrics-dashboard__value">{summary.totalItems}</span>
          <span className="metrics-dashboard__label">items handled</span>
        </li>
        <li className="metrics-dashboard__card" data-testid="metrics-egress">
          <span className="metrics-dashboard__value">{formatBytes(summary.totalEgressBytes)}</span>
          <span className="metrics-dashboard__label">data egressed</span>
        </li>
        <li className="metrics-dashboard__card" data-testid="metrics-time-saved">
          <span className="metrics-dashboard__value">{formatDuration(summary.timeSavedSeconds)}</span>
          <span className="metrics-dashboard__label">time saved (est.)</span>
        </li>
      </ul>

      <div className="metrics-dashboard__models" data-testid="metrics-models">
        <span className="metrics-dashboard__models-label">Models used:</span>{' '}
        {summary.modelsUsed.length === 0 ? (
          <span className="metrics-dashboard__empty">none yet</span>
        ) : (
          summary.modelsUsed.map((m) => (
            <span key={m} className="metrics-dashboard__model-chip">
              {m}
            </span>
          ))
        )}
      </div>

      <p className="metrics-dashboard__assurance" data-testid="metrics-assurance">
        All AI ran on-device. {formatBytes(summary.totalEgressBytes)} left your device.
      </p>

      {entries.length > 0 && (
        <details className="metrics-dashboard__recent">
          <summary>Recent runs</summary>
          <ul className="metrics-dashboard__recent-list" data-testid="metrics-recent-list">
            {entries.slice(-5).reverse().map((e) => (
              <li key={e.id} className="metrics-dashboard__recent-row">
                <span className="metrics-dashboard__recent-skill">{e.skillId}</span>
                <span className="metrics-dashboard__recent-meta">
                  {e.tier.toUpperCase()} · {e.itemsProduced} items · {e.latencyMs} ms
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins < 60) return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin === 0 ? `${hours}h` : `${hours}h ${remMin}m`;
}
