import { useState, type FormEvent, type ReactNode } from 'react';
import { ActionLauncher } from '../ai/ActionLauncher';
import { useWorkspaceStore } from '../../stores/workspaceStore';

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
}: Props) {
  const [internal, setInternal] = useState('');
  const isControlled = valueProp !== undefined;
  const value = isControlled ? valueProp : internal;
  const setValue = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };
  const context = useWorkspaceStore((s) => s.context);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue('');
  }

  return (
    <div className="composer-wrap">
      {children}
      <form className="composer" onSubmit={handleSubmit}>
        <ActionLauncher context={context} onAction={onAIAction} />

        <input
          type="text"
          className="composer__input"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Message"
        />
        <button type="submit" className="composer__send" disabled={disabled || !value.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
