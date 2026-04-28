import type {
  DraftArtifactResponse,
  PrivacyStripData,
  PrivacyStripWhyDetail,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  draft: DraftArtifactResponse;
  streamingText?: string;
  isStreaming?: boolean;
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}

const SECTION_LABEL: Record<DraftArtifactResponse['section'], string> = {
  goal: 'Goal section',
  requirements: 'Requirements section',
  risks: 'Risks section',
  all: 'Top-level draft',
};

// ArtifactDraftCard renders the streamed body of a long-form artifact
// section drafted from a B2B thread (PROPOSAL.md §5.1 "Create"). It
// mirrors ThreadSummaryCard's streaming contract: streamingText holds
// whatever has arrived so far and the card shows a blinking cursor while
// `isStreaming` is true.
export function ArtifactDraftCard({
  draft,
  streamingText,
  isStreaming = false,
  onAccept,
  onEdit,
  onDiscard,
}: Props) {
  const text = streamingText ?? '';

  const whyDetails: PrivacyStripWhyDetail[] = [
    { signal: `Artifact type: ${draft.artifactType}` },
    { signal: SECTION_LABEL[draft.section] },
    {
      signal: `Routed to ${draft.tier.toUpperCase()} (${draft.messageCount} messages)`,
    },
  ];
  for (const s of draft.sources.slice(0, 5)) {
    whyDetails.push({
      signal: 'Source message',
      sourceId: s.id,
      sourceLabel: `${s.sender}: ${s.excerpt}`,
    });
  }

  const privacy: PrivacyStripData = {
    computeLocation: draft.computeLocation,
    modelName: draft.model,
    sources: draft.sources.map((s) => ({
      kind: 'message' as const,
      id: s.id,
      label: `${s.sender}: ${s.excerpt}`,
    })),
    dataEgressBytes: draft.dataEgressBytes,
    confidence: 0.78,
    whySuggested: draft.reason,
    whyDetails,
    origin: {
      kind: 'thread',
      id: draft.threadId,
      label: 'Source thread',
    },
  };

  return (
    <article
      className="artifact-draft-card"
      data-testid="artifact-draft-card"
      aria-label="AI artifact draft"
    >
      <header className="artifact-draft-card__header">
        <span className="artifact-draft-card__kind">{draft.artifactType}</span>
        <span className="artifact-draft-card__ai-badge">AI</span>
        <span className="artifact-draft-card__tier" data-testid="artifact-draft-tier">
          {draft.tier.toUpperCase()}
        </span>
        <span
          className="artifact-draft-card__section"
          data-testid="artifact-draft-section"
        >
          {SECTION_LABEL[draft.section]}
        </span>
      </header>
      <h4 className="artifact-draft-card__title" data-testid="artifact-draft-title">
        {draft.title}
      </h4>
      <div className="artifact-draft-card__body" data-testid="artifact-draft-body">
        {text ? (
          text.split('\n').map((line, i) =>
            line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>,
          )
        ) : (
          <p className="artifact-draft-card__placeholder">Drafting…</p>
        )}
        {isStreaming && (
          <span className="artifact-draft-card__cursor" aria-hidden>
            ▍
          </span>
        )}
      </div>
      {draft.sources.length > 0 && (
        <details className="artifact-draft-card__sources">
          <summary>Sources ({draft.sources.length})</summary>
          <ul data-testid="artifact-draft-sources">
            {draft.sources.map((src) => (
              <li key={src.id}>
                <a href={`#message-${src.id}`}>{src.sender}</a>: {src.excerpt}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div
        className="artifact-draft-card__actions"
        role="group"
        aria-label="Artifact draft actions"
      >
        <button type="button" onClick={onAccept} data-testid="artifact-draft-accept">
          Save as draft
        </button>
        <button type="button" onClick={onEdit} data-testid="artifact-draft-edit">
          Edit
        </button>
        <button type="button" onClick={onDiscard} data-testid="artifact-draft-discard">
          Discard
        </button>
      </div>
      <PrivacyStrip data={privacy} />
    </article>
  );
}
