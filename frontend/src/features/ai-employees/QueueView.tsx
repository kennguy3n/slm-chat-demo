import { useEffect, useState } from 'react';
import type {
  AIEmployeeRecipe,
  RecipeRun,
  RecipeRunStatus,
} from '../../types/aiEmployee';
import type { Channel } from '../../types/workspace';
import { fetchQueue } from '../../api/recipeRunApi';

interface Props {
  aiEmployeeId: string | null;
  channels: Channel[];
  recipeCatalog: Record<string, AIEmployeeRecipe>;
  // initialRuns lets tests inject a deterministic queue without going
  // through the network path; when omitted the component fetches on
  // mount / aiEmployeeId change.
  initialRuns?: RecipeRun[];
}

function statusLabel(s: RecipeRunStatus): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return s;
  }
}

function formatTimestamp(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// QueueView renders the pending + completed recipe runs for a single
// AI Employee. It mirrors the compact KApp-card layout used elsewhere
// in the right rail: a list of rows with recipe name, status badge,
// channel, and timestamp. Empty state reads "No pending tasks".
export function QueueView({
  aiEmployeeId,
  channels,
  recipeCatalog,
  initialRuns,
}: Props) {
  const [runs, setRuns] = useState<RecipeRun[]>(initialRuns ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRuns !== undefined) {
      setRuns(initialRuns);
      return;
    }
    if (!aiEmployeeId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    // Clear prior employee's runs so a slow / failed fetch never leaves the
    // previous queue visible under the new employee's header.
    setRuns([]);
    setLoading(true);
    setError(null);
    fetchQueue(aiEmployeeId)
      .then((list) => {
        if (!cancelled) setRuns(list);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [aiEmployeeId, initialRuns]);

  if (!aiEmployeeId) {
    return null;
  }

  // Sort newest-first so pending work bubbles to the top of the list.
  const sorted = [...runs].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  return (
    <section className="queue-view" data-testid="queue-view">
      <header className="queue-view__header">
        <h4 className="queue-view__heading">Queue</h4>
        {loading && <span className="queue-view__status">Loading…</span>}
      </header>

      {error && (
        <p className="queue-view__error" role="alert">
          {error}
        </p>
      )}

      {!loading && sorted.length === 0 && (
        <p className="queue-view__empty" data-testid="queue-view-empty">
          No pending tasks
        </p>
      )}

      {sorted.length > 0 && (
        <ul className="queue-view__list" data-testid="queue-view-list">
          {sorted.map((r) => {
            const recipe = recipeCatalog[r.recipeId];
            const channel = channels.find((c) => c.id === r.channelId);
            return (
              <li
                key={r.id}
                className="queue-view__item"
                data-testid={`queue-view-item-${r.id}`}
              >
                <div className="queue-view__row">
                  <span className="queue-view__recipe">
                    {recipe?.name ?? r.recipeId}
                  </span>
                  <span
                    className={`queue-view__badge queue-view__badge--${r.status}`}
                    data-testid={`queue-view-status-${r.id}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
                <div className="queue-view__meta">
                  {channel && (
                    <span className="queue-view__channel"># {channel.name}</span>
                  )}
                  <span className="queue-view__timestamp">
                    {formatTimestamp(r.createdAt)}
                  </span>
                </div>
                {r.resultSummary && (
                  <p className="queue-view__summary">{r.resultSummary}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
