import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetSkillsForTesting,
  GuardrailError,
  INSUFFICIENT_RULE,
  assemblePrompt,
  detectInsufficient,
  getSkill,
  listSkills,
  registerSkill,
  runPreInferenceGuardrails,
  runPostInferenceGuardrails,
  runSkill,
  type SkillDefinition,
  type SkillParseResult,
  type SkillResult,
} from '../skill-framework.js';
import { InferenceRouter } from '../router.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from '../adapter.js';

class CannedAdapter implements Adapter {
  public lastReq: InferenceRequest | null = null;
  constructor(public output: string, public modelLabel = 'gemma-4-e2b') {}
  name() {
    return 'canned';
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastReq = req;
    return {
      taskType: req.taskType,
      model: req.model || this.modelLabel,
      output: this.output,
      tokensUsed: 1,
      latencyMs: 1,
      onDevice: true,
    };
  }
  async *stream(): AsyncGenerator<StreamChunk, void, void> {
    yield { done: true };
  }
}

interface DemoInput {
  destination?: string;
  duration?: number;
  messages?: { id: string; content: string }[];
}

interface DemoOutput {
  destination: string;
  notes: string[];
}

function makeDemoSkill(
  overrides: Partial<SkillDefinition<DemoInput, DemoOutput>> = {},
): SkillDefinition<DemoInput, DemoOutput> {
  const base: SkillDefinition<DemoInput, DemoOutput> = {
    id: 'demo-skill',
    name: 'Demo Skill',
    description: 'demo',
    metaPrompt: 'You are a demo skill. [USER_CONTEXT_SLOT]',
    steps: [
      { order: 1, action: 'build_prompt', description: 'Build prompt' },
      { order: 2, action: 'run_inference', description: 'Run' },
      { order: 3, action: 'parse_output', description: 'Parse' },
    ],
    tools: [],
    guardrails: {
      requireMinMessages: 1,
      requireFields: ['destination'],
      refusalTemplate: "I can't {action} because {reason}.",
      requireSourceAttribution: true,
    },
    responseTemplate: {
      format: 'card',
      requiredFields: ['destination', 'notes'],
    },
    preferredTier: 'e2b',
    taskType: 'extract_tasks',
    parser(raw, input) {
      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        return {
          result: { destination: input.destination ?? '', notes: [] },
          sources: [],
          parseFailed: true,
          confidence: 0,
        };
      }
      const sources = (input.messages ?? []).map((m) => ({
        kind: 'message' as const,
        id: m.id,
      }));
      return {
        result: { destination: input.destination ?? '', notes: lines },
        sources,
        confidence: 0.9,
      };
    },
    buildInputPrompt(input) {
      let s = `Destination: ${input.destination ?? '?'}\nDuration: ${input.duration ?? '?'} days\n`;
      if (input.messages && input.messages.length > 0) {
        s += 'Messages:\n';
        for (const m of input.messages) s += `- ${m.content}\n`;
      }
      return s;
    },
  };
  return { ...base, ...overrides };
}

afterEach(() => {
  __resetSkillsForTesting();
});

describe('skill registry', () => {
  it('registers and retrieves a skill by id', () => {
    const def = makeDemoSkill();
    registerSkill(def);
    expect(getSkill('demo-skill')?.name).toBe('Demo Skill');
    expect(listSkills().map((s) => s.id)).toContain('demo-skill');
  });

  it('list returns an empty array when nothing is registered', () => {
    expect(listSkills()).toEqual([]);
  });
});

describe('assemblePrompt', () => {
  it('always prepends the INSUFFICIENT rule', () => {
    const def = makeDemoSkill();
    const out = assemblePrompt(def, {
      input: { destination: 'Tokyo', duration: 5, messages: [{ id: 'm1', content: 'hi' }] },
    });
    expect(out.startsWith(INSUFFICIENT_RULE)).toBe(true);
  });

  it('substitutes the [USER_CONTEXT_SLOT] placeholder', () => {
    const def = makeDemoSkill();
    const out = assemblePrompt(def, {
      input: { destination: 'Tokyo', duration: 5, messages: [{ id: 'm1', content: 'hi' }] },
      userContext: 'Family: Smiths, 4 members in Austin TX',
    });
    expect(out).toContain('Family: Smiths');
    expect(out).not.toContain('[USER_CONTEXT_SLOT]');
  });

  it('appends user context when no placeholder is present', () => {
    const def = makeDemoSkill({ metaPrompt: 'Plain meta prompt with no slot.' });
    const out = assemblePrompt(def, {
      input: { destination: 'Tokyo', duration: 5, messages: [{ id: 'm1', content: 'hi' }] },
      userContext: 'Family: Smiths',
    });
    expect(out).toContain('User context:\nFamily: Smiths');
  });
});

