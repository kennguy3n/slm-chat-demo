import { useState, type FormEvent } from 'react';

interface Props {
  placeholder?: string;
  disabled?: boolean;
  onSend?: (text: string) => void;
}

// Composer is the chat input row at the bottom of MainChat. Phase 0 ships a
// local-only composer: submitting clears the input and calls onSend, but no
// message is yet persisted on the backend (POST /api/chats/:id/messages lands
// in Phase 1).
export function Composer({ placeholder = 'Message…', disabled, onSend }: Props) {
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue('');
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
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
  );
}
