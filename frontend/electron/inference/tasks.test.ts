import { describe, expect, it } from 'vitest';
import {
  buildDraftArtifact,
  buildThreadSummary,
  findSourceMessage,
  parseBatchTranslations,
  parseFormFields,
  parseKAppsExtractedTasks,
  parsePrefilledApprovalFields,
  runKAppsExtractTasks,
  runPrefillApproval,
  runPrefillForm,
  runTranslateBatch,
} from './tasks.js';
import { InferenceRouter } from './router.js';
import { MockAdapter } from './mock.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
  TaskType,
} from './adapter.js';

// Stub adapter that returns a caller-provided output keyed by
// taskType. Tests use this to simulate a Bonsai-1.7B response shape
// without depending on MockAdapter's canned outputs (which were
// stripped of seed-specific content as part of the B2B redesign).
class StubAdapter implements Adapter {
  constructor(private readonly outputs: Partial<Record<TaskType, string>>) {}
  name(): string {
    return 'stub';
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    const output = this.outputs[req.taskType] ?? '';
    return {
      taskType: req.taskType,
      model: req.model || 'bonsai-1.7b',
      output,
      tokensUsed: Math.max(1, Math.floor(output.length / 4)),
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

function makeRouter() {
  // Default router uses MockAdapter as the fallback (no real
  // local adapter is wired in unit tests). Tests that need a
  // specific output shape construct their own stub-backed router.
  return new InferenceRouter(null, new MockAdapter());
}

function makeStubRouter(outputs: Partial<Record<TaskType, string>>) {
  return new InferenceRouter(new StubAdapter(outputs), new MockAdapter());
}

describe('parsePrefilledApprovalFields', () => {
  it('parses canonical key: value pairs', () => {
    const out = [
      'vendor: Acme Logs',
      'amount: $42,000 / yr',
      'justification: Lowest-cost SOC 2-cleared bidder.',
      'risk: medium',
    ].join('\n');
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme Logs',
      amount: '$42,000 / yr',
      justification: 'Lowest-cost SOC 2-cleared bidder.',
      risk: 'medium',
    });
  });

  it('strips bullet prefixes and surrounding quotes', () => {
    const out = ['- vendor: "Acme"', '* amount: $1', '• risk: low'].join('\n');
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme',
      amount: '$1',
      risk: 'low',
    });
  });

  it('captures unknown keys as extra', () => {
    const out = 'vendor: Acme\ncontract length: 12 months\nrisk: low';
    const fields = parsePrefilledApprovalFields(out);
    expect(fields.vendor).toBe('Acme');
    expect(fields.risk).toBe('low');
    expect(fields.extra).toEqual({ 'contract length': '12 months' });
  });

  it('skips blank lines and lines without a colon', () => {
    const out = '\nvendor: Acme\nthis line has no colon\n\namount: $99\n';
    expect(parsePrefilledApprovalFields(out)).toEqual({
      vendor: 'Acme',
      amount: '$99',
    });
  });

  it('returns {} when the model emits the INSUFFICIENT refusal', () => {
    expect(parsePrefilledApprovalFields('INSUFFICIENT: thread is empty')).toEqual({});
    expect(
      parsePrefilledApprovalFields('INSUFFICIENT: cannot determine\nvendor: Acme'),
    ).toEqual({});
  });

  it('preserves the first occurrence when the model repeats a field', () => {
    const out = 'vendor: Acme\nvendor: Beta\namount: $1';
    const fields = parsePrefilledApprovalFields(out);
    expect(fields.vendor).toBe('Acme');
    expect(fields.amount).toBe('$1');
  });

  it('treats requester / subject as legacy aliases for vendor', () => {
    const fields = parsePrefilledApprovalFields('requester: Alice\namount: $1');
    expect(fields.vendor).toBe('Alice');
    expect(fields.amount).toBe('$1');
  });

  it('treats severity as a legacy alias for risk', () => {
    const fields = parsePrefilledApprovalFields('vendor: Acme\nseverity: high');
    expect(fields.risk).toBe('high');
  });
});

