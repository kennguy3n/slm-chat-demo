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
      expect(resp.model).toBe('bonsai-8b');
    }
  });

  it('respects the request model override', async () => {
    const m = new MockAdapter();
    const resp = await m.run({ taskType: 'draft_artifact', prompt: '', model: 'bonsai-8b-override' });
    expect(resp.model).toBe('bonsai-8b-override');
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

  // The mock outputs are shaped for the demo flows in PROPOSAL §5 —
  // the enrichment work requires references to real seeded material so
  // the privacy strip / source-pin / approval-prefill surfaces have
  // concrete anchors to render.
  describe('seeded demo outputs', () => {
    const adapter = new MockAdapter();

    it('summarize output mentions seeded B2C material', async () => {
      const resp = await adapter.run({ taskType: 'summarize', prompt: '' });
      expect(resp.output).toMatch(/field-trip form/i);
      expect(resp.output).toMatch(/piano recital/i);
      expect(resp.output).toMatch(/Grandma/);
      expect(resp.output).toMatch(/block[- ]party/i);
      expect(resp.output).toMatch(/Acme Logs/);
    });

    it('extract_tasks output references seeded message IDs via [source:...] markers', async () => {
      const resp = await adapter.run({ taskType: 'extract_tasks', prompt: '' });
      // Markers must use the no-space convention so CitationRenderer
      // (`/\[source:[a-zA-Z0-9_\-:.,]+\]/`) can parse them.
      expect(resp.output).toMatch(/\[source:msg_fam_1\]/);
      // At least two distinct source-message references so the demo
      // isn't showing a single pin for every task.
      const matches = resp.output.match(/msg_fam_\d+/g) ?? [];
      const distinct = new Set(matches);
      expect(distinct.size).toBeGreaterThanOrEqual(2);
      expect(resp.output).toMatch(/Friday/);
      expect(resp.output).toMatch(/sunscreen/);
    });

    it('parseExtractedTasks strips [source:...] markers from task titles', async () => {
      const { parseExtractedTasks } = await import('./tasks.js');
      const resp = await adapter.run({ taskType: 'extract_tasks', prompt: '' });
      const tasks = parseExtractedTasks(resp.output);
      expect(tasks.length).toBeGreaterThanOrEqual(5);
      for (const t of tasks) {
        expect(t.title).not.toMatch(/\[source:/i);
        expect(t.title.length).toBeGreaterThan(0);
      }
      // Sanity-check a specific title survives cleanly.
      expect(tasks.some((t) => t.title === 'Add sunscreen to shopping list')).toBe(true);
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

    it('prefill_approval output matches the enriched vendor thread', async () => {
      const resp = await adapter.run({ taskType: 'prefill_approval', prompt: '' });
      expect(resp.output).toMatch(/vendor:\s*Acme Logs/i);
      expect(resp.output).toMatch(/amount:\s*\$42,000/i);
      expect(resp.output).toMatch(/risk:\s*medium/i);
      // Justification reflects the SOC 2 / termination / uptime
      // details introduced by the vendor-thread enrichment.
      expect(resp.output).toMatch(/SOC 2/);
      expect(resp.output).toMatch(/termination/i);
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
  it('uses different bases per task type', () => {
    const a = mockLatencyMS('smart_reply', 0);
    const b = mockLatencyMS('draft_artifact', 0);
    expect(b).toBeGreaterThan(a);
  });

  it('adds a token penalty', () => {
    const lo = mockLatencyMS('summarize', 0);
    const hi = mockLatencyMS('summarize', 200);
    expect(hi).toBeGreaterThan(lo);
  });
});
