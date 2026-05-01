import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { extractKAppTasks } from '../../api/kappsApi';
import { fetchChannelMessages } from '../../api/chatApi';
import type { Channel } from '../../types/workspace';
import type { KAppsExtractTasksResponse } from '../../types/ai';
import { TaskExtractionCard, type TaskItem } from './TaskExtractionCard';

// ThreadTasksPanel powers the B2B right-rail "Tasks" tab introduced
// in Phase 9. It runs `ai:kapps-extract-tasks` against the active
// channel's primary thread (root + replies), surfaces the extracted
// tasks with owner / due / source provenance, and lets the operator
// Accept / Discard each one. Per-channel output is cached via
// react-query so a tab switch does not re-run inference.

interface Props {
  channel?: Channel | null;
}

interface TasksCache {
  response: KAppsExtractTasksResponse;
  generatedAt: string;
}

function cacheKeyFor(channelId: string | null | undefined) {
  return ['b2b-thread-tasks', channelId ?? '_none_'] as const;
}

export function ThreadTasksPanel({ channel }: Props) {
  const queryClient = useQueryClient();
  const channelId = channel?.id ?? null;
  const cacheKey = cacheKeyFor(channelId);
  const cached = queryClient.getQueryData<TasksCache>(cacheKey) ?? null;

  const [response, setResponse] = useState<KAppsExtractTasksResponse | null>(
    cached?.response ?? null,
  );
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    cached ? new Date(cached.generatedAt) : null,
  );
  const startedRef = useRef<string | null>(null);
  const runIdRef = useRef(0);

  function run() {
    if (!channelId) return;
    runIdRef.current += 1;
    const myRunId = runIdRef.current;
    setRunning(true);
    setErr(null);
    void (async () => {
      try {
        const messages = await fetchChannelMessages(channelId, {
          includeReplies: true,
        });
        if (runIdRef.current !== myRunId) return;
        if (messages.length === 0) {
          throw new Error('channel has no messages to extract tasks from');
        }
        const root =
          messages.find((m) => !m.threadId || m.threadId === m.id) ?? messages[0];
        const threadId = root.threadId ?? root.id;
        const data = await extractKAppTasks({ threadId });
        if (runIdRef.current !== myRunId) return;
        setResponse(data);
        const now = new Date();
        setGeneratedAt(now);
        queryClient.setQueryData<TasksCache>(cacheKey, {
          response: data,
          generatedAt: now.toISOString(),
        });
      } catch (e) {
        if (runIdRef.current !== myRunId) return;
        setErr((e as Error).message);
      } finally {
        if (runIdRef.current === myRunId) {
          setRunning(false);
        }
      }
    })();
  }

  useEffect(() => {
    if (!channelId) {
      startedRef.current = null;
      return;
    }
    const key = cacheKey.join(':');
    if (startedRef.current === key) return;
    startedRef.current = key;
    const existing = queryClient.getQueryData<TasksCache>(cacheKey);
    if (existing) {
      runIdRef.current += 1;
      setResponse(existing.response);
      setGeneratedAt(new Date(existing.generatedAt));
      setRunning(false);
      setErr(null);
      return;
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (!channelId) {
    return (
      <section className="thread-tasks-panel" data-testid="thread-tasks-panel">
        <header className="thread-tasks-panel__header">
          <h3 className="thread-tasks-panel__title">Tasks</h3>
        </header>
        <p className="thread-tasks-panel__empty">
          Select a channel to extract tasks from its primary thread.
        </p>
      </section>
    );
  }

  const items: TaskItem[] = response?.tasks ?? [];

  return (
    <section
      className="thread-tasks-panel"
      data-testid="thread-tasks-panel"
      aria-label="B2B thread tasks"
    >
      <header className="thread-tasks-panel__header">
        <h3 className="thread-tasks-panel__title">Tasks</h3>
        <p className="thread-tasks-panel__subtitle">
          Action items extracted from <strong>#{channel?.name ?? 'this channel'}</strong>
          {' '}on-device by Bonsai-1.7B.
        </p>
        <button
          type="button"
          className="thread-tasks-panel__run"
          data-testid="thread-tasks-panel-run"
          onClick={run}
          disabled={running}
        >
          {running
            ? 'Extracting…'
            : response
              ? 'Re-extract tasks'
              : 'Extract tasks'}
        </button>
        {generatedAt && !running && (
          <span
            className="thread-tasks-panel__timestamp"
            data-testid="thread-tasks-panel-timestamp"
          >
            Updated {generatedAt.toLocaleTimeString()}
          </span>
        )}
      </header>
      {err && (
        <p
          className="thread-tasks-panel__error"
          role="alert"
          data-testid="thread-tasks-panel-error"
        >
          Extraction failed: {err}
        </p>
      )}
      {!err && response && items.length === 0 && (
        <p
          className="thread-tasks-panel__empty"
          data-testid="thread-tasks-panel-empty"
        >
          The model didn't surface any action items for this thread.
        </p>
      )}
      {!err && response && items.length > 0 && (
        <TaskExtractionCard
          title={`${items.length} ${items.length === 1 ? 'task' : 'tasks'} extracted`}
          tasks={items}
          sourceMessageId={items[0]?.sourceMessageId}
          channelId={response.channelId}
          model={response.model}
          computeLocation={response.computeLocation}
          dataEgressBytes={response.dataEgressBytes}
          acceptLabel="Add to plan"
        />
      )}
      {!err && !response && running && (
        <p
          className="thread-tasks-panel__placeholder"
          data-testid="thread-tasks-panel-running"
        >
          Extracting action items from the thread…
        </p>
      )}
    </section>
  );
}
