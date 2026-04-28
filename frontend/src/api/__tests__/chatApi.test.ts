import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchChannelMessages,
  fetchChats,
  fetchMe,
  fetchThreadMessages,
  fetchWorkspaceChannels,
  fetchWorkspaces,
} from '../chatApi';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('chatApi', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  it('fetchMe returns the user', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ id: 'user_alice', displayName: 'Alice', email: 'a@x', avatarColor: '#000' }),
    );
    const u = await fetchMe();
    expect(u.id).toBe('user_alice');
    expect(fetchSpy).toHaveBeenCalledWith('/api/users/me', expect.any(Object));
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-User-ID')).toBe('user_alice');
  });

  it('fetchChats appends ?context when provided', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ chats: [] }));
    await fetchChats('b2b');
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats?context=b2b', expect.any(Object));
  });

  it('fetchChats omits ?context when no context is given', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ chats: [] }));
    await fetchChats();
    expect(fetchSpy).toHaveBeenCalledWith('/api/chats', expect.any(Object));
  });

  it('fetchChannelMessages unwraps the messages array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        messages: [
          { id: 'm1', channelId: 'c1', senderId: 'u', content: 'hi', createdAt: '2026-04-28T08:00:00Z' },
        ],
      }),
    );
    const msgs = await fetchChannelMessages('c1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe('m1');
  });

  it('fetchThreadMessages calls the threads endpoint', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ messages: [] }));
    await fetchThreadMessages('t1');
    expect(fetchSpy).toHaveBeenCalledWith('/api/threads/t1/messages', expect.any(Object));
  });

  it('fetchWorkspaces unwraps and fetchWorkspaceChannels filters by context', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ workspaces: [{ id: 'ws_acme', name: 'Acme', context: 'b2b', domains: [] }] }))
      .mockResolvedValueOnce(jsonResponse({ channels: [] }));
    const wss = await fetchWorkspaces();
    expect(wss[0].id).toBe('ws_acme');
    await fetchWorkspaceChannels('ws_acme', 'b2b');
    expect(fetchSpy).toHaveBeenLastCalledWith('/api/workspaces/ws_acme/channels?context=b2b', expect.any(Object));
  });

  it('throws ApiError on non-2xx responses', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500, statusText: 'Server Error' }));
    await expect(fetchMe()).rejects.toThrow(/500/);
  });
});
