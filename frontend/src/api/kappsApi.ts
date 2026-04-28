import { apiFetch } from './client';
import { fetchThreadMessages } from './chatApi';
import { getElectronAI } from './electronBridge';
import type { KAppCard } from '../types/kapps';
import type { KAppsExtractTasksResponse } from '../types/ai';

// Fetch the seeded KApp cards for the demo. Phase 0 returns the four sample
// cards from store.seedCards. An optional channelId scopes the response.
export async function fetchKAppCards(channelId?: string): Promise<KAppCard[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ cards: KAppCard[] }>(`/api/kapps/cards${qs}`);
  return data.cards ?? [];
}

// extractKAppTasks runs B2B task extraction over a thread.
//
// Electron mode: fetches the thread's messages from the Go data API
// and forwards them to the main-process inference router via IPC.
// HTTP mode: legacy POST /api/kapps/tasks/extract.
export async function extractKAppTasks(req: {
  threadId: string;
}): Promise<KAppsExtractTasksResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.extractKAppTasks({
      threadId: req.threadId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<KAppsExtractTasksResponse>('/api/kapps/tasks/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}
