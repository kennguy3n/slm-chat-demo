// Knowledge-extraction prompt — replaces the Phase 5 regex
// heuristic with an LLM-driven extractor when Ollama is reachable.
// The output is one entity per line in
// `<kind> | <description> | <actor-or-blank> | <due-or-blank>`
// form so the parser maps directly to KnowledgeEntity.

import {
  formatThread,
  isInsufficient,
  stripBulletPrefix,
  type ThreadMessage,
} from './shared.js';

export type KnowledgeKind = 'decision' | 'owner' | 'risk' | 'requirement' | 'deadline';

const KIND_ALIASES: Record<string, KnowledgeKind> = {
  decision: 'decision',
  decisions: 'decision',
  owner: 'owner',
  owners: 'owner',
  assignment: 'owner',
  responsibility: 'owner',
  risk: 'risk',
  risks: 'risk',
  blocker: 'risk',
  concern: 'risk',
  requirement: 'requirement',
  requirements: 'requirement',
  spec: 'requirement',
  must: 'requirement',
  deadline: 'deadline',
  deadlines: 'deadline',
  date: 'deadline',
  due: 'deadline',
};

export interface ExtractKnowledgeInput {
  messages: (ThreadMessage & { id?: string })[];
}

export interface KnowledgeRow {
  kind: KnowledgeKind;
  description: string;
  actor?: string;
  dueDate?: string;
  // sourceMessageId is the best-effort match between the description
  // and the closest seed message id. Populated by the runner, not
  // the parser, so the prompt module stays pure.
  sourceMessageId?: string;
}

export interface ExtractKnowledgeOutput {
  rows: KnowledgeRow[];
}

export function buildExtractKnowledgePrompt(input: ExtractKnowledgeInput): string {
  const { rendered } = formatThread(input.messages);
  return [
    'You extract structured workspace knowledge from a chat channel.',
    'For every distinct fact emit one line in the exact format:',
    '  <kind> | <description> | <actor-or-blank> | <due-or-blank>',
    'Allowed kinds: decision, owner, risk, requirement, deadline.',
    'Description is one short sentence (max 20 words) describing the',
    'fact in the thread, written in third person.',
    'Actor is the person responsible (name or "@" handle) or blank.',
    'Due is a date / short phrase or blank.',
    'Emit at most 12 rows total; pick the highest-signal facts.',
    'Do not number the lines. Do not echo this prompt.',
    'If the channel has no extractable facts, reply with the single',
    'line: INSUFFICIENT: <reason>.',
    '',
    'Channel messages:',
    rendered,
    '',
    'Knowledge:',
  ].join('\n');
}

export function parseExtractKnowledgeOutput(out: string): ExtractKnowledgeOutput {
  if (isInsufficient(out)) return { rows: [] };
  const rows: KnowledgeRow[] = [];
  for (const raw of (out ?? '').split('\n')) {
    const line = stripBulletPrefix(raw);
    if (!line) continue;
    if (/^(knowledge|here are)\b/i.test(line)) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const kindRaw = parts[0]!.toLowerCase().replace(/\s+$/, '');
    const kind = KIND_ALIASES[kindRaw];
    if (!kind) continue;
    const description = parts[1]!;
    if (!description) continue;
    const actor = parts[2] ?? '';
    const due = parts[3] ?? '';
    rows.push({
      kind,
      description,
      ...(actor ? { actor } : {}),
      ...(due ? { dueDate: due } : {}),
    });
  }
  return { rows };
}
