import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchBilingualSummary, fetchUnreadSummary } from '../../api/aiApi';
import { streamAITask } from '../../api/streamAI';
import type { UnreadSummaryResponse } from '../../types/ai';
import type { Channel, User } from '../../types/workspace';
import { DigestCard } from './DigestCard';
import { PrivacyStrip } from './PrivacyStrip';

// Shared cache key prefix; the bilingual variant adds the channel id
// so each conversation owns its own cached summary. The default
// catch-up digest still uses the original key.
const DEFAULT_CACHE_KEY = ['morning-digest'] as const;

function cacheKeyFor(channel: Channel | null | undefined) {
  if (channel?.partnerLanguage) {
    return ['conversation-summary', channel.id] as const;
  }
  return DEFAULT_CACHE_KEY;
}

interface DigestCache {
  digest: UnreadSummaryResponse;
  streamingText: string;
  generatedAt: string;
}

interface Props {
  // Optional active channel. When the channel has `partnerLanguage`
  // set, the panel switches into "Bilingual conversation summary"
  // mode and only summarises that channel's messages. Otherwise it
  // runs the legacy multi-chat morning digest.
  channel?: Channel | null;
  // Reserved for future per-sender annotation in the summary; kept on
  // the props so B2CLayout can pass the workspace user map without
  // tripping a TS error.
  users?: Record<string, User>;
}

