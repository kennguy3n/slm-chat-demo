import { describe, expect, it } from 'vitest';
import { extractTasksRecipe } from '../extract-tasks.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

describe('extract_tasks recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(extractTasksRecipe.id).toBe('extract_tasks');
    expect(extractTasksRecipe.name).toMatch(/extract/i);
    expect(extractTasksRecipe.taskType).toBe('extract_tasks');
    expect(extractTasksRecipe.preferredTier).toBe('local');
  });

  it('returns extracted tasks with source provenance for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const messages = [
      {
        id: 'm_1',
        channelId: 'ch_general',
        senderId: 'user_alice',
        content: 'Please submit the field-trip form by Friday.',
      },
      {
        id: 'm_2',
        channelId: 'ch_general',
        senderId: 'user_bob',
        content: 'I will add sunscreen to the shopping list.',
      },
    ];
    const result = await extractTasksRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'thr_abc',
      messages,
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      tasks: { title: string; sourceMessageId?: string }[];
      threadId: string;
      channelId: string;
    };
    expect(output.tasks.length).toBeGreaterThan(0);
    expect(output.threadId).toBe('thr_abc');
    expect(output.channelId).toBe('ch_general');
    // At least one extracted task should trace back to a source message
    // so the renderer can pin the "why" of the extraction.
    const withSource = output.tasks.filter((t) => t.sourceMessageId);
    expect(withSource.length).toBeGreaterThan(0);
    for (const t of withSource) {
      expect(['m_1', 'm_2']).toContain(t.sourceMessageId);
    }
  });

  it('refuses gracefully when the thread has no messages', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const result = await extractTasksRecipe.execute(router, {
      aiEmployeeId: 'ai_kara_ops',
      channelId: 'ch_general',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/empty/i);
  });
});
