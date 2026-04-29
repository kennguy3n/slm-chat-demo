import { apiFetch } from './client';
import type { AuditEntry, AuditObjectKind } from '../types/audit';

// fetchAuditLog returns the audit entries for a single KApp object.
// Pass an empty objectId to fetch by kind only; pass both empty to
// fetch every entry (Phase 3 admin tool — not currently surfaced).
export async function fetchAuditLog(
  objectId: string,
  objectKind?: AuditObjectKind,
): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (objectId) params.set('objectId', objectId);
  if (objectKind) params.set('objectKind', objectKind);
  const qs = params.toString();
  const path = qs ? `/api/audit?${qs}` : '/api/audit';
  const data = await apiFetch<{ entries: AuditEntry[] }>(path);
  return data.entries ?? [];
}

// fetchChannelAuditLog returns the audit entries for every KApp object
// in a channel — used by per-channel audit views.
export async function fetchChannelAuditLog(channelId: string): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  params.set('channelId', channelId);
  const data = await apiFetch<{ entries: AuditEntry[] }>(`/api/audit?${params.toString()}`);
  return data.entries ?? [];
}
