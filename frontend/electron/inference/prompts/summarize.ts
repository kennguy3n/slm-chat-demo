// Thread summarisation prompt — produces a 3-5 bullet summary of a
// B2B work thread, anchored to decisions / open questions / owners
// / deadlines. Tuned for Bonsai-1.7B (~1.0 GB, 1024-token window).

import { formatThread, type ThreadMessage } from './shared.js';

export interface SummarizeInput {
  messages: ThreadMessage[];
  threadId?: string;
}

export interface SummarizeOutput {
  bullets: string[];
}

export function buildSummarizePrompt(input: SummarizeInput): string {
  const { rendered } = formatThread(input.messages);
  return [
    'You are summarising a work-chat thread for a busy teammate.',
    'Output 3-5 short bullets covering, in this order: decisions, open',
    'questions, owners, and deadlines. Each bullet is one short',
    'sentence on its own line, prefixed with "- ". No preamble, no',
    'closing remark, no headings.',
    'If the thread does not contain enough material to summarise,',
    'reply with the single line: INSUFFICIENT: <reason>.',
    '',
    'Example:',
    '- Decision: pick vendor A at $40k/yr.',
    '- Open question: confirm SOC 2 by Friday.',
    '- Owner: alice drives the contract.',
    '',
    'Thread:',
    rendered,
    '',
    'Summary:',
  ].join('\n');
}

// parseSummarizeOutput is intentionally tolerant of the slight
// formatting variations Bonsai-1.7B produces: lines may use "-", "•",
// "*", or numeric prefixes; blank lines and stray commentary are
// ignored.
export function parseSummarizeOutput(out: string): SummarizeOutput {
  if (!out) return { bullets: [] };
  const trimmed = out.trim();
  if (trimmed.toUpperCase().startsWith('INSUFFICIENT')) {
    return { bullets: [] };
  }
  const bullets: string[] = [];
  for (const raw of trimmed.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·]\s+/, '');
    line = line.replace(/^\d+[.)\]:]?\s+/, '');
    if (!line) continue;
    // Skip stray "Summary:" / "Bullets:" labels.
    if (/^(summary|bullets|key points|here are)\b/i.test(line)) continue;
    bullets.push(line);
  }
  return { bullets };
}
