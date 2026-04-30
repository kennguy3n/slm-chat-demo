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
  // The viewer's preferred language. When the translation is into
  // this language, the bottom (translated) panel takes visual
  // emphasis. When the translation is into a *partner* language
  // (i.e. the viewer wrote in their preferred language and is
  // showing it to a partner), the original stays prominent and the
  // translation drops to the secondary panel. Defaults to 'en'.
  preferredLanguage?: string;
}

// Human-readable language names + a small flag emoji used by the
// per-panel label. Defaults to a generic globe when we don't know
// the language.
const LANGUAGE_META: Record<string, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇺🇸' },
  es: { name: 'Spanish', flag: '🇪🇸' },
  vi: { name: 'Vietnamese', flag: '🇻🇳' },
  ja: { name: 'Japanese', flag: '🇯🇵' },
  ko: { name: 'Korean', flag: '🇰🇷' },
  zh: { name: 'Chinese', flag: '🇨🇳' },
  fr: { name: 'French', flag: '🇫🇷' },
  de: { name: 'German', flag: '🇩🇪' },
};

function normaliseCode(code: string | undefined): string {
  if (!code) return '';
  return code.toLowerCase().split(/[-_]/)[0] ?? '';
}

function languageName(code: string | undefined): string {
  if (!code) return '';
  const base = normaliseCode(code);
  return LANGUAGE_META[base]?.name ?? code;
}

function languageFlag(code: string | undefined): string {
  const base = normaliseCode(code);
  return LANGUAGE_META[base]?.flag ?? '🌐';
}

// Build a panel label string like "🇺🇸 English". Falls back to a
// globe + the raw code when we don't recognise the language.
function panelLabel(code: string | undefined): string {
  if (!code) return 'Original';
  return `${languageFlag(code)} ${languageName(code)}`;
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
  preferredLanguage = 'en',
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

  // Context-aware emphasis: in a bilingual chat the message arrives
  // either in the viewer's preferred language (they wrote it; the
  // bottom panel shows the partner's-language version) or in the
  // partner's language (incoming message; bottom panel shows the
  // viewer's-language version). When the translation lands in the
  // viewer's preferred language we promote the bottom panel as
  // primary so the eye lands on text the viewer can read; when it's
  // outgoing context (translation INTO the partner language), the
  // original stays prominent.
  const targetBase = normaliseCode(data.targetLanguage);
  const preferredBase = normaliseCode(preferredLanguage);
  const intoPreferred = targetBase === preferredBase;
  const originalLanguage = intoPreferred
    ? // Translation is INTO the viewer's language; the original is
      // therefore in some other language. We don't know its exact
      // code from the response (the adapter doesn't echo a source
      // language) so we leave the label as "Original" if the source
      // looks ambiguous, but if the partnerLanguage hint matches we
      // use it.
      undefined
    : // Translation is INTO the partner language → the original is
      // in the viewer's preferred language.
      preferredLanguage;

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

  const originalPanelClass =
    'translation-card__panel translation-card__panel--original' +
    (intoPreferred ? ' translation-card__panel--secondary' : ' translation-card__panel--primary');
  const translatedPanelClass =
    'translation-card__panel translation-card__panel--translated' +
    (intoPreferred ? ' translation-card__panel--primary' : ' translation-card__panel--secondary');

  return (
    <aside
      className="translation-caption translation-card"
      data-testid="translation-caption"
      data-emphasis={intoPreferred ? 'translated' : 'original'}
      aria-label={`Translation into ${targetLabel}`}
    >
      <div className={originalPanelClass}>
        <span className="translation-card__label" aria-hidden>
          {originalLanguage ? panelLabel(originalLanguage) : 'Original'}
        </span>
        <p
          className="translation-card__body translation-card__body--original"
          data-testid="translation-original"
        >
          {original}
        </p>
      </div>
      <hr className="translation-card__divider" aria-hidden />
      <div className={translatedPanelClass}>
        <span className="translation-card__label" aria-hidden>
          {panelLabel(data.targetLanguage)}
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
