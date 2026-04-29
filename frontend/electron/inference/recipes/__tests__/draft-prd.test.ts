import { describe, expect, it } from 'vitest';
import { draftPRDRecipe } from '../draft-prd.js';
import { InferenceRouter } from '../../router.js';
import { MockAdapter } from '../../mock.js';

describe('draft_prd recipe', () => {
  it('declares the correct registry metadata', () => {
    expect(draftPRDRecipe.id).toBe('draft_prd');
    expect(draftPRDRecipe.name).toMatch(/prd/i);
    expect(draftPRDRecipe.taskType).toBe('draft_artifact');
    expect(draftPRDRecipe.preferredTier).toBe('local');
  });

  it('returns an ok result with prompt + sources for a normal thread', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const messages = [
      {
        id: 'm_1',
        channelId: 'ch_product',
        senderId: 'user_alice',
        content: 'Goal: launch self-serve checkout by end of quarter.',
      },
      {
        id: 'm_2',
        channelId: 'ch_product',
        senderId: 'user_bob',
        content: 'Risk: payments gateway migration could slip by two weeks.',
      },
    ];
    const result = await draftPRDRecipe.execute(router, {
      aiEmployeeId: 'ai_mika_drafts',
      channelId: 'ch_product',
      threadId: 'thr_prd',
      messages,
    });
    expect(result.status).toBe('ok');
    const output = result.output as {
      prompt: string;
      sources: unknown[];
      threadId: string;
      channelId: string;
    };
    expect(output.prompt).toMatch(/prd/i);
    expect(output.sources).toHaveLength(2);
    expect(output.threadId).toBe('thr_prd');
    expect(output.channelId).toBe('ch_product');
    expect(result.tier).toBe('local');
    expect(result.model).toBeTruthy();
  });

  it('refuses gracefully when the thread has no messages', async () => {
    const adapter = new MockAdapter();
    const router = new InferenceRouter(adapter, adapter);
    const result = await draftPRDRecipe.execute(router, {
      aiEmployeeId: 'ai_mika_drafts',
      channelId: 'ch_product',
      threadId: 'thr_empty',
      messages: [],
    });
    expect(result.status).toBe('refused');
    expect(result.reason).toMatch(/empty/i);
  });
});
