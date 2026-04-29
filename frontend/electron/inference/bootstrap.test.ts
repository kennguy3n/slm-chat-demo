import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapInference } from './bootstrap.js';

// makeFetch returns a fake fetch that handles the two endpoints the
// bootstrap probes: GET /api/tags (used by ping + listModels) and
// POST /api/generate (the run endpoint, not exercised here). Tests
// inject different ping outcomes / tag lists to drive bootstrap
// branches.
function makeFetch(opts: {
  pingOk: boolean;
  tagModels?: string[];
}): typeof fetch {
  const { pingOk, tagModels } = opts;
  return (async (url: RequestInfo | URL) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (u.endsWith('/api/tags')) {
      if (!pingOk) {
        // ping failure path
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

describe('bootstrapInference', () => {
  it('falls back to mock adapters when ollama is unreachable', async () => {
    const stack = await bootstrapInference({ fetchImpl: makeFetch({ pingOk: false }) });
    expect(stack.source).toBe('mock');
    expect(stack.hasE4B).toBe(false);
    expect(stack.router.hasE4B()).toBe(false);
    expect(stack.status).toBeUndefined();
    expect(stack.e4bStatus).toBeUndefined();
  });

  it('wires a single ollama adapter for both tiers when only e2b is pulled', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, tagModels: ['gemma-4-e2b'] }),
    });
    expect(stack.source).toBe('ollama');
    expect(stack.hasE4B).toBe(false);
    expect(stack.router.hasE4B()).toBe(false);
    expect(stack.status).toBeDefined();
    expect(stack.e4bStatus).toBeUndefined();
    expect(stack.e4bLoader).toBeUndefined();

    // Decisions for E4B-preferred tasks must report the fallback so
    // the privacy strip can show the user that they ran on E2B.
    const dec = stack.router.decide({ taskType: 'draft_artifact', prompt: 'p' });
    expect(dec.tier).toBe('e2b');
    expect(dec.reason).toMatch(/fallback to E2B/i);
  });

  it('wires two ollama adapters when both e2b and e4b are pulled', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({
        pingOk: true,
        tagModels: ['gemma-4-e2b', 'gemma-4-e4b:latest'],
      }),
    });
    expect(stack.source).toBe('ollama');
    expect(stack.hasE4B).toBe(true);
    expect(stack.router.hasE4B()).toBe(true);
    expect(stack.status).toBeDefined();
    expect(stack.e4bStatus).toBeDefined();
    expect(stack.e4bLoader).toBeDefined();
    expect(stack.status).not.toBe(stack.e4bStatus);

    const dec = stack.router.decide({ taskType: 'draft_artifact', prompt: 'p' });
    expect(dec.tier).toBe('e4b');
    expect(dec.model).toBe('gemma-4-e4b');
    expect(dec.reason).toContain('E4B');
  });

  it('respects the listModels override (used by isolated unit tests)', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, tagModels: [] }),
      listModels: async () => ['gemma-4-e2b', 'gemma-4-e4b'],
    });
    expect(stack.hasE4B).toBe(true);
    expect(stack.router.hasE4B()).toBe(true);
  });

  it('treats listModels failure as "no E4B"', async () => {
    const stack = await bootstrapInference({
      fetchImpl: makeFetch({ pingOk: true, tagModels: [] }),
      listModels: async () => {
        throw new Error('boom');
      },
    });
    expect(stack.hasE4B).toBe(false);
    expect(stack.source).toBe('ollama');
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
