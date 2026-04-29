import { useState } from 'react';
import { fetchUnreadSummary } from '../../api/aiApi';
import { streamAITask } from '../../api/streamAI';
import type { UnreadSummaryResponse } from '../../types/ai';
import { DigestCard } from './DigestCard';
import { PrivacyStrip } from './PrivacyStrip';

// MorningDigestPanel is the B2C "Morning digest" surface
// (PROPOSAL.md §4.1, PHASES.md Phase 2). It runs the existing
// fetchUnreadSummary + streamAITask flow but presents it as a
// dedicated catch-up page with simple metrics so the user gets a
// one-button "what happened overnight?" answer.
export function MorningDigestPanel() {
  const [digest, setDigest] = useState<UnreadSummaryResponse | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    setDigest(null);
    setStreamingText('');
    setIsStreaming(true);
    void fetchUnreadSummary()
      .then((d) => {
        setDigest(d);
        streamAITask(
          { taskType: 'summarize', prompt: d.prompt },
          {
            onChunk: (delta) => setStreamingText((t) => t + delta),
            onDone: () => {
              setIsStreaming(false);
              setGeneratedAt(new Date());
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

  // Group sources by channelId so the user can see "X chats summarised".
  const chatsCount = digest
    ? new Set(digest.sources.map((s) => s.channelId)).size
    : 0;

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
        <Metric label="Messages" value={(digest?.sources.length ?? 0).toString()} />
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
      {!isStreaming && !digest && !err && (
        <p
          className="morning-digest-panel__empty"
          data-testid="morning-digest-empty"
        >
          Click <em>Generate digest</em> to get a quick on-device summary of recent activity.
        </p>
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
