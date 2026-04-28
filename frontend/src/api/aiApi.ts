import { apiFetch } from './client';
import { fetchChannelMessages, fetchChats, fetchThreadMessages } from './chatApi';
import { getElectronAI } from './electronBridge';
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
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchChannelMessages(req.channelId);
    return ipc.smartReply({
      channelId: req.channelId,
      messageId: req.messageId,
      context: messages.map((m) => ({ senderId: m.senderId, content: m.content })),
    });
  }
  return apiFetch<SmartReplyResponse>('/api/ai/smart-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
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
  const ipc = getElectronAI();
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
  return ipc.familyChecklist({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
    eventHint: req.eventHint,
  });
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
  return ipc.shoppingNudges({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
    existingItems: req.existingItems,
  });
}

export async function fetchEventRSVP(req: {
  channelId: string;
}): Promise<import('../types/ai').EventRSVPResponse> {
  const ipc = getElectronAI();
  if (!ipc) {
    throw new Error('event RSVP requires the Electron preload bridge');
  }
  const messages = await fetchChannelMessages(req.channelId);
  return ipc.eventRSVP({
    channelId: req.channelId,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
}
