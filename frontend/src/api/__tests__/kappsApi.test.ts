import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeTask,
  createTask,
  fetchLinkedObjects,
  fetchTasks,
  submitApprovalDecision,
  updateTask,
  updateTaskStatus,
} from '../kappsApi';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('kappsApi (Phase 3)', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('fetchLinkedObjects unwraps the cards array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        cards: [{ kind: 'task', threadId: 'thr_x' }],
      }),
    );
    const cards = await fetchLinkedObjects('thr_x');
    expect(cards).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/threads/thr_x/linked-objects',
      expect.any(Object),
    );
  });

  it('fetchTasks defaults to an empty list when the server omits the array', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const tasks = await fetchTasks('ch_general');
    expect(tasks).toEqual([]);
  });

  it('createTask POSTs the payload and returns the unwrapped task', async () => {
    const task = {
      id: 't1',
      channelId: 'ch_general',
      title: 'Wire E4B',
      status: 'open' as const,
      aiGenerated: false,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse({ task }, { status: 201 }));
    const result = await createTask({
      channelId: 'ch_general',
      title: 'Wire E4B',
    });
    expect(result).toEqual(task);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kapps/tasks');
    expect(init.method).toBe('POST');
  });

  it('updateTask sends a PATCH with the payload', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 't1',
          channelId: 'ch_general',
          title: 'New title',
          status: 'open',
          aiGenerated: false,
        },
      }),
    );
    await updateTask('t1', { title: 'New title', clearDueDate: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kapps/tasks/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse((init.body ?? '{}') as string)).toEqual({
      title: 'New title',
      clearDueDate: true,
    });
  });

  it('updateTaskStatus PATCHes /status with the new status', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 't1',
          channelId: 'ch_general',
          title: 'x',
          status: 'in_progress',
          aiGenerated: false,
        },
      }),
    );
    await updateTaskStatus('t1', 'in_progress', 'note');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kapps/tasks/t1/status');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse((init.body ?? '{}') as string)).toEqual({
      status: 'in_progress',
      note: 'note',
    });
  });

  it('closeTask resolves on a 204 No Content response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(closeTask('t1')).resolves.toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kapps/tasks/t1');
    expect(init.method).toBe('DELETE');
  });

  it('closeTask resolves on an empty 200 body', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(closeTask('t1')).resolves.toBeUndefined();
  });

  it('submitApprovalDecision POSTs to /decide and returns the approval', async () => {
    const approval = {
      id: 'appr_1',
      channelId: 'ch_vendor_management',
      templateId: 't',
      title: 'x',
      requester: 'u',
      approvers: [],
      fields: {},
      status: 'approved' as const,
      decisionLog: [],
      aiGenerated: false,
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse({ approval }));
    const out = await submitApprovalDecision('appr_1', 'approve', 'LGTM');
    expect(out.status).toBe('approved');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/kapps/approvals/appr_1/decide');
    expect(init.method).toBe('POST');
    expect(JSON.parse((init.body ?? '{}') as string)).toEqual({
      decision: 'approve',
      note: 'LGTM',
    });
  });
});
