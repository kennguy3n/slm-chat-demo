// Task-level helpers — prompt building + output parsing for the AI
// surfaces (smart-reply, translate, extract-tasks, summarize-thread,
// kapps-extract-tasks, unread-summary). These are 1:1 ports of the
// Go handlers in `backend/internal/api/handlers/ai_*.go` so the
// renderer experience is unchanged.

import type {
  Adapter,
  ApprovalTemplate,
  ArtifactKind,
  ArtifactSection,
  DraftArtifactRequest,
  DraftArtifactResponse,
  ExtractTasksRequest,
  ExtractTasksResponse,
  ExtractedTask,
  KAppsExtractTasksRequest,
  KAppsExtractTasksResponse,
  KAppsExtractedTask,
  PrefillApprovalRequest,
  PrefillApprovalResponse,
  PrefillFormRequest,
  PrefillFormResponse,
  PrefilledApprovalFields,
  SmartReplyRequest,
  SmartReplyResponse,
  ThreadSummaryRequest,
  ThreadSummaryResponse,
  Tier,
  TranslateBatchRequest,
  TranslateBatchResponse,
  TranslateRequest,
  TranslateResponse,
  UnreadSummaryRequest,
  UnreadSummaryResponse,
} from './adapter.js';
import type { InferenceRouter } from './router.js';
import { INSUFFICIENT_RULE, detectInsufficient } from './skill-framework.js';
import {
  buildSummarizePrompt,
  buildExtractTasksPrompt,
  buildPrefillApprovalPrompt,
  buildDraftArtifactPrompt,
  parseExtractTasksOutput,
  parsePrefillApprovalOutput,
} from './prompts/index.js';

// truncateForPrompt caps a string at `max` runes (not bytes) so multi-
// byte characters (emoji, CJK) are never split mid-codepoint.
export function truncateForPrompt(s: string, max: number): string {
  const trimmed = (s ?? '').trim();
  const runes = Array.from(trimmed);
  if (runes.length <= max) return trimmed;
  return runes.slice(0, max).join('') + '…';
}

// ---------- smart reply ----------

const SMART_REPLY_CONTEXT_SIZE = 6;
const SMART_REPLY_MAX_SUGGESTIONS = 3;
const SMART_REPLY_FALLBACK = [
  'Sounds good — thanks!',
  'On it, will follow up shortly.',
  'Could you share more context?',
];

export async function runSmartReply(
  adapter: Adapter,
  req: SmartReplyRequest,
): Promise<SmartReplyResponse> {
  const ctx = req.context.slice(-SMART_REPLY_CONTEXT_SIZE);
  let prompt = `${INSUFFICIENT_RULE}\n\n`;
  prompt += 'You are drafting short, friendly reply suggestions for a chat user. ';
  prompt += 'Read the recent messages and propose 2–3 short reply options. ';
  prompt += 'Each option must be a single sentence. Return one option per line.\n\n';
  for (const m of ctx) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
  }
  const resp = await adapter.run({
    taskType: 'smart_reply',
    prompt,
    channelId: req.channelId,
  });
  let replies = parseSmartReplies(resp.output);
  if (replies.length === 0) replies = [...SMART_REPLY_FALLBACK];
  if (replies.length > SMART_REPLY_MAX_SUGGESTIONS) {
    replies = replies.slice(0, SMART_REPLY_MAX_SUGGESTIONS);
  }
  return {
    replies,
    model: resp.model,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
    channelId: req.channelId,
    sourceMessageId: req.messageId,
  };
}

export function parseSmartReplies(out: string): string[] {
  if (detectInsufficient(out)) return [];
  const replies: string[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    const digitPrefix = line.match(/^\d+[.)\]:]?\s*/);
    if (digitPrefix) line = line.slice(digitPrefix[0].length).trim();
    if (line.toLowerCase().startsWith('suggested reply:')) {
      line = line.slice('suggested reply:'.length).trim();
    }
    line = line.replace(/^["']|["']$/g, '');
    if (!line) continue;
    replies.push(line);
  }
  return replies;
}

