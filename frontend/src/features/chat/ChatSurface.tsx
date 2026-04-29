import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchChannelMessages } from '../../api/chatApi';
import { fetchKAppCards } from '../../api/kappsApi';
import {
  fetchAIRoute,
  fetchExtractTasks,
  fetchUnreadSummary,
} from '../../api/aiApi';
import { streamAITask } from '../../api/streamAI';
import type { Channel, User } from '../../types/workspace';
import type { KAppCard } from '../../types/kapps';
import type {
  AIRouteResponse,
  ExtractTasksResponse,
  PrivacyStripData,
  UnreadSummaryResponse,
} from '../../types/ai';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { KAppCardRenderer } from '../kapps/KAppCardRenderer';
import { PrivacyStrip } from '../ai/PrivacyStrip';
import { DigestCard } from '../ai/DigestCard';
import { SmartReplyBar } from '../ai/SmartReplyBar';
import { TaskCreatedPill } from '../ai/TaskCreatedPill';
import { TaskExtractionCard, type TaskItem } from '../ai/TaskExtractionCard';

interface Props {
  channel: Channel | null;
  users: Record<string, User>;
  // currentUserId is used to detect the latest *incoming* message (one
  // not sent by the viewer) so SmartReplyBar can suggest a reply. When
  // omitted the smart-reply bar simply hides itself.
  currentUserId?: string;
}

// privacyDataForCard builds the placeholder PrivacyStripData rendered under
// each AI-generated KApp card. Phase 1 produces these from the policy
// engine + adapter outputs; the values here are realistic mocks that match
// the adapter's reports.
function privacyDataForCard(card: KAppCard): PrivacyStripData {
  const originID =
    card.task?.sourceMessageId ??
    card.task?.sourceThreadId ??
    card.approval?.sourceThreadId ??
    card.event?.sourceMessageId ??
    card.artifact?.sourceRefs?.[0]?.id ??
    card.task?.id ??
    card.approval?.id ??
    card.event?.id ??
    card.artifact?.id ??
    'unknown';
  const originLabel = card.kind === 'task' ? 'Originating message' : 'Originating thread';
  const why =
    card.kind === 'task'
      ? 'Detected an action item with a clear owner and due date.'
      : card.kind === 'approval'
        ? 'Recognised a vendor approval flow and prefilled the template.'
        : card.kind === 'artifact'
          ? 'Drafted from the most recent thread on this topic.'
          : 'Detected an event with a date and a location.';
  return {
    computeLocation: 'on_device',
    modelName: 'gemma-4-e2b',
    sources: [
      {
        kind: card.kind === 'task' || card.kind === 'event' ? 'message' : 'thread',
        id: originID,
        label: originLabel,
      },
    ],
    dataEgressBytes: 0,
    confidence: 0.86,
    missingInfo: [],
    whySuggested: why,
    origin: {
      kind: card.kind === 'task' || card.kind === 'event' ? 'message' : 'thread',
      id: originID,
      label: originLabel,
    },
  };
}

function isAIGenerated(card: KAppCard): boolean {
  return Boolean(
    card.task?.aiGenerated ||
      card.approval?.aiGenerated ||
      card.artifact?.aiGenerated ||
      card.event?.aiGenerated,
  );
}

function cardKey(card: KAppCard): string {
  return (
    card.task?.id ??
    card.approval?.id ??
    card.artifact?.id ??
    card.event?.id ??
    `${card.kind}-unknown`
  );
}

// digestPrivacyData turns a finished UnreadSummaryResponse + AIRouteResponse
// into a PrivacyStripData for the digest card.
function digestPrivacyData(
  digest: UnreadSummaryResponse,
  route: AIRouteResponse | null,
): PrivacyStripData {
  return {
    computeLocation: digest.computeLocation,
    modelName: route?.model ?? digest.model,
    sources: digest.sources.map((s) => ({
      kind: 'message' as const,
      id: s.id,
      label: `${s.sender}: ${s.excerpt}`,
    })),
    dataEgressBytes: digest.dataEgressBytes,
    confidence: 0.84,
    whySuggested:
      route?.reason ??
      'Catch-up digest summarises the most recent messages from your B2C chats.',
    origin: {
      kind: 'message',
      id: digest.sources[0]?.id ?? 'digest',
      label: 'Recent chats',
    },
  };
}

