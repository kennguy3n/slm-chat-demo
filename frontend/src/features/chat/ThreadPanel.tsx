import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChannelMessages, fetchThreadMessages } from '../../api/chatApi';
import { fetchThreadSummary } from '../../api/aiApi';
import {
  draftArtifact,
  extractKAppTasks,
  fetchLinkedObjects,
  prefillApproval,
} from '../../api/kappsApi';
import { KAppCardRenderer } from '../kapps/KAppCardRenderer';
import { streamAITask } from '../../api/streamAI';
import type { Channel } from '../../types/workspace';
import type {
  ArtifactKind,
  ApprovalTemplate,
  DraftArtifactResponse,
  KAppsExtractTasksResponse,
  PrefillApprovalResponse,
  ThreadSummaryResponse,
} from '../../types/ai';
import { ApprovalPrefillCard } from '../ai/ApprovalPrefillCard';
import { ArtifactDraftCard } from '../ai/ArtifactDraftCard';
import { ThreadSummaryCard } from '../ai/ThreadSummaryCard';
import { TaskExtractionCard, type TaskItem } from '../ai/TaskExtractionCard';

interface Props {
  channel: Channel | null;
}

// ThreadPanel renders the B2B right-rail thread view: a list of threads
// in the current channel, plus the ThreadSummaryCard and B2B
// TaskExtractionCard for whichever thread is selected. The two AI
// surfaces map to PROPOSAL.md §3.3 ("Analyze → Thread summary") and
// §5.4 ("Plan → Extract tasks").
export function ThreadPanel({ channel }: Props) {
  const enabled = !!channel;
  const messagesQ = useQuery({
    queryKey: ['channel-messages', channel?.id],
    queryFn: () => fetchChannelMessages(channel!.id),
    enabled,
  });

  // Group messages by threadId to surface real threads only. Phase 0
  // seeds two B2B threads (vendor-management + engineering); each has a
  // root message whose own threadId equals its id.
  const threads = useMemo(() => {
    const seen = new Map<string, { id: string; title: string }>();
    for (const m of messagesQ.data ?? []) {
      if (!m.threadId) continue;
      if (seen.has(m.threadId)) continue;
      // Use the root message's content as the thread title; replies come
      // later in the channel listing so the first one we see is usually
      // the root.
      seen.set(m.threadId, { id: m.threadId, title: m.content.slice(0, 60) });
    }
    return Array.from(seen.values());
  }, [messagesQ.data]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Auto-select the first thread once messages load.
  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
    if (
      selectedThreadId &&
      threads.length > 0 &&
      !threads.some((t) => t.id === selectedThreadId)
    ) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId]);

  const threadMsgsQ = useQuery({
    queryKey: ['thread-messages', selectedThreadId],
    queryFn: () => fetchThreadMessages(selectedThreadId!),
    enabled: !!selectedThreadId,
  });

  // Phase 3 — linked KApp cards (tasks, approvals, artifacts) for the
  // selected thread. Renders below the thread actions in compact mode.
  const linkedObjectsQ = useQuery({
    queryKey: ['linked-objects', selectedThreadId],
    queryFn: () => fetchLinkedObjects(selectedThreadId!),
    enabled: !!selectedThreadId,
  });

  const [summary, setSummary] = useState<ThreadSummaryResponse | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);

  const [extracted, setExtracted] = useState<KAppsExtractTasksResponse | null>(null);
  const [extractErr, setExtractErr] = useState<string | null>(null);

  const [prefill, setPrefill] = useState<PrefillApprovalResponse | null>(null);
  const [prefillErr, setPrefillErr] = useState<string | null>(null);

  const [artifact, setArtifact] = useState<DraftArtifactResponse | null>(null);
  const [artifactStreamingText, setArtifactStreamingText] = useState('');
  const [isArtifactStreaming, setIsArtifactStreaming] = useState(false);
  const [artifactErr, setArtifactErr] = useState<string | null>(null);

  function summarizeThread() {
    if (!selectedThreadId) return;
    setSummaryErr(null);
    setSummary(null);
    setStreamingText('');
    setIsStreaming(true);
    void fetchThreadSummary({ threadId: selectedThreadId })
      .then((d) => {
        setSummary(d);
        streamAITask(
          {
            taskType: 'summarize',
            prompt: d.prompt,
            channelId: d.channelId,
          },
          {
            onChunk: (delta) => setStreamingText((t) => t + delta),
            onDone: () => setIsStreaming(false),
            onError: (err) => {
              setSummaryErr(err.message);
              setIsStreaming(false);
            },
          },
        );
      })
      .catch((err: Error) => {
        setSummaryErr(err.message);
        setIsStreaming(false);
      });
  }

  function extractTasks() {
    if (!selectedThreadId) return;
    setExtractErr(null);
    setExtracted(null);
    void extractKAppTasks({ threadId: selectedThreadId })
      .then(setExtracted)
      .catch((err: Error) => setExtractErr(err.message));
  }

  function runPrefillApproval(templateId: ApprovalTemplate = 'vendor') {
    if (!selectedThreadId) return;
    setPrefillErr(null);
    setPrefill(null);
    void prefillApproval({ threadId: selectedThreadId, templateId })
      .then(setPrefill)
      .catch((err: Error) => setPrefillErr(err.message));
  }

  function runDraftArtifact(artifactType: ArtifactKind = 'PRD') {
    if (!selectedThreadId) return;
    setArtifactErr(null);
    setArtifact(null);
    setArtifactStreamingText('');
    setIsArtifactStreaming(true);
    void draftArtifact({ threadId: selectedThreadId, artifactType })
      .then((d) => {
        setArtifact(d);
        streamAITask(
          { taskType: 'draft_artifact', prompt: d.prompt, channelId: d.channelId },
          {
            onChunk: (delta) => setArtifactStreamingText((t) => t + delta),
            onDone: () => setIsArtifactStreaming(false),
            onError: (err) => {
              setArtifactErr(err.message);
              setIsArtifactStreaming(false);
            },
          },
        );
      })
      .catch((err: Error) => {
        setArtifactErr(err.message);
        setIsArtifactStreaming(false);
      });
  }

  if (!channel) {
    return (
      <div className="thread-panel thread-panel--empty">
        <p>Select a channel to view threads.</p>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="thread-panel thread-panel--empty">
        <p>No threads in #{channel.name} yet.</p>
      </div>
    );
  }

  return (
    <div className="thread-panel" data-testid="thread-panel">
      <header className="thread-panel__header">
        <h3>Threads</h3>
      </header>
      <ul className="thread-panel__list">
        {threads.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              className={`thread-panel__thread${
                t.id === selectedThreadId ? ' thread-panel__thread--active' : ''
              }`}
              data-testid={`thread-panel-item-${t.id}`}
              onClick={() => setSelectedThreadId(t.id)}
            >
              {t.title}
            </button>
          </li>
        ))}
      </ul>
      {selectedThreadId && (
        <div className="thread-panel__actions" role="group" aria-label="Thread actions">
          <button
            type="button"
            className="thread-panel__action"
            data-testid="thread-summarize"
            onClick={summarizeThread}
          >
            Summarize thread
          </button>
          <button
            type="button"
            className="thread-panel__action"
            data-testid="thread-extract-tasks"
            onClick={extractTasks}
          >
            Extract tasks
          </button>
          <button
            type="button"
            className="thread-panel__action"
            data-testid="thread-prefill-approval"
            onClick={() => runPrefillApproval('vendor')}
          >
            Prefill approval
          </button>
          <button
            type="button"
            className="thread-panel__action"
            data-testid="thread-draft-artifact"
            onClick={() => runDraftArtifact('PRD')}
          >
            Draft PRD
          </button>
        </div>
      )}
      {summaryErr && (
        <div role="alert" className="thread-panel__error">
          Summary failed: {summaryErr}
        </div>
      )}
      {summary && (
        <ThreadSummaryCard
          summary={summary}
          streamingText={streamingText}
          isStreaming={isStreaming}
        />
      )}
      {extractErr && (
        <div role="alert" className="thread-panel__error">
          Task extraction failed: {extractErr}
        </div>
      )}
      {extracted && extracted.tasks.length > 0 && (
        <TaskExtractionCard
          tasks={extracted.tasks as TaskItem[]}
          channelId={extracted.channelId}
          model={extracted.model}
          computeLocation={extracted.computeLocation}
          dataEgressBytes={extracted.dataEgressBytes}
          acceptLabel="Add to plan"
        />
      )}
      {prefillErr && (
        <div role="alert" className="thread-panel__error">
          Approval prefill failed: {prefillErr}
        </div>
      )}
      {prefill && (
        <ApprovalPrefillCard
          prefill={prefill}
          sourceExcerpts={Object.fromEntries(
            (threadMsgsQ.data ?? []).map((m) => [
              m.id,
              `${m.senderId}: ${m.content.slice(0, 80)}`,
            ]),
          )}
        />
      )}
      {artifactErr && (
        <div role="alert" className="thread-panel__error">
          Draft failed: {artifactErr}
        </div>
      )}
      {artifact && (
        <ArtifactDraftCard
          draft={artifact}
          streamingText={artifactStreamingText}
          isStreaming={isArtifactStreaming}
        />
      )}
      {selectedThreadId && (
        <details
          className="thread-panel__linked"
          data-testid="thread-panel-linked"
          open={(linkedObjectsQ.data?.length ?? 0) > 0}
        >
          <summary>
            Linked objects ({linkedObjectsQ.data?.length ?? 0})
          </summary>
          {linkedObjectsQ.isLoading && <p>Loading…</p>}
          {linkedObjectsQ.error && (
            <p role="alert" className="thread-panel__error">
              Linked objects failed: {(linkedObjectsQ.error as Error).message}
            </p>
          )}
          {linkedObjectsQ.data && linkedObjectsQ.data.length === 0 && (
            <p className="thread-panel__empty">No linked KApp objects yet.</p>
          )}
          {linkedObjectsQ.data && linkedObjectsQ.data.length > 0 && (
            <ul className="thread-panel__linked-list">
              {linkedObjectsQ.data.map((card, idx) => (
                <li key={idx} data-testid={`thread-panel-linked-${idx}`}>
                  <KAppCardRenderer card={card} mode="compact" />
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {threadMsgsQ.data && threadMsgsQ.data.length > 0 && (
        <details className="thread-panel__messages">
          <summary>{threadMsgsQ.data.length} messages</summary>
          <ul>
            {threadMsgsQ.data.map((m) => (
              <li key={m.id} id={`message-${m.id}`}>
                <strong>{m.senderId}:</strong> {m.content}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
