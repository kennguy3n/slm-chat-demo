// Phase 2 B2C "second brain" task helpers — family checklists,
// shopping-list nudges, and community event/RSVP cards. All three
// surfaces share the same shape: read recent chat messages, run a
// single on-device inference (Bonsai-1.7B), parse the model output deterministically, and
// match items back to the messages that produced them.
//
// The router still owns tier selection. We pass `taskType: 'extract_tasks'`
// (the closest existing task in `TaskType`) so requests stay on-device;
// adding new TaskType values would require a Go-side companion change
// even though the Go backend no longer runs inference.

import type {
  Adapter,
  EventRSVPRequest,
  EventRSVPResponse,
  FamilyChecklistItem,
  FamilyChecklistRequest,
  FamilyChecklistResponse,
  RSVPEvent,
  ShoppingNudge,
  ShoppingNudgesRequest,
  ShoppingNudgesResponse,
  Tier,
} from './adapter.js';
import type { InferenceRouter } from './router.js';
import { truncateForPrompt } from './tasks.js';
import { INSUFFICIENT_RULE, detectInsufficient } from './skill-framework.js';
import { PROMPT_THREAD_CAP } from './prompts/shared.js';

// Second-Brain helpers don't use the prompts/ library yet, but the
// outer cap is kept in lock-step with PROMPT_THREAD_CAP so the
// 1024-token window stays inside budget across every B2C surface.
const SECOND_BRAIN_MAX_MESSAGES = PROMPT_THREAD_CAP;

// ---------- family checklist ----------

export async function runFamilyChecklist(
  router: InferenceRouter,
  req: FamilyChecklistRequest,
): Promise<FamilyChecklistResponse> {
  if (req.messages.length === 0) {
    throw new Error('family checklist requires at least one message');
  }
  const limited = req.messages.slice(-SECOND_BRAIN_MAX_MESSAGES);
  let prompt = `${INSUFFICIENT_RULE}\n\n`;
  prompt += 'Read this family chat and produce a concrete preparation checklist. ';
  prompt += 'Each line is one item the family needs to do or bring. ';
  prompt += 'Format: <title> | <when if mentioned>. ';
  prompt += 'Keep titles short (≤ 8 words). Skip items the chat does not actually need.\n\n';
  if (req.eventHint) {
    prompt += `Event focus: ${truncateForPrompt(req.eventHint, 120)}\n`;
  }
  prompt += 'Recent messages:\n';
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
  }

  const resp = await router.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: req.channelId,
  });
  const decision = router.lastDecision();

  let items = parseChecklistItems(resp.output, limited);
  if (items.length === 0) {
    items = [
      {
        title: 'Review the chat for prep items',
        sourceMessageId: limited[limited.length - 1].id,
      },
    ];
  }

  const sourceMessageIds = uniqueSourceIds(items, limited);
  const tier: Tier = decision.tier ?? 'local';
  const reason = decision.reason || `Routed family checklist to ${tier === 'server' ? 'confidential server' : 'on-device Bonsai-1.7B'}.`;
  const title = req.eventHint
    ? `Checklist — ${truncateForPrompt(req.eventHint, 60)}`
    : 'Family checklist';

  return {
    channelId: req.channelId,
    title,
    items,
    sourceMessageIds,
    model: resp.model,
    tier,
    reason,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

export function parseChecklistItems(
  out: string,
  sources: { id: string; content: string }[],
): FamilyChecklistItem[] {
  // Honour the SLM refusal contract: if the model explicitly returns
  // "INSUFFICIENT: ..." we skip parsing instead of treating the refusal
  // text as a checklist item.
  if (detectInsufficient(out)) return [];
  const items: FamilyChecklistItem[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    if (!line) continue;
    const digitPrefix = line.match(/^\d+[.)\]:]?\s*/);
    if (digitPrefix) line = line.slice(digitPrefix[0].length).trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    let title = parts[0] ?? '';
    let dueHint = parts.length >= 2 ? parts[1] : '';
    if (!title) continue;
    // Strip a "(by Friday)" / "(due tomorrow)" tail if the model put one
    // into the title field instead of the second column.
    if (!dueHint) {
      const tail = title.match(/\(([^)]*)\)\s*$/);
      if (tail) {
        dueHint = tail[1].replace(/^(by|due|on)\s+/i, '').trim();
        title = title.slice(0, tail.index).trim();
      }
    }
    title = title.replace(/^["']|["']$/g, '');
    if (!title) continue;
    const sourceMessageId = matchSourceId(title, sources);
    items.push({
      title,
      ...(dueHint ? { dueHint } : {}),
      ...(sourceMessageId ? { sourceMessageId } : {}),
    });
  }
  return items;
}

// ---------- shopping nudges ----------

