import { useState } from 'react';
import type { Artifact } from '../../types/kapps';

interface Props {
  artifact: Artifact;
  // onOpen is the "view" action — Phase 3 wires this to open the
  // artifact body in the right panel.
  onOpen?: (artifact: Artifact) => void;
  mode?: 'full' | 'compact';
}

const STATUS_LABEL: Record<Artifact['status'], string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
};

// ArtifactCard renders a long-form artifact reference (PRD / RFC / Proposal /
// SOP / QBR) inline in chat. Phase 3 surfaces the View action, the current
// version number, and an expandable history list (ARCHITECTURE.md §6.1).
export function ArtifactCard({ artifact, onOpen, mode = 'full' }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const latest =
    artifact.versions.length > 0 ? artifact.versions[artifact.versions.length - 1] : undefined;
  const compact = mode === 'compact';
  return (
    <article
      className={`kapp-card kapp-card--artifact kapp-card--${mode}`}
      data-testid="artifact-card"
      data-mode={mode}
      aria-label={`Artifact: ${artifact.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">{artifact.type}</span>
        {artifact.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span className={`kapp-card__status kapp-card__status--${artifact.status}`}>
          {STATUS_LABEL[artifact.status]}
        </span>
        <span className="kapp-card__version" data-testid="artifact-card-version">
          {latest ? `v${latest.version}` : 'v0'}
        </span>
      </header>
      <h4 className="kapp-card__title">{artifact.title}</h4>
      {!compact && (
        <dl className="kapp-card__meta">
          {latest && (
            <div>
              <dt>Author</dt>
              <dd>{latest.author}</dd>
            </div>
          )}
          {latest?.createdAt && (
            <div>
              <dt>Updated</dt>
              <dd>{new Date(latest.createdAt).toLocaleDateString()}</dd>
            </div>
          )}
        </dl>
      )}
      {!compact && latest?.summary && (
        <p className="kapp-card__summary">{latest.summary}</p>
      )}
      {!compact && (
        <div className="kapp-card__actions" role="group" aria-label="Artifact actions">
          <button
            type="button"
            className="kapp-card__action kapp-card__action--view"
            onClick={() => onOpen?.(artifact)}
            data-testid="artifact-card-view"
          >
            View
          </button>
          {artifact.versions.length > 1 && (
            <button
              type="button"
              className="kapp-card__action kapp-card__action--history"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              data-testid="artifact-card-history-toggle"
            >
              {historyOpen ? 'Hide history' : 'View history'}
            </button>
          )}
        </div>
      )}
      {!compact && historyOpen && (
        <ol className="kapp-card__history" data-testid="artifact-card-history">
          {[...artifact.versions]
            .slice()
            .reverse()
            .map((v) => (
              <li key={v.version}>
                <span className="kapp-card__history-version">v{v.version}</span>
                <span className="kapp-card__history-author">{v.author}</span>
                {v.summary && <p className="kapp-card__history-summary">{v.summary}</p>}
              </li>
            ))}
        </ol>
      )}
    </article>
  );
}