describe('runPrefillApproval', () => {
  const stubOutput = [
    'vendor: Acme Logs',
    'amount: $42,000 / yr',
    'justification: Lowest-cost SOC 2-cleared bidder with 30-day termination.',
    'risk: medium',
  ].join('\n');

  it('returns prefilled fields, sources, on-device metadata, and a local-tier reason', async () => {
    const router = makeStubRouter({ prefill_approval: stubOutput });
    const resp = await runPrefillApproval(router, {
      threadId: 't1',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'We picked Acme Logs at $42,000/yr.' },
        { id: 'm2', channelId: 'c1', senderId: 'u2', content: 'Risk medium since SOC 2 is current.' },
      ],
    });
    expect(resp.threadId).toBe('t1');
    expect(resp.channelId).toBe('c1');
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.fields.vendor).toBe('Acme Logs');
    expect(resp.fields.amount).toBe('$42,000 / yr');
    expect(resp.fields.risk).toBe('medium');
    expect(resp.title).toContain('Acme Logs');
    expect(resp.sourceMessageIds.length).toBeGreaterThan(0);
    expect(resp.tier).toBe('local');
    expect(typeof resp.reason).toBe('string');
  });

  it('throws when the thread has no messages', async () => {
    const router = makeRouter();
    await expect(
      runPrefillApproval(router, { threadId: 't', messages: [] }),
    ).rejects.toThrow(/thread/);
  });

  it('respects the templateId passed by the caller', async () => {
    const router = makeStubRouter({ prefill_approval: 'vendor: Beta' });
    const resp = await runPrefillApproval(router, {
      threadId: 't1',
      templateId: 'access',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'Need access for the new contractor.' },
      ],
    });
    expect(resp.templateId).toBe('access');
  });

  it('returns empty fields without throwing when the model refuses', async () => {
    const router = makeStubRouter({
      prefill_approval: 'INSUFFICIENT: no vendor / amount in the thread',
    });
    const resp = await runPrefillApproval(router, {
      threadId: 't1',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'Lunch tomorrow?' },
      ],
    });
    expect(resp.fields).toEqual({});
    expect(resp.sourceMessageIds.length).toBeGreaterThan(0);
  });
});

describe('buildDraftArtifact', () => {
  it('builds a prompt that lists every message and includes the artifact type/section hint', () => {
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'Need inline translation.' },
        { id: 'm2', channelId: 'c1', senderId: 'u2', content: 'On-device only.' },
      ],
    });
    expect(out.prompt).toContain('PRD');
    expect(out.prompt).toContain('product requirements');
    expect(out.prompt).toContain('Need inline translation');
    expect(out.prompt).toContain('On-device only');
    expect(out.sources).toHaveLength(2);
    expect(out.threadId).toBe('t1');
    expect(out.channelId).toBe('c1');
    expect(out.computeLocation).toBe('on_device');
    expect(out.dataEgressBytes).toBe(0);
    expect(out.title).toContain('PRD');
    expect(out.section).toBe('all');
    expect(out.messageCount).toBe(2);
  });

  it('routes PRD threads to the local tier', () => {
    const router = makeRouter();
    const messages = Array.from({ length: 9 }, (_, i) => ({
      id: `m${i}`,
      channelId: 'c1',
      senderId: `u${i}`,
      content: `message ${i}`,
    }));
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      messages,
    });
    expect(out.tier).toBe('local');
  });

  it('honours the router decision when an adapter is wired in', () => {
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'SOP',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'How to rotate keys.' },
      ],
    });
    expect(out.tier).toBe('local');
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('honours the requested section in the prompt', () => {
    const router = makeRouter();
    const out = buildDraftArtifact(router, {
      threadId: 't1',
      artifactType: 'PRD',
      section: 'risks',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'There is a privacy risk.' },
      ],
    });
    expect(out.section).toBe('risks');
    expect(out.prompt).toMatch(/risk/i);
  });

  it('throws when the thread is empty', () => {
    const router = makeRouter();
    expect(() =>
      buildDraftArtifact(router, { threadId: 't', artifactType: 'PRD', messages: [] }),
    ).toThrow(/thread/);
  });
});

describe('buildThreadSummary', () => {
  it('renders the thread into the prompt and reports messageCount', () => {
    const router = makeRouter();
    const out = buildThreadSummary(router, {
      threadId: 't1',
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'alice', content: 'We picked Acme Logs at $42,000/yr.' },
        { id: 'm2', channelId: 'c1', senderId: 'eve', content: 'Approving once the request is filed.' },
      ],
    });
    expect(out.prompt).toContain('alice');
    expect(out.prompt).toContain('Acme Logs');
    expect(out.prompt).toContain('Summary');
    expect(out.threadId).toBe('t1');
    expect(out.channelId).toBe('c1');
    expect(out.messageCount).toBe(2);
    expect(out.tier).toBe('local');
  });
});

