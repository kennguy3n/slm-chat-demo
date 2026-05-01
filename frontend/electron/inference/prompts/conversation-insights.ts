// Conversation-insights prompt — drives the redesigned B2C
// "Insights" right-rail panel (Alice ↔ Minh bilingual VI↔EN demo).
// The 2026-05-01 ground-zero LLM redesign wires this prompt to a
// dedicated `ai:conversation-insights` IPC channel that calls the
// real on-device model (OllamaAdapter / LlamaCppAdapter → Bonsai-1.7B).
//
// Output is line-delimited and tagged so the parser can recover
// distinct sections (topics / action items / decisions / sentiment)
// from a single completion. Each section line is pipe-delimited so
// fields stay independent of natural-language formatting.

import {
  formatThread,
  isInsufficient,
  stripBulletPrefix,
  type ThreadMessage,
} from './shared.js';

export interface ConversationInsightsInput {
  messages: ThreadMessage[];
  // viewerLanguage hints which language the human reading the panel
  // is most comfortable with. The model writes the topic / action /
  // decision text in this language while keeping any quoted phrases
  // in their original language.
  viewerLanguage?: string;
}

export type ConversationSentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed'
  | 'unknown';

export interface ConversationInsightTopicRow {
  label: string;
  detail?: string;
}

export interface ConversationInsightActionRow {
  text: string;
  owner?: string;
}

export interface ConversationInsightDecisionRow {
  text: string;
}

export interface ConversationInsightsOutput {
  topics: ConversationInsightTopicRow[];
  actionItems: ConversationInsightActionRow[];
  decisions: ConversationInsightDecisionRow[];
  sentiment: ConversationSentiment;
  sentimentRationale?: string;
}

type SectionHeader = 'TOPICS' | 'ACTIONS' | 'DECISIONS' | 'SENTIMENT';

// buildConversationInsightsPrompt builds the prompt envelope. The
// instruction span is intentionally compact (≤ 200 tokens) so even
// Bonsai-1.7B has room for the rendered conversation + completion.
export function buildConversationInsightsPrompt(
  input: ConversationInsightsInput,
): string {
  const { rendered } = formatThread(input.messages);
  const lang = (input.viewerLanguage ?? '').trim();
  const langLine = lang
    ? `Write topic / action / decision text in language: ${lang}.`
    : 'Write topic / action / decision text in the dominant language of the conversation.';
  return [
    'You analyze a chat conversation and extract structured insights.',
    'Output exactly four sections in this order, one per line, in the format below.',
    'Use these section headers verbatim: TOPICS, ACTIONS, DECISIONS, SENTIMENT.',
    'TOPICS: each line "TOPIC | <short label> | <one-sentence detail>" (max 5).',
    'ACTIONS: each line "ACTION | <owner-or-blank> | <imperative action>" (max 5).',
    'DECISIONS: each line "DECISION | <one-sentence decision>" (max 5).',
    'SENTIMENT: a single line "SENTIMENT | <positive|neutral|negative|mixed> | <one-sentence rationale>".',
    'A section may be empty — emit only its header line in that case.',
    langLine,
    'No bullets, no numbering, no commentary outside the four sections.',
    'If the conversation lacks usable content, reply with the single line:',
    'INSUFFICIENT: <reason>.',
    '',
    'Conversation:',
    rendered,
    '',
    'Insights:',
  ].join('\n');
}

const VALID_SENTIMENTS: ReadonlySet<ConversationSentiment> = new Set([
  'positive',
  'neutral',
  'negative',
  'mixed',
  'unknown',
]);

function normalizeSentiment(raw: string): ConversationSentiment {
  const v = raw.trim().toLowerCase();
  if (VALID_SENTIMENTS.has(v as ConversationSentiment)) {
    return v as ConversationSentiment;
  }
  return 'unknown';
}

interface ParsedSection {
  topics: ConversationInsightTopicRow[];
  actions: ConversationInsightActionRow[];
  decisions: ConversationInsightDecisionRow[];
  sentiment: ConversationSentiment;
  sentimentRationale?: string;
}

