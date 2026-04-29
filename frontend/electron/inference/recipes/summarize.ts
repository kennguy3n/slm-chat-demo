// summarize recipe — wraps buildThreadSummary from tasks.ts. The
// existing helper already implements the SLM-friendly prompt and a
// short/long heuristic (E2B for short, E4B for long). The recipe just
// adapts the router + context to the uniform RecipeResult envelope.

import { buildThreadSummary } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

// Summaries under this many messages comfortably fit on E2B; longer
// threads benefit from E4B reasoning. Matches the threshold
// buildThreadSummary uses internally, exposed here so the registry
// can advertise the preferred tier without running the helper.
const THREAD_SUMMARY_SHORT = 8;

export const summarizeRecipe: RecipeDefinition = {
  id: 'summarize',
  name: 'Summarize thread',
  description:
    'Condense a thread into decisions, open questions, owners, and deadlines, routing to E2B for short threads and E4B for long ones.',
  taskType: 'summarize',
  preferredTier: 'e2b',
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

// preferredTierForThread exposes the short/long heuristic to callers
// (the IPC handler uses this in tests to verify the recipe advertises
// the right tier without executing inference).
export function preferredTierForThread(messageCount: number): 'e2b' | 'e4b' {
  return messageCount > THREAD_SUMMARY_SHORT ? 'e4b' : 'e2b';
}
