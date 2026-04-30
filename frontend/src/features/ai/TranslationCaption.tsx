import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTranslate } from '../../api/aiApi';
import type {
  PrivacyStripData,
  TranslateResponse,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

interface Props {
  messageId: string;
  channelId?: string;
  // The target language for the translation.
  targetLanguage?: string;
  // When true (the default) the card always auto-renders on mount.
  // Retained for backward compatibility with tests.
  autoFetch?: boolean;
  // When true, render an inline PrivacyStrip below the card.
  showPrivacyStrip?: boolean;
  // Optional fallback text for the original message, used for the top
  // panel while the translation streams.
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
  const queryClient = useQueryClient();
  // MessageList seeds this cache key with `null` while a batched SLM
  // call is in flight, and with a full TranslateResponse once it's
  // back. When we see either we skip firing our own per-message query
  // to avoid doubling up the inference cost.
  const seeded = queryClient.getQueryData<TranslateResponse | null | undefined>([
    'translate',
    messageId,
    targetLanguage,
  ]);
  const batchPending = seeded === null;
  const hasBatchResult = seeded !== undefined && seeded !== null;

  const {
    data: queryData,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['translate', messageId, targetLanguage],
    queryFn: () => fetchTranslate({ messageId, channelId, targetLanguage }),
    enabled: autoFetch && !batchPending && !hasBatchResult,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const data: TranslateResponse | null = queryData ?? null;
  const loading = autoFetch && (batchPending || (isLoading && !data));
  const error = queryError ? (queryError as Error).message : null;

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