export async function runShoppingNudges(
  router: InferenceRouter,
  req: ShoppingNudgesRequest,
): Promise<ShoppingNudgesResponse> {
  if (req.messages.length === 0) {
    // Mirror runFamilyChecklist / runEventRSVP: without chat context the
    // model would hallucinate ungrounded suggestions and the response
    // would carry an empty sourceMessageIds array that the privacy strip
    // dereferences at index 0.
    throw new Error('shopping nudges requires at least one message');
  }
  const limited = req.messages.slice(-SECOND_BRAIN_MAX_MESSAGES);
  let prompt = '';
  prompt += `${INSUFFICIENT_RULE}\n\n`;
  prompt += 'Read this family chat and suggest items the user may want to add to their shopping list. ';
  prompt += 'For every suggestion give a short reason that points back to the chat. ';
  prompt += 'Format: <item> | <reason>. ';
  prompt += 'Skip suggestions that already appear in the existing list. ';
  prompt += 'Return at most 5 suggestions.\n\n';
  if (req.existingItems.length > 0) {
    prompt += 'Existing list:\n';
    for (const it of req.existingItems) {
      prompt += `- ${truncateForPrompt(it, 80)}\n`;
    }
    prompt += '\n';
  }
  prompt += 'Recent messages:\n';
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 200)}\n`;
  }

  const resp = await router.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: req.channelId,
  });
  const decision = router.lastDecision();

  const existingLower = new Set(req.existingItems.map((s) => s.trim().toLowerCase()));
  const nudges = parseShoppingNudges(resp.output, limited).filter(
    (n) => !existingLower.has(n.item.toLowerCase()),
  );

  const sourceMessageIds = uniqueSourceIds(nudges, limited);
  const tier: Tier = decision.tier ?? 'local';
  const reason = decision.reason || `Routed shopping nudges to ${tier === 'server' ? 'confidential server' : 'on-device Bonsai-1.7B'}.`;

  return {
    channelId: req.channelId,
    nudges,
    sourceMessageIds,
    model: resp.model,
    tier,
    reason,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

export function parseShoppingNudges(
  out: string,
  sources: { id: string; content: string }[],
): ShoppingNudge[] {
  if (detectInsufficient(out)) return [];
  const nudges: ShoppingNudge[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    const digitPrefix = line.match(/^\d+[.)\]:]?\s*/);
    if (digitPrefix) line = line.slice(digitPrefix[0].length).trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const item = parts[0].replace(/^["']|["']$/g, '');
    const reason = parts[1].replace(/^["']|["']$/g, '');
    if (!item || !reason) continue;
    const sourceMessageId = matchSourceId(`${item} ${reason}`, sources);
    nudges.push({
      item,
      reason,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    });
    if (nudges.length >= 5) break;
  }
  return nudges;
}

// ---------- event / RSVP card ----------

export async function runEventRSVP(
  router: InferenceRouter,
  req: EventRSVPRequest,
): Promise<EventRSVPResponse> {
  if (req.messages.length === 0) {
    throw new Error('event RSVP requires at least one message');
  }
  const limited = req.messages.slice(-SECOND_BRAIN_MAX_MESSAGES);
  let prompt = '';
  prompt += `${INSUFFICIENT_RULE}\n\n`;
  prompt += 'Read this community / family chat and find any upcoming events the user may want to RSVP to. ';
  prompt += 'For each event return: <title> | <when> | <location if any> | <rsvp-by if any>. ';
  prompt += 'Skip events without at least a title and a when. Return at most 4 events.\n\n';
  prompt += 'Recent messages:\n';
  for (const m of limited) {
    prompt += `- ${m.senderId}: ${truncateForPrompt(m.content, 240)}\n`;
  }

  const resp = await router.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: req.channelId,
  });
  const decision = router.lastDecision();

  const events = parseRSVPEvents(resp.output, limited);

  const sourceMessageIds = uniqueSourceIds(events, limited);
  const tier: Tier = decision.tier ?? 'local';
  const reason = decision.reason || `Routed RSVP extraction to ${tier === 'server' ? 'confidential server' : 'on-device Bonsai-1.7B'}.`;

  return {
    channelId: req.channelId,
    events,
    sourceMessageIds,
    model: resp.model,
    tier,
    reason,
    computeLocation: 'on_device',
    dataEgressBytes: 0,
  };
}

export function parseRSVPEvents(
  out: string,
  sources: { id: string; content: string }[],
): RSVPEvent[] {
  if (detectInsufficient(out)) return [];
  const events: RSVPEvent[] = [];
  for (const raw of out.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•·\s\t]+/, '');
    const digitPrefix = line.match(/^\d+[.)\]:]?\s*/);
    if (digitPrefix) line = line.slice(digitPrefix[0].length).trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) continue;
    const title = parts[0];
    const whenHint = parts[1];
    if (!title || !whenHint) continue;
    const location = parts[2] || undefined;
    const rsvpBy = parts[3] || undefined;
    const sourceMessageId = matchSourceId(
      [title, whenHint, location].filter(Boolean).join(' '),
      sources,
    );
    events.push({
      title,
      whenHint,
      ...(location ? { location } : {}),
      ...(rsvpBy ? { rsvpBy } : {}),
      ...(sourceMessageId ? { sourceMessageId } : {}),
    });
    if (events.length >= 4) break;
  }
  return events;
}

// ---------- helpers ----------

function matchSourceId(text: string, sources: { id: string; content: string }[]): string {
  if (sources.length === 0) return '';
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  for (let i = sources.length - 1; i >= 0; i--) {
    const c = sources[i].content.toLowerCase();
    for (const w of tokens) {
      if (c.includes(w)) return sources[i].id;
    }
  }
  return sources[sources.length - 1].id;
}

function uniqueSourceIds(
  items: { sourceMessageId?: string }[],
  sources: { id: string }[],
): string[] {
  const seen = new Set<string>();
  for (const it of items) {
    if (it.sourceMessageId) seen.add(it.sourceMessageId);
  }
  if (seen.size === 0 && sources.length > 0) seen.add(sources[sources.length - 1].id);
  return Array.from(seen);
}

// Re-exported for the IPC handler module.
export const __SECOND_BRAIN_MAX_MESSAGES = SECOND_BRAIN_MAX_MESSAGES;

// Re-export the Adapter type so callers don't need to import from
// adapter.ts when their only reason was the helper signature. Keeps
// the public surface small.
export type { Adapter };
