import type { Message } from '../../types/chat';
import type { User } from '../../types/workspace';
import type { AIEmployee } from '../../types/aiEmployee';
import { TranslationCaption } from '../ai/TranslationCaption';
import { AIEmployeeModeBadge } from '../ai/AIEmployeeModeBadge';
import { computeTranslationTarget } from './translate-utils';

interface Props {
  message: Message;
  sender?: User;
  // The user's preferred language for inline translation. Defaults to "en".
  preferredLanguage?: string;
  // The "other side" language in a bilingual channel. When set, the
  // bubble also auto-translates messages that are in the user's
  // preferred language *into* this language, so both directions of
  // the conversation show a paired translation card. Used by DM
  // channels where the partner speaks a different language.
  partnerLanguage?: string;
  // When the message was produced by an AI Employee, the parent
  // passes the full employee record so the bubble can render the
  // Phase 4 mode badge (⚡ Auto / 👤 Inline) inline with the content.
  aiEmployee?: AIEmployee;
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
  partnerLanguage,
  aiEmployee,
}: Props) {
  const color = sender?.avatarColor ?? '#94a3b8';
  const translateInto = computeTranslationTarget(
    message.content,
    preferredLanguage,
    partnerLanguage,
  );
  const needsTranslation = translateInto !== null;

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
        {needsTranslation && translateInto ? (
          <TranslationCaption
            messageId={message.id}
            channelId={message.channelId}
            targetLanguage={translateInto}
            autoFetch
            showPrivacyStrip={false}
            originalFallback={message.content}
          />
        ) : (
          <div className="msg-bubble__content">{message.content}</div>
        )}
        {message.aiEmployeeId && aiEmployee && aiEmployee.id === message.aiEmployeeId && (
          <div className="msg-bubble__ai-mode" data-testid={`message-ai-mode-${message.id}`}>
            <AIEmployeeModeBadge
              mode={aiEmployee.mode}
              employeeName={aiEmployee.name}
            />
          </div>
        )}
      </div>
    </div>
  );
}
