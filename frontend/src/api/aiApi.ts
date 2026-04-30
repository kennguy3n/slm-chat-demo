import { apiFetch } from './client';
import { fetchChannelMessages, fetchChats, fetchThreadMessages } from './chatApi';
import { getElectronAI } from './electronBridge';

// Preload scripts run before renderer JS but during the first hot
// reload we occasionally see the bridge attach a microtask late. A
// tiny retry window swallows that race so the user doesn't see a
// transient 404/bridge-unavailable error on their first smart reply.
async function waitForElectronAI(timeoutMs = 400) {
  const first = getElectronAI();
  if (first) return first;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 25));
    const found = getElectronAI();
    if (found) return found;
  }
  return null;
}
import type {
  AIRouteResponse,
  AIRunRequest,
  AIRunResponse,
  EgressPreview,
  ExtractTasksResponse,
  ModelStatus,
  SmartReplyResponse,
  ThreadSummaryResponse,
  TranslateResponse,
  UnreadSummaryResponse,
} from '../types/ai';
import type {
  TripPlannerExecution,
  TripPlannerInputArgs,
  GuardrailSkillResult,
} from '../types/electron';
import { logActivity } from '../features/ai/activityLog';

// Each helper below first checks for the Electron preload bridge
// (`window.electronAI`) and dispatches inference there. When the bridge
// is not present (web demo, Vitest, hosted static build) it falls back
// to the legacy HTTP path so existing tests continue to work.

export async function fetchModelStatus(): Promise<ModelStatus> {
  const ipc = getElectronAI();
  if (ipc) return ipc.modelStatus();
  return apiFetch<ModelStatus>('/api/model/status');
}

export async function loadModel(model?: string): Promise<{ loaded: boolean; model: string }> {
  const ipc = getElectronAI();
  if (ipc) return ipc.loadModel(model);
  return apiFetch('/api/model/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { model } : {}),
  });
}

export async function unloadModel(model?: string): Promise<{ loaded: boolean; model: string }> {
  const ipc = getElectronAI();
  if (ipc) return ipc.unloadModel(model);
  return apiFetch('/api/model/unload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(model ? { model } : {}),
  });
}

// fetchUnreadSummary: in Electron mode the renderer fetches the user's
// recent B2C chats + recent messages and forwards them to the IPC
// handler which builds the prompt. In HTTP mode the Go data API still
// owns the prompt-building (it never ran inference for this endpoint).
export async function fetchUnreadSummary(): Promise<UnreadSummaryResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const chats = await fetchChats('b2c');
    const enriched = await Promise.all(
      chats.map(async (c) => {
        const messages = await fetchChannelMessages(c.id);
        return {
          id: c.id,
          name: c.name,
          messages: messages.map((m) => ({
            id: m.id,
            channelId: m.channelId,
            senderId: m.senderId,
            content: m.content,
          })),
        };
      }),
    );
    return ipc.unreadSummary({ chats: enriched });
  }
  return apiFetch<UnreadSummaryResponse>('/api/chats/unread-summary');
}

export async function fetchEgressPreview(): Promise<EgressPreview> {
  return apiFetch<EgressPreview>('/api/privacy/egress-preview');
}

export async function runAITask(req: AIRunRequest): Promise<AIRunResponse> {
  const ipc = getElectronAI();
  if (ipc) return ipc.run(req);
  return apiFetch<AIRunResponse>('/api/ai/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchAIRoute(req: AIRunRequest): Promise<AIRouteResponse> {
  const ipc = getElectronAI();
  if (ipc) return ipc.route(req);
  return apiFetch<AIRouteResponse>('/api/ai/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchSmartReply(req: {
  channelId: string;
  messageId?: string;
}): Promise<SmartReplyResponse> {
  const ipc = await waitForElectronAI();
  if (!ipc) {
    throw new Error(
      'Smart reply needs the on-device SLM — open this demo in the Electron app.',
    );
  }
  const messages = await fetchChannelMessages(req.channelId);
  return ipc.smartReply({
    channelId: req.channelId,
    messageId: req.messageId,
    context: messages.map((m) => ({ senderId: m.senderId, content: m.content })),
  });
}

// fetchTranslateBatch dispatches a single IPC call that covers N
// messages. The main process builds one prompt + one model call so
// CPU inference isn't paying the prompt-eval cost N times. Falls back
// to per-message `fetchTranslate` when the Electron bridge is
// unavailable (browser dev mode, Vitest).
export async function fetchTranslateBatch(req: {
  items: {
    messageId: string;
    channelId: string;
    text: string;
    targetLanguage: string;
  }[];
}): Promise<{ results: TranslateResponse[] }> {
  const ipc = await waitForElectronAI();
  if (ipc) return ipc.translateBatch(req);
  const results = await Promise.all(
    req.items.map(async (it) => {
      return fetchTranslate({
        messageId: it.messageId,
        channelId: it.channelId,
        targetLanguage: it.targetLanguage,
      });
    }),
  );
  return { results };
}

// fetchTranslate: the renderer needs the source message text. We fetch
// it from the Go data API by way of the message's channel; callers who
// already have the message text can invoke window.electronAI.translate
// directly to skip the round trip.
export async function fetchTranslate(req: {
  messageId: string;
  channelId?: string;
  targetLanguage?: string;
}): Promise<TranslateResponse> {
  const ipc = await waitForElectronAI();
  if (ipc) {
    if (!req.channelId) {
      throw new Error('translate requires channelId in Electron mode');
    }
    const messages = await fetchChannelMessages(req.channelId);
    const msg = messages.find((m) => m.id === req.messageId);
    if (!msg) throw new Error('message not found');
    return ipc.translate({
      messageId: msg.id,
      channelId: msg.channelId,
      text: msg.content,
      targetLanguage: req.targetLanguage,
    });
  }
  return apiFetch<TranslateResponse>('/api/ai/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: req.messageId, targetLanguage: req.targetLanguage }),
  });
}

