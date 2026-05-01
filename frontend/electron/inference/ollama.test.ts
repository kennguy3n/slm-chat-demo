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
        JSON.stringify({ model: 'bonsai-1.7b', response: 'hello ', done: false }),
        JSON.stringify({ model: 'bonsai-1.7b', response: 'world', done: false }),
        JSON.stringify({ model: 'bonsai-1.7b', response: '', done: true, eval_count: 2 }),
      ]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const resp = await ad.run({ taskType: 'summarize', prompt: 'hi' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'bonsai-1.7b', prompt: 'hi', stream: true, think: false });

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

  it('forwards req.temperature into options.temperature on /api/generate (translate pins to 0)', async () => {
    // `runTranslate` pins `temperature: 0` so the 1.7B model runs
    // greedy. Without this override the Ollama runtime would silently
    // run translate at the Modelfile default (typically 0.8) and the
    // model occasionally produces a free-form rewrite of the source
    // instead of a translation. Note `0` is a meaningful override —
    // the adapter checks for `undefined`, not falsiness.
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonStream([JSON.stringify({ response: 'ok', done: true })]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    for await (const _ of ad.stream({
      taskType: 'translate',
      prompt: 'Text: Hi',
      system: 'translate to vi',
      temperature: 0,
    })) {
      void _;
    }
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      options?: { temperature?: number };
    };
    expect(body.options?.temperature).toBe(0);
  });

  it('omits options.temperature when the caller does not specify one (other tasks inherit Modelfile default)', async () => {
    // Smart-reply / summarize / draft don't pin temperature, so the
    // adapter must not send an `options` object at all — we want
    // those tasks to inherit Ollama's Modelfile default rather than
    // being silently coerced to a hardcoded fallback.
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonStream([JSON.stringify({ response: 'ok', done: true })]),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    for await (const _ of ad.stream({ taskType: 'summarize', prompt: 'x' })) {
      void _;
    }
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      options?: unknown;
    };
    expect(body.options).toBeUndefined();
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
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 1_200 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-1.7b');
    expect(s.ramUsageMB).toBeGreaterThan(0);
  });

  it('reports loaded=false when /api/ps lists only an unrelated model (adapter is configured with a different model)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-1.7b-alt',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(false);
    expect(s.model).toBe('bonsai-1.7b-alt');
    expect(s.ramUsageMB).toBe(0);
  });

  it('matches even when the adapter is configured with a tagged model name (e.g. MODEL_NAME=bonsai-1.7b:q4_k_m)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-1.7b:q4_k_m',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-1.7b');
  });

  it('returns the configured quant label in every status() path (loaded, not-loaded, daemon-refused)', async () => {
    // Loaded path — quant comes from the constructor option, not hardcoded.
    const okFetch = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 5 * 1024 * 1024 * 1024 }] }),
    );
    const loaded = await new OllamaAdapter({
      model: 'bonsai-1.7b',
      quant: 'q4_K_M',
      fetchImpl: okFetch as unknown as typeof fetch,
    }).status();
    expect(loaded.loaded).toBe(true);
    expect(loaded.quant).toBe('q4_K_M');

    // Not-loaded (daemon running but model missing) path.
    const emptyFetch = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));
    const notLoaded = await new OllamaAdapter({
      model: 'bonsai-1.7b',
      quant: 'q4_K_M',
      fetchImpl: emptyFetch as unknown as typeof fetch,
    }).status();
    expect(notLoaded.loaded).toBe(false);
    expect(notLoaded.sidecar).toBe('running');
    expect(notLoaded.quant).toBe('q4_K_M');

    // Daemon-refused path.
    const refusedFetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    const refused = await new OllamaAdapter({
      model: 'bonsai-1.7b',
      quant: 'q4_K_M',
      fetchImpl: refusedFetch as unknown as typeof fetch,
    }).status();
    expect(refused.loaded).toBe(false);
    expect(refused.sidecar).toBe('stopped');
    expect(refused.quant).toBe('q4_K_M');
  });

  it('defaults quant to "default" when the constructor option is omitted (Bonsai-1.7B ships as a single GGUF)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 1_200 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const s = await ad.status();
    expect(s.quant).toBe('default');
  });

  it('warns when a Bonsai-1.7B-configured adapter sees a resident-set size that looks like the wrong GGUF', async () => {
    // 16 GB resident is the tell-tale sign of an alias bound to a
    // mid-sized GGUF instead of the ~1 GB Bonsai-1.7B target. The
    // adapter should log a warning but still report loaded=true so
    // the demo keeps running.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'bonsai-1.7b', size: 16 * 1024 * 1024 * 1024 }] }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-1.7b',
      quant: 'default',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.ramUsageMB).toBeGreaterThan(15_000);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0]).toMatch(/bonsai-1.7b.*loaded at.*MB/i);
    expect(warnSpy.mock.calls[0]![0]).toMatch(/Bonsai-1\.7B/);
    warnSpy.mockRestore();
  });

  it('matches the adapter model when an Ollama tag suffix is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        models: [
          { name: 'bonsai-1.7b-alt:latest', size: 1 * 1024 * 1024 * 1024 },
          { name: 'bonsai-1.7b:q4_k_m', size: 5 * 1024 * 1024 * 1024 },
        ],
      }),
    );
    const ad = new OllamaAdapter({
      model: 'bonsai-1.7b',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const s = await ad.status();
    expect(s.loaded).toBe(true);
    expect(s.model).toBe('bonsai-1.7b:q4_k_m');
    expect(s.ramUsageMB).toBeGreaterThanOrEqual(5000);
  });
});