// ---------- translate ----------

export async function runTranslate(
  adapter: Adapter,
  req: TranslateRequest,
): Promise<TranslateResponse> {
  const target = (req.targetLanguage ?? '').trim() || 'en';
  const prompt =
    `Translate the following chat message into ${target}. Preserve tone, names, and emoji. ` +
    `Respond with the translation only, no commentary.\n\nMessage: ${req.text}`;
  const resp = await adapter.run({
    taskType: 'translate',
    prompt,
    channelId: req.channelId,
  });
  const translated = resp.output.trim() || req.text;
  return {
    messageId: req.messageId,
    channelId: req.channelId,
    original: req.text,
    translated,
    targetLanguage: target,
    model: resp.model,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// runTranslateBatch sends every message in a single prompt so the
// model only pays the prompt-eval / load cost once. The response is a
// JSON array keyed by index; missing entries fall back to the
// original text so the renderer never blanks out.
export async function runTranslateBatch(
  adapter: Adapter,
  req: TranslateBatchRequest,
): Promise<TranslateBatchResponse> {
  const items = req.items;
  if (items.length === 0) return { results: [] };
  if (items.length === 1) {
    const only = items[0]!;
    const one = await runTranslate(adapter, {
      messageId: only.messageId,
      channelId: only.channelId,
      text: only.text,
      targetLanguage: only.targetLanguage,
    });
    return { results: [one] };
  }
  const channelId = items[0]!.channelId;
  const lines = items
    .map((it, i) => `${i + 1}. (to ${it.targetLanguage}) ${truncateForPrompt(it.text, 400)}`)
    .join('\n');
  const prompt =
    'Translate each of the following chat messages into the language indicated in parentheses. ' +
    'Preserve tone, names, and emoji. Output one translation per line in the exact format ' +
    '`<N>. <translation>` with nothing else — no commentary, no repetition of the original.\n\n' +
    lines;
  const resp = await adapter.run({
    taskType: 'translate',
    prompt,
    channelId,
    maxTokens: Math.max(256, items.reduce((s, it) => s + it.text.length, 0)),
  });
  const parsed = parseBatchTranslations(resp.output, items.length);
  const results: TranslateResponse[] = items.map((it, i) => ({
    messageId: it.messageId,
    channelId: it.channelId,
    original: it.text,
    translated: parsed[i]?.trim() || it.text,
    targetLanguage: it.targetLanguage,
    model: resp.model,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  }));
  return { results };
}

export function parseBatchTranslations(out: string, expected: number): string[] {
  const result: string[] = new Array(expected).fill('');
  if (!out) return result;
  const lines = out.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\s*\(?(\d+)[.):\]]?\s+(.+)$/);
    if (!m) continue;
    const idx = Number.parseInt(m[1]!, 10) - 1;
    if (idx < 0 || idx >= expected) continue;
    if (!result[idx]) result[idx] = m[2]!.trim();
  }
  return result;
}

// ---------- extract tasks (B2C) ----------

export async function runExtractTasks(
  adapter: Adapter,
  req: ExtractTasksRequest,
): Promise<ExtractTasksResponse> {
  let prompt = `${INSUFFICIENT_RULE}\n\n`;
  prompt += 'Extract actionable items from the focused chat message. ';
  prompt += 'For each item, pick a type: task, reminder, or shopping. ';
  prompt += 'Return one item per line as: <type> | <title> | <due if any>.\n\n';
  if (req.context.length > 0) {
    prompt += 'Recent context:\n';
    for (const m of req.context) {
      prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
    }
    prompt += '\n';
  }
  prompt += `Focused message from ${req.focused.senderId}: ${req.focused.content}\n`;
  const resp = await adapter.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: req.focused.channelId,
  });
  let tasks = parseExtractedTasks(resp.output);
  if (tasks.length === 0) {
    tasks = [{ title: 'Review this message', type: 'task' }];
  }
  return {
    tasks,
    sourceMessageId: req.focused.id,
    channelId: req.focused.channelId,
    model: resp.model,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// Strip `[source:id1,id2]` / `[source: id1, id2]` provenance markers from a
// task line. The markers are emitted by the mock adapter (and, in the
// future, any adapter that wants to annotate which seeded message a
// task came from) so the UI can wire provenance. They must not leak
// into the user-visible task title.
const SOURCE_MARKER_RE = /\s*\[source:[^\]]*\]/gi;

