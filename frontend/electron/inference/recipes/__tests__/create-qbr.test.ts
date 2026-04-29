import { describe, expect, it } from 'vitest';
import { createQBRRecipe } from '../create-qbr.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

describe('create_qbr recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(createQBRRecipe.id).toBe('create_qbr');
    expect(createQBRRecipe.name).toMatch(/qbr/i);
    expect(createQBRRecipe.taskType).toBe('draft_artifact');
    expect(createQBRRecipe.preferredTier).toBe('e4b');
  });

  it('returns an ok result with prompt + sources for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter, adapter, {
      hasRealE4B: true,
    });
    const messages = [
      {
        id: 'm_1',
        channelId: 'ch_exec',
        senderId: 'user_alice',
        content: 'Wins this quarter: shipped self-serve checkout, 40% adoption.',
      },
      {
        id: 'm_2',
        channelId: 'ch_exec',
        senderId: 'user_bob',
        content: 'Gap: enterprise SSO still blocked on vendor review.',
      },
    ];
    const result = await createQBRRecipe.execute(router, {
      aiEmployeeId: 'ai_nina_research',
      channelId: 'ch_exec',
      threadId: 'thr_qbr',
      messages,
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      prompt: string;
      sources: unknown[];
      threadId: string;
      channelId: string;
    };
    expect(output.prompt).toMatch(/qbr/i);
    expect(output.sources).toHaveLength(2);
    expect(output.threadId).toBe('thr_qbr');
    expect(output.channelId).toBe('ch_exec');
    expect(result.tier).toBe('e4b');
    expect(result.model).toBeTruthy();
  });

  it('refuses gracefully when the thread has no messages', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter, adapter, {
      hasRealE4B: true,
    });
    const result = await createQBRRecipe.execute(router, {
      aiEmployeeId: 'ai_nina_research',
      channelId: 'ch_exec',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/empty/i);
  });
});
