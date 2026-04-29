import { apiFetch } from './client';
import type { Channel, Domain, Workspace } from '../types/workspace';

// workspaceApi mirrors the Phase 3 navigation endpoints:
//
//   GET /api/workspaces                       — list workspaces (used by AppShell)
//   GET /api/workspaces/{id}/domains          — list domains in a workspace
//   GET /api/domains/{id}/channels            — list channels in a domain
//   GET /api/workspaces/{id}/channels         — list every channel in a workspace
//
// The workspace-list and workspace-channels helpers also live in
// `chatApi.ts` (legacy callers) — re-exporting from here keeps the new
// navigation hierarchy in one module without breaking existing imports.

export async function fetchWorkspacesList(): Promise<Workspace[]> {
  const data = await apiFetch<{ workspaces: Workspace[] }>('/api/workspaces');
  return data.workspaces;
}

export async function fetchWorkspaceDomains(workspaceId: string): Promise<Domain[]> {
  const data = await apiFetch<{ domains: Domain[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/domains`,
  );
  return data.domains;
}

export async function fetchDomainChannels(domainId: string): Promise<Channel[]> {
  const data = await apiFetch<{ channels: Channel[] }>(
    `/api/domains/${encodeURIComponent(domainId)}/channels`,
  );
  return data.channels;
}