// MorningDigestPanel powers the B2C right-rail "Summary" tab. With
// no channel context it renders the original Morning Catch-up digest
// (multi-chat tail summary, PROPOSAL.md §5.1). When the active
// channel is a bilingual DM (e.g. the Alice ↔ Minh demo), the panel
// switches into "Conversation Summary" mode: a single-channel
// bilingual digest produced on-device, written in the viewer's
// language. Both modes stream through `streamAITask` and cache the
// finished output in react-query so a tab switch replays the same
// summary instead of re-running inference.
export function MorningDigestPanel(_props: Props = {}) {
  const props = _props;
  const channel = props.channel ?? null;
  const isBilingual = Boolean(channel?.partnerLanguage);

  const queryClient = useQueryClient();
  const cacheKey = cacheKeyFor(channel);
  const cached = queryClient.getQueryData<DigestCache>(cacheKey) ?? null;

  const [digest, setDigest] = useState<UnreadSummaryResponse | null>(
    cached?.digest ?? null,
  );
  const [streamingText, setStreamingText] = useState(cached?.streamingText ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    cached ? new Date(cached.generatedAt) : null,
  );
  const [err, setErr] = useState<string | null>(null);
  const startedRef = useRef<string | null>(null);

  function run() {
    setErr(null);
    setDigest(null);
    setStreamingText('');
    setIsStreaming(true);
    let collected = '';
    let digestSnapshot: UnreadSummaryResponse | null = null;
    const fetcher: Promise<UnreadSummaryResponse> =
      isBilingual && channel?.partnerLanguage
        ? fetchBilingualSummary({
            channelId: channel.id,
            channelName: channel.name,
            partnerLanguage: channel.partnerLanguage,
          })
        : fetchUnreadSummary();
    void fetcher
      .then((raw) => {
        const d: UnreadSummaryResponse = { ...raw, sources: raw.sources ?? [] };
        digestSnapshot = d;
        setDigest(d);
        streamAITask(
          { taskType: 'summarize', prompt: d.prompt },
          {
            onChunk: (delta) => {
              collected += delta;
              setStreamingText((t) => t + delta);
            },
            onDone: () => {
              setIsStreaming(false);
              const now = new Date();
              setGeneratedAt(now);
              if (digestSnapshot) {
                queryClient.setQueryData<DigestCache>(cacheKey, {
                  digest: digestSnapshot,
                  streamingText: collected,
                  generatedAt: now.toISOString(),
                });
              }
            },
            onError: (e) => {
              setErr(e.message);
              setIsStreaming(false);
            },
          },
        );
      })
      .catch((e: Error) => {
        setErr(e.message);
        setIsStreaming(false);
      });
  }

  // Auto-run on first mount (or on channel change) if no cached
  // summary exists for the current cache key. The ref tracks the
  // last channel we kicked a run for so React 18 StrictMode's
  // double-effect in development doesn't fire two runs.
  useEffect(() => {
    const key = cacheKey.join(':');
    if (startedRef.current === key) return;
    startedRef.current = key;
    const existing = queryClient.getQueryData<DigestCache>(cacheKey);
    if (existing) {
      setDigest(existing.digest);
      setStreamingText(existing.streamingText);
      setGeneratedAt(new Date(existing.generatedAt));
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.id]);

  const sources = digest?.sources ?? [];
  const chatsCount = new Set(sources.map((s) => s.channelId)).size;

  const title = isBilingual ? 'Conversation summary' : 'Morning digest';
  const subtitle = isBilingual
    ? `Bilingual ${channel?.name ?? 'chat'} summarised in English on this device.`
    : 'A one-tap catch-up across your personal chats — runs entirely on this device.';

  return (
    <section
      className="morning-digest-panel"
      aria-label={title}
      data-testid="morning-digest-panel"
    >
      <header className="morning-digest-panel__header">
        <h2 className="morning-digest-panel__title">{title}</h2>
        <p className="morning-digest-panel__subtitle">{subtitle}</p>
        <button
          type="button"
          className="morning-digest-panel__run"
          data-testid="morning-digest-run"
          onClick={run}
          disabled={isStreaming}
        >
          {isStreaming
            ? 'Summarising…'
            : digest
              ? 'Refresh summary'
              : 'Generate summary'}
        </button>
        {generatedAt && !isStreaming && (
          <span
            className="morning-digest-panel__timestamp"
            data-testid="morning-digest-timestamp"
          >
            Updated {generatedAt.toLocaleTimeString()}
          </span>
        )}
      </header>
      <div className="morning-digest-panel__metrics" data-testid="morning-digest-metrics">
        <Metric
          label={isBilingual ? 'Languages' : 'Chats'}
          value={isBilingual ? '2' : chatsCount.toString()}
        />
        <Metric label="Messages" value={sources.length.toString()} />
        <Metric
          label="Egress"
          value={digest ? `${digest.dataEgressBytes} B` : '—'}
        />
        <Metric
          label="Compute"
          value={digest?.computeLocation === 'on_device' ? 'On-device' : '—'}
        />
      </div>
      {err && (
        <div role="alert" className="morning-digest-panel__error">
          Summary failed: {err}
        </div>
      )}
      {(isStreaming || digest) && (
        <div className="morning-digest-panel__body">
          <DigestCard
            digest={
              digest ?? {
                prompt: '',
                model: 'bonsai-8b',
                sources: [],
                computeLocation: 'on_device',
                dataEgressBytes: 0,
              }
            }
            streamingText={streamingText}
            isStreaming={isStreaming}
          />
          {digest && !isStreaming && (
            <PrivacyStrip
              data={{
                computeLocation: digest.computeLocation,
                modelName: digest.model,
                sources: digest.sources.map((s) => ({
                  kind: 'message' as const,
                  id: s.id,
                  label: `${s.sender}: ${s.excerpt}`,
                })),
                dataEgressBytes: digest.dataEgressBytes,
                confidence: 0.86,
                whySuggested: isBilingual
                  ? `Bilingual conversation summary of ${channel?.name ?? 'this chat'}, written in English on-device.`
                  : 'Catch-up digest summarises the most recent messages from your B2C chats.',
                whyDetails: isBilingual
                  ? [
                      { signal: 'Source spans 2 languages' },
                      { signal: `${digest.sources.length} messages summarised` },
                      { signal: 'Runs on-device only' },
                    ]
                  : [
                      { signal: `${chatsCount} chats summarised` },
                      { signal: `${digest.sources.length} messages cited` },
                      { signal: 'Runs on-device only' },
                    ],
                origin: {
                  kind: 'message',
                  id: digest.sources[0]?.id ?? 'digest',
                  label: isBilingual ? channel?.name ?? 'Bilingual chat' : 'Recent chats',
                },
              }}
            />
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="morning-digest-panel__metric">
      <span className="morning-digest-panel__metric-value">{value}</span>
      <span className="morning-digest-panel__metric-label">{label}</span>
    </div>
  );
}
