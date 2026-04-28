// Task-level helpers — prompt building + output parsing for the AI
// surfaces (smart-reply, translate, extract-tasks, summarize-thread,
// kapps-extract-tasks, unread-summary). These are 1:1 ports of the
// Go handlers in `backend/internal/api/handlers/ai_*.go` so the
// renderer experience is unchanged.

import type {
  Adapter,
  ExtractTasksRequest,
  ExtractTasksResponse,
  ExtractedTask,
  KAppsExtractTasksRequest,
  KAppsExtractTasksResponse,
  KAppsExtractedTask,
  SmartReplyRequest,
  SmartReplyResponse,
  ThreadSummaryRequest,
  ThreadSummaryResponse,
  TranslateRequest,
  TranslateResponse,
  UnreadSummaryRequest,
  UnreadSummaryResponse,
} from './adapter.js';
import type { InferenceRouter } from './router.js';

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
  let prompt = '';
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
  let prompt = '';
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

export function parseKAppsExtractedTasks(
  out: string,
  sources: { id: string; content: string }[],
): KAppsExtractedTask[] {
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
