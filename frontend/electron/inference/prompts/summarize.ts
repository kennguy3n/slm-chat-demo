// Thread summarisation prompt — produces a 3-5 bullet summary of a
// B2B work thread, anchored to decisions / open questions / owners
// / deadlines. Tuned for Bonsai-8B-Q1_0 (1.16 GB, 2048-token window).

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
    'questions, owners, and deadlines. Each bullet must be one short',
    'sentence on its own line, prefixed with "- ". No preamble, no',
    'closing remark, no headings.',
    '',
    'If the thread does not contain enough material to summarise,',
    'reply with the single line: INSUFFICIENT: <reason>.',
    '',
    'Thread:',
    rendered,
    '',
    'Summary:',
  ].join('\n');
}

// parseSummarizeOutput is intentionally tolerant of the slight
// formatting variations Bonsai-8B produces: lines may use "-", "•",
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
