import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapInference } from './bootstrap.js';

// makeFetch returns a fake fetch that handles the two endpoints the
// bootstrap probes: GET /api/tags (the ping) and POST /api/generate
// (the run endpoint, not exercised here). Tests inject different ping
// outcomes to drive the two bootstrap branches (ollama reachable vs.
// fallback to mock).
function makeFetch(opts: {
  pingOk: boolean;
  tagModels?: string[];
}): typeof fetch {
  const { pingOk, tagModels } = opts;
  return (async (url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (u.endsWith('/api/tags')) {
      if (!pingOk) {
        return new Response('boom', { status: 500 });
      }
      const body = JSON.stringify({
        models: (tagModels ?? []).map((name) => ({ name })),
      });
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
}

// The demo ships a single on-device model (Ternary-Bonsai-8B). The
// bootstrap instantiates one OllamaAdapter pointing at it when the
// daemon is reachable, otherwise it falls back to MockAdapter.
describe('bootstrapInference', () => {
  const ORIGINAL_MODEL_NAME = process.env.MODEL_NAME;
  beforeEach(() => {
    delete process.env.MODEL_NAME;
  });
  afterEach(() => {
    if (ORIGINAL_MODEL_NAME === undefined) delete process.env.MODEL_NAME;
    else process.env.MODEL_NAME = ORIGINAL_MODEL_NAME;
  });

  it('falls back to the mock adapter when ollama is unreachable', async () => {
    const stack = await bootstrapInference({ fetchImpl: makeFetch({ pingOk: false }) });
    expect(stack.source).toBe('mock');
    expect(stack.status).toBeUndefined();
    expect(stack.loader).toBeUndefined();
  });

  it('wires an ollama adapter when the daemon is reachable', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, tagModels: ['ternary-bonsai-8b'] }),
    });
    expect(stack.source).toBe('ollama');
    expect(stack.status).toBeDefined();
    expect(stack.loader).toBeDefined();
    expect(stack.defaultModel).toBe('ternary-bonsai-8b');

    const dec = stack.router.decide({ taskType: 'draft_artifact', prompt: 'p' });
    expect(dec.tier).toBe('local');
    expect(dec.model).toBe('ternary-bonsai-8b');
    expect(dec.reason.toLowerCase()).toContain('on-device');
  });

  it('honours a MODEL_NAME override', async () => {
    process.env.MODEL_NAME = 'custom-alias';
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, tagModels: ['custom-alias'] }),
    });
    expect(stack.defaultModel).toBe('custom-alias');

    const dec = stack.router.decide({ taskType: 'summarize', prompt: 'p' });
    expect(dec.model).toBe('custom-alias');
  });
});
