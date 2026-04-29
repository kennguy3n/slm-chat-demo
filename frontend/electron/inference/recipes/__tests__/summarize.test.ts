import { describe, expect, it } from 'vitest';
import { summarizeRecipe } from '../summarize.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

function buildMessages(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m_${i}`,
    channelId: 'ch_general',
    senderId: 'user_alice',
    content: `message ${i}`,
  }));
}

describe('summarize recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(summarizeRecipe.id).toBe('summarize');
    expect(summarizeRecipe.name).toMatch(/summarize/i);
    expect(summarizeRecipe.taskType).toBe('summarize');
    expect(summarizeRecipe.preferredTier).toBe('local');
  });

  it('returns an ok result with prompt + sources for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const result = await summarizeRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'thr_123',
      messages: buildMessages(3),
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      prompt: string;
      sources: unknown[];
      messageCount: number;
    };
    expect(output.prompt).toMatch(/summarise/i);
    expect(output.sources).toHaveLength(3);
    expect(output.messageCount).toBe(3);
    expect(result.tier).toBe('local');
    expect(result.model).toBeTruthy();
  });

  it('handles empty threads gracefully without throwing', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const result = await summarizeRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('ok');
    const output = result.output as { sources: unknown[]; messageCount: number };
    expect(output.sources).toEqual([]);
    expect(output.messageCount).toBe(0);
  });
});
