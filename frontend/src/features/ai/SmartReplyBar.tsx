import { useEffect, useState } from 'react';
import { fetchSmartReply } from '../../api/aiApi';
import type {
  PrivacyStripData,
  SmartReplyResponse,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  channelId: string;
  // The id of the most recent message from someone else; included as a
  // back-link in the privacy strip so the user can see which message the
  // suggestions were drawn from.
  sourceMessageId?: string;
  // onSelect inserts the chosen reply text into the composer's input.
  onSelect: (text: string) => void;
}

// SmartReplyBar fetches /api/ai/smart-reply for the latest incoming
// message in the channel and renders 2–3 suggestion chips above the
// composer. Tapping a chip inserts the text into the composer input.
// Below the chips it shows a PrivacyStrip with on-device /
// Bonsai-1.7B / 0 bytes egress per PROPOSAL.md §4.3.
//
// The component owns its own fetch state (instead of going through
// react-query) because the suggestions must refresh whenever the source
// message changes, and they're cheap enough that retry/cache adds little.
export function SmartReplyBar({ channelId, sourceMessageId, onSelect }: Props) {
  const [data, setData] = useState<SmartReplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    fetchSmartReply({ channelId, messageId: sourceMessageId })
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, sourceMessageId]);

  if (loading && !data) {
    return (
      <div className="smart-reply-bar smart-reply-bar--loading" data-testid="smart-reply-bar">
        <span role="status" className="smart-reply-bar__status">
          Drafting on-device replies…
        </span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="smart-reply-bar smart-reply-bar--error" data-testid="smart-reply-bar">
        <span role="alert">Smart reply unavailable: {error}</span>
      </div>
    );
  }
  if (!data || data.replies.length === 0) return null;

  const privacyData: PrivacyStripData = {
    computeLocation: data.computeLocation,
    modelName: data.model,
    sources: sourceMessageId
      ? [
          {
            kind: 'message',
            id: sourceMessageId,
            label: 'Triggering message',
          },
        ]
      : [],
    dataEgressBytes: data.dataEgressBytes,
    confidence: 0.78,
    whySuggested:
      'Drafted from the last few messages so the reply lands in context.',
    origin: {
      kind: 'message',
      id: sourceMessageId ?? data.channelId,
      label: 'Recent chat',
    },
  };

  return (
    <div className="smart-reply-bar" data-testid="smart-reply-bar" aria-label="Smart reply suggestions">
      <ul className="smart-reply-bar__chips" role="list" data-testid="smart-reply-chips">
        {data.replies.map((reply, i) => (
          <li key={`${i}-${reply}`}>
            <button
              type="button"
              className="smart-reply-bar__chip"
              data-testid={`smart-reply-chip-${i}`}
              onClick={() => onSelect(reply)}
            >
              {reply}
            </button>
          </li>
        ))}
      </ul>
      <PrivacyStrip data={privacyData} />
    </div>
  );
}
