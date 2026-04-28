import type { Artifact } from '../../types/kapps';

interface Props {
  artifact: Artifact;
  onOpen?: (artifact: Artifact) => void;
}

const STATUS_LABEL: Record<Artifact['status'], string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
};

// ArtifactCard renders a long-form artifact reference (PRD / RFC / Proposal /
// SOP / QBR) inline in chat. Shows the type, title, current version, status,
// and an open link (ARCHITECTURE.md 6.1).
export function ArtifactCard({ artifact, onOpen }: Props) {
  const latest = artifact.versions.length > 0 ? artifact.versions[artifact.versions.length - 1] : undefined;
  return (
    <article
      className="kapp-card kapp-card--artifact"
      data-testid="artifact-card"
      aria-label={`Artifact: ${artifact.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">{artifact.type}</span>
        {artifact.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span className={`kapp-card__status kapp-card__status--${artifact.status}`}>
          {STATUS_LABEL[artifact.status]}
        </span>
      </header>
      <h4 className="kapp-card__title">{artifact.title}</h4>
      <dl className="kapp-card__meta">
        <div>
          <dt>Version</dt>
          <dd>{latest ? `v${latest.version}` : '—'}</dd>
        </div>
        {latest && (
          <div>
            <dt>Author</dt>
            <dd>{latest.author}</dd>
          </div>
        )}
      </dl>
      {latest?.summary && <p className="kapp-card__summary">{latest.summary}</p>}
      <button type="button" className="kapp-card__source" onClick={() => onOpen?.(artifact)}>
        Open artifact
      </button>
    </article>
  );
}
