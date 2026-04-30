import { describe, expect, it } from 'vitest';
import { InferenceRouter } from './router.js';
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

describe('InferenceRouter', () => {
  it('dispatches every request to the single local adapter', async () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, new MockAdapter());

    const resp = await router.run({ taskType: 'smart_reply', prompt: 'hi' });
    expect(local.lastReq?.prompt).toBe('hi');
    expect(resp.output).toBe('local-stub-out');

    const dec = router.lastDecision();
    expect(dec.tier).toBe('local');
    expect(dec.allow).toBe(true);
    expect(dec.reason.toLowerCase()).toContain('on-device');
  });

  it('dispatches reasoning-heavy tasks to the same local adapter', async () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, null);

    await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(local.lastReq?.prompt).toBe('spec');
    const dec = router.lastDecision();
    expect(dec.tier).toBe('local');
  });

  it('falls through to the mock adapter when no local adapter is wired', async () => {
    const router = new InferenceRouter(null, new MockAdapter());

    const resp = await router.run({ taskType: 'summarize', prompt: 'x' });
    expect(resp.onDevice).toBe(true);
    expect(router.lastDecision().reason.toLowerCase()).toContain('fallback');
  });

  it('respects an explicit model name override', async () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, null);

    await router.run({
      taskType: 'smart_reply',
      prompt: 'x',
      model: 'custom-model',
    });
    expect(local.lastReq?.model).toBe('custom-model');
  });

  it('streams via the local adapter', async () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, null);

    const chunks: StreamChunk[] = [];
    for await (const c of router.stream({ taskType: 'translate', prompt: 'hola' })) {
      chunks.push(c);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.delta).toBe('local-stub-chunk');
    expect(chunks[1]?.done).toBe(true);
  });

  it('rejects when no adapter is available at all', async () => {
    const router = new InferenceRouter(null, null);
    await expect(router.run({ taskType: 'summarize', prompt: 'x' })).rejects.toThrow(
      /no inference adapter/,
    );
  });

  it('respects defaultModel override in decide()', () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, null, {
      defaultModel: 'custom-local',
    });
    const dec = router.decide({ taskType: 'smart_reply', prompt: 'hi' });
    expect(dec.tier).toBe('local');
    expect(dec.model).toBe('custom-local');
  });

  it('passes the configured default through to the adapter on run()', async () => {
    const local = new StubAdapter('local-stub');
    const router = new InferenceRouter(local, null, {
      defaultModel: 'bonsai-8b-alt',
    });
    await router.run({ taskType: 'draft_artifact', prompt: 'spec' });
    expect(local.lastReq?.model).toBe('bonsai-8b-alt');
  });

  describe('confidential server tier', () => {
    it('refuses server-bound requests when no server adapter is wired', () => {
      const local = new StubAdapter('local-stub');
      const router = new InferenceRouter(local, null);
      expect(router.hasServer()).toBe(false);
      const dec = router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(false);
      expect(dec.reason).toMatch(/unreachable/i);
    });

    it('refuses server-bound requests when policy denies even if adapter is wired', () => {
      const local = new StubAdapter('local-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(local, null);
      router.attachServer(server, { policyAllows: false });
      expect(router.hasServer()).toBe(false);
      const dec = router.decide({ taskType: 'summarize', tier: 'server' });
      expect(dec.allow).toBe(false);
      expect(dec.reason).toMatch(/policy/i);
    });

    it('routes server-bound requests when adapter wired AND policy allows', async () => {
      const local = new StubAdapter('local-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(local, null, {
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
      const router = new InferenceRouter(null, null, {
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
      const router = new InferenceRouter(null, null, {
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
      const local = new StubAdapter('local-stub');
      const server = new StubAdapter('server-stub');
      const router = new InferenceRouter(local, null, {
        policyAllowsServer: true,
      });
      router.attachServer(server, { policyAllows: true });
      const dec = router.decide({ taskType: 'summarize', prompt: 'hello' });
      expect(dec.allow).toBe(true);
      expect(dec.tier).toBe('local');
    });
  });
});
