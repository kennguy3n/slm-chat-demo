import { apiFetch } from './client';
import type { KAppCard } from '../types/kapps';
import type { KAppsExtractTasksResponse } from '../types/ai';

// Fetch the seeded KApp cards for the demo. Phase 0 returns the four sample
// cards from store.seedCards (a Task, an Approval, an Artifact, and an
// Event). An optional channelId scopes the response to a single channel.
export async function fetchKAppCards(channelId?: string): Promise<KAppCard[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ cards: KAppCard[] }>(`/api/kapps/cards${qs}`);
  return data.cards ?? [];
}

// extractKAppTasks runs B2B task extraction over a thread. Returns
// per-task title / owner / due-date / status with source-message
// provenance so the TaskExtractionCard can render TaskCards with
// linked-origin back-links.
export async function extractKAppTasks(req: {
  threadId: string;
}): Promise<KAppsExtractTasksResponse> {
  return apiFetch<KAppsExtractTasksResponse>('/api/kapps/tasks/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}