export function ChatSurface({ channel, users, currentUserId }: Props) {
  const enabled = !!channel;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['channel-messages', channel?.id],
    queryFn: () => fetchChannelMessages(channel!.id),
    enabled,
  });

  const cardsQ = useQuery({
    queryKey: ['kapp-cards', channel?.id],
    queryFn: () => fetchKAppCards(channel!.id),
    enabled,
  });

  // AI digest state. The "Catch me up" action triggers the SSE stream and
  // also fires off /unread-summary + /route in parallel so the digest card
  // can show source back-links and a privacy strip once streaming finishes.
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [digest, setDigest] = useState<UnreadSummaryResponse | null>(null);
  const [route, setRoute] = useState<AIRouteResponse | null>(null);
  const [streamErr, setStreamErr] = useState<string | null>(null);

  // Composer text is lifted up so SmartReplyBar's chip clicks can seed it.
  const [composerText, setComposerText] = useState('');
  // Inline task-extraction card. Populated when the user runs the
  // "Extract tasks" action from the launcher; cleared once they accept
  // or discard everything.
  const [extracted, setExtracted] = useState<ExtractTasksResponse | null>(null);
  const [extractErr, setExtractErr] = useState<string | null>(null);

  // Persistent inline pill state — once a user accepts items from the
  // TaskExtractionCard above, we record the count keyed by the
  // originating message id and surface a small pill below the
  // extraction card. The card itself disappears when its tasks list is
  // emptied; the pill stays until the user reloads the chat.
  const [acceptedByMessage, setAcceptedByMessage] = useState<Record<string, number>>({});

  function recordAccepted(sourceMessageId: string | undefined) {
    if (!sourceMessageId) return;
    setAcceptedByMessage((prev) => ({
      ...prev,
      [sourceMessageId]: (prev[sourceMessageId] ?? 0) + 1,
    }));
  }

  // handleAIAction returns true when it actually handled the action so the
  // composer / launcher knows to suppress its placeholder "queued" toast.
  // Actions that fall through (translate / remind / extract / all B2B
  // intents in Phase 1) return false so the launcher's toast still fires.
  function handleAIAction(path: string[]): boolean {
    if (path[0] === 'catch_me_up') {
      setStreamErr(null);
      setStreamingText('');
      setIsStreaming(true);
      setDigest(null);
      setRoute(null);

      // Fetch the digest prompt + sources first (no inference yet), then
      // hand the *same* prompt to the SSE stream so the model runs exactly
      // once. Previously this kicked off the stream with no prompt while
      // /unread-summary ran a second inference pass on its own — with the
      // mock both produced identical text so it looked fine, but with real
      // Ollama you'd see useless empty-prompt output stream in and then
      // jarringly swap to the digest endpoint's text.
      void fetchUnreadSummary()
        .then((d) => {
          setDigest(d);
          streamAITask(
            {
              taskType: 'summarize',
              prompt: d.prompt,
              channelId: channel?.id,
            },
            {
              onChunk: (delta) => setStreamingText((t) => t + delta),
              onDone: () => setIsStreaming(false),
              onError: (err) => {
                setStreamErr(err.message);
                setIsStreaming(false);
              },
            },
          );
        })
        .catch((err: Error) => {
          setStreamErr(err.message);
          setIsStreaming(false);
        });
      void fetchAIRoute({ taskType: 'summarize' }).then(setRoute).catch(() => undefined);
      return true;
    }
    // Phase 3 — B2B Create / Approve paths dispatch a DOM event the
    // ThreadPanel listens for. The ChatSurface itself doesn't own the
    // selected thread, so we forward the action to whichever panel is
    // currently mounted (typically the right-rail ThreadPanel).
    if (path[0] === 'create' && (path[1] === 'prd' || path[1] === 'rfc' || path[1] === 'proposal')) {
      const evt = new CustomEvent('kapps:launcher', {
        detail: { kind: 'draft_artifact', artifactType: path[1].toUpperCase() },
      });
      window.dispatchEvent(evt);
      return true;
    }
    if (path[0] === 'approve' && (path[1] === 'vendor' || path[1] === 'budget' || path[1] === 'access')) {
      const evt = new CustomEvent('kapps:launcher', {
        detail: { kind: 'prefill_approval', templateId: path[1] },
      });
      window.dispatchEvent(evt);
      return true;
    }
    if (path[0] === 'extract_tasks') {
      setExtractErr(null);
      setExtracted(null);
      const lastMessageId = (data ?? []).at(-1)?.id;
      void fetchExtractTasks({
        channelId: channel?.id,
        messageId: lastMessageId,
      })
        .then(setExtracted)
        .catch((err: Error) => setExtractErr(err.message));
      return true;
    }
    return false;
  }

  const lastIncomingMessage = (data ?? [])
    .slice()
    .reverse()
    .find((m) => !currentUserId || m.senderId !== currentUserId);

  if (!channel) {
    return (
      <section className="chat-surface chat-surface--empty">
        <header className="chat-surface__header">
          <h2 className="chat-surface__title">Select a chat</h2>
        </header>
        <div className="chat-surface__messages chat-surface__messages--empty">
          Pick a chat from the sidebar to see messages.
        </div>
      </section>
    );
  }

  const cards = cardsQ.data ?? [];

  return (
    <section className="chat-surface" aria-label={`Chat: ${channel.name}`}>
      <header className="chat-surface__header">
        <h2 className="chat-surface__title">{channel.name}</h2>
        <span className="chat-surface__kind">{channel.kind}</span>
      </header>
      <div className="chat-surface__messages">
        {isLoading && <div role="status">Loading messages…</div>}
        {isError && <div role="alert">Could not load messages.</div>}
        {!isLoading && !isError && (
          <MessageList messages={data ?? []} users={users} emptyLabel="This chat has no messages yet." />
        )}
        {(isStreaming || digest || streamErr) && (
          <div className="chat-surface__digest" data-testid="chat-surface-digest">
            {streamErr && (
              <div role="alert" className="chat-surface__digest-error">
                AI digest failed: {streamErr}
              </div>
            )}
            {(isStreaming || digest) && (
              <DigestCard
                digest={
                  digest ?? {
                    prompt: '',
                    model: 'gemma-4-e2b',
                    sources: [],
                    computeLocation: 'on_device',
                    dataEgressBytes: 0,
                  }
                }
                streamingText={streamingText}
                isStreaming={isStreaming}
              />
            )}
            {digest && !isStreaming && (
              <PrivacyStrip data={digestPrivacyData(digest, route)} />
            )}
          </div>
        )}
        {extractErr && (
          <div role="alert" className="chat-surface__digest-error">
            Task extraction failed: {extractErr}
          </div>
        )}
        {extracted && extracted.tasks.length > 0 && (
          <div className="chat-surface__extracted" data-testid="chat-surface-extracted">
            <TaskExtractionCard
              tasks={extracted.tasks as TaskItem[]}
              sourceMessageId={extracted.sourceMessageId}
              channelId={extracted.channelId}
              model={extracted.model}
              computeLocation={extracted.computeLocation}
              dataEgressBytes={extracted.dataEgressBytes}
              acceptLabel="Add to my list"
              onAccept={() => recordAccepted(extracted.sourceMessageId)}
            />
          </div>
        )}
        {Object.entries(acceptedByMessage).filter(([, n]) => n > 0).length > 0 && (
          <div className="chat-surface__pills" data-testid="chat-surface-task-pills">
            {Object.entries(acceptedByMessage)
              .filter(([, n]) => n > 0)
              .map(([id, count]) => {
                const src = (data ?? []).find((m) => m.id === id);
                const label = src ? src.content.slice(0, 60) : undefined;
                return (
                  <TaskCreatedPill
                    key={id}
                    count={count}
                    label={label}
                    testId={`task-created-pill-${id}`}
                  />
                );
              })}
          </div>
        )}
        {cards.length > 0 && (
          <div className="chat-surface__cards" data-testid="chat-surface-cards">
            {cards.map((card) => (
              <div key={cardKey(card)}>
                <KAppCardRenderer card={card} />
                {isAIGenerated(card) && <PrivacyStrip data={privacyDataForCard(card)} />}
              </div>
            ))}
          </div>
        )}
      </div>
      <Composer
        placeholder={`Message ${channel.name}`}
        onAIAction={handleAIAction}
        value={composerText}
        onChange={setComposerText}
      >
        {channel.context === 'b2c' && lastIncomingMessage && (
          <SmartReplyBar
            channelId={channel.id}
            sourceMessageId={lastIncomingMessage.id}
            onSelect={(text) => setComposerText(text)}
          />
        )}
      </Composer>
    </section>
  );
}