export function parseExtractedTasks(out: string): ExtractedTask[] {
  if (detectInsufficient(out)) return [];
  const tasks: ExtractedTask[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    line = line.replace(SOURCE_MARKER_RE, '').trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      const t: ExtractedTask = {
        type: classifyType(parts[0]),
        title: parts[1],
        ...(parts.length >= 3 && parts[2] ? { dueDate: parts[2] } : {}),
      };
      if (!t.title) continue;
      tasks.push(t);
      continue;
    }
    let title = line;
    let due = '';
    const dueIdx = line.lastIndexOf('(due ');
    if (dueIdx >= 0) {
      const closeIdx = line.indexOf(')', dueIdx);
      if (closeIdx > dueIdx) {
        due = line.slice(dueIdx + '(due '.length, closeIdx).trim();
        title = line.slice(0, dueIdx).trim();
      }
    }
    tasks.push({ title, type: classifyType(title), ...(due ? { dueDate: due } : {}) });
  }
  return tasks;
}

export function classifyType(hint: string): ExtractedTask['type'] {
  const h = hint.toLowerCase();
  if (h === 'task' || h === 'reminder' || h === 'shopping') return h;
  if (h.includes('remind')) return 'reminder';
  if (h.includes('shop') || h.includes('grocer') || h.includes('list')) return 'shopping';
  if (h.includes('buy') || h.includes('pick up') || h.includes('grab')) return 'shopping';
  return 'task';
}

// ---------- B2B thread summary ----------

const THREAD_SUMMARY_MAX_MESSAGES = 30;