// parseConversationInsightsOutput tolerates a fair amount of model
// drift: missing sections, missing sentiment line, mis-ordered
// sections, leading bullets, [MOCK] prefixes from the placeholder
// adapter. The shape is normalised before it crosses the IPC
// boundary so the renderer never has to re-validate.
export function parseConversationInsightsOutput(
  out: string,
): ConversationInsightsOutput {
  const empty: ConversationInsightsOutput = {
    topics: [],
    actionItems: [],
    decisions: [],
    sentiment: 'unknown',
  };
  if (!out || isInsufficient(out)) return empty;

  const parsed: ParsedSection = {
    topics: [],
    actions: [],
    decisions: [],
    sentiment: 'unknown',
  };

  let section: SectionHeader | null = null;
  for (const raw of out.split('\n')) {
    let line = stripBulletPrefix(raw);
    if (!line) continue;

    // Section header on its own line, e.g. "TOPICS:" or "TOPICS".
    const headerMatch = line.match(/^(TOPICS|ACTIONS|DECISIONS|SENTIMENT)\b\s*:?$/i);
    if (headerMatch) {
      const h = headerMatch[1]!.toUpperCase() as SectionHeader;
      section = h;
      continue;
    }

    // Tagged line — preferred form. Tag wins over the current
    // section so a stray "ACTION |" still parses correctly.
    const tagged = line.match(/^(TOPIC|ACTION|DECISION|SENTIMENT)\b\s*[|:-]?\s*(.*)$/i);
    if (tagged) {
      const tag = tagged[1]!.toUpperCase();
      const rest = tagged[2] ?? '';
      const fields = rest.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (tag === 'TOPIC' && fields.length >= 1) {
        const label = fields[0]!;
        const detail = fields[1];
        parsed.topics.push({
          label,
          ...(detail ? { detail } : {}),
        });
      } else if (tag === 'ACTION' && fields.length >= 1) {
        // "ACTION | owner | text" or "ACTION | text" (no owner).
        if (fields.length >= 2) {
          parsed.actions.push({
            owner: fields[0]!,
            text: fields.slice(1).join(' | '),
          });
        } else {
          parsed.actions.push({ text: fields[0]! });
        }
      } else if (tag === 'DECISION' && fields.length >= 1) {
        parsed.decisions.push({ text: fields.join(' | ') });
      } else if (tag === 'SENTIMENT' && fields.length >= 1) {
        parsed.sentiment = normalizeSentiment(fields[0]!);
        if (fields[1]) parsed.sentimentRationale = fields[1];
      }
      continue;
    }

    // Untagged line falls back to the current section header. This
    // recovers cases where the model emits `TOPICS:` once and then
    // raw lines under it.
    if (section === 'TOPICS') {
      const parts = line.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length >= 1) {
        parsed.topics.push({
          label: parts[0]!,
          ...(parts[1] ? { detail: parts[1] } : {}),
        });
      }
    } else if (section === 'ACTIONS') {
      const parts = line.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length >= 2) {
        parsed.actions.push({ owner: parts[0]!, text: parts.slice(1).join(' | ') });
      } else if (parts.length === 1) {
        parsed.actions.push({ text: parts[0]! });
      }
    } else if (section === 'DECISIONS') {
      parsed.decisions.push({ text: line });
    } else if (section === 'SENTIMENT') {
      const parts = line.split('|').map((p) => p.trim()).filter((p) => p.length > 0);
      if (parts.length >= 1) {
        parsed.sentiment = normalizeSentiment(parts[0]!);
        if (parts[1]) parsed.sentimentRationale = parts[1];
      }
    }
  }

  return {
    topics: parsed.topics.slice(0, 5),
    actionItems: parsed.actions.slice(0, 5),
    decisions: parsed.decisions.slice(0, 5),
    sentiment: parsed.sentiment,
    ...(parsed.sentimentRationale
      ? { sentimentRationale: parsed.sentimentRationale }
      : {}),
  };
}
