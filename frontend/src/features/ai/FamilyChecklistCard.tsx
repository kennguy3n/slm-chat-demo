import { useState } from 'react';
import { fetchFamilyChecklist } from '../../api/aiApi';
import type { FamilyChecklistResponse } from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  channelId: string | null;
  channelName?: string;
}

// FamilyChecklistCard is the B2C "Family checklist" surface
// (PROPOSAL.md §3.2, PHASES.md Phase 2). Reads the recent family chat,
// drafts a concrete preparation checklist with optional event focus,
// and shows on-device routing in the privacy strip.
export function FamilyChecklistCard({ channelId, channelName }: Props) {
  const [eventHint, setEventHint] = useState('');
  const [data, setData] = useState<FamilyChecklistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    if (!channelId) return;
    setErr(null);
    setLoading(true);
    setData(null);
    fetchFamilyChecklist({ channelId, eventHint: eventHint.trim() || undefined })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }

  return (
    <section
      className="family-checklist-card"
      aria-label="Family checklist"
      data-testid="family-checklist-card"
    >
      <header className="family-checklist-card__header">
        <h3 className="family-checklist-card__title">Family checklist</h3>
        <p className="family-checklist-card__subtitle">
          Turns {channelName ?? 'this chat'} into a concrete prep list — runs on this device.
        </p>
      </header>

      <div className="family-checklist-card__form">
        <label className="family-checklist-card__field">
          <span>Focus event (optional)</span>
          <input
            type="text"
            value={eventHint}
            onChange={(e) => setEventHint(e.target.value)}
            placeholder="e.g. Soccer practice tomorrow"
            data-testid="family-checklist-hint"
          />
        </label>
        <button
          type="button"
          className="family-checklist-card__run"
          onClick={run}
          disabled={loading || !channelId}
          data-testid="family-checklist-run"
        >
          {loading ? 'Building…' : data ? 'Refresh checklist' : 'Generate checklist'}
        </button>
      </div>

      {!channelId && (
        <p className="family-checklist-card__empty">Pick a chat to generate a checklist.</p>
      )}

      {err && (
        <div role="alert" className="family-checklist-card__error">
          Checklist failed: {err}
        </div>
      )}

      {data && (
        <>
          <h4 className="family-checklist-card__list-title">{data.title}</h4>
          {data.items.length === 0 ? (
            <p className="family-checklist-card__empty">No prep items detected yet.</p>
          ) : (
            <ul className="family-checklist-card__list" data-testid="family-checklist-list">
              {data.items.map((item, i) => (
                <li key={`${i}-${item.title}`} className="family-checklist-card__item">
                  <input
                    type="checkbox"
                    aria-label={item.title}
                    data-testid={`family-checklist-item-${i}`}
                  />
                  <span className="family-checklist-card__item-title">{item.title}</span>
                  {item.dueHint && (
                    <span className="family-checklist-card__item-due">{item.dueHint}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <PrivacyStrip
            data={{
              computeLocation: data.computeLocation,
              modelName: data.model,
              sources: data.sourceMessageIds.map((id) => ({
                kind: 'message' as const,
                id,
                label: id,
              })),
              dataEgressBytes: data.dataEgressBytes,
              whySuggested: data.reason,
              whyDetails: [
                { signal: `Routed to ${data.tier.toUpperCase()}` },
                { signal: `${data.items.length} items extracted` },
                { signal: 'Runs on-device only' },
              ],
              origin: {
                kind: 'message',
                id: data.sourceMessageIds[0] ?? data.channelId,
                label: channelName ?? data.channelId,
              },
            }}
          />
        </>
      )}
    </section>
  );
}
