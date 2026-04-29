import { describe, expect, it } from 'vitest';
import { InferenceRouter, taskPreference } from './router.js';
import { MockAdapter } from './mock.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

class StubAdapter implements Adapter {
  public lastReq: InferenceRequest | null = null;
  constructor(private label: string) {}
  name() {
    return this.label;
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastReq = req;
    return {
      taskType: req.taskType,
      model: req.model || this.label,
      output: `${this.label}-out`,
      tokensUsed: 1,
      latencyMs: 1,
      onDevice: true,
    };
  }
  async *stream(req: InferenceRequest): AsyncGenerator<StreamChunk, void, void> {
    this.lastReq = req;
    yield { delta: `${this.label}-chunk`, done: false };
    yield { done: true };
  }
}

describe('taskPreference', () => {
  it('routes reasoning-heavy tasks (draft_artifact, prefill_approval, prefill_form) to e4b', () => {
    expect(taskPreference('draft_artifact')).toBe('e4b');
    expect(taskPreference('prefill_approval')).toBe('e4b');
    expect(taskPreference('prefill_form')).toBe('e4b');
  });

  it('routes the rest to e2b', () => {
    expect(taskPreference('summarize')).toBe('e2b');
    expect(taskPreference('translate')).toBe('e2b');
    expect(taskPreference('extract_tasks')).toBe('e2b');
    expect(taskPreference('smart_reply')).toBe('e2b');
  });
});

