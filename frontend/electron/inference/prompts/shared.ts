// Shared helpers used by every prompt module. Kept dependency-free so
// the modules in this directory can be imported by both the Electron
// main process (Node) and Vitest (jsdom).

// Bonsai-8B-Q1_0 has a 2048-token context window in the demo's
// Modelfile. These caps reserve roughly half the window for input
// (~1024 tokens / ~4096 chars) and the rest for system instructions
// + generation. Values are runes (codepoints), not bytes, so multi-
// byte characters (emoji, CJK) are never truncated mid-codepoint.
export const PROMPT_MESSAGE_CAP = 200; // per-message body cap
export const PROMPT_THREAD_CAP = 30;   // max messages forwarded to the model

// Refusal contract — the model is asked to emit this prefix when the
// thread genuinely lacks the requested information. Each parser
// short-circuits on this prefix to return an empty result instead of
// hallucinated fields.
export const INSUFFICIENT_PREFIX = 'INSUFFICIENT';

export function truncateRunes(s: string, max: number): string {
  const trimmed = (s ?? '').trim();
  const runes = Array.from(trimmed);
  if (runes.length <= max) return trimmed;
  return runes.slice(0, max).join('') + '…';
}

// formatThread renders the message list into the exact shape every
// B2B prompt feeds the model. Centralising the rendering ensures
// every prompt sees the same envelope and the model develops a
// stable expectation of the input format.
export interface ThreadMessage {
  id?: string;
  channelId?: string;
  senderId: string;
  content: string;
}

export function formatThread(
  messages: ThreadMessage[],
  opts: { messageCap?: number; threadCap?: number } = {},
): { rendered: string; used: ThreadMessage[] } {
  const messageCap = opts.messageCap ?? PROMPT_MESSAGE_CAP;
  const threadCap = opts.threadCap ?? PROMPT_THREAD_CAP;
  const used = messages.slice(0, threadCap);
  const lines = used.map((m) => `- ${m.senderId}: ${truncateRunes(m.content, messageCap)}`);
  return { rendered: lines.join('\n'), used };
}

export function isInsufficient(out: string): boolean {
  if (!out) return false;
  return out.trim().toUpperCase().startsWith(INSUFFICIENT_PREFIX);
}

// stripBulletPrefix removes Markdown / numbered-list prefixes a model
// often adds to each line. Centralised so every parser handles the
// same set of leading tokens. Also strips a leading `[MOCK]` marker
// — the post-redesign MockAdapter prefixes its placeholder lines so
// it's obvious in screenshots when the real LLM isn't running, and
// the parsers should still recover field names underneath.
export function stripBulletPrefix(line: string): string {
  let out = line.replace(/^[-*•·\s\t]+/, '');
  out = out.replace(/^\[(?:MOCK|mock|Mock)\]\s*/, '');
  const digitPrefix = out.match(/^\d+[.)\]:]?\s+/);
  if (digitPrefix) out = out.slice(digitPrefix[0].length);
  return out.trim();
}

// stripQuotes removes a single pair of leading/trailing single or
// double quotes — Bonsai often wraps short field values in quotes.
export function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}
