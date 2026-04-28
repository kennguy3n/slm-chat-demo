import { useQuery } from '@tanstack/react-query';
import { fetchChannelMessages } from '../../api/chatApi';
import { fetchKAppCards } from '../../api/kappsApi';
import type { Channel, User } from '../../types/workspace';
import type { KAppCard } from '../../types/kapps';
import type { PrivacyStripData } from '../../types/ai';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { KAppCardRenderer } from '../kapps/KAppCardRenderer';
import { PrivacyStrip } from '../ai/PrivacyStrip';

interface Props {
  channel: Channel | null;
  users: Record<string, User>;
}

// Phase 0 placeholder privacy data. Each AI-generated card renders an
// identical strip showing on-device E2B + zero egress; Phase 1 produces
// these from the policy engine and the inference adapter.
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

export function ChatSurface({ channel, users }: Props) {
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
      <Composer placeholder={`Message ${channel.name}`} />
    </section>
  );
}
