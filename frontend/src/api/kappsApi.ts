import { apiFetch } from './client';
import type { KAppCard } from '../types/kapps';

// Fetch the seeded KApp cards for the demo. Phase 0 returns the four sample
// cards from store.seedCards (a Task, an Approval, an Artifact, and an
// Event). An optional channelId scopes the response to a single channel.
export async function fetchKAppCards(channelId?: string): Promise<KAppCard[]> {
  const qs = channelId ? `?channelId=${encodeURIComponent(channelId)}` : '';
  const data = await apiFetch<{ cards: KAppCard[] }>(`/api/kapps/cards${qs}`);
  return data.cards ?? [];
}
