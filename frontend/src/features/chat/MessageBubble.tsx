import { useState } from 'react';
import type { Message } from '../../types/chat';
import type { User } from '../../types/workspace';
import { TranslationCaption } from '../ai/TranslationCaption';

interface Props {
  message: Message;
  sender?: User;
  // The user's preferred language for inline translation. Defaults to "en".
  preferredLanguage?: string;
  // showTranslate toggles the per-bubble Translate affordance. Defaults
  // to true; tests can set it to false to keep the bubble dense.
  showTranslate?: boolean;
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

export function MessageBubble({
  message,
  sender,
  preferredLanguage = 'en',
  showTranslate = true,
}: Props) {
  const color = sender?.avatarColor ?? '#94a3b8';
  const [showTranslation, setShowTranslation] = useState(false);
  return (
    <div className="msg-bubble" id={`message-${message.id}`}>
      <div className="msg-bubble__avatar" style={{ background: color }} aria-hidden>
        {initials(sender?.displayName)}
      </div>
      <div className="msg-bubble__body">
        <div className="msg-bubble__head">
          <span className="msg-bubble__name">{sender?.displayName ?? message.senderId}</span>
          <span className="msg-bubble__time">{formatTime(message.createdAt)}</span>
        </div>
        <div className="msg-bubble__content">{message.content}</div>
        {showTranslate && !showTranslation && (
          <button
            type="button"
            className="msg-bubble__translate"
            data-testid={`message-translate-${message.id}`}
            onClick={() => setShowTranslation(true)}
          >
            Translate
          </button>
        )}
        {showTranslation && (
          <TranslationCaption
            messageId={message.id}
            channelId={message.channelId}
            targetLanguage={preferredLanguage}
            autoFetch
            showPrivacyStrip={false}
          />
        )}
      </div>
    </div>
  );
}
