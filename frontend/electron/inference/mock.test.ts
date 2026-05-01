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

    // Bilingual conversation summary path — the mock should switch
    // its summarize output when the prompt looks like a bilingual
    // chat digest (the redesigned B2C demo). The check here is loose
    // (fuzz-resistant against prompt copy edits) but covers the
    // critical signals the renderer surfaces.
    it('summarize output is bilingual when prompt mentions a bilingual chat', async () => {
      const prompt =
        'Summarise the following English ↔ Vietnamese bilingual chat ' +
        'for an English-speaking reader. Write the summary in English. ' +
        'phở, cà phê sữa đá, chè ba màu.';
      const resp = await adapter.run({ taskType: 'summarize', prompt });
      expect(resp.output).toMatch(/bilingual/i);
      expect(resp.output).toMatch(/English/);
      expect(resp.output).toMatch(/Vietnamese/);
      // Surfaces enriched seed vocabulary so the demo summary feels
      // grounded in the actual conversation.
      expect(resp.output).toMatch(/phở/);
    });
  });
});

describe('mockTranslate (seeded bilingual outputs)', () => {
  // Keys are taken straight from the enriched seed.go content. These
  // tests guard against drift between the seeded VI/EN messages and
  // the mock adapter's hand-curated translations: a regression where
  // a seeded message no longer has a matching mock output would
  // otherwise be invisible until you ran the full demo.
  it.each([
    {
      prompt:
        'Translate the following chat message into English.\n\n' +
        'Message: Chào Alice! Thứ Bảy này mình rảnh. Nhà hàng nào vậy? Mình nghe nói có một quán phở mới mở ở trung tâm.',
      expectMatch: /Saturday/i,
    },
    {
      prompt:
        'Translate the following chat message into English.\n\n' +
        'Message: Trưa được nha! Mình sẽ đặt bàn trước. Bạn có ăn được cay không?',
      expectMatch: /spicy/i,
    },
    {
      prompt:
        'Translate the following chat message into English.\n\n' +
        'Message: Cà phê sữa đá là lựa chọn tuyệt vời! Mình cũng sẽ gọi thêm chè cho tráng miệng.',
      expectMatch: /dessert/i,
    },
    {
      prompt:
        'Translate the following chat message into Vietnamese.\n\n' +
        "Message: Hey Minh! Are you free this Saturday? I was thinking we could check out that new Vietnamese restaurant downtown.",
      expectMatch: /Thứ Bảy|Việt Nam/,
    },
  ])('returns a plausible translation for seeded line', async ({ prompt, expectMatch }) => {
    const adapter = new MockAdapter();
    const resp = await adapter.run({ taskType: 'translate', prompt });
    expect(resp.output).toMatch(expectMatch);
    // Translations should never echo the raw `[lang] source` fallback.
    expect(resp.output).not.toMatch(/^\[[a-z]{2}\]\s/);
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
