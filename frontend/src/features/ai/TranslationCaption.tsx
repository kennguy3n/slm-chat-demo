import { useEffect, useState } from 'react';
import { fetchTranslate } from '../../api/aiApi';
import type {
  PrivacyStripData,
  TranslateResponse,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  messageId: string;
  channelId?: string;
  // The user's preferred language. Defaults to "en".
  targetLanguage?: string;
  // When true the component renders the translation immediately on
  // mount; otherwise it shows a "Translate" button and only fetches
  // once the user opts in.
  autoFetch?: boolean;
  // When true, render an inline PrivacyStrip below the caption. The
  // bubble already has a strip in dense layouts, so callers can disable
  // it. Defaults to true.
  showPrivacyStrip?: boolean;
}

// TranslationCaption renders the inline-translation surface from
// PROPOSAL.md §3.2: a small "Translated" caption under the message bubble
// with a tap-to-toggle between the translated and original text. The
// component owns its own translation state (loading, success, error).
//
// The caption is rendered as an aside so screen readers announce it
// after the bubble's content rather than replacing it.
export function TranslationCaption({
  messageId,
  channelId,
  targetLanguage = 'en',
  autoFetch = true,
  showPrivacyStrip = true,
}: Props) {
  const [data, setData] = useState<TranslateResponse | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(autoFetch);

  useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTranslate({ messageId, targetLanguage })
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
  }, [messageId, targetLanguage, requested]);

  if (!requested) {
    return (
      <button
        type="button"
        className="translation-caption__trigger"
        data-testid="translation-trigger"
        onClick={() => setRequested(true)}
      >
        Translate to {targetLanguage}
      </button>
    );
  }
  if (loading) {
    return (
      <span className="translation-caption translation-caption--loading" role="status" data-testid="translation-caption">
        Translating…
      </span>
    );
  }
  if (error) {
    return (
      <span className="translation-caption translation-caption--error" role="alert" data-testid="translation-caption">
        Translation unavailable: {error}
      </span>
    );
  }
  if (!data) return null;

  const privacy: PrivacyStripData = {
    computeLocation: data.computeLocation,
    modelName: data.model,
    sources: [
      {
        kind: 'message',
        id: data.messageId,
        label: 'Source message',
      },
    ],
    dataEgressBytes: data.dataEgressBytes,
    confidence: 0.92,
    whySuggested: `Translated on-device into ${data.targetLanguage}.`,
    origin: {
      kind: 'message',
      id: data.messageId,
      label: 'Source message',
    },
  };

  return (
    <aside className="translation-caption" data-testid="translation-caption" aria-label="Translation">
      <p className="translation-caption__body" data-testid="translation-body">
        {showOriginal ? data.original : data.translated}
      </p>
      <div className="translation-caption__meta">
        <span className="translation-caption__label">
          {showOriginal ? 'Original' : `Translated · ${data.targetLanguage}`}
        </span>
        <button
          type="button"
          className="translation-caption__toggle"
          data-testid="translation-toggle"
          onClick={() => setShowOriginal((v) => !v)}
        >
          {showOriginal ? 'Show translation' : 'See original'}
        </button>
      </div>
      {showPrivacyStrip && (
        <PrivacyStrip data={privacy} />
      )}
      {channelId && (
        <input type="hidden" data-testid="translation-channel" value={channelId} readOnly />
      )}
    </aside>
  );
}
