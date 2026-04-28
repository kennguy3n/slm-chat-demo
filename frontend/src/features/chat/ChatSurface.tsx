import { useQuery } from '@tanstack/react-query';
import { fetchChannelMessages } from '../../api/chatApi';
import type { Channel, User } from '../../types/workspace';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

interface Props {
  channel: Channel | null;
  users: Record<string, User>;
}

export function ChatSurface({ channel, users }: Props) {
  const enabled = !!channel;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['channel-messages', channel?.id],
    queryFn: () => fetchChannelMessages(channel!.id),
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
      </div>
      <Composer placeholder={`Message ${channel.name}`} disabled />
    </section>
  );
}