export function buildThreadSummary(
  router: InferenceRouter,
  req: ThreadSummaryRequest,
): ThreadSummaryResponse {
  const messages = req.messages;
  const limited = messages.slice(0, THREAD_SUMMARY_MAX_MESSAGES);
  // Prompt construction lives in `prompts/summarize.ts` so the
  // Bonsai-8B-tuned envelope (concise instructions, refusal
  // contract, capped per-message length) can evolve without churn
  // in this orchestrator.
  const prompt = buildSummarizePrompt({
    threadId: req.threadId,
    messages: limited.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
  const sources = limited.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    sender: m.senderId,
    excerpt: truncateForPrompt(m.content, 160),
  }));

  let model = 'bonsai-8b';
  let tier: ThreadSummaryResponse['tier'] = 'local';
  let reason = 'Thread summary routed to on-device Bonsai-8B.';
  const decision = router.decide({ taskType: 'summarize', prompt });
  if (decision.allow) {
    model = decision.model;
    if (decision.tier) tier = decision.tier;
    reason = decision.reason;
  }
  return {
    prompt,
    sources,
    threadId: req.threadId,
    channelId: limited[0]?.channelId ?? '',
    model,
    tier,
    reason,
    messageCount: messages.length,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// ---------- B2B KApps extract tasks ----------

const KAPPS_EXTRACT_MAX_MESSAGES = 30;

export async function runKAppsExtractTasks(
  adapter: Adapter,
  req: KAppsExtractTasksRequest,
): Promise<KAppsExtractTasksResponse> {
  if (req.messages.length === 0) {
    throw new Error('thread not found');
  }
  const limited = req.messages.slice(0, KAPPS_EXTRACT_MAX_MESSAGES);
  const prompt = buildExtractTasksPrompt({
    messages: limited.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
  const resp = await adapter.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: limited[0].channelId,
  });
  let tasks = parseKAppsExtractedTasks(resp.output, limited);
  if (tasks.length === 0) {
    tasks = [
      {
        title: 'Review thread for follow-ups',
        status: 'open',
        sourceMessageId: limited[limited.length - 1].id,
      },
    ];
  }
  return {
    tasks,
    threadId: req.threadId,
    channelId: limited[0].channelId,
    model: resp.model,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// parseKAppsExtractedTasks honours the SLM refusal contract by
// returning an empty list when the model output starts with
// `INSUFFICIENT:`. The pipe-delimited "<owner> | <title> | <due>"
// row parsing is delegated to the prompt library so the format
// shared with the prompt template stays in one place; this wrapper
// adds best-effort source-message attribution + a status field.
export function parseKAppsExtractedTasks(
  out: string,
  sources: { id: string; content: string }[],
): KAppsExtractedTask[] {
  if (detectInsufficient(out)) return [];
  const { tasks: rows } = parseExtractTasksOutput(out);
  const tasks: KAppsExtractedTask[] = [];
  for (const row of rows) {
    if (!row.title) continue;
    const t: KAppsExtractedTask = {
      owner: row.owner,
      title: row.title,
      status: 'open',
      ...(row.dueDate ? { dueDate: row.dueDate } : {}),
    };
    const matched = matchSourceMessage(t.title, sources);
    if (matched) t.sourceMessageId = matched;
    tasks.push(t);
  }
  // Legacy fallback: if the prompt library found no rows but the
  // model wrote "<title> (due <date>)" prose, recover via the older
  // best-effort parser so older fixtures keep working.
  if (tasks.length === 0) {
    for (const raw of out.split('\n')) {
      let line = raw.trim();
      if (!line) continue;
      line = line.replace(/^[-*•·\s\t]+/, '');
      if (!line) continue;
      let title = line;
      let due = '';
      const dueIdx = line.lastIndexOf('(due ');
      if (dueIdx >= 0) {
        const closeIdx = line.indexOf(')', dueIdx);
        if (closeIdx > dueIdx) {
          due = line.slice(dueIdx + '(due '.length, closeIdx).trim();
          title = line.slice(0, dueIdx).trim();
        }
      }
      const matched = matchSourceMessage(title, sources);
      tasks.push({
        title,
        status: 'open',
        ...(due ? { dueDate: due } : {}),
        ...(matched ? { sourceMessageId: matched } : {}),
      });
    }
  }
  return tasks;
}

export function matchSourceMessage(
  title: string,
  msgs: { id: string; content: string }[],
): string {
  if (msgs.length === 0) return '';
  const lt = title.toLowerCase();
  const words = lt.split(/[^a-z]+/).filter((w) => w.length >= 4);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const content = msgs[i].content.toLowerCase();
    for (const w of words) {
      if (content.includes(w)) return msgs[i].id;
    }
  }
  return msgs[0].id;
}

// ---------- B2B prefill approval ----------

const PREFILL_APPROVAL_MAX_MESSAGES = 30;

const APPROVAL_TEMPLATE_TITLES: Record<ApprovalTemplate, string> = {
  vendor: 'Vendor approval',
  budget: 'Budget request',
  access: 'Access request',
};

const APPROVAL_TEMPLATE_FIELDS: Record<ApprovalTemplate, string[]> = {
  vendor: ['vendor', 'amount', 'justification', 'risk'],
  budget: ['vendor', 'amount', 'justification', 'risk'],
  access: ['vendor', 'amount', 'justification', 'risk'],
};

export async function runPrefillApproval(
  router: InferenceRouter,
  req: PrefillApprovalRequest,
): Promise<PrefillApprovalResponse> {
  if (req.messages.length === 0) {
    throw new Error('thread not found');
  }
  const template: ApprovalTemplate = req.templateId ?? 'vendor';
  const limited = req.messages.slice(0, PREFILL_APPROVAL_MAX_MESSAGES);
  const expectedFields = APPROVAL_TEMPLATE_FIELDS[template];

  // expectedFields informs the renderer which values to surface
  // — the prompt itself is now built by the prompt library.
  void expectedFields;
  const prompt = buildPrefillApprovalPrompt({
    templateId: template,
    messages: limited.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });

  const resp = await router.run({
    taskType: 'prefill_approval',
    prompt,
    channelId: limited[0].channelId,
  });
  const decision = router.lastDecision();

  const fields = parsePrefilledApprovalFields(resp.output);
  const title = fields.vendor
    ? `${APPROVAL_TEMPLATE_TITLES[template]} — ${fields.vendor}`
    : APPROVAL_TEMPLATE_TITLES[template];

  const sourceMessageIds = collectApprovalSources(fields, limited);

  const tier: Tier = decision.tier ?? 'local';
  const reason = decision.reason || `Routed prefill_approval to ${tier === 'server' ? 'confidential server' : 'on-device Bonsai-8B'}.`;

  return {
    threadId: req.threadId,
    channelId: limited[0].channelId,
    templateId: template,
    title,
    fields,
    sourceMessageIds,
    model: resp.model,
    tier,
    reason,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

export function parsePrefilledApprovalFields(out: string): PrefilledApprovalFields {
  if (detectInsufficient(out)) return {};
  // The pipe parsing is shared with the prompt template via the
  // prompt library. This wrapper preserves the legacy alias keys
  // (`requester` / `subject` -> vendor, `severity` -> risk) that
  // the renderer used before the prompt library landed.
  const { fields: parsed } = parsePrefillApprovalOutput(out);
  const fields: PrefilledApprovalFields = {};
  if (parsed.vendor) fields.vendor = parsed.vendor;
  if (parsed.amount) fields.amount = parsed.amount;
  if (parsed.justification) fields.justification = parsed.justification;
  if (parsed.risk) fields.risk = parsed.risk;
  const extra: Record<string, string> = {};
  if (parsed.extra) {
    for (const [k, v] of Object.entries(parsed.extra)) {
      const key = k.toLowerCase();
      if (!fields.vendor && (key === 'requester' || key === 'subject')) {
        fields.vendor = v;
        continue;
      }
      if (!fields.risk && key === 'severity') {
        fields.risk = v;
        continue;
      }
      extra[key] = v;
    }
  }
  if (Object.keys(extra).length > 0) fields.extra = extra;
  return fields;
}

function collectApprovalSources(
  fields: PrefilledApprovalFields,
  messages: { id: string; content: string }[],
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const v of [fields.vendor, fields.amount, fields.justification, fields.risk]) {
    if (v) values.push(v.toLowerCase());
  }
  if (values.length === 0) {
    return messages.length > 0 ? [messages[0].id] : [];
  }
  for (const m of messages) {
    const c = m.content.toLowerCase();
    for (const v of values) {
      const words = v.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      if (words.length === 0) continue;
      if (words.some((w) => c.includes(w)) && !seen.has(m.id)) {
        seen.add(m.id);
        break;
      }
    }
  }
  if (seen.size === 0 && messages.length > 0) seen.add(messages[0].id);
  return Array.from(seen);
}

// ---------- B2B draft artifact section ----------

const DRAFT_ARTIFACT_MAX_MESSAGES = 30;

const ARTIFACT_TYPE_HINT: Record<ArtifactKind, string> = {
  PRD: 'product requirements doc with goal, requirements, success metrics, risks',
  RFC: 'request-for-comments doc with motivation, proposal, alternatives',
  Proposal: 'proposal with summary, scope, cost, risks, ask',
  SOP: 'standard operating procedure with goal, steps, owner, exceptions',
  QBR: 'quarterly business review with wins, gaps, asks, next-quarter plan',
};

const ARTIFACT_SECTION_HINT: Record<ArtifactSection, string> = {
  goal: 'just the goal section (1–2 short paragraphs)',
  requirements: 'just the requirements section (bulleted list)',
  risks: 'just the risks / mitigations section (bulleted list)',
  all: 'a short top-level draft covering the main sections (under 200 words total)',
};

export function buildDraftArtifact(
  router: InferenceRouter,
  req: DraftArtifactRequest,
): DraftArtifactResponse {
  if (req.messages.length === 0) {
    throw new Error('thread not found');
  }
  const limited = req.messages.slice(0, DRAFT_ARTIFACT_MAX_MESSAGES);
  const section: ArtifactSection = req.section ?? 'all';
  // ARTIFACT_TYPE_HINT / ARTIFACT_SECTION_HINT now live in
  // `prompts/draft-artifact.ts` so the Bonsai-tuned wording is in
  // one place. Kept the legacy local copies above for tests that
  // still assert on the old wording.
  void ARTIFACT_TYPE_HINT;
  void ARTIFACT_SECTION_HINT;
  const prompt = buildDraftArtifactPrompt({
    artifactType: req.artifactType,
    section,
    messages: limited.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
  const sources = limited.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    sender: m.senderId,
    excerpt: truncateForPrompt(m.content, 160),
  }));

  // Default: route to the on-device model. The router's decision
  // still wins when the confidential-server tier is wired in and the
  // dispatcher asks for it explicitly.
  let tier: Tier = 'local';
  let model = 'bonsai-8b';
  let reason = `Drafting a ${req.artifactType} routed to on-device Bonsai-8B.`;

  const decision = router.decide({
    taskType: 'draft_artifact',
    prompt,
    channelId: limited[0].channelId,
  });
  if (decision.allow) {
    model = decision.model;
    if (decision.tier) tier = decision.tier;
    reason = decision.reason;
  }

  const root = limited[0].content.trim().split('\n')[0];
  const title = root
    ? `${req.artifactType}: ${truncateForPrompt(root, 60)}`
    : `${req.artifactType} draft`;

  return {
    prompt,
    sources,
    threadId: req.threadId,
    channelId: limited[0].channelId,
    artifactType: req.artifactType,
    section,
    title,
    model,
    tier,
    reason,
    messageCount: req.messages.length,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// ---------- B2C unread summary ----------

const UNREAD_SUMMARY_MAX_MESSAGES = 20;

// Per-channel cap for the standard multi-chat morning digest. The
// bilingual variant lifts this so a single ~20-message conversation
// is summarised in full.
const PER_CHAT_MESSAGE_TAIL = 5;

export function buildUnreadSummary(req: UnreadSummaryRequest): UnreadSummaryResponse {
  const sources: UnreadSummaryResponse['sources'] = [];
  const isBilingual = Boolean(req.bilingualPartnerLanguage);
  const viewerLang = req.viewerLanguage?.trim() || 'English';
  const partnerLang = req.bilingualPartnerLanguage?.trim() ?? '';

  let prompt = '';
  if (isBilingual) {
    prompt +=
      `Summarise the following ${viewerLang} ↔ ${partnerLang} bilingual chat ` +
      `for an ${viewerLang}-speaking reader. Write the summary in ${viewerLang}. ` +
      `Note key topics, action items, decisions, and any plans the two ` +
      `participants agreed on. Mention briefly that the conversation was ` +
      `conducted in two languages.\n\n`;
  } else {
    prompt += 'Summarise these recent unread messages into a short digest. ';
    prompt += 'Call out deadlines, RSVPs, and replies needed.\n\n';
  }

  // Bilingual mode: take the full tail of the single channel, capped
  // at UNREAD_SUMMARY_MAX_MESSAGES. Default mode: tail per chat.
  outer: for (const ch of req.chats) {
    const msgs = ch.messages;
    const start = isBilingual
      ? Math.max(0, msgs.length - UNREAD_SUMMARY_MAX_MESSAGES)
      : Math.max(0, msgs.length - PER_CHAT_MESSAGE_TAIL);
    for (const m of msgs.slice(start)) {
      sources.push({
        id: m.id,
        channelId: m.channelId,
        sender: m.senderId,
        excerpt: truncateForPrompt(m.content, 160),
      });
      prompt += `- [${ch.name}] ${m.senderId}: ${m.content}\n`;
      if (sources.length >= UNREAD_SUMMARY_MAX_MESSAGES) break outer;
    }
  }
  return {
    prompt,
    model: 'bonsai-8b',
    sources,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// ---------- Phase 3: form prefill ----------
//
// Same opt-in / single-inference pattern as runPrefillApproval. The
// helper builds a prompt asking the model to fill the requested form
// fields one per line ("<field>: <value>"), parses the output back
// into a Record<string, string>, and surfaces source provenance.

const PREFILL_FORM_MAX_MESSAGES = 30;

export async function runPrefillForm(
  router: InferenceRouter,
  req: PrefillFormRequest,
): Promise<PrefillFormResponse> {
  if (req.messages.length === 0) {
    throw new Error('thread not found');
  }
  const limited = req.messages.slice(0, PREFILL_FORM_MAX_MESSAGES);
  const fields = req.fields.length > 0 ? req.fields : ['vendor', 'amount', 'justification'];

  let prompt = '';
  prompt += `Fill the following intake form fields from the work thread below. `;
  prompt += `Output one "<field>: <value>" pair per line. `;
  prompt += `Leave a value blank if the thread does not mention it. `;
  prompt += `Fields: ${fields.join(', ')}.\n\n`;
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
  }

  const resp = await router.run({
    taskType: 'prefill_form',
    prompt,
    channelId: limited[0].channelId,
  });
  const decision = router.lastDecision();

  const parsed = parseFormFields(resp.output, fields);
  const sourceMessageIds = collectFormSources(parsed, limited);
  const tier: Tier = decision.tier ?? 'local';
  const reason = decision.reason || `Routed prefill_form to ${tier === 'server' ? 'confidential server' : 'on-device Bonsai-8B'}.`;

  return {
    threadId: req.threadId,
    channelId: limited[0].channelId,
    templateId: req.templateId,
    fields: parsed,
    sourceMessageIds,
    model: resp.model,
    tier,
    reason,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

// parseFormFields parses one "<field>: <value>" line per row. Unknown
// fields are dropped silently — only the requested template fields are
// kept on the response so the renderer never has to reconcile the AI's
// invented keys.
export function parseFormFields(out: string, allowed: string[]): Record<string, string> {
  if (detectInsufficient(out)) return {};
  const allowedSet = new Set(allowed.map((a) => a.toLowerCase()));
  const fields: Record<string, string> = {};
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    let value = line.slice(colon + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    if (!value) continue;
    if (allowedSet.has(key)) {
      fields[key] = value;
    }
  }
  return fields;
}

function collectFormSources(
  fields: Record<string, string>,
  messages: { id: string; content: string }[],
): string[] {
  const values = Object.values(fields).filter((v) => v).map((v) => v.toLowerCase());
  if (values.length === 0) {
    return messages.length > 0 ? [messages[0].id] : [];
  }
  const seen = new Set<string>();
  for (const m of messages) {
    const c = m.content.toLowerCase();
    for (const v of values) {
      const words = v.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      if (words.length === 0) continue;
      if (words.some((w) => c.includes(w)) && !seen.has(m.id)) {
        seen.add(m.id);
        break;
      }
    }
  }
  if (seen.size === 0 && messages.length > 0) seen.add(messages[0].id);
  return Array.from(seen);
}
