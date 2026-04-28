import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamAITask } from '../streamAI';

// Build a Response whose body is a ReadableStream that emits the given
// SSE-encoded chunks one by one.
function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'text/event-stream', ...(init.headers ?? {}) },
  });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('streamAITask', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => fetchSpy.mockReset());

  it('parses SSE delta + done frames and reassembles deltas', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        'data: {"delta":"Hello","done":false}\n\n',
        'data: {"delta":", ","done":false}\n\n',
        'data: {"delta":"world!","done":false}\n\n',
        'data: {"done":true}\n\n',
      ]),
    );

    const deltas: string[] = [];
    const onDone = vi.fn();
    streamAITask({ taskType: 'summarize' }, { onChunk: (d) => deltas.push(d), onDone });

    // Wait until the stream has been fully drained.
    while (onDone.mock.calls.length === 0) {
      await flush();
    }

    expect(deltas.join('')).toBe('Hello, world!');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('POSTs to /api/ai/stream with the request body and X-User-ID header', async () => {
    fetchSpy.mockResolvedValueOnce(sseResponse(['data: {"done":true}\n\n']));
    const onDone = vi.fn();
    streamAITask({ taskType: 'summarize', prompt: 'hi' }, { onChunk: () => undefined, onDone });
    while (onDone.mock.calls.length === 0) await flush();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/ai/stream');
    expect((init as RequestInit).method).toBe('POST');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-User-ID')).toBe('user_alice');
    expect((init as RequestInit).body).toBe(JSON.stringify({ taskType: 'summarize', prompt: 'hi' }));
  });

  it('handles SSE frames split across multiple network reads', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse([
        'data: {"delta":"par',
        'tial",',
        '"done":false}\n\ndata: {"done":true}\n\n',
      ]),
    );
    const deltas: string[] = [];
    const onDone = vi.fn();
    streamAITask({ taskType: 'summarize' }, { onChunk: (d) => deltas.push(d), onDone });
    while (onDone.mock.calls.length === 0) await flush();
    expect(deltas).toEqual(['partial']);
  });

  it('returns an AbortController callers can use to cancel', async () => {
    fetchSpy.mockImplementation((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const onError = vi.fn();
    const ctrl = streamAITask(
      { taskType: 'summarize' },
      { onChunk: () => undefined, onError, onDone: () => undefined },
    );
    expect(ctrl).toBeInstanceOf(AbortController);
    ctrl.abort();
    await flush();
    // AbortError should not propagate to onError per implementation contract.
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error when the server returns a non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const onError = vi.fn();
    const onDone = vi.fn();
    streamAITask({ taskType: 'summarize' }, { onChunk: () => undefined, onError, onDone });
    // Give the microtask queue a chance to run.
    while (onError.mock.calls.length === 0) await flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('forwards server-side error frames via onError', async () => {
    fetchSpy.mockResolvedValueOnce(
      sseResponse(['data: {"error":"adapter exploded","done":true}\n\n']),
    );
    const onError = vi.fn();
    const onDone = vi.fn();
    streamAITask({ taskType: 'summarize' }, { onChunk: () => undefined, onError, onDone });
    while (onDone.mock.calls.length === 0) await flush();
    expect(onError).toHaveBeenCalled();
    expect((onError.mock.calls[0][0] as Error).message).toContain('adapter exploded');
  });
});