describe('parseKAppsExtractedTasks', () => {
  it('parses pipe-delimited owner | title | due rows with source attribution', () => {
    const out = [
      'Alice | Send the contract draft | 2025-04-01',
      'Bob | Review the SOC 2 report |',
    ].join('\n');
    const sources = [
      { id: 'm1', content: 'Alice can you send the contract draft' },
      { id: 'm2', content: 'Bob please review the SOC 2 report' },
    ];
    const tasks = parseKAppsExtractedTasks(out, sources);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      owner: 'Alice',
      title: 'Send the contract draft',
      dueDate: '2025-04-01',
      sourceMessageId: 'm1',
    });
    expect(tasks[1]).toMatchObject({
      owner: 'Bob',
      title: 'Review the SOC 2 report',
      sourceMessageId: 'm2',
    });
  });

  it('returns an empty list when the model refuses with INSUFFICIENT', () => {
    const out = 'INSUFFICIENT: thread does not name any owners or tasks';
    expect(parseKAppsExtractedTasks(out, [])).toEqual([]);
  });

  it('returns an empty list even when INSUFFICIENT is followed by extra explanation', () => {
    const out = [
      'INSUFFICIENT: cannot determine owners',
      'The thread is purely status updates without action items.',
    ].join('\n');
    expect(parseKAppsExtractedTasks(out, [])).toEqual([]);
  });

  it('is robust to bullet prefixes, numeric prefixes, and extra whitespace', () => {
    const out = [
      '1. Alice | Send the contract | Friday',
      '- Bob   |   Review SOC 2 report   |   ',
      '* @carol | Confirm budget |',
    ].join('\n');
    const tasks = parseKAppsExtractedTasks(out, []);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ owner: 'Alice', title: 'Send the contract', dueDate: 'Friday' });
    expect(tasks[1]).toMatchObject({ owner: 'Bob', title: 'Review SOC 2 report' });
    expect(tasks[2]).toMatchObject({ owner: '@carol', title: 'Confirm budget' });
  });

  it('falls back to colon-separated rows when the model omits the pipe format', () => {
    const out = 'Alice: send the contract draft\nBob: review the SOC 2 report';
    const tasks = parseKAppsExtractedTasks(out, []);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]).toMatchObject({ owner: 'Alice' });
  });
});

describe('runKAppsExtractTasks', () => {
  it('parses pipe-delimited Bonsai-style output and attaches source ids', async () => {
    const router = makeStubRouter({
      extract_tasks: [
        'Alice | Draft the rotation calendar | Thursday EOD',
        'Eve | Confirm comp-day budget with Finance |',
        'Dave | Announce on-call change in #general | Friday',
      ].join('\n'),
    });
    const resp = await runKAppsExtractTasks(router, {
      threadId: 't1',
      messages: [
        { id: 'mA', channelId: 'c1', senderId: 'alice', content: 'I will draft the rotation calendar by Thursday EOD.' },
        { id: 'mB', channelId: 'c1', senderId: 'eve', content: 'I will confirm the comp-day budget with Finance.' },
        { id: 'mC', channelId: 'c1', senderId: 'dave', content: 'I will announce in #general by Friday.' },
      ],
    });
    expect(resp.tasks.length).toBe(3);
    expect(resp.tasks[0]).toMatchObject({ owner: 'Alice' });
    // Source attribution: each title fuzzy-matches the originating
    // message via shared keyword overlap.
    const matchedIds = new Set(resp.tasks.map((t) => t.sourceMessageId).filter(Boolean));
    expect(matchedIds.size).toBeGreaterThanOrEqual(2);
  });
});

describe('parseFormFields', () => {
  it('keeps only allow-listed fields', () => {
    const out = ['vendor: Acme', 'cost: $100', 'amount: $200'].join('\n');
    expect(parseFormFields(out, ['vendor', 'amount'])).toEqual({
      vendor: 'Acme',
      amount: '$200',
    });
  });

  it('returns {} when output indicates insufficient context', () => {
    expect(parseFormFields('I do not have enough information.', ['vendor'])).toEqual({});
  });

  it('strips bullet prefixes and quoted values', () => {
    const out = '- vendor: "Acme"\n* amount: 1';
    expect(parseFormFields(out, ['vendor', 'amount'])).toEqual({
      vendor: 'Acme',
      amount: '1',
    });
  });
});

