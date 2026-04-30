// Tests for the LlamaCppAdapter implementation. Uses the same
// fetchImpl-injection pattern as `ollama.test.ts` so we exercise the
// fetch-stream path (which honours `signal`) instead of the
// node:http path (which is exercised end-to-end against a real
// llama-server in manual QA).

import { describe, expect, it, vi } from 'vitest';
import { LlamaCppAdapter } from '../llamacpp.js';

// Build a streaming Response whose body emits the given SSE frames
// one at a time. Each frame is wrapped as `data: <json>\n\n`.
function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('LlamaCppAdapter', () => {
  it('reports the canonical adapter name', () => {
    expect(new LlamaCppAdapter().name()).toBe('llama.cpp');
  });

  it('defaults the base URL to localhost:8080 and the model to bonsai-1.7b', () => {
    const adapter = new LlamaCppAdapter();
    expect(adapter.baseURL).toBe('http://localhost:8080');
    expect(adapter.model).toBe('bonsai-1.7b');
  });

  it('honours custom baseURL, model, and quant', () => {
    const adapter = new LlamaCppAdapter({
      baseURL: 'http://example.com:9090/',
      model: 'custom-model',
      quant: 'q4_k_m',
    });
    expect(adapter.baseURL).toBe('http://example.com:9090');
    expect(adapter.model).toBe('custom-model');
    expect(adapter.quant).toBe('q4_k_m');
  });

  it('streams SSE frames from /completion as deltas', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ content: 'Hello', stop: false }),
        JSON.stringify({ content: ', world', stop: false }),
        JSON.stringify({ content: '!', stop: true }),
      ]),
    ) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    const chunks: string[] = [];
    let sawDone = false;
    for await (const chunk of adapter.stream({
      taskType: 'smart_reply',
      prompt: 'hi',
    })) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.done) sawDone = true;
    }
    expect(chunks.join('')).toBe('Hello, world!');
    expect(sawDone).toBe(true);
  });

  it('aggregates streamed deltas into a single run() output and reports onDevice', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ content: 'Privacy ', stop: false }),
        JSON.stringify({ content: 'first.', stop: true }),
      ]),
    ) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    const resp = await adapter.run({
      taskType: 'smart_reply',
      prompt: 'hi',
    });
    expect(resp.output).toBe('Privacy first.');
    expect(resp.tokensUsed).toBeGreaterThan(0);
    expect(resp.onDevice).toBe(true);
    expect(resp.taskType).toBe('smart_reply');
  });

  it('targets POST /completion with stream=true and the configured sampling params', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([JSON.stringify({ content: 'ok', stop: true })]),
    ) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    await adapter.run({
      taskType: 'smart_reply',
      prompt: 'reply',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [url, init] = calls[0]! as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/completion');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.prompt).toBe('reply');
    expect(body.stream).toBe(true);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(typeof body.n_predict).toBe('number');
  });

  it('throws when the server returns a non-2xx response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 500 }),
    ) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    await expect(
      adapter.run({ taskType: 'smart_reply', prompt: 'hi' }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('surfaces server-side error frames as a single error chunk', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ error: { message: 'context exceeded' } }),
      ]),
    ) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    await expect(
      adapter.run({ taskType: 'smart_reply', prompt: 'hi' }),
    ).rejects.toThrow(/context exceeded/);
  });

  it('cancels the in-flight stream when the AbortSignal fires', async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      // Simulate the underlying fetch rejecting when the signal is aborted.
      if (init?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      return sseResponse([JSON.stringify({ content: 'ok', stop: true })]);
    }) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    const ac = new AbortController();
    ac.abort();
    await expect(
      adapter.run({ taskType: 'smart_reply', prompt: 'hi' }, ac.signal),
    ).rejects.toThrow();
  });

  it('ping() resolves on /health 200 and rejects on non-2xx', async () => {
    const ok = vi.fn(
      async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as unknown as typeof fetch;
    await expect(new LlamaCppAdapter({ fetchImpl: ok }).ping()).resolves.toBeUndefined();

    const bad = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(new LlamaCppAdapter({ fetchImpl: bad }).ping()).rejects.toThrow(/HTTP 503/);
  });

  it('status() reports loaded=true and resolves the model from /props when reachable', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (u.endsWith('/health')) {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.endsWith('/props')) {
        return new Response(
          JSON.stringify({
            default_generation_settings: { model: '/models/Bonsai-1.7B.gguf' },
            total_slots: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    const status = await adapter.status();
    expect(status.loaded).toBe(true);
    expect(status.sidecar).toBe('running');
    expect(status.model).toBe('Bonsai-1.7B.gguf');
  });

  it('status() reports loaded=false when /health is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const adapter = new LlamaCppAdapter({ fetchImpl });
    const status = await adapter.status();
    expect(status.loaded).toBe(false);
    expect(status.sidecar).toBe('stopped');
  });

  it('load() and unload() are no-ops because llama-server loads the model at startup', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch;
    const adapter = new LlamaCppAdapter({ fetchImpl });
    await expect(adapter.load('whatever')).resolves.toBeUndefined();
    await expect(adapter.unload('whatever')).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
