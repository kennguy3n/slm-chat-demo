import { apiFetch } from './client';
import type { KnowledgeEntity } from '../types/knowledge';
import { fetchChannelMessages } from './chatApi';

// knowledgeApi mirrors the Phase 5 backend endpoints:
//
//   POST /api/channels/{channelId}/knowledge/extract — (re-)extract
//   GET  /api/channels/{channelId}/knowledge?kind=   — list (optionally filtered)
//   GET  /api/knowledge/{id}                         — single entity
//
// The Phase 7 redesign added an LLM-driven extraction path on top of
// the regex heuristic: when running inside the Electron shell with
// Ollama reachable, `extractKnowledge` first asks Bonsai-1.7B to extract
// entities (`window.electronAI.extractKnowledge`). If the bridge is
// unavailable or the LLM call fails for any reason we fall back to
// the legacy server-side regex extractor at the URL above.

export async function extractKnowledge(
  channelId: string,
): Promise<KnowledgeEntity[]> {
  const bridge =
    typeof window !== 'undefined'
      ? (window as unknown as {
          electronAI?: {
            extractKnowledge?: (req: {
              channelId: string;
              messages: Array<{
                id: string;
                channelId: string;
                threadId?: string;
                senderId: string;
                content: string;
                createdAt?: string;
              }>;
            }) => Promise<{ entities: KnowledgeEntity[] }>;
          };
        }).electronAI
      : undefined;
  if (bridge && typeof bridge.extractKnowledge === 'function') {
    try {
      // Pull every message in the channel, including thread
      // replies — Phase 2's enriched seed (decisions, owners,
      // deadlines, risks) lives inside the threads, not on the
      // top-level messages. Top-level-only would feed the LLM
      // mostly thread-root sentences and miss the substance.
      const messages = await fetchChannelMessages(channelId, {
        includeReplies: true,
      });
      const out = await bridge.extractKnowledge({
        channelId,
        messages: messages.map((m) => ({
          id: m.id,
          channelId,
          threadId: m.threadId ?? m.id,
          senderId: m.senderId,
          content: m.content,
          createdAt: m.createdAt,
        })),
      });
      if (out.entities.length > 0) return out.entities;
      // If the LLM returned no rows (refusal / parser error) fall
      // through to the regex extractor so the panel still surfaces
      // *something* for the demo path.
    } catch {
      // Swallow and fall through to the HTTP path. The renderer
      // shouldn't crash just because Ollama is offline.
    }
  }
  const data = await apiFetch<{ entities: KnowledgeEntity[] }>(
    `/api/channels/${encodeURIComponent(channelId)}/knowledge/extract`,
    { method: 'POST' },
  );
  return data.entities;
}

export async function fetchKnowledge(
  channelId: string,
  kind?: string,
): Promise<KnowledgeEntity[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const data = await apiFetch<{ entities: KnowledgeEntity[] }>(
    `/api/channels/${encodeURIComponent(channelId)}/knowledge${qs}`,
  );
  return data.entities;
}

export async function fetchKnowledgeEntity(
  id: string,
): Promise<KnowledgeEntity> {
  const data = await apiFetch<{ entity: KnowledgeEntity }>(
    `/api/knowledge/${encodeURIComponent(id)}`,
  );
  return data.entity;
}
