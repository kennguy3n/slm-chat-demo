import { useState } from 'react';
import { fetchShoppingNudges } from '../../api/aiApi';
import type { ShoppingNudgesResponse } from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  channelId: string | null;
  channelName?: string;
}

// ShoppingNudgesPanel is the B2C "shopping list with nudges" surface
// (PROPOSAL.md §3.2, PHASES.md Phase 2). Owns a small local shopping
// list and asks the on-device model to suggest additions grounded in
// the chat ("Add sunscreen because field trip is tomorrow"). The list
// itself never leaves the device — it is forwarded to the inference
// router only via IPC.
export function ShoppingNudgesPanel({ channelId, channelName }: Props) {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [data, setData] = useState<ShoppingNudgesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addItem() {
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setDraft('');
      return;
    }
    setItems((rows) => [...rows, v]);
    setDraft('');
  }

  function removeItem(idx: number) {
    setItems((rows) => rows.filter((_, i) => i !== idx));
  }

  function acceptNudge(item: string) {
    // Match `addItem`'s case-insensitive dedup so adding "sunscreen" and then
    // accepting a "Sunscreen" nudge doesn't end up with both spellings.
    setItems((rows) =>
      rows.some((i) => i.toLowerCase() === item.toLowerCase()) ? rows : [...rows, item],
    );
    setData((d) =>
      d
        ? {
            ...d,
            nudges: d.nudges.filter((n) => n.item !== item),
          }
        : d,
    );
  }

  function dismissNudge(item: string) {
    setData((d) =>
      d
        ? {
            ...d,
            nudges: d.nudges.filter((n) => n.item !== item),
          }
        : d,
    );
  }

  function run() {
    if (!channelId) return;
    setErr(null);
    setLoading(true);
    fetchShoppingNudges({ channelId, existingItems: items })
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
      className="shopping-nudges-panel"
      aria-label="Shopping list with nudges"
      data-testid="shopping-nudges-panel"
    >
      <header className="shopping-nudges-panel__header">
        <h3 className="shopping-nudges-panel__title">Shopping list</h3>
        <p className="shopping-nudges-panel__subtitle">
          Local list with on-device nudges sourced from {channelName ?? 'this chat'}.
        </p>
      </header>

      <form
        className="shopping-nudges-panel__add"
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item…"
          data-testid="shopping-nudges-draft"
        />
        <button type="submit" data-testid="shopping-nudges-add" disabled={!draft.trim()}>
          Add
        </button>
      </form>

      <ul className="shopping-nudges-panel__list" data-testid="shopping-nudges-list">
        {items.length === 0 ? (
          <li className="shopping-nudges-panel__empty">List is empty.</li>
        ) : (
          items.map((it, i) => (
            <li key={`${i}-${it}`} className="shopping-nudges-panel__row">
              <span>{it}</span>
              <button
                type="button"
                onClick={() => removeItem(i)}
                data-testid={`shopping-nudges-remove-${i}`}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        className="shopping-nudges-panel__run"
        onClick={run}
        disabled={loading || !channelId}
        data-testid="shopping-nudges-run"
      >
        {loading ? 'Suggesting…' : 'Suggest from chat'}
      </button>

      {err && (
        <div role="alert" className="shopping-nudges-panel__error">
          Nudges failed: {err}
        </div>
      )}

      {data && (
        <>
          <h4 className="shopping-nudges-panel__nudges-title">Suggestions</h4>
          {data.nudges.length === 0 ? (
            <p className="shopping-nudges-panel__empty" data-testid="shopping-nudges-empty">
              Nothing new to nudge — your list already covers the chat.
            </p>
          ) : (
            <ul className="shopping-nudges-panel__nudges" data-testid="shopping-nudges-nudges">
              {data.nudges.map((n, i) => (
                <li key={`${i}-${n.item}`} className="shopping-nudges-panel__nudge">
                  <div className="shopping-nudges-panel__nudge-text">
                    <strong>{n.item}</strong>
                    <span className="shopping-nudges-panel__nudge-reason">{n.reason}</span>
                  </div>
                  <div className="shopping-nudges-panel__nudge-actions">
                    <button
                      type="button"
                      onClick={() => acceptNudge(n.item)}
                      data-testid={`shopping-nudges-accept-${i}`}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissNudge(n.item)}
                      data-testid={`shopping-nudges-dismiss-${i}`}
                    >
                      Dismiss
                    </button>
                  </div>
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
                { signal: `${data.nudges.length} nudges suggested` },
                { signal: 'Shopping list never leaves this device' },
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
