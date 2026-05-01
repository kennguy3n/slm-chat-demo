import { describe, expect, it } from 'vitest';
import { MockAdapter, estimateTokens, mockLatencyMS } from './mock.js';

describe('MockAdapter', () => {
  it('returns canned output for every TaskType', async () => {
    const m = new MockAdapter();
    const tasks: import('./adapter.js').TaskType[] = [
      'summarize',
      'translate',
      'extract_tasks',
      'smart_reply',
      'prefill_approval',
      'prefill_form',
      'draft_artifact',
    ];
    for (const t of tasks) {
      const resp = await m.run({ taskType: t, prompt: 'hi' });
      expect(resp.output.length).toBeGreaterThan(0);
      expect(resp.onDevice).toBe(true);
      expect(resp.taskType).toBe(t);
      expect(resp.model).toBe('bonsai-1.7b');
    }
  });

  it('respects the request model override', async () => {
    const m = new MockAdapter();
    const resp = await m.run({ taskType: 'draft_artifact', prompt: '', model: 'bonsai-1.7b-override' });
    expect(resp.model).toBe('bonsai-1.7b-override');
  });

  it('streams a single delta then done', async () => {
    const m = new MockAdapter();
    const chunks: import('./adapter.js').StreamChunk[] = [];
    for await (const c of m.stream({ taskType: 'summarize', prompt: '' })) {
      chunks.push(c);
    }
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.delta).toBeTruthy();
    expect(chunks[0]?.done).toBe(false);
    expect(chunks[1]?.done).toBe(true);
  });

  // The B2B redesign moved every B2B canned output to the prompt
  // library + real Ollama path. The MockAdapter now emits generic,
  // clearly-labelled `[MOCK]` placeholders for the B2B task types so
  // demo screenshots / privacy strips reveal whenever the real LLM
  // wasn't running.
  describe('generic [MOCK] outputs', () => {
    const adapter = new MockAdapter();

    it('summarize output is parseable as bullets and labelled [MOCK]', async () => {
      const resp = await adapter.run({ taskType: 'summarize', prompt: '' });
      expect(resp.output).toMatch(/\[MOCK\]/);
      const lines = resp.output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // At least three bullet-style lines so the summarize parser
      // produces a non-empty result without depending on seed data.
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('extract_tasks output is pipe-delimited and free of seed message IDs', async () => {
      const resp = await adapter.run({ taskType: 'extract_tasks', prompt: '' });
      expect(resp.output).toMatch(/\[MOCK\]/);
      // Hardcoded msg_fam_* / msg_vend_* references were removed in
      // the B2B redesign — the mock must not leak fixture-specific
      // identifiers anymore.
      expect(resp.output).not.toMatch(/msg_fam_\d+/);
      expect(resp.output).not.toMatch(/msg_vend_/);
      expect(resp.output).not.toMatch(/msg_eng_/);
    });

    it('smart_reply returns 2-3 distinct suggestions on separate lines', async () => {
      const resp = await adapter.run({ taskType: 'smart_reply', prompt: '' });
      const lines = resp.output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(3);
      const distinct = new Set(lines);
      expect(distinct.size).toBe(lines.length);
    });

    it('prefill_approval output is generic and labelled [MOCK]', async () => {
      const resp = await adapter.run({ taskType: 'prefill_approval', prompt: '' });
      expect(resp.output).toMatch(/\[MOCK\]/);
      // The canned vendor-thread fields ("Acme Logs", "$42,000",
      // SOC 2 / termination justifications) are now produced by
      // the real LLM — the mock must not reproduce them.
      expect(resp.output).not.toMatch(/Acme Logs/);
      expect(resp.output).not.toMatch(/\$42,000/);
      expect(resp.output).not.toMatch(/SOC 2/);
    });

    it('draft_artifact output is generic and labelled [MOCK]', async () => {
      const resp = await adapter.run({ taskType: 'draft_artifact', prompt: '' });
      expect(resp.output).toMatch(/\[MOCK\]/);
      expect(resp.output).not.toMatch(/inline translation/i);
    });

    // Bilingual / seeded translation paths were removed in the B2C
    // ground-zero redesign — the MockAdapter now always emits a
    // generic [MOCK] placeholder for translate so missing local
    // models surface unambiguously in screenshots and privacy strips.
    it('translate output is a labelled [MOCK] placeholder, not a seeded translation', async () => {
      const prompt =
        'Translate the following chat message into English.\n\n' +
        'Message: Chào Alice! Thứ Bảy này mình rảnh.';
      const resp = await adapter.run({ taskType: 'translate', prompt });
      expect(resp.output).toMatch(/\[MOCK\]/);
      // The pre-redesign seed table answered this prompt with the
      // word "Saturday". Confirm the seed table is gone.
      expect(resp.output).not.toMatch(/Saturday/);
      // The source body is echoed back so it's visible the model
      // didn't run — the original Vietnamese text appears verbatim.
      expect(resp.output).toMatch(/Chào Alice/);
    });

    // Bilingual summarize path was also removed — the MockAdapter no
    // longer special-cases a bilingual chat prompt and just returns
    // the generic [MOCK] bullet list.
    it('summarize output stays generic even for a bilingual chat prompt', async () => {
      const prompt =
        'Summarise the following English ↔ Vietnamese bilingual chat ' +
        'for an English-speaking reader.';
      const resp = await adapter.run({ taskType: 'summarize', prompt });
      expect(resp.output).toMatch(/\[MOCK\]/);
      // The pre-redesign seed surfaced "phở", "chè ba màu", and
      // "Vietnamese" verbatim. Confirm none of those leak through.
      expect(resp.output).not.toMatch(/phở/);
      expect(resp.output).not.toMatch(/chè ba màu/);
    });
  });
});

describe('estimateTokens', () => {
  it('returns at least 1 token for non-empty input', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefghij')).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('mockLatencyMS', () => {
  it('produces deterministic latencies per task type', () => {
    const a = mockLatencyMS('summarize', 100);
    const b = mockLatencyMS('summarize', 100);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
