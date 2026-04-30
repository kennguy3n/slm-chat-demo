// Approval-prefill prompt — fills the `vendor`, `amount`,
// `justification`, and `risk` fields on a B2B approval card. Output
// is `<field>: <value>` lines so the parser stays trivial.

import {
  formatThread,
  isInsufficient,
  stripBulletPrefix,
  stripQuotes,
  type ThreadMessage,
} from './shared.js';

export type ApprovalTemplate = 'vendor' | 'budget' | 'access';

export interface PrefillApprovalInput {
  messages: ThreadMessage[];
  templateId?: ApprovalTemplate;
}

export interface PrefilledFields {
  vendor?: string;
  amount?: string;
  justification?: string;
  risk?: string;
  // extra holds any keys the model emitted that aren't in the
  // canonical four — e.g. "contract length", "termination terms".
  extra?: Record<string, string>;
}

export interface PrefillApprovalOutput {
  fields: PrefilledFields;
}

const KNOWN_FIELDS: Record<string, keyof PrefilledFields> = {
  vendor: 'vendor',
  amount: 'amount',
  cost: 'amount',
  price: 'amount',
  justification: 'justification',
  reason: 'justification',
  rationale: 'justification',
  // `why` was a recognised alias under the legacy parser
  // (`tasks.ts → parsePrefilledApprovalFields`) and an 8B model
  // routinely emits "why: …" instead of "justification: …".
  // Keep it mapped to the canonical field so that prompt format
  // doesn't silently end up in `extra`.
  why: 'justification',
  risk: 'risk',
  'risk level': 'risk',
};

export function buildPrefillApprovalPrompt(input: PrefillApprovalInput): string {
  const template = input.templateId ?? 'vendor';
  const { rendered } = formatThread(input.messages);
  return [
    `You are prefilling a "${template}" approval request from a chat thread.`,
    'Emit exactly four lines, in this order:',
    '  vendor: <name>',
    '  amount: <currency amount or budget>',
    '  justification: <one-sentence reason>',
    '  risk: <low | medium | high>',
    'Omit a line when the thread does not name a value.',
    'Do not invent values. Do not add commentary.',
    'If the thread does not mention any of the four fields, reply',
    'with the single line: INSUFFICIENT: <reason>.',
    '',
    'Example:',
    'vendor: Acme Logs',
    'amount: $42,000 / yr',
    'justification: Lowest-cost SOC 2-cleared bidder.',
    'risk: medium',
    '',
    'Thread:',
    rendered,
    '',
    'Fields:',
  ].join('\n');
}

export function parsePrefillApprovalOutput(out: string): PrefillApprovalOutput {
  if (isInsufficient(out)) return { fields: {} };
  const fields: PrefilledFields = {};
  const extra: Record<string, string> = {};
  for (const raw of (out ?? '').split('\n')) {
    const line = stripBulletPrefix(raw);
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = stripQuotes(line.slice(idx + 1).trim());
    if (!key || !value) continue;
    const canonical = KNOWN_FIELDS[key];
    if (canonical && canonical !== 'extra') {
      // Only set the canonical field once — the first occurrence
      // wins so a model that repeats itself doesn't silently
      // overwrite an earlier-correct value.
      if (!fields[canonical]) fields[canonical] = value;
      continue;
    }
    extra[key] = value;
  }
  if (Object.keys(extra).length > 0) fields.extra = extra;
  return { fields };
}
