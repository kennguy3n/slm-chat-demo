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
  it('streams /api/generate and concatenates the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonStream([
        JSON.stringify({ model: 'bonsai-8b', response: 'hello ', done: false }),
        JSON.stringify({ model: 'bonsai-8b', response: 'world', done: false }),
        JSON.stringify({ model: 'bonsai-8b', response: '', done: true, eval_count: 2 }),
      ]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const resp = await ad.run({ taskType: 'summarize', prompt: 'hi' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'bonsai-8b-q1_0', prompt: 'hi', stream: true, think: false });

    expect(resp.output).toBe('hello world');
    expect(resp.tokensUsed).toBe(2);
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
      ndjsonStream([JSON.stringify({ error: 'model not found' })]),
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
    // Match the adapter's new default alias (quant-suffixed).
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b-q1_0', size: 1_200 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-8b-q1_0');
    expect(s.ramUsageMB).toBeGreaterThan(0);
  });

  it('reports loaded=false when /api/ps lists only an unrelated model (adapter is configured with a different model)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-8b-alt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(false);
    expect(s.model).toBe('bonsai-8b-alt');
    expect(s.ramUsageMB).toBe(0);
  });

  it('matches even when the adapter is configured with a tagged model name (e.g. MODEL_NAME=bonsai-8b:q4_k_m)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-8b:q4_k_m',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-8b');
  });

  it('returns the configured quant label in every status() path (loaded, not-loaded, daemon-refused)', async () => {
    // Loaded path — quant comes from the constructor option, not hardcoded.
    const okFetch = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const loaded = await new OllamaAdapter({
      model: 'bonsai-8b',
      quant: 'q2_0',
      fetchImpl: okFetch as unknown as typeof fetch,
    }).status();
    expect(loaded.loaded).toBe(true);
    expect(loaded.quant).toBe('q2_0');

    // Not-loaded (daemon running but model missing) path.
    const emptyFetch = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));
    const notLoaded = await new OllamaAdapter({
      model: 'bonsai-8b',
      quant: 'q2_0',
      fetchImpl: emptyFetch as unknown as typeof fetch,
    }).status();
    expect(notLoaded.loaded).toBe(false);
    expect(notLoaded.sidecar).toBe('running');
    expect(notLoaded.quant).toBe('q2_0');

    // Daemon-refused path.
    const refusedFetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    const refused = await new OllamaAdapter({
      model: 'bonsai-8b',
      quant: 'q2_0',
      fetchImpl: refusedFetch as unknown as typeof fetch,
    }).status();
    expect(refused.loaded).toBe(false);
    expect(refused.sidecar).toBe('stopped');
    expect(refused.quant).toBe('q2_0');
  });

  it('defaults quant to q1_0 when the constructor option is omitted (Bonsai-8B-Q1_0 is the pinned artifact)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b-q1_0', size: 1_200 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.quant).toBe('q1_0');
  });

  it('warns when a Q1_0-configured adapter sees a resident-set size that looks like the wrong GGUF', async () => {
    // 16 GB resident with quant=q1_0 is the tell-tale sign of an alias
    // bound to an F16 GGUF. The adapter should log a warning but still
    // report loaded=true so the demo keeps running.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-8b-q1_0', size: 16 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-8b-q1_0',
      quant: 'q1_0',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.ramUsageMB).toBeGreaterThan(15_000);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/bonsai-8b-q1_0.*loaded at.*MB.*q1_0/);
    warnSpy.mockRestore();
  });

  it('matches the adapter model when an Ollama tag suffix is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'bonsai-8b-alt:latest', size: 1 * 1024 * 1024 * 1024 },
          { name: 'bonsai-8b:q4_k_m', size: 5 * 1024 * 1024 * 1024 },
        ],
      }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-8b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-8b:q4_k_m');
    expect(s.ramUsageMB).toBeGreaterThanOrEqual(5000);
  });
});
