import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchThreadSummary } from '../../api/aiApi';
import { fetchChannelMessages } from '../../api/chatApi';
import { streamAITask } from '../../api/streamAI';
import type { Channel } from '../../types/workspace';
import type { ThreadSummaryResponse } from '../../types/ai';
import { ThreadSummaryCard } from './ThreadSummaryCard';

// ThreadSummaryPanel powers the B2B right-rail "Summary" tab
// introduced in Phase 9. It is the B2B counterpart to the B2C
// MorningDigestPanel: the moment a channel is selected the panel
// resolves that channel's primary thread, fetches its messages,
// runs `ai:summarize-thread` against the on-device LLM, and streams
// the response into the existing ThreadSummaryCard. Per-channel
// output is cached in react-query so flipping between Tasks /
// Knowledge / AI Employees and back replays the cached summary
// instead of re-running inference on every tab switch.
//
// The "primary thread" of a channel is the threadId of the first
// top-level message returned by `/api/chats/{id}/messages` with
// `includeReplies=true`. Almost every seeded B2B channel has a
// single dominant root thread (vendor-management, engineering,
// product-launch), and Phase 9 removed the seeded approval/artifact
// cards that previously anchored those threads, so this panel is
// the surface that demonstrates real Bonsai-1.7B summarisation
// against the conversation rather than against a hand-crafted
// fixture.

interface Props {
  channel?: Channel | null;
}

interface SummaryCache {
  summary: ThreadSummaryResponse;
  streamingText: string;
  generatedAt: string;
}

function cacheKeyFor(channelId: string | null | undefined) {
  return ['b2b-thread-summary', channelId ?? '_none_'] as const;
}

