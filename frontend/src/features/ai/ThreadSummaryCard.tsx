import type {
  PrivacyStripData,
  ThreadSummaryResponse,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';
import { CitationRenderer } from '../knowledge/CitationRenderer';
import type { CitationSource } from '../knowledge/CitationChip';

interface Props {
  summary: ThreadSummaryResponse;
  streamingText?: string;
  isStreaming?: boolean;
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}

// ThreadSummaryCard renders the streamed summary of a B2B thread next
// to source back-links and a PrivacyStrip. It mirrors DigestCard's
// streaming contract: streamingText holds whatever has arrived so far
// (and the final value once isStreaming flips false), and the card
// shows a blinking cursor while streaming.
export function ThreadSummaryCard({
  summary,
  streamingText,
  isStreaming = false,
  onAccept,
  onEdit,
  onDiscard,
}: Props) {
  const text = streamingText ?? '';
  const hasCitations = /\[source:[a-zA-Z0-9_\-:.]+\]/.test(text);
  const citationSources: CitationSource[] = summary.sources.map((s) => ({
    kind: 'message' as const,
    id: s.id,
    label: `${s.sender}`,
    sender: s.sender,
    excerpt: s.excerpt,
  }));

  const privacy: PrivacyStripData = {
    computeLocation: summary.computeLocation,
    modelName: summary.model,
    sources: summary.sources.map((s) => ({
      kind: 'message' as const,
      id: s.id,
      label: `${s.sender}: ${s.excerpt}`,
    })),
    dataEgressBytes: summary.dataEgressBytes,
    confidence: 0.83,
    whySuggested: summary.reason,
    origin: {
      kind: 'thread',
      id: summary.threadId,
      label: 'Source thread',
    },
  };

  return (
    <article
      className="thread-summary-card"
      data-testid="thread-summary-card"
      aria-label="AI thread summary"
    >
      <header className="thread-summary-card__header">
        <h3 className="thread-summary-card__title">Thread summary</h3>
        <span className="thread-summary-card__model" data-testid="thread-summary-model">
          {summary.model}
        </span>
        <span className="thread-summary-card__tier" data-testid="thread-summary-tier">
          {summary.tier.toUpperCase()}
        </span>
      </header>
      <div className="thread-summary-card__body" data-testid="thread-summary-body">
        {text ? (
          hasCitations ? (
            <CitationRenderer text={text} sources={citationSources} />
          ) : (
            text
              .split('\n')
              .map((line, i) =>
                line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>,
              )
          )
        ) : (
          <p className="thread-summary-card__placeholder">
            Loading summary…
          </p>
        )}
        {isStreaming && (
          <span className="thread-summary-card__cursor" aria-hidden>
            ▍
          </span>
        )}
      </div>
      {!hasCitations && summary.sources.length > 0 && (
        <details className="thread-summary-card__sources">
          <summary>Sources ({summary.sources.length})</summary>
          <ul data-testid="thread-summary-sources">
            {summary.sources.map((src) => (
              <li key={src.id}>
                <a href={`#message-${src.id}`}>{src.sender}</a>: {src.excerpt}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div
        className="thread-summary-card__actions"
        role="group"
        aria-label="Thread summary actions"
      >
        <button type="button" onClick={onAccept} data-testid="thread-summary-accept">
          Accept
        </button>
        <button type="button" onClick={onEdit} data-testid="thread-summary-edit">
          Edit
        </button>
        <button type="button" onClick={onDiscard} data-testid="thread-summary-discard">
          Discard
        </button>
      </div>
      <PrivacyStrip data={privacy} />
    </article>
  );
}
