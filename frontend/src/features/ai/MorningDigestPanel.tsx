import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchUnreadSummary } from '../../api/aiApi';
import { streamAITask } from '../../api/streamAI';
import type { UnreadSummaryResponse } from '../../types/ai';
import { DigestCard } from './DigestCard';
import { PrivacyStrip } from './PrivacyStrip';

// Shared cache key so navigating away and back to the catch-up page
// replays the existing digest + streamed text instead of re-running
// the 20–60 s summarisation.
const DIGEST_CACHE_KEY = ['morning-digest'] as const;

interface DigestCache {
  digest: UnreadSummaryResponse;
  streamingText: string;
  generatedAt: string;
}

// MorningDigestPanel is the B2C "Morning digest" surface
// (PROPOSAL.md §4.1, PHASES.md Phase 2). It auto-runs on mount and
// caches the result in react-query so subsequent visits replay the
// same digest without hitting the model again.
export function MorningDigestPanel() {
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<DigestCache>(DIGEST_CACHE_KEY) ?? null;

  const [digest, setDigest] = useState<UnreadSummaryResponse | null>(
    cached?.digest ?? null,
  );
  const [streamingText, setStreamingText] = useState(cached?.streamingText ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    cached ? new Date(cached.generatedAt) : null,
  );
  const [err, setErr] = useState<string | null>(null);
  const startedRef = useRef(false);

  function run() {
    setErr(null);
    setDigest(null);
    setStreamingText('');
    setIsStreaming(true);
    let collected = '';
    let digestSnapshot: UnreadSummaryResponse | null = null;
    void fetchUnreadSummary()
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
                queryClient.setQueryData<DigestCache>(DIGEST_CACHE_KEY, {
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

  // Auto-run on first mount if no cached digest exists yet. The ref
  // guards against React 18 StrictMode's double-effect in development.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (cached) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group sources by channelId so the user can see "X chats summarised".
  const sources = digest?.sources ?? [];
  const chatsCount = new Set(sources.map((s) => s.channelId)).size;

  return (
    <section
      className="morning-digest-panel"
      aria-label="Morning digest"
      data-testid="morning-digest-panel"
    >
      <header className="morning-digest-panel__header">
        <h2 className="morning-digest-panel__title">Morning digest</h2>
        <p className="morning-digest-panel__subtitle">
          A one-tap catch-up across your personal chats — runs entirely on this device.
        </p>
        <button
          type="button"
          className="morning-digest-panel__run"
          data-testid="morning-digest-run"
          onClick={run}
          disabled={isStreaming}
        >
          {isStreaming ? 'Summarising…' : digest ? 'Refresh digest' : 'Generate digest'}
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
        <Metric label="Chats" value={chatsCount.toString()} />
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
          Digest failed: {err}
        </div>
      )}
      {(isStreaming || digest) && (
        <div className="morning-digest-panel__body">
          <DigestCard
            digest={
              digest ?? {
                prompt: '',
                model: 'ternary-bonsai-8b',
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
                whySuggested:
                  'Catch-up digest summarises the most recent messages from your B2C chats.',
                whyDetails: [
                  { signal: `${chatsCount} chats summarised` },
                  {
                    signal: `${digest.sources.length} messages cited`,
                  },
                  { signal: 'Runs on-device only' },
                ],
                origin: {
                  kind: 'message',
                  id: digest.sources[0]?.id ?? 'digest',
                  label: 'Recent chats',
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
