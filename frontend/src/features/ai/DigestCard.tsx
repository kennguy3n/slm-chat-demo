import type { UnreadSummaryResponse } from '../../types/ai';

interface Props {
  digest: UnreadSummaryResponse;
  streamingText?: string;
  isStreaming?: boolean;
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}

// DigestCard renders the AI-generated unread-chat digest plus accept/edit/
// discard actions. The digest text is always sourced from `streamingText`
// — the caller (ChatSurface) accumulates streamed tokens there and keeps
// the final value after the stream ends. `isStreaming` only toggles the
// blinking cursor.
export function DigestCard({
  digest,
  streamingText,
  isStreaming = false,
  onAccept,
  onEdit,
  onDiscard,
}: Props) {
  const text = streamingText ?? '';
  return (
    <article className="digest-card" data-testid="digest-card" aria-label="AI unread digest">
      <header className="digest-card__header">
        <h3 className="digest-card__title">Catch-up digest</h3>
        <span className="digest-card__model" data-testid="digest-card-model">
          {digest.model}
        </span>
      </header>
      <div className="digest-card__body" data-testid="digest-card-body">
        {text ? (
          text.split('\n').map((line, i) =>
            line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>,
          )
        ) : (
          <p className="digest-card__placeholder">No unread messages.</p>
        )}
        {isStreaming && (
          <span className="digest-card__cursor" aria-hidden>
            ▍
          </span>
        )}
      </div>
      {digest.sources.length > 0 && (
        <details className="digest-card__sources">
          <summary>Sources ({digest.sources.length})</summary>
          <ul data-testid="digest-card-sources">
            {digest.sources.map((src) => (
              <li key={src.id}>
                <a href={`#message-${src.id}`}>{src.sender}</a>: {src.excerpt}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="digest-card__actions" role="group" aria-label="Digest actions">
        <button type="button" onClick={onAccept} data-testid="digest-card-accept">
          Accept
        </button>
        <button type="button" onClick={onEdit} data-testid="digest-card-edit">
          Edit
        </button>
        <button type="button" onClick={onDiscard} data-testid="digest-card-discard">
          Discard
        </button>
      </div>
    </article>
  );
}
