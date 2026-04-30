import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapInference } from './bootstrap.js';

// makeFetch returns a fake fetch that handles the runtime probes the
// bootstrap performs:
//
//   - GET /health        — llama-server health check (port 8080)
//   - GET /api/tags      — Ollama ping + tag list (port 11434)
//   - POST /api/generate — Ollama run (not exercised here)
//
// Tests inject different ping outcomes to drive the three bootstrap
// branches (llama.cpp reachable, ollama reachable, both unreachable).
// `llamaCppOk` defaults to `false` so the original Ollama-focused
// tests keep their behaviour now that llama-server is the new
// preferred runtime.
function makeFetch(opts: {
  pingOk: boolean;
  tagModels?: string[];
  llamaCppOk?: boolean;
}): typeof fetch {
  const { pingOk, tagModels, llamaCppOk = false } = opts;
  return (async (url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (u.endsWith('/health')) {
      return new Response('{}', {
        status: llamaCppOk ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.endsWith('/props')) {
      return new Response(
        JSON.stringify({ default_generation_settings: { model: '/Bonsai-1.7B.gguf' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
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

// The demo ships a single on-device model (Bonsai-1.7B). The
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
      fetchImpl: makeFetch({ pingOk: true, tagModels: ['bonsai-1.7b'] }),
    });
    expect(stack.source).toBe('ollama');
    expect(stack.status).toBeDefined();
    expect(stack.loader).toBeDefined();
    // Default alias is quant-suffixed so a host with a bare
    // `bonsai-1.7b` alias pointing at the wrong GGUF cannot be picked
    // up silently. See bootstrap.ts.
    expect(stack.defaultModel).toBe('bonsai-1.7b');

    const dec = stack.router.decide({ taskType: 'draft_artifact', prompt: 'p' });
    expect(dec.tier).toBe('local');
    expect(dec.model).toBe('bonsai-1.7b');
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

  it('prefers llama-server over Ollama when /health is reachable', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, llamaCppOk: true, tagModels: ['bonsai-1.7b'] }),
    });
    expect(stack.source).toBe('llama.cpp');
    expect(stack.status).toBeDefined();
    expect(stack.loader).toBeDefined();
    // The router still uses the configured model alias for routing
    // decisions, regardless of which on-device runtime backs it.
    const dec = stack.router.decide({ taskType: 'summarize', prompt: 'p' });
    expect(dec.tier).toBe('local');
    expect(dec.model).toBe('bonsai-1.7b');
  });

  it('falls back from llama-server to Ollama when /health is down but /api/tags is up', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, llamaCppOk: false, tagModels: ['bonsai-1.7b'] }),
    });
    expect(stack.source).toBe('ollama');
  });

  describe('MODEL_QUANT override', () => {
    const ORIGINAL_QUANT = process.env.MODEL_QUANT;
    afterEach(() => {
      if (ORIGINAL_QUANT === undefined) delete process.env.MODEL_QUANT;
      else process.env.MODEL_QUANT = ORIGINAL_QUANT;
    });

    it('defaults defaultQuant to "default" when MODEL_QUANT is unset (Bonsai-1.7B ships as a single GGUF)', async () => {
      delete process.env.MODEL_QUANT;
      const stack = await bootstrapInference({
        fetchImpl: makeFetch({ pingOk: true, tagModels: ['bonsai-1.7b'] }),
      });
      expect(stack.defaultQuant).toBe('default');
    });

    it('honours MODEL_QUANT and propagates it to the Ollama adapter status()', async () => {
      process.env.MODEL_QUANT = 'q4_k_m';
      const stack = await bootstrapInference({
        fetchImpl: makeFetch({ pingOk: true, tagModels: ['bonsai-1.7b'] }),
      });
      expect(stack.defaultQuant).toBe('q4_k_m');
      // The status provider must report the configured quant, not a
      // hardcoded value — otherwise DeviceCapabilityPanel shows the
      // wrong label when an operator runs a non-default GGUF.
      expect(stack.status).toBeDefined();
      const s = await stack.status!.status();
      expect(s.quant).toBe('q4_k_m');
    });
  });

  describe('confidential server probe', () => {
    const ORIGINAL_POLICY = process.env.CONFIDENTIAL_SERVER_POLICY;
    afterEach(() => {
      if (ORIGINAL_POLICY === undefined) {
        delete process.env.CONFIDENTIAL_SERVER_POLICY;
      } else {
        process.env.CONFIDENTIAL_SERVER_POLICY = ORIGINAL_POLICY;
      }
    });

    it('does NOT probe the server when policy is not "allow"', async () => {
      delete process.env.CONFIDENTIAL_SERVER_POLICY;
      let pinged = false;
      const stack = await bootstrapInference({
        fetchImpl: makeFetch({ pingOk: false }),
        pingServer: async () => {
          pinged = true;
        },
      });
      expect(pinged).toBe(false);
      expect(stack.hasServer).toBe(false);
      expect(stack.router.hasServer()).toBe(false);
    });

    it('wires the server tier when policy=allow AND ping resolves', async () => {
      process.env.CONFIDENTIAL_SERVER_POLICY = 'allow';
      const stack = await bootstrapInference({
        fetchImpl: makeFetch({ pingOk: false }),
        pingServer: async () => {},
      });
      expect(stack.hasServer).toBe(true);
      expect(stack.router.hasServer()).toBe(true);
      const dec = stack.router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(true);
      expect(dec.tier).toBe('server');
    });

    it('leaves server unwired when policy=allow but ping rejects', async () => {
      process.env.CONFIDENTIAL_SERVER_POLICY = 'allow';
      const stack = await bootstrapInference({
        fetchImpl: makeFetch({ pingOk: false }),
        pingServer: async () => {
          throw new Error('refused');
        },
      });
      expect(stack.hasServer).toBe(false);
      expect(stack.router.hasServer()).toBe(false);
      const dec = stack.router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(false);
      expect(dec.reason).toMatch(/unreachable/i);
    });
  });
});