describe('runPreInferenceGuardrails', () => {
  it('passes when all required fields and message counts are met', () => {
    const def = makeDemoSkill();
    expect(() =>
      runPreInferenceGuardrails(
        def,
        { destination: 'Tokyo', duration: 5 },
        { messageCount: 3 },
      ),
    ).not.toThrow();
  });

  it('throws when a required field is missing or blank', () => {
    const def = makeDemoSkill();
    expect(() =>
      runPreInferenceGuardrails(
        def,
        { destination: '', duration: 5 },
        { messageCount: 3 },
      ),
    ).toThrow(GuardrailError);
  });

  it('throws when fewer than requireMinMessages are present', () => {
    const def = makeDemoSkill();
    expect(() =>
      runPreInferenceGuardrails(
        def,
        { destination: 'Tokyo', duration: 5 },
        { messageCount: 0 },
      ),
    ).toThrow(/at least 1 message/);
  });
});

describe('detectInsufficient', () => {
  it('detects a canonical INSUFFICIENT prefix', () => {
    expect(detectInsufficient('INSUFFICIENT: no destination given')).toBe(
      'no destination given',
    );
  });

  it('is case-insensitive and ignores leading whitespace / quotes', () => {
    expect(detectInsufficient('  > "insufficient: no chat context')).toBe(
      'no chat context',
    );
  });

  it('returns null when the model produced a real answer', () => {
    expect(detectInsufficient('Day 1: Visit the park.')).toBeNull();
  });

  it('returns null when INSUFFICIENT appears mid-response', () => {
    expect(
      detectInsufficient('Day 1: Visit\nNote: INSUFFICIENT data for day 2'),
    ).toBeNull();
  });

  it('still detects INSUFFICIENT when the model adds extra explanatory lines', () => {
    expect(
      detectInsufficient(
        'INSUFFICIENT: no destination supplied\nThe user did not provide a city or trip dates.',
      ),
    ).toBe('no destination supplied');
  });
});

describe('runPostInferenceGuardrails', () => {
  it('rejects results that report no source attribution', () => {
    const def = makeDemoSkill();
    const parsed: SkillParseResult<DemoOutput> = {
      result: { destination: 'Tokyo', notes: ['ok'] },
      sources: [],
      confidence: 0.9,
    };
    expect(() => runPostInferenceGuardrails(def, 'ok', parsed)).toThrow(
      /source attribution/,
    );
  });

  it('rejects results below the confidence threshold', () => {
    const def = makeDemoSkill({
      guardrails: {
        ...makeDemoSkill().guardrails,
        confidenceThreshold: 0.8,
      },
    });
    const parsed: SkillParseResult<DemoOutput> = {
      result: { destination: 'Tokyo', notes: ['ok'] },
      sources: [{ kind: 'message', id: 'm1' }],
      confidence: 0.5,
    };
    expect(() => runPostInferenceGuardrails(def, 'ok', parsed)).toThrow(
      /confidence/,
    );
  });

  it('rejects raw output matching a prohibited pattern', () => {
    const def = makeDemoSkill({
      guardrails: {
        ...makeDemoSkill().guardrails,
        prohibitedPatterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'], // SSN
      },
    });
    const parsed: SkillParseResult<DemoOutput> = {
      result: { destination: 'Tokyo', notes: ['ok'] },
      sources: [{ kind: 'message', id: 'm1' }],
      confidence: 1,
    };
    expect(() =>
      runPostInferenceGuardrails(def, 'My SSN is 123-45-6789', parsed),
    ).toThrow(/prohibited/);
  });

  it('promotes a parser-reported parseFailed to a refusal', () => {
    const def = makeDemoSkill();
    const parsed: SkillParseResult<DemoOutput> = {
      result: { destination: '', notes: [] },
      sources: [],
      parseFailed: true,
    };
    expect(() => runPostInferenceGuardrails(def, '', parsed)).toThrow(
      /parse the model output/,
    );
  });
});