export async function fetchExtractTasks(req: {
  channelId?: string;
  messageId?: string;
}): Promise<ExtractTasksResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    if (!req.channelId) {
      throw new Error('extract-tasks requires channelId in Electron mode');
    }
    const messages = await fetchChannelMessages(req.channelId);
    const focused =
      messages.find((m) => m.id === req.messageId) ?? messages[messages.length - 1];
    if (!focused) throw new Error('channel has no messages');
    const focusedIdx = messages.findIndex((m) => m.id === focused.id);
    const start = Math.max(0, focusedIdx - 4);
    const context = messages
      .slice(start, focusedIdx)
      .map((m) => ({ senderId: m.senderId, content: m.content }));
    return ipc.extractTasks({
      channelId: req.channelId,
      messageId: focused.id,
      focused: {
        id: focused.id,
        channelId: focused.channelId,
        senderId: focused.senderId,
        content: focused.content,
      },
      context,
    });
  }
  return apiFetch<ExtractTasksResponse>('/api/ai/extract-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchThreadSummary(req: {
  threadId: string;
}): Promise<ThreadSummaryResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    return ipc.summarizeThread({
      threadId: req.threadId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<ThreadSummaryResponse>('/api/ai/summarize-thread', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// ---------- Phase 2 B2C second-brain helpers ----------

export async function fetchFamilyChecklist(req: {
  channelId: string;
  eventHint?: string;
}): Promise<import('../types/ai').FamilyChecklistResponse> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('family checklist requires the Electron preload bridge');
  }
  const messages = await fetchChannelMessages(req.channelId);
  const start = performance.now();
  const data = await ipc.familyChecklist({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
    eventHint: req.eventHint,
  });
  logActivity({
    skillId: 'family-checklist',
    model: data.model,
    tier: data.tier,
    itemsProduced: data.items.length,
    egressBytes: data.dataEgressBytes,
    latencyMs: Math.round(performance.now() - start),
  });
  return data;
}

export async function fetchShoppingNudges(req: {
  channelId: string;
  existingItems: string[];
}): Promise<import('../types/ai').ShoppingNudgesResponse> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('shopping nudges requires the Electron preload bridge');
  }
  const messages = await fetchChannelMessages(req.channelId);
  const start = performance.now();
  const data = await ipc.shoppingNudges({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
    existingItems: req.existingItems,
  });
  logActivity({
    skillId: 'shopping-nudges',
    model: data.model,
    tier: data.tier,
    itemsProduced: data.nudges.length,
    egressBytes: data.dataEgressBytes,
    latencyMs: Math.round(performance.now() - start),
  });
  return data;
}

export async function fetchEventRSVP(req: {
  channelId: string;
}): Promise<import('../types/ai').EventRSVPResponse> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('event RSVP requires the Electron preload bridge');
  }
  const messages = await fetchChannelMessages(req.channelId);
  const start = performance.now();
  const data = await ipc.eventRSVP({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
  logActivity({
    skillId: 'event-rsvp',
    model: data.model,
    tier: data.tier,
    itemsProduced: data.events.length,
    egressBytes: data.dataEgressBytes,
    latencyMs: Math.round(performance.now() - start),
  });
  return data;
}

export async function fetchTripPlan(req: {
  input: TripPlannerInputArgs;
  channelId?: string;
}): Promise<TripPlannerExecution> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('trip planner requires the Electron preload bridge');
  }
  const start = performance.now();
  const exec = await ipc.tripPlan(req);
  const latency = Math.round(performance.now() - start);
  if (exec.result.status === 'ok') {
    logActivity({
      skillId: exec.result.skillId,
      model: exec.result.privacy.modelName,
      tier: exec.result.privacy.tier,
      itemsProduced: exec.result.result.days.reduce((n, d) => n + d.items.length, 0),
      egressBytes: exec.result.privacy.dataEgressBytes,
      latencyMs: latency,
    });
  }
  return exec;
}

export async function runGuardrailCheck(req: {
  text: string;
  channelId?: string;
}): Promise<GuardrailSkillResult> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('guardrail rewrite requires the Electron preload bridge');
  }
  const start = performance.now();
  const result = await ipc.guardrailCheck({ input: { text: req.text, channelId: req.channelId } });
  const latency = Math.round(performance.now() - start);
  if (result.status === 'ok') {
    logActivity({
      skillId: result.skillId,
      model: result.privacy.modelName,
      tier: result.privacy.tier,
      itemsProduced: result.result.findings.length,
      egressBytes: result.privacy.dataEgressBytes,
      latencyMs: latency,
    });
  }
  return result;
}