export function ThreadSummaryPanel({ channel }: Props) {
  const queryClient = useQueryClient();
  const channelId = channel?.id ?? null;
  const cacheKey = cacheKeyFor(channelId);
  const cached = queryClient.getQueryData<SummaryCache>(cacheKey) ?? null;

  const [summary, setSummary] = useState<ThreadSummaryResponse | null>(
    cached?.summary ?? null,
  );
  const [streamingText, setStreamingText] = useState(cached?.streamingText ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    cached ? new Date(cached.generatedAt) : null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [resolvedThreadId, setResolvedThreadId] = useState<string | null>(
    cached?.summary.threadId ?? null,
  );

  // The panel may auto-run on mount and again on channel change.
  // Track every run so any callback firing from a stale run becomes
  // a no-op once the user has switched channels (or hit "Refresh").
  const startedRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const inFlightRef = useRef<{
    id: number;
    controller: AbortController | null;
  } | null>(null);

  function run() {
    if (!channelId) return;
    if (inFlightRef.current?.controller) {
      try {
        inFlightRef.current.controller.abort();
      } catch {
        // ignore — controller may already be settled
      }
    }
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    inFlightRef.current = { id: myRunId, controller: null };

    setErr(null);
    setSummary(null);
    setStreamingText('');
    setIsStreaming(true);
    let collected = '';
    let summarySnapshot: ThreadSummaryResponse | null = null;

    void fetchChannelMessages(channelId, { includeReplies: true })
      .then(async (messages) => {
        if (runIdRef.current !== myRunId) return;
        if (messages.length === 0) {
          throw new Error('channel has no messages to summarise');
        }
        // The primary thread is the first top-level message — its
        // threadId equals its own id by convention. We forward the
        // entire thread (root + replies) to the summariser.
        const root = messages.find((m) => !m.threadId || m.threadId === m.id) ??
          messages[0];
        const threadId = root.threadId ?? root.id;
        setResolvedThreadId(threadId);
        const data = await fetchThreadSummary({ threadId });
        if (runIdRef.current !== myRunId) return;
        summarySnapshot = data;
        setSummary(data);

        const controller = streamAITask(
          {
            taskType: 'summarize',
            prompt: data.prompt,
            channelId: data.channelId,
          },
          {
            onChunk: (delta) => {
              if (runIdRef.current !== myRunId) return;
              collected += delta;
              setStreamingText((t) => t + delta);
            },
            onDone: () => {
              if (runIdRef.current !== myRunId) return;
              setIsStreaming(false);
              const now = new Date();
              setGeneratedAt(now);
              if (summarySnapshot) {
                queryClient.setQueryData<SummaryCache>(cacheKey, {
                  summary: summarySnapshot,
                  streamingText: collected,
                  generatedAt: now.toISOString(),
                });
              }
              if (inFlightRef.current?.id === myRunId) inFlightRef.current = null;
            },
            onError: (e) => {
              if (runIdRef.current !== myRunId) return;
              setErr(e.message);
              setIsStreaming(false);
              if (inFlightRef.current?.id === myRunId) inFlightRef.current = null;
            },
          },
        );
        if (inFlightRef.current?.id === myRunId) {
          inFlightRef.current.controller = controller;
        } else {
          // A newer run started between the fetcher resolving and
          // streamAITask returning — abort this stream immediately
          // so it does not leak.
          try {
            controller.abort();
          } catch {
            // ignore
          }
        }
      })
      .catch((e: Error) => {
        if (runIdRef.current !== myRunId) return;
        setErr(e.message);
        setIsStreaming(false);
        if (inFlightRef.current?.id === myRunId) inFlightRef.current = null;
      });
  }

  // Auto-run on first mount (and on channel change) when nothing
  // is cached for the active channel. A cached run is replayed
  // verbatim — no new inference.
  useEffect(() => {
    if (!channelId) {
      startedRef.current = null;
      return;
    }
    const key = cacheKey.join(':');
    if (startedRef.current === key) return;
    startedRef.current = key;
    const existing = queryClient.getQueryData<SummaryCache>(cacheKey);
    if (existing) {
      runIdRef.current += 1;
      if (inFlightRef.current?.controller) {
        try {
          inFlightRef.current.controller.abort();
        } catch {
          // ignore
        }
      }
      inFlightRef.current = null;
      setSummary(existing.summary);
      setStreamingText(existing.streamingText);
      setGeneratedAt(new Date(existing.generatedAt));
      setResolvedThreadId(existing.summary.threadId);
      setIsStreaming(false);
      setErr(null);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Abort any in-flight stream on unmount so its IPC chunks don't
  // outlive the component.
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      if (inFlightRef.current?.controller) {
        try {
          inFlightRef.current.controller.abort();
        } catch {
          // ignore
        }
      }
      inFlightRef.current = null;
    };
  }, []);

  if (!channelId) {
    return (
      <section
        className="thread-summary-panel"
        data-testid="thread-summary-panel"
      >
        <header className="thread-summary-panel__header">
          <h2 className="thread-summary-panel__title">Thread summary</h2>
        </header>
        <p className="thread-summary-panel__empty">
          Select a channel to summarise its primary thread.
        </p>
      </section>
    );
  }

  return (
    <section
      className="thread-summary-panel"
      data-testid="thread-summary-panel"
      aria-label="B2B thread summary"
    >
      <header className="thread-summary-panel__header">
        <h2 className="thread-summary-panel__title">Thread summary</h2>
        <p className="thread-summary-panel__subtitle">
          On-device summary of <strong>#{channel?.name ?? 'this channel'}</strong>
          's primary thread, generated by Bonsai-1.7B.
        </p>
        <button
          type="button"
          className="thread-summary-panel__run"
          data-testid="thread-summary-panel-run"
          onClick={run}
          disabled={isStreaming}
        >
          {isStreaming
            ? 'Summarising…'
            : summary
              ? 'Refresh summary'
              : 'Generate summary'}
        </button>
        {generatedAt && !isStreaming && (
          <span
            className="thread-summary-panel__timestamp"
            data-testid="thread-summary-panel-timestamp"
          >
            Updated {generatedAt.toLocaleTimeString()}
          </span>
        )}
      </header>
      {err && (
        <p
          className="thread-summary-panel__error"
          role="alert"
          data-testid="thread-summary-panel-error"
        >
          Summary failed: {err}
        </p>
      )}
      {summary ? (
        <ThreadSummaryCard
          summary={summary}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      ) : (
        !err && (
          <p className="thread-summary-panel__placeholder">
            {resolvedThreadId
              ? 'Summarising…'
              : 'Loading thread…'}
          </p>
        )
      )}
    </section>
  );
}