describe('runSkill end-to-end', () => {
  it('executes a healthy skill and returns a structured success', async () => {
    const adapter = new CannedAdapter('Pack passport\nBook hotel');
    const router = new InferenceRouter(adapter, null, null);
    const def = makeDemoSkill();
    const out: SkillResult<DemoOutput> = await runSkill(router, def, {
      input: {
        destination: 'Tokyo',
        duration: 5,
        messages: [{ id: 'm1', content: 'going to Tokyo' }],
      },
    });
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') return;
    expect(out.result.destination).toBe('Tokyo');
    expect(out.result.notes).toEqual(['Pack passport', 'Book hotel']);
    expect(out.sources.map((s) => s.id)).toEqual(['m1']);
    expect(out.privacy.computeLocation).toBe('on_device');
    expect(out.privacy.dataEgressBytes).toBe(0);
    expect(out.privacy.tier).toBe('e2b');
    expect(adapter.lastReq?.prompt).toContain(INSUFFICIENT_RULE);
    expect(adapter.lastReq?.prompt).toContain('Destination: Tokyo');
  });

  it('refuses pre-inference when destination is missing', async () => {
    const adapter = new CannedAdapter('should not run');
    const router = new InferenceRouter(adapter, null, null);
    const def = makeDemoSkill();
    const out = await runSkill(router, def, {
      input: { destination: '', duration: 0, messages: [{ id: 'm1', content: 'x' }] },
    });
    expect(out.status).toBe('refused');
    if (out.status !== 'refused') return;
    expect(out.refusal.origin).toBe('pre_inference');
    expect(out.refusal.refusalText).toContain('demo skill');
    expect(adapter.lastReq).toBeNull(); // never invoked
  });

  it('detects INSUFFICIENT in the model output and returns a refusal', async () => {
    const adapter = new CannedAdapter('INSUFFICIENT: no relevant chat context');
    const router = new InferenceRouter(adapter, null, null);
    const def = makeDemoSkill();
    const out = await runSkill(router, def, {
      input: {
        destination: 'Tokyo',
        duration: 5,
        messages: [{ id: 'm1', content: 'x' }],
      },
    });
    expect(out.status).toBe('refused');
    if (out.status !== 'refused') return;
    expect(out.refusal.origin).toBe('insufficient');
    expect(out.refusal.reason).toBe('no relevant chat context');
    expect(out.refusal.refusalText).toContain('no relevant chat context');
    expect(out.privacy).not.toBeNull();
    expect(out.privacy?.modelName).toBe('gemma-4-e2b');
  });

  it('refuses post-inference when output matches a prohibited pattern', async () => {
    const adapter = new CannedAdapter('Call me at 555-12-1234\nMore info');
    const router = new InferenceRouter(adapter, null, null);
    const def = makeDemoSkill({
      guardrails: {
        ...makeDemoSkill().guardrails,
        prohibitedPatterns: ['\\b\\d{3}-\\d{2}-\\d{4}\\b'],
      },
    });
    const out = await runSkill(router, def, {
      input: {
        destination: 'Tokyo',
        duration: 5,
        messages: [{ id: 'm1', content: 'x' }],
      },
    });
    expect(out.status).toBe('refused');
    if (out.status !== 'refused') return;
    expect(out.refusal.origin).toBe('post_inference');
  });

  it('honours a rawOutputOverride for guardrail-only test paths', async () => {
    const adapter = new CannedAdapter('should be ignored');
    const router = new InferenceRouter(adapter, null, null);
    const def = makeDemoSkill();
    const out = await runSkill(
      router,
      def,
      {
        input: {
          destination: 'Tokyo',
          duration: 5,
          messages: [{ id: 'm1', content: 'x' }],
        },
      },
      { rawOutputOverride: 'Pack passport' },
    );
    expect(out.status).toBe('ok');
    expect(adapter.lastReq).toBeNull();
  });
});
