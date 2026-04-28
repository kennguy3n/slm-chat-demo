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
  PrefilledApprovalFields,
  SmartReplyRequest,
  SmartReplyResponse,
  ThreadSummaryRequest,
  ThreadSummaryResponse,
  Tier,
  TranslateRequest,
  TranslateResponse,
  UnreadSummaryRequest,
  UnreadSummaryResponse,
} from './adapter.js';
import type { InferenceRouter } from './router.js';
import { INSUFFICIENT_RULE, detectInsufficient } from './skill-framework.js';

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

export function parseExtractedTasks(out: string): ExtractedTask[] {
  if (detectInsufficient(out)) return [];
  const tasks: ExtractedTask[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
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

const THREAD_SUMMARY_SHORT = 8;
const THREAD_SUMMARY_MAX_MESSAGES = 30;

export function buildThreadSummary(
  router: InferenceRouter,
  req: ThreadSummaryRequest,
): ThreadSummaryResponse {
  const messages = req.messages;
  const limited = messages.slice(0, THREAD_SUMMARY_MAX_MESSAGES);
  let prompt = '';
  prompt += 'Summarise the following thread for a busy teammate. ';
  prompt += 'Call out decisions made, open questions, owners, and deadlines. ';
  prompt += 'Keep it to a short paragraph plus a bulleted list.\n\n';
  const sources = limited.map((m) => {
    prompt += `- ${m.senderId}: ${m.content}\n`;
    return {
      id: m.id,
      channelId: m.channelId,
      sender: m.senderId,
      excerpt: truncateForPrompt(m.content, 160),
    };
  });

  let model = 'gemma-4-e2b';
  let tier: ThreadSummaryResponse['tier'] = 'e2b';
  let reason = 'Short thread routed to E2B.';
  if (messages.length > THREAD_SUMMARY_SHORT) {
    model = 'gemma-4-e4b';
    tier = 'e4b';
    reason = 'Thread is long enough to benefit from E4B reasoning.';
  }
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
  let prompt = '';
  prompt += 'Extract concrete tasks from the following work thread. ';
  prompt += 'For each task identify the owner, the due date if mentioned, ';
  prompt += 'and a clear title. Return one task per line as: ';
  prompt += '<owner> | <title> | <due if any>.\n\n';
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${m.content}\n`;
  }
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
// `INSUFFICIENT:` (see skill-framework.ts).
export function parseKAppsExtractedTasks(
  out: string,
  sources: { id: string; content: string }[],
): KAppsExtractedTask[] {
  if (detectInsufficient(out)) return [];
  const tasks: KAppsExtractedTask[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      const t: KAppsExtractedTask = {
        owner: parts[0],
        title: parts[1],
        status: 'open',
        ...(parts.length >= 3 && parts[2] ? { dueDate: parts[2] } : {}),
      };
      const matched = matchSourceMessage(t.title, sources);
      if (matched) t.sourceMessageId = matched;
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
    const matched = matchSourceMessage(title, sources);
    tasks.push({
      title,
      status: 'open',
      ...(due ? { dueDate: due } : {}),
      ...(matched ? { sourceMessageId: matched } : {}),
    });
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

  let prompt = '';
  prompt += `Prefill an ${template} approval card from the following work thread. `;
  prompt += `Output one ${expectedFields.join(' / ')} pair per line as: `;
  prompt += '<field>: <value>. ';
  prompt += 'Keep each value short. Leave a value blank if the thread does not mention it.\n\n';
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
  }

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

  const tier: Tier = decision.tier ?? 'e4b';
  const reason = decision.reason || `Routed prefill_approval to ${tier.toUpperCase()}.`;

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
  const fields: PrefilledApprovalFields = {};
  const extra: Record<string, string> = {};
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
    if (key === 'vendor' || key === 'requester' || key === 'subject') {
      fields.vendor = value;
    } else if (key === 'amount' || key === 'cost' || key === 'price') {
      fields.amount = value;
    } else if (key === 'justification' || key === 'reason' || key === 'why') {
      fields.justification = value;
    } else if (key === 'risk' || key === 'risk level' || key === 'severity') {
      fields.risk = value;
    } else if (key.length > 0) {
      extra[key] = value;
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

const DRAFT_ARTIFACT_SHORT = 6;
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
  const typeHint = ARTIFACT_TYPE_HINT[req.artifactType];
  const sectionHint = ARTIFACT_SECTION_HINT[section];

  let prompt = '';
  prompt += `Draft a ${req.artifactType} (${typeHint}) — ${sectionHint}. `;
  prompt += 'Use the following thread as the only source. ';
  prompt += 'Cite owners, decisions, and deadlines where the thread mentions them. ';
  prompt += 'Output Markdown.\n\n';
  const sources = limited.map((m) => {
    prompt += `- ${m.senderId}: ${m.content}\n`;
    return {
      id: m.id,
      channelId: m.channelId,
      sender: m.senderId,
      excerpt: truncateForPrompt(m.content, 160),
    };
  });

  // Default tier follows length AND artifact type. Long threads (or PRDs/
  // QBRs that always benefit from reasoning) prefer E4B; the router's
  // decision still wins when a real adapter is wired in.
  const reasoningHeavy = req.artifactType === 'PRD' || req.artifactType === 'QBR';
  let tier: Tier = reasoningHeavy || req.messages.length > DRAFT_ARTIFACT_SHORT ? 'e4b' : 'e2b';
  let model = tier === 'e4b' ? 'gemma-4-e4b' : 'gemma-4-e2b';
  let reason =
    tier === 'e4b'
      ? `Drafting a ${req.artifactType} benefits from E4B reasoning.`
      : `Short ${req.artifactType} draft routed to E2B.`;

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

export function buildUnreadSummary(req: UnreadSummaryRequest): UnreadSummaryResponse {
  const sources: UnreadSummaryResponse['sources'] = [];
  let prompt = '';
  prompt += 'Summarise these recent unread messages into a short digest. ';
  prompt += 'Call out deadlines, RSVPs, and replies needed.\n\n';
  outer: for (const ch of req.chats) {
    const msgs = ch.messages;
    const start = Math.max(0, msgs.length - 5);
    for (const m of msgs.slice(start)) {
      sources.push({
        id: m.id,
        channelId: m.channelId,
        sender: m.senderId,
        excerpt: truncateForPrompt(m.content, 120),
      });
      prompt += `- [${ch.name}] ${m.senderId}: ${m.content}\n`;
      if (sources.length >= UNREAD_SUMMARY_MAX_MESSAGES) break outer;
    }
  }
  return {
    prompt,
    model: 'gemma-4-e2b',
    sources,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}
