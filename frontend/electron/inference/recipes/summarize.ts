// summarize recipe — wraps buildThreadSummary from tasks.ts. The
// existing helper already implements the SLM-friendly prompt and
// output parsing; the recipe just adapts the router + context to the
// uniform RecipeResult envelope.

import { buildThreadSummary } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const summarizeRecipe: RecipeDefinition = {
  id: 'summarize',
  name: 'Summarize thread',
  description:
    'Condense a thread into decisions, open questions, owners, and deadlines on the on-device Ternary-Bonsai-8B model.',
  taskType: 'summarize',
  preferredTier: 'local',
  async execute(
    router: InferenceRouter,
    context: RecipeContext,
  ): Promise<RecipeResult> {
    const resp = buildThreadSummary(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
    });
    return {
      status: 'ok',
      output: {
        prompt: resp.prompt,
        sources: resp.sources,
        threadId: resp.threadId,
        channelId: resp.channelId,
        messageCount: resp.messageCount,
      },
      model: resp.model,
      tier: resp.tier,
      reason: resp.reason,
    };
  },
};