describe('InferenceRouter', () => {
  it('dispatches short tasks to E2B', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, new MockAdapter());

    const resp = await router.run({ taskType: 'smart_reply', prompt: 'hi' });
    expect(e2b.lastReq?.prompt).toBe('hi');
    expect(e4b.lastReq).toBeNull();
    expect(resp.output).toBe('e2b-stub-out');

    const dec = router.lastDecision();
    expect(dec.tier).toBe('e2b');
    expect(dec.allow).toBe(true);
    expect(dec.reason).toContain('E2B');
  });

  it('dispatches reasoning-heavy tasks to E4B', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null);

    await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(e4b.lastReq?.prompt).toBe('spec');
    const dec = router.lastDecision();
    expect(dec.tier).toBe('e4b');
    expect(dec.reason).toContain('E4B');
  });

  it('falls back from E4B to E2B when no E4B adapter exists', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const router = new InferenceRouter(e2b, null, null);

    await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(e2b.lastReq).not.toBeNull();
    const dec = router.lastDecision();
    expect(dec.tier).toBe('e2b');
    expect(dec.reason).toContain('fallback');
  });

  it('falls through to the mock adapter when no real adapter is wired', async () => {
    const router = new InferenceRouter(null, null, new MockAdapter());

    const resp = await router.run({ taskType: 'summarize', prompt: 'x' });
    expect(resp.onDevice).toBe(true);
    expect(router.lastDecision().reason.toLowerCase()).toContain('fallback');
  });

  it('respects an explicit model name override (E4B forced)', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null);

    await router.run({ taskType: 'smart_reply', prompt: 'x', model: 'ternary-bonsai-8b-e4b' });
    expect(e4b.lastReq?.model).toBe('ternary-bonsai-8b-e4b');
    expect(e2b.lastReq).toBeNull();
  });

  it('streams via the picked adapter', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const router = new InferenceRouter(e2b, null, null);

    const chunks: StreamChunk[] = [];
    for await (const c of router.stream({ taskType: 'translate', prompt: 'hola' })) {
      chunks.push(c);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.delta).toBe('e2b-stub-chunk');
    expect(chunks[1]?.done).toBe(true);
  });

  it('rejects when no adapter is available at all', async () => {
    const router = new InferenceRouter(null, null, null);
    await expect(router.run({ taskType: 'summarize', prompt: 'x' })).rejects.toThrow(
      /no inference adapter/,
    );
  });

  // Phase 3 (E4B routing completion) — tests for the hasE4B() flag and
  // for the aliased-E4B fallback path.

  it('hasE4B is true when a real E4B adapter is wired', () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null, { hasRealE4B: true });
    expect(router.hasE4B()).toBe(true);
  });

  it('hasE4B is false when the e4b slot is aliased to the e2b adapter', () => {
    const e2b = new StubAdapter('e2b-stub');
    const router = new InferenceRouter(e2b, e2b, null, { hasRealE4B: false });
    expect(router.hasE4B()).toBe(false);
  });

  it('reports E2B fallback in decide() when E4B is aliased to E2B', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const router = new InferenceRouter(e2b, e2b, null, { hasRealE4B: false });
    const dec = router.decide({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(dec.allow).toBe(true);
    expect(dec.tier).toBe('e2b');
    expect(dec.model).toBe('ternary-bonsai-8b');
    expect(dec.reason).toMatch(/fallback to E2B/i);
  });

  it('routes draft_artifact to the real E4B adapter when one is wired', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null, { hasRealE4B: true });
    const resp = await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(e4b.lastReq?.prompt).toBe('spec');
    expect(e2b.lastReq).toBeNull();
    expect(resp.model).toBe('ternary-bonsai-8b');
    const dec = router.lastDecision();
    expect(dec.tier).toBe('e4b');
    expect(dec.reason).toContain('E4B');
  });

  it('respects defaultE2BModel / defaultE4BModel overrides in decide()', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null, {
      hasRealE4B: true,
      defaultE2BModel: 'custom-e2b',
      defaultE4BModel: 'custom-e4b',
    });
    const e2bDec = router.decide({ taskType: 'smart_reply', prompt: 'hi' });
    expect(e2bDec.tier).toBe('e2b');
    expect(e2bDec.model).toBe('custom-e2b');
    const e4bDec = router.decide({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(e4bDec.tier).toBe('e4b');
    expect(e4bDec.model).toBe('custom-e4b');
  });

  it('passes the configured E4B default through to the adapter on run()', async () => {
    const e2b = new StubAdapter('e2b-stub');
    const e4b = new StubAdapter('e4b-stub');
    const router = new InferenceRouter(e2b, e4b, null, {
      hasRealE4B: true,
      defaultE2BModel: 'ternary-bonsai-8b',
      defaultE4BModel: 'ternary-bonsai-8b-alt',
    });
    await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(e4b.lastReq?.model).toBe('ternary-bonsai-8b-alt');
  });

  describe('confidential server tier', () => {
    it('refuses server-bound requests when no server adapter is wired', () => {
      const e2b = new StubAdapter('e2b-stub');
      const router = new InferenceRouter(e2b, e2b, null, { hasRealE4B: false });
      expect(router.hasServer()).toBe(false);
      const dec = router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(false);
      expect(dec.reason).toMatch(/unreachable/i);
    });

    it('refuses server-bound requests when policy denies even if adapter is wired', () => {
      const e2b = new StubAdapter('e2b-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(e2b, e2b, null, { hasRealE4B: false });
      router.attachServer(server, { policyAllows: false });
      expect(router.hasServer()).toBe(false);
      const dec = router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(false);
      expect(dec.reason).toMatch(/policy/i);
    });

    it('routes server-bound requests when adapter wired AND policy allows', async () => {
      const e2b = new StubAdapter('e2b-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(e2b, e2b, null, {
        hasRealE4B: false,
        policyAllowsServer: true,
        defaultServerModel: 'confidential-large',
      });
      router.attachServer(server, { policyAllows: true });
      expect(router.hasServer()).toBe(true);
      const dec = router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(true);
      expect(dec.tier).toBe('server');
      expect(dec.model).toBe('confidential-large');
      expect(dec.reason).toMatch(/confidential server/i);
    });

    it('tokenizes prompt before dispatch and detokenizes the response', async () => {
      const server = new StubAdapter('server-stub');
      // Override server stub to echo prompt → output so we can
      // observe what the adapter actually saw.
      server.run = async (req: InferenceRequest): Promise<InferenceResponse> => {
        server.lastReq = req;
        return {
          taskType: req.taskType,
          model: req.model || 'server',
          output: req.prompt ?? '',
          tokensUsed: 1,
          latencyMs: 1,
          onDevice: false,
        };
      };
      const router = new InferenceRouter(null, null, null, {
        hasRealE4B: false,
        policyAllowsServer: true,
      });
      router.attachServer(server, { policyAllows: true });

      const resp = await router.run({
        taskType: 'summarize',
        tier: 'server',
        prompt: 'Email me at alice@acme.com please',
      });

      // The wire (server.lastReq) should have contained the
      // tokenized form, NOT the original email.
      expect(server.lastReq?.prompt).not.toContain('alice@acme.com');
      expect(server.lastReq?.prompt).toMatch(/\[EMAIL_1\]/);
      // The response (which echoes the prompt) should have been
      // detokenized back to the original.
      expect(resp.output).toContain('alice@acme.com');
    });

    it('records an egress entry into the supplied tracker on every server-routed run', async () => {
      const { EgressTracker } = await import('./egress-tracker.js');
      const tracker = new EgressTracker();
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(null, null, null, {
        hasRealE4B: false,
        policyAllowsServer: true,
        egressTracker: tracker,
      });
      router.attachServer(server, { policyAllows: true });

      await router.run({
        taskType: 'summarize',
        tier: 'server',
        channelId: 'ch_engineering',
        prompt: 'no PII here',
      });
      const sum = tracker.summary();
      expect(sum.totalRequests).toBe(1);
      expect(sum.totalBytes).toBeGreaterThan(0);
      expect(sum.byChannel.ch_engineering.requests).toBe(1);
    });

    it('falls through to local tier when request does not request server', () => {
      const e2b = new StubAdapter('e2b-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(e2b, e2b, null, {
        hasRealE4B: false,
        policyAllowsServer: true,
      });
      router.attachServer(server, { policyAllows: true });
      const dec = router.decide({ taskType: 'summarize', prompt: 'hello' });
      expect(dec.allow).toBe(true);
      expect(dec.tier).toBe('e2b');
    });
  });
});
