import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDomainChannels,
  fetchWorkspaceDomains,
  fetchWorkspacesList,
} from '../workspaceApi';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('workspaceApi', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('fetchWorkspacesList returns the unwrapped workspaces array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        workspaces: [
          { id: 'ws_acme', name: 'Acme', context: 'b2b', domains: [] },
        ],
      }),
    );
    const ws = await fetchWorkspacesList();
    expect(ws).toHaveLength(1);
    expect(ws[0].id).toBe('ws_acme');
    expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces', expect.any(Object));
  });

  it('fetchWorkspaceDomains hits /api/workspaces/{id}/domains', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        domains: [{ id: 'dom_eng', name: 'Engineering', workspaceId: 'ws_acme' }],
      }),
    );
    const domains = await fetchWorkspaceDomains('ws_acme');
    expect(domains[0].id).toBe('dom_eng');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws_acme/domains',
      expect.any(Object),
    );
  });

  it('fetchDomainChannels hits /api/domains/{id}/channels', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        channels: [
          {
            id: 'ch_general',
            name: 'general',
            kind: 'channel',
            context: 'b2b',
            workspaceId: 'ws_acme',
            domainId: 'dom_eng',
            memberIds: [],
          },
        ],
      }),
    );
    const channels = await fetchDomainChannels('dom_eng');
    expect(channels[0].id).toBe('ch_general');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/domains/dom_eng/channels',
      expect.any(Object),
    );
  });

  it('URL-encodes the path parameters', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ domains: [] }));
    await fetchWorkspaceDomains('ws/with slash');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws%2Fwith%20slash/domains',
      expect.any(Object),
    );
  });
});
