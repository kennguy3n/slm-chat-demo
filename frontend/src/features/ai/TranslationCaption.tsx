import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  // When true, render an inline PrivacyStrip below the card. The
  // bubble already shows an on-device attribution pill inside the
  // card, so the full strip is off by default in dense layouts.
  showPrivacyStrip?: boolean;
  // Optional fallback text for the original message. The API also
  // returns `original`, but passing it in up-front lets the card
  // render the top panel immediately while the translation streams.
  originalFallback?: string;
}

// Human-readable language names for the bottom-panel label. Falls
// back to the raw code for languages we haven't listed.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  vi: 'Vietnamese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  fr: 'French',
  de: 'German',
};

function languageName(code: string | undefined): string {
  if (!code) return '';
  const base = code.toLowerCase().split(/[-_]/)[0] ?? '';
  return LANGUAGE_NAMES[base] ?? code;
}

// TranslationCaption is the two-panel translation card surface from
// PROPOSAL.md §3.2 ("inline translation"). The current layout matches
// the product mockup: the bubble renders as a light-blue card with
// the original text on top, a horizontal divider, and the translated
// text below, with a small on-device attribution pill anchored in the
// bottom-left. The card is followed by an optional full PrivacyStrip
// so the compute location / model / egress bytes are fully auditable.
export function TranslationCaption({
  messageId,
  channelId,
  targetLanguage = 'en',
  autoFetch = true,
  showPrivacyStrip = false,
  originalFallback,
}: Props) {
  const [requested, setRequested] = useState(autoFetch);

  // useQuery caches results by key so remounts (e.g. after a message
  // list refetch) don't re-fire the 30–90 s SLM inference. The query
  // runs only once `requested` flips to true, which for `autoFetch`
  // is the mount itself.
  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['translate', messageId, targetLanguage],
    queryFn: () => fetchTranslate({ messageId, channelId, targetLanguage }),
    enabled: requested,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const data: TranslateResponse | null = queryData ?? null;
  const loading = isLoading && requested;
  const error = queryError ? (queryError as Error).message : null;

  if (!requested) {
    return (
      <button
        type="button"
        className="translation-caption__trigger"
        data-testid="translation-trigger"
        onClick={() => setRequested(true)}
      >
        Translate to {languageName(targetLanguage) || targetLanguage}
      </button>
    );
  }
  if (loading && !data) {
    return (
      <span
        className="translation-caption translation-caption--loading"
        role="status"
        data-testid="translation-caption"
      >
        Translating on-device…
      </span>
    );
  }
  if (error) {
    return (
      <span
        className="translation-caption translation-caption--error"
        role="alert"
        data-testid="translation-caption"
      >
        Translation unavailable: {error}
      </span>
    );
  }
  if (!data) return null;

  const original = data.original || originalFallback || '';
  const targetLabel = languageName(data.targetLanguage) || data.targetLanguage;
  const bytesLabel =
    data.dataEgressBytes === 0 ? '0 B' : `${data.dataEgressBytes} B`;
  const computeLabel =
    data.computeLocation === 'on_device' ? 'on-device' : data.computeLocation;

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
    whySuggested: `Translated on-device into ${targetLabel}.`,
    origin: {
      kind: 'message',
      id: data.messageId,
      label: 'Source message',
    },
  };

  return (
    <aside
      className="translation-caption translation-card"
      data-testid="translation-caption"
      aria-label={`Translation into ${targetLabel}`}
    >
      <div className="translation-card__panel translation-card__panel--original">
        <span className="translation-card__label" aria-hidden>
          Original
        </span>
        <p
          className="translation-card__body translation-card__body--original"
          data-testid="translation-original"
        >
          {original}
        </p>
      </div>
      <hr className="translation-card__divider" aria-hidden />
      <div className="translation-card__panel translation-card__panel--translated">
        <span className="translation-card__label" aria-hidden>
          {targetLabel}
        </span>
        <p
          className="translation-card__body translation-card__body--translated"
          data-testid="translation-body"
        >
          {data.translated}
        </p>
        <div className="translation-card__pill" data-testid="translation-pill">
          <span className="translation-card__pill-badge" aria-hidden>
            SLM
          </span>
          <span className="translation-card__pill-text">
            {computeLabel} · {data.model} · {bytesLabel} egress
          </span>
        </div>
      </div>
      {showPrivacyStrip && <PrivacyStrip data={privacy} />}
      {channelId && (
        <input
          type="hidden"
          data-testid="translation-channel"
          value={channelId}
          readOnly
        />
      )}
    </aside>
  );
}
