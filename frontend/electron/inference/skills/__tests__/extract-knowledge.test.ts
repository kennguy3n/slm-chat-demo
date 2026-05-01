// Phase 7 — `runExtractKnowledge` skill tests. The skill calls the
// inference router with a prompt-library prompt and projects the
// parsed rows onto the existing KnowledgeEntity shape so the
// renderer can drop them straight into its state.

import { describe, it, expect } from 'vitest';
import {
  runExtractKnowledge,
  matchSourceMessage,
  type ExtractKnowledgeMessage,
} from '../extract-knowledge.js';
import { InferenceRouter } from '../../router.js';
import type { Adapter, InferenceRequest, InferenceResponse, StreamChunk, TaskType } from '../../adapter.js';

class StubAdapter implements Adapter {
  constructor(private readonly outputs: Partial<Record<TaskType, string>>) {}
  name() {
    return 'stub';
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    const out = this.outputs[req.taskType] ?? '';
    return {
      taskType: req.taskType,
      model: req.model || 'bonsai-1.7b',
      output: out,
      tokensUsed: Math.max(1, Math.floor(out.length / 4)),
      latencyMs: 0,
      onDevice: true,
    };
  }
  async *stream(req: InferenceRequest): AsyncGenerator<StreamChunk, void, void> {
    const r = await this.run(req);
    yield { delta: r.output, done: false };
    yield { done: true };
  }
}

const MESSAGES: ExtractKnowledgeMessage[] = [
  {
    id: 'm1',
    channelId: 'c',
    senderId: 'alice',
    content: 'Need to lock vendor pricing for Q3 logging contract.',
    createdAt: '2025-04-01T10:00:00Z',
  },
  {
    id: 'm2',
    channelId: 'c',
    senderId: 'dave',
    content: 'Acme Logs $42k/yr — SOC 2 Type II in place; single region us-east-1.',
    createdAt: '2025-04-01T10:05:00Z',
  },
  {
    id: 'm3',
    channelId: 'c',
    senderId: 'eve',
    content: 'Decision: go with Acme Logs at $42k/yr. Risk: medium — single region.',
    createdAt: '2025-04-01T10:10:00Z',
  },
];

describe('runExtractKnowledge', () => {
  it('returns an empty result when given no messages', async () => {
    const adapter = new StubAdapter({});
    const router = new InferenceRouter(adapter, adapter);
    const out = await runExtractKnowledge(router, { channelId: 'c', messages: [] });
    expect(out.entities).toEqual([]);
    expect(out.channelId).toBe('c');
  });

  it('parses LLM output and maps each row to a KnowledgeEntity', async () => {
    const stub = new StubAdapter({
      extract_tasks: [
        'decision | Go with Acme Logs at $42k/yr | eve | ',
        'risk | Single-region us-east-1 | | ',
        'deadline | Decision needed by Tuesday | | next Tuesday',
      ].join('\n'),
    });
    const router = new InferenceRouter(stub, stub);
    const out = await runExtractKnowledge(router, {
      channelId: 'ch_vendor_management',
      messages: MESSAGES,
    });
    expect(out.entities).toHaveLength(3);
    expect(out.source).toBe('ollama');

    const decision = out.entities.find((e) => e.kind === 'decision');
    expect(decision).toBeTruthy();
    expect(decision!.actors).toEqual(['eve']);
    // Best-effort source attribution should land on the message
    // that mentions "Acme Logs" + "$42k" — i.e. m3 (the decision).
    expect(['m2', 'm3']).toContain(decision!.sourceMessageId);
    expect(decision!.title).toMatch(/Decision/);
    expect(decision!.confidence).toBeGreaterThan(0);

    const deadline = out.entities.find((e) => e.kind === 'deadline');
    expect(deadline?.actors).toEqual([]);
    // dueDate from the parsed row must flow through to the entity
    // so the renderer can display it (KnowledgeGraphPanel renders
    // `entity.dueDate` for `deadline` entities).
    expect(deadline?.dueDate).toBe('next Tuesday');
    // Rows without a dueDate column should not gain one.
    const decisionEntity = out.entities.find((e) => e.kind === 'decision');
    expect(decisionEntity?.dueDate).toBeUndefined();
  });

  it("reports source: 'mock' when the router falls back to MockAdapter", async () => {
    // Two-arg `InferenceRouter(local, fallback)` always picks the local
    // adapter when supplied. To exercise the fallback path we omit the
    // local adapter so the router routes through the MockAdapter and
    // its decision reason contains the literal word `fallback`.
    const stub = new StubAdapter({
      extract_tasks: 'decision | Use Acme Logs | eve | ',
    });
    const router = new InferenceRouter(null, stub);
    const out = await runExtractKnowledge(router, {
      channelId: 'c',
      messages: MESSAGES,
    });
    expect(out.source).toBe('mock');
    expect(out.entities[0]?.source).toBe('mock');
  });

  it('honours the INSUFFICIENT refusal contract', async () => {
    const stub = new StubAdapter({
      extract_tasks: 'INSUFFICIENT: channel has nothing actionable yet.',
    });
    const router = new InferenceRouter(stub, stub);
    const out = await runExtractKnowledge(router, {
      channelId: 'c',
      messages: MESSAGES,
    });
    expect(out.entities).toEqual([]);
  });
});

describe('matchSourceMessage', () => {
  it('matches the message that shares the most distinct keywords', () => {
    const id = matchSourceMessage(
      {
        kind: 'decision',
        description: 'Go with Acme Logs at $42k/yr',
      },
      MESSAGES,
    );
    expect(['m2', 'm3']).toContain(id);
  });

  it('falls back to the first message when nothing overlaps', () => {
    const id = matchSourceMessage(
      { kind: 'risk', description: 'Quantum cosmic neutrinos' },
      MESSAGES,
    );
    expect(id).toBe('m1');
  });
});
