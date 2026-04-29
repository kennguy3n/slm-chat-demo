import { apiBase, DEMO_USER_ID, apiFetch } from './client';
import type { AuditEntry, AuditObjectKind } from '../types/audit';

export type AuditExportFormat = 'json' | 'csv';

export interface AuditExportFilters {
  objectId?: string;
  objectKind?: AuditObjectKind;
  channelId?: string;
}

// exportAuditLog downloads the audit log as JSON or CSV (Phase 6).
// Returns an object URL (`URL.createObjectURL`) the caller can attach
// to a hidden <a download> to trigger the browser save dialog.
export async function exportAuditLog(
  format: AuditExportFormat,
  filters: AuditExportFilters = {},
): Promise<string> {
  const params = new URLSearchParams();
  params.set('format', format);
  if (filters.objectId) params.set('objectId', filters.objectId);
  if (filters.objectKind) params.set('objectKind', filters.objectKind);
  if (filters.channelId) params.set('channelId', filters.channelId);

  const res = await fetch(`${apiBase}/api/audit/export?${params.toString()}`, {
    headers: {
      Accept: format === 'csv' ? 'text/csv' : 'application/json',
      'X-User-ID': DEMO_USER_ID,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`audit export failed: ${res.status} ${text}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

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
