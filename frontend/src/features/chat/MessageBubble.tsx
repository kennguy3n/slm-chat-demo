import type { Message } from '../../types/chat';
import type { User } from '../../types/workspace';

interface Props {
  message: Message;
  sender?: User;
}

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({ message, sender }: Props) {
  const color = sender?.avatarColor ?? '#94a3b8';
  return (
    <div className="msg-bubble">
      <div className="msg-bubble__avatar" style={{ background: color }} aria-hidden>
        {initials(sender?.displayName)}
      </div>
      <div className="msg-bubble__body">
        <div className="msg-bubble__head">
          <span className="msg-bubble__name">{sender?.displayName ?? message.senderId}</span>
          <span className="msg-bubble__time">{formatTime(message.createdAt)}</span>
        </div>
        <div className="msg-bubble__content">{message.content}</div>
      </div>
    </div>
  );
}