describe('runPrefillForm', () => {
  it('fills the requested fields and reports on-device metadata', async () => {
    const router = makeStubRouter({
      prefill_form: [
        'vendor: Acme Logs',
        'amount: $42,000',
        'compliance: SOC 2',
        'justification: Logging vendor selection.',
      ].join('\n'),
    });
    const resp = await runPrefillForm(router, {
      threadId: 't1',
      templateId: 'vendor_onboarding_v1',
      fields: ['vendor', 'amount', 'compliance', 'justification'],
      messages: [
        { id: 'm1', channelId: 'c1', senderId: 'u1', content: 'We picked Acme at $42k SOC 2.' },
      ],
    });
    expect(resp.templateId).toBe('vendor_onboarding_v1');
    expect(resp.channelId).toBe('c1');
    expect(resp.computeLocation).toBe('on_device');
    expect(resp.dataEgressBytes).toBe(0);
    expect(resp.fields.vendor).toBe('Acme Logs');
    expect(resp.fields.amount).toBe('$42,000');
    expect(resp.fields.compliance).toBe('SOC 2');
    expect(resp.sourceMessageIds.length).toBeGreaterThan(0);
  });

  it('throws when the thread has no messages', async () => {
    const router = makeRouter();
    await expect(
      runPrefillForm(router, {
        threadId: 't',
        templateId: 'x',
        fields: ['a'],
        messages: [],
      }),
    ).rejects.toThrow(/thread/);
  });
});

describe('parseBatchTranslations', () => {
  it('parses a numbered list into N entries', () => {
    const out = '1. Hi Alice, are you free for phở tomorrow?\n2. Yes, 7pm at that place.';
    expect(parseBatchTranslations(out, 2)).toEqual([
      'Hi Alice, are you free for phở tomorrow?',
      'Yes, 7pm at that place.',
    ]);
  });

  it('returns empty strings for missing indices', () => {
    const out = '1. first\n3. third';
    expect(parseBatchTranslations(out, 3)).toEqual(['first', '', 'third']);
  });

  it('ignores stray commentary lines', () => {
    const out = [
      'Here are the translations:',
      '1. first',
      'note: line 2 omitted',
      '2. second',
    ].join('\n');
    expect(parseBatchTranslations(out, 2)).toEqual(['first', 'second']);
  });
});

describe('runTranslateBatch (single-call optimisation)', () => {
  it('falls through to runTranslate when only one item is present', async () => {
    const router = makeStubRouter({ translate: 'translated text' });
    const resp = await runTranslateBatch(router, {
      items: [
        {
          messageId: 'm1',
          channelId: 'c1',
          text: 'hello',
          targetLanguage: 'fr',
        },
      ],
    });
    expect(resp.results).toHaveLength(1);
    expect(resp.results[0]?.translated).toBe('translated text');
  });

  // Identity short-circuit: a 1.7B model would otherwise hallucinate
  // an "English → English" rewrite that looks like a bug to the user.
  // The runTranslate path returns the original text verbatim with
  // model='identity' instead.
  it('skips the LLM and returns the original text when source==target', async () => {
    const router = makeStubRouter({ translate: 'WRONG — should not be called' });
    const resp = await runTranslateBatch(router, {
      items: [
        {
          messageId: 'm1',
          channelId: 'c1',
          text: 'Hello there!',
          targetLanguage: 'en',
          sourceLanguage: 'en',
        },
        {
          messageId: 'm2',
          channelId: 'c1',
          text: 'Chào bạn!',
          targetLanguage: 'en',
          sourceLanguage: 'vi',
        },
      ],
    });
    expect(resp.results).toHaveLength(2);
    expect(resp.results[0]?.translated).toBe('Hello there!');
    expect(resp.results[0]?.model).toBe('identity');
    // Second item still uses the LLM because src != dst.
    expect(resp.results[1]?.translated).toBe('WRONG — should not be called');
    expect(resp.results[1]?.model).not.toBe('identity');
  });

  it('strips legacy "(to xx)" / label prefixes from per-item responses', async () => {
    // Each item now goes through a separate `runTranslate` call, so
    // the stub adapter returns the same "(to xx)" / label string for
    // every call — `parseTranslateOutput` cleans both lines.
    const router = makeStubRouter({
      translate: 'Translation: "Chào Alice"',
    });
    const resp = await runTranslateBatch(router, {
      items: [
        {
          messageId: 'm1',
          channelId: 'c1',
          text: 'Hi Alice!',
          targetLanguage: 'vi',
          sourceLanguage: 'en',
        },
        {
          messageId: 'm2',
          channelId: 'c1',
          text: 'Hi Minh!',
          targetLanguage: 'vi',
          sourceLanguage: 'en',
        },
      ],
    });
    expect(resp.results.map((r) => r.translated)).toEqual([
      'Chào Alice',
      'Chào Alice',
    ]);
  });

  // Conversation context — short / ambiguous chat lines like
  // "Yes! That's the one." or "Trưa được nha!" hallucinate on a
  // 1.7B model when fed in isolation. We pipe the preceding 2-3
  // messages down to the prompt builder; this test pins that the
  // flow from `runTranslateBatch` → `runTranslate` → `buildTranslatePrompt`
  // preserves per-item context end-to-end.
  it('plumbs per-item context through to the adapter prompt', async () => {
    const seen: { prompt: string; system: string }[] = [];
    const adapter: Adapter = {
      name: () => 'spy',
      async run(req: InferenceRequest): Promise<InferenceResponse> {
        seen.push({ prompt: req.prompt ?? '', system: req.system ?? '' });
        return {
          taskType: req.taskType,
          model: 'bonsai-1.7b',
          output: 'Vâng! Đúng cái đó.',
          tokensUsed: 1,
          latencyMs: 0,
          onDevice: true,
        };
      },
      async *stream(req: InferenceRequest): AsyncGenerator<StreamChunk, void, void> {
        const r = await this.run(req);
        yield { delta: r.output, done: false };
        yield { done: true };
      },
    };
    await runTranslateBatch(adapter, {
      items: [
        {
          messageId: 'm1',
          channelId: 'c1',
          text: "Yes! That's the one.",
          targetLanguage: 'vi',
          sourceLanguage: 'en',
          context: [
            { sender: 'user_minh', text: 'Phở 79 hay là Phở Lý Quốc Sư?' },
            { sender: 'user_alice', text: 'I think Phở 79 — closer to home.' },
          ],
        },
        {
          // Second item without context — verifies per-item isolation
          // (item 2's prompt must not include item 1's context).
          messageId: 'm2',
          channelId: 'c1',
          text: 'Got it!',
          targetLanguage: 'vi',
          sourceLanguage: 'en',
        },
      ],
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]!.prompt).toContain('Recent conversation:');
    expect(seen[0]!.prompt).toContain('user_minh: Phở 79 hay là Phở Lý Quốc Sư?');
    expect(seen[0]!.prompt).toContain("Text: Yes! That's the one.");
    expect(seen[0]!.system).toMatch(/conversation context/i);
    expect(seen[1]!.prompt).not.toContain('Recent conversation:');
    expect(seen[1]!.prompt).toContain('Text: Got it!');
  });
});

