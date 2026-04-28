import { useState, type FormEvent, type ReactNode } from 'react';
import { ActionLauncher } from '../ai/ActionLauncher';
import { GuardrailRewriteCard } from '../ai/GuardrailRewriteCard';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { runGuardrailCheck } from '../../api/aiApi';
import { getElectronAI } from '../../api/electronBridge';
import type { GuardrailSkillResult } from '../../types/electron';

interface Props {
  placeholder?: string;
  disabled?: boolean;
  onSend?: (text: string) => void;
  // onAIAction may return true to indicate the caller handled the action,
  // suppressing the launcher's placeholder toast. Returning false /
  // undefined leaves the toast in place so unwired actions still give the
  // user feedback.
  onAIAction?: (path: string[]) => boolean | void;
  // children render above the composer (used by ChatSurface to slot in
  // the SmartReplyBar so suggestion chips appear right above the input).
  children?: ReactNode;
  // value/onChange support a controlled input; when present, lets a
  // sibling component (SmartReplyBar) seed the composer's text by
  // calling onChange directly. Falls back to internal state when omitted.
  value?: string;
  onChange?: (text: string) => void;
  channelId?: string;
  // Tests inject a stub so they don't need a live preload bridge.
  guardrailCheck?: (req: { text: string; channelId?: string }) => Promise<GuardrailSkillResult>;
}

// Composer is the chat input row at the bottom of MainChat. It renders the
// AI action launcher (PROPOSAL.md 4.2 / ARCHITECTURE.md module #4) inline
// with the text input. Phase 0 ships a local-only composer: submitting
// clears the input and calls onSend, but no message is yet persisted on the
// backend (POST /api/chats/:id/messages lands in Phase 1).
export function Composer({
  placeholder = 'Message…',
  disabled,
  onSend,
  onAIAction,
  children,
  value: valueProp,
  onChange,
  channelId,
  guardrailCheck = runGuardrailCheck,
}: Props) {
  const [internal, setInternal] = useState('');
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : internal;
  const setValue = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };
  const context = useWorkspaceStore((s) => s.context);

  const [guardrail, setGuardrail] = useState<{
    text: string;
    result: GuardrailSkillResult;
  } | null>(null);
  const [reviewing, setReviewing] = useState(false);

  function clearGuardrail() {
    setGuardrail(null);
  }

  function send(text: string) {
    onSend?.(text);
    setValue('');
    clearGuardrail();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    // Skip guardrail when the bridge is unavailable (web demo) — the
    // skill needs the on-device router.
    if (!getElectronAI()) {
      send(trimmed);
      return;
    }
    setReviewing(true);
    guardrailCheck({ text: trimmed, channelId })
      .then((result) => {
        setReviewing(false);
        if (result.status !== 'ok') {
          // Refusal: send as-is, the user already typed it.
          send(trimmed);
          return;
        }
        if (result.result.safe) {
          send(trimmed);
          return;
        }
        setGuardrail({ text: trimmed, result });
      })
      .catch(() => {
        setReviewing(false);
        send(trimmed);
      });
  }

  return (
    <div className="composer-wrap">
      {guardrail && guardrail.result.status === 'ok' && (
        <GuardrailRewriteCard
          original={guardrail.text}
          result={guardrail.result.result}
          privacy={guardrail.result.privacy}
          onAccept={(rewrite) => send(rewrite)}
          onKeep={() => send(guardrail.text)}
          onEdit={() => {
            setValue(guardrail.text);
            clearGuardrail();
          }}
        />
      )}
      {children}
      <form className="composer" onSubmit={handleSubmit}>
        <ActionLauncher context={context} onAction={onAIAction} />

        <input
          type="text"
          className="composer__input"
          placeholder={placeholder}
          value={value}
          disabled={disabled || reviewing}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Message"
        />
        <button
          type="submit"
          className="composer__send"
          disabled={disabled || reviewing || !value.trim()}
        >
          {reviewing ? 'Reviewing…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
