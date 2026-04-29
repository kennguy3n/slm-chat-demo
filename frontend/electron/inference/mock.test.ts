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
      expect(resp.model).toBe('ternary-bonsai-8b');
    }
  });

  it('respects the request model override', async () => {
    const m = new MockAdapter();
    const resp = await m.run({ taskType: 'draft_artifact', prompt: '', model: 'ternary-bonsai-8b-override' });
    expect(resp.model).toBe('ternary-bonsai-8b-override');
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
