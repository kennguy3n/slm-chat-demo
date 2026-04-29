import { apiFetch } from './client';
import type { KnowledgeEntity } from '../types/knowledge';

// knowledgeApi mirrors the Phase 5 backend endpoints:
//
//   POST /api/channels/{channelId}/knowledge/extract — (re-)extract
//   GET  /api/channels/{channelId}/knowledge?kind=   — list (optionally filtered)
//   GET  /api/knowledge/{id}                         — single entity
//
// All extraction is done server-side via heuristic keyword matching
// over channel messages — see backend/internal/services/knowledge.go.

export async function extractKnowledge(
  channelId: string,
): Promise<KnowledgeEntity[]> {
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