describe('findSourceMessage', () => {
  // Multi-token insight text against a transcript where the best match
  // is a single coincidental token. The previous implementation returned
  // that message id; the score≥2 threshold drops it back to undefined.
  it('returns undefined when the best score is a coincidental single-token hit', () => {
    const messages = [
      { id: 'm1', content: 'I just bought a brand new wooden table for the kitchen' },
      { id: 'm2', content: 'Sounds great, see you Saturday' },
    ];
    // "Book a table at Pho 79 tonight" → tokens [book, table, tonight]
    // (length≥4). "table" appears in m1, "book"/"tonight" do not appear
    // anywhere. Best score = 1; min score (since tokens.length≥2) = 2.
    expect(findSourceMessage(messages, 'Book a table at Pho 79 tonight')).toBeUndefined();
  });

  it('returns the message id when at least two tokens overlap', () => {
    const messages = [
      { id: 'm1', content: 'I just bought a brand new wooden table for the kitchen' },
      { id: 'm2', content: 'Saturday we should book a table for dinner together' },
    ];
    // m2 has "book", "table", "Saturday", "dinner" → score = 3 against
    // tokens [book, table, tonight, dinner] (4 tokens). Should pick m2.
    expect(findSourceMessage(messages, 'Book a table tonight, dinner together')).toBe('m2');
  });

  it('still matches a one-token insight on score=1 (otherwise unreachable)', () => {
    // Insight text reduces to a single ≥4-character token, so requiring
    // score≥2 would always return undefined for it. The implementation
    // relaxes the threshold to 1 in that case.
    const messages = [
      { id: 'm1', content: 'Phở 79 was excellent' },
      { id: 'm2', content: 'See you tomorrow' },
    ];
    expect(findSourceMessage(messages, 'excellent')).toBe('m1');
  });

  it('returns undefined when no message has any qualifying overlap', () => {
    const messages = [
      { id: 'm1', content: 'Saturday lunch sounds good' },
      { id: 'm2', content: 'See you then' },
    ];
    expect(findSourceMessage(messages, 'Book a table tonight')).toBeUndefined();
  });

  it('returns undefined when the insight has zero ≥4-character tokens', () => {
    const messages = [{ id: 'm1', content: 'phở table book' }];
    expect(findSourceMessage(messages, 'a b c')).toBeUndefined();
  });
});
