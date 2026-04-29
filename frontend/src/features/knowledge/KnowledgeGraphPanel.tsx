import { useEffect, useMemo, useState } from 'react';
import type {
  KnowledgeEntity,
  KnowledgeEntityKind,
} from '../../types/knowledge';
import { extractKnowledge, fetchKnowledge } from '../../api/knowledgeApi';

interface Props {
  channelId: string;
  channelName?: string;
  // Test seam — lets the panel tests stub the network layer without
  // intercepting global fetch.
  api?: {
    fetchKnowledge?: (
      channelId: string,
      kind?: string,
    ) => Promise<KnowledgeEntity[]>;
    extractKnowledge?: (channelId: string) => Promise<KnowledgeEntity[]>;
  };
}

interface SectionDef {
  kind: KnowledgeEntityKind;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { kind: 'decision', label: 'Decisions' },
  { kind: 'owner', label: 'Owners' },
  { kind: 'risk', label: 'Risks' },
  { kind: 'requirement', label: 'Requirements' },
  { kind: 'deadline', label: 'Deadlines' },
];

// KnowledgeGraphPanel renders the Phase 5 right-rail "Knowledge" tab
// for a B2B channel. Five collapsible sections — Decisions, Owners,
// Risks, Requirements, Deadlines — list extracted entities as compact
// cards with a source-message link, confidence badge, actor list, and
// optional due date. The "Extract" button (re-)runs heuristic
// extraction on the active channel and refreshes the list.
//
// The graph is purely workspace-local: the API is mounted under the
// existing data-only Go backend and entities are scoped per channel
// to mirror PROPOSAL.md §7 rule 2 ("never read across channels
// without explicit pickup"). The panel is intentionally agnostic to
// the underlying extractor — Phase 5 ships a keyword heuristic; a
// future phase can swap in an SLM-backed extractor without changing
// this component.
export function KnowledgeGraphPanel({ channelId, channelName, api }: Props) {
  const list = api?.fetchKnowledge ?? fetchKnowledge;
  const extract = api?.extractKnowledge ?? extractKnowledge;

  const [entities, setEntities] = useState<KnowledgeEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    list(channelId)
      .then((items) => {
        if (cancelled) return;
        setEntities(items);
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
  }, [channelId, list]);

  const grouped = useMemo(() => {
    const out: Record<KnowledgeEntityKind, KnowledgeEntity[]> = {
      decision: [],
      owner: [],
      risk: [],
      requirement: [],
      deadline: [],
    };
    for (const e of entities) {
      out[e.kind].push(e);
    }
    return out;
  }, [entities]);

  async function handleExtract() {
    setExtracting(true);
    setError(null);
    try {
      const next = await extract(channelId);
      setEntities(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExtracting(false);
    }
  }

  function toggleSection(kind: KnowledgeEntityKind) {
    setCollapsed((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  const empty = !loading && !error && entities.length === 0;

  return (
    <section
      className="knowledge-graph-panel"
      data-testid="knowledge-graph-panel"
    >
      <header className="knowledge-graph-panel__header">
        <h3>Knowledge</h3>
        {channelName && (
          <p className="knowledge-graph-panel__subtitle">
            From <strong>#{channelName}</strong>
          </p>
        )}
        <button
          type="button"
          className="knowledge-graph-panel__extract"
          onClick={handleExtract}
          disabled={extracting || !channelId}
          data-testid="knowledge-graph-extract"
        >
          {extracting ? 'Extracting…' : 'Extract'}
        </button>
      </header>

      {loading && <p>Loading knowledge graph…</p>}
      {error && (
        <p className="knowledge-graph-panel__error" role="alert">
          {error}
        </p>
      )}

      {empty && (
        <p
          className="knowledge-graph-panel__empty"
          data-testid="knowledge-graph-empty"
        >
          No entities extracted yet. Click Extract to scan this channel.
        </p>
      )}

      {!empty && !loading && (
        <ul className="knowledge-graph-panel__sections">
          {SECTIONS.map(({ kind, label }) => {
            const items = grouped[kind];
            const isCollapsed = collapsed[kind] ?? false;
            return (
              <li
                key={kind}
                className="knowledge-graph-panel__section"
                data-testid={`knowledge-graph-section-${kind}`}
              >
                <button
                  type="button"
                  className="knowledge-graph-panel__section-toggle"
                  onClick={() => toggleSection(kind)}
                  aria-expanded={!isCollapsed}
                  data-testid={`knowledge-graph-section-toggle-${kind}`}
                >
                  <span aria-hidden>{isCollapsed ? '▸' : '▾'}</span>{' '}
                  {label} ({items.length})
                </button>
                {!isCollapsed && (
                  <ul className="knowledge-graph-panel__items">
                    {items.length === 0 && (
                      <li className="knowledge-graph-panel__item-empty">
                        None
                      </li>
                    )}
                    {items.map((e) => (
                      <EntityCard key={e.id} entity={e} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EntityCard({ entity }: { entity: KnowledgeEntity }) {
  return (
    <li
      className="knowledge-graph-panel__card"
      data-testid={`knowledge-graph-card-${entity.id}`}
    >
      <div className="knowledge-graph-panel__card-title">{entity.title}</div>
      <div className="knowledge-graph-panel__card-description">
        {entity.description}
      </div>
      <div className="knowledge-graph-panel__card-meta">
        <a
          className="knowledge-graph-panel__card-source"
          href={`#message-${entity.sourceMessageId}`}
          data-testid={`knowledge-graph-card-source-${entity.id}`}
        >
          source
        </a>
        <span
          className="knowledge-graph-panel__card-confidence"
          data-testid={`knowledge-graph-card-confidence-${entity.id}`}
        >
          {Math.round(entity.confidence * 100)}%
        </span>
        {entity.actors && entity.actors.length > 0 && (
          <span
            className="knowledge-graph-panel__card-actors"
            data-testid={`knowledge-graph-card-actors-${entity.id}`}
          >
            {entity.actors.map((a) => `@${a}`).join(', ')}
          </span>
        )}
        {entity.dueDate && (
          <span
            className="knowledge-graph-panel__card-due"
            data-testid={`knowledge-graph-card-due-${entity.id}`}
          >
            due {formatDue(entity.dueDate)}
          </span>
        )}
      </div>
    </li>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
