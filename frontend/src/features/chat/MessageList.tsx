import type { Message } from '../../types/chat';
import type { User } from '../../types/workspace';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  users: Record<string, User>;
  emptyLabel?: string;
  preferredLanguage?: string;
  partnerLanguage?: string;
}

export function MessageList({
  messages,
  users,
  emptyLabel = 'No messages yet.',
  preferredLanguage,
  partnerLanguage,
}: Props) {
  if (messages.length === 0) {
    return (
      <div className="msg-list msg-list--empty" role="status">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="msg-list" role="log" aria-live="polite">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          sender={users[m.senderId]}
          preferredLanguage={preferredLanguage}
          partnerLanguage={partnerLanguage}
        />
      ))}
    </div>
  );
}
