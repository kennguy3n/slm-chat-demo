import { apiFetch } from './client';
import { fetchThreadMessages } from './chatApi';
import { getElectronAI } from './electronBridge';
import type { KAppCard } from '../types/kapps';
import type {
  ApprovalTemplate,
  ArtifactKind,
  ArtifactSection,
  DraftArtifactResponse,
  KAppsExtractTasksResponse,
  PrefillApprovalResponse,
} from '../types/ai';

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

// prefillApproval runs B2B approval prefill over a thread. Electron
// mode forwards the thread messages to the main-process inference
// router; HTTP mode falls back to the legacy Go endpoint (for the
// browser demo and Vitest).
export async function prefillApproval(req: {
  threadId: string;
  templateId?: ApprovalTemplate;
}): Promise<PrefillApprovalResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.prefillApproval({
      threadId: req.threadId,
      templateId: req.templateId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<PrefillApprovalResponse>('/api/kapps/approvals/prefill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

// draftArtifact returns the prompt + sources used to draft an
// artifact section so the renderer can stream the body via
// /api/ai/stream — same single-inference contract as fetchThreadSummary.
export async function draftArtifact(req: {
  threadId: string;
  artifactType: ArtifactKind;
  section?: ArtifactSection;
}): Promise<DraftArtifactResponse> {
  const ipc = getElectronAI();
  if (ipc) {
    const messages = await fetchThreadMessages(req.threadId);
    if (messages.length === 0) {
      throw new Error('thread not found');
    }
    return ipc.draftArtifact({
      threadId: req.threadId,
      artifactType: req.artifactType,
      section: req.section,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        content: m.content,
      })),
    });
  }
  return apiFetch<DraftArtifactResponse>('/api/kapps/artifacts/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}
