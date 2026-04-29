import { describe, expect, it, vi } from 'vitest';
import { OllamaAdapter } from './ollama.js';
import type { StreamChunk } from './adapter.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function ndjsonStream(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(enc.encode(line + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('OllamaAdapter.run', () => {
  it('POSTs to /api/generate with stream=false and parses the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: 'ternary-bonsai-8b',
        response: 'hello world',
        done: true,
        eval_count: 5,
        total_duration: 1_000_000,
      }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const resp = await ad.run({ taskType: 'summarize', prompt: 'hi' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'ternary-bonsai-8b', prompt: 'hi', stream: false });

    expect(resp.output).toBe('hello world');
    expect(resp.tokensUsed).toBe(5);
    expect(resp.latencyMs).toBe(1);
    expect(resp.onDevice).toBe(true);
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('boom', { status: 503 }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(ad.run({ taskType: 'summarize', prompt: 'hi' })).rejects.toThrow(/HTTP 503/);
  });

  it('surfaces inline error frames', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'model not found' }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(ad.run({ taskType: 'summarize', prompt: 'hi' })).rejects.toThrow(/model not found/);
  });
});

describe('OllamaAdapter.stream', () => {
  it('parses an NDJSON stream into delta + done chunks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonStream([
        JSON.stringify({ response: 'hel', done: false }),
        JSON.stringify({ response: 'lo', done: false }),
        JSON.stringify({ response: '', done: true }),
      ]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const chunks: StreamChunk[] = [];
    for await (const c of ad.stream({ taskType: 'summarize', prompt: 'x' })) {
      chunks.push(c);
    }
    const deltas = chunks.map((c) => c.delta).filter((d): d is string => Boolean(d));
    expect(deltas).toEqual(['hel', 'lo']);
    expect(chunks[chunks.length - 1]?.done).toBe(true);
  });

  it('emits a single error chunk and stops on inline error frames', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonStream([JSON.stringify({ error: 'model offline' })]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const chunks: StreamChunk[] = [];
    for await (const c of ad.stream({ taskType: 'summarize', prompt: 'x' })) {
      chunks.push(c);
    }
    expect(chunks).toEqual([{ error: 'model offline', done: true }]);
  });
});

describe('OllamaAdapter.status', () => {
  it('reports loaded=false when the daemon refuses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.loaded).toBe(false);
    expect(s.sidecar).toBe('stopped');
  });

  it('reports loaded=true when /api/ps returns a model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'ternary-bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('ternary-bonsai-8b');
    expect(s.ramUsageMB).toBeGreaterThan(0);
  });

  it('reports loaded=false when /api/ps lists only an unrelated model (adapter is configured with a different model)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'ternary-bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'ternary-bonsai-8b-alt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(false);
    expect(s.model).toBe('ternary-bonsai-8b-alt');
    expect(s.ramUsageMB).toBe(0);
  });

  it('matches even when the adapter is configured with a tagged model name (e.g. MODEL_NAME=ternary-bonsai-8b:q4_k_m)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'ternary-bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'ternary-bonsai-8b:q4_k_m',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('ternary-bonsai-8b');
  });

  it('matches the adapter model when an Ollama tag suffix is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'ternary-bonsai-8b-alt:latest', size: 1 * 1024 * 1024 * 1024 },
          { name: 'ternary-bonsai-8b:q4_k_m', size: 5 * 1024 * 1024 * 1024 },
        ],
      }),
    );
    const ad = new OllamaAdapter({
      model: 'ternary-bonsai-8b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('ternary-bonsai-8b:q4_k_m');
    expect(s.ramUsageMB).toBeGreaterThanOrEqual(5000);
  });
});
