import { useEffect, useMemo, useState } from 'react';
import type { MemoryFact, MemoryFactKind } from '../../types/ai';
import { buildFact, createMemoryStore, type MemoryStore } from './memoryStore';

const KIND_LABELS: Record<MemoryFactKind, string> = {
  person: 'Person',
  preference: 'Preference',
  routine: 'Routine',
  note: 'Note',
};

const KIND_ORDER: MemoryFactKind[] = ['person', 'preference', 'routine', 'note'];

interface Props {
  // Tests inject a deterministic store; production callers omit this so
  // the page picks up the shared IndexedDB-backed store.
  store?: MemoryStore;
}

// AIMemoryPage is the B2C "Personal AI Memory" surface (PROPOSAL.md
// §3.2, PHASES.md Phase 2). The page renders the local-only memory
// index, lets the user add / edit / remove facts (people, preferences,
// routines, free-form notes), and prominently labels the on-device
// guarantee in the privacy banner.
export function AIMemoryPage({ store: injected }: Props = {}) {
  const store = useMemo(() => injected ?? createMemoryStore(), [injected]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<MemoryFactKind>('person');
  const [draftText, setDraftText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    store
      .list()
      .then((rows) => {
        if (!cancelled) {
          setFacts(rows);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setErr(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const grouped = useMemo(() => {
    const out = new Map<MemoryFactKind, MemoryFact[]>();
    for (const k of KIND_ORDER) out.set(k, []);
    for (const f of facts) {
      const list = out.get(f.kind) ?? [];
      list.push(f);
      out.set(f.kind, list);
    }
    return out;
  }, [facts]);

  async function add() {
    const text = draftText.trim();
    if (!text) return;
    const fact = buildFact({ kind: draftKind, text });
    setDraftText('');
    try {
      await store.put(fact);
      setFacts((rows) => [fact, ...rows]);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await store.remove(id);
      setFacts((rows) => rows.filter((r) => r.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function beginEdit(fact: MemoryFact) {
    setEditingId(fact.id);
    setEditingText(fact.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
  }

  async function commitEdit(fact: MemoryFact) {
    const text = editingText.trim();
    if (!text || text === fact.text) {
      cancelEdit();
      return;
    }
    const updated = buildFact({
      ...fact,
      text,
      id: fact.id,
      createdAt: fact.createdAt,
    });
    try {
      await store.put(updated);
      setFacts((rows) => rows.map((r) => (r.id === fact.id ? updated : r)));
      cancelEdit();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="memory-page" aria-label="AI Memory" data-testid="ai-memory-page">
      <header className="memory-page__header">
        <h1 className="memory-page__title">AI Memory</h1>
        <p className="memory-page__subtitle">
          Facts your second brain has learned about you. Stored only on this device — nothing
          syncs and the AI never writes here without your confirmation.
        </p>
        <p className="memory-page__privacy" data-testid="memory-page-privacy">
          On-device · 0 B egress · Local-only memory index
        </p>
      </header>

      <form
        className="memory-page__add"
        data-testid="memory-page-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="memory-page__field">
          <span className="memory-page__field-label">Kind</span>
          <select
            value={draftKind}
            onChange={(e) => setDraftKind(e.target.value as MemoryFactKind)}
            data-testid="memory-page-kind"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="memory-page__field memory-page__field--grow">
          <span className="memory-page__field-label">Fact</span>
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="e.g. Mira plays soccer Saturday mornings"
            data-testid="memory-page-text"
          />
        </label>
        <button
          type="submit"
          className="memory-page__add-button"
          disabled={!draftText.trim()}
          data-testid="memory-page-add-button"
        >
          Add to memory
        </button>
      </form>

      {err && (
        <div role="alert" className="memory-page__error">
          {err}
        </div>
      )}

      {loading ? (
        <p className="memory-page__loading">Loading local memory…</p>
      ) : facts.length === 0 ? (
        <p className="memory-page__empty" data-testid="memory-page-empty">
          No facts yet. Add a few to teach your second brain who's who.
        </p>
      ) : (
        KIND_ORDER.map((kind) => {
          const rows = grouped.get(kind) ?? [];
          if (rows.length === 0) return null;
          return (
            <section
              key={kind}
              className="memory-page__group"
              data-testid={`memory-page-group-${kind}`}
            >
              <h2 className="memory-page__group-title">{KIND_LABELS[kind]}</h2>
              <ul className="memory-page__list">
                {rows.map((fact) => (
                  <li key={fact.id} className="memory-page__row">
                    {editingId === fact.id ? (
                      <>
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          data-testid={`memory-page-edit-${fact.id}`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void commitEdit(fact)}
                          data-testid={`memory-page-save-${fact.id}`}
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="memory-page__row-text">{fact.text}</span>
                        <button
                          type="button"
                          onClick={() => beginEdit(fact)}
                          data-testid={`memory-page-edit-button-${fact.id}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(fact.id)}
                          data-testid={`memory-page-remove-${fact.id}`}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
