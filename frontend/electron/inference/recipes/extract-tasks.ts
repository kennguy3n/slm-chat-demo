// extract_tasks recipe — wraps runKAppsExtractTasks from tasks.ts.
// The underlying helper pulls concrete action items out of a work
// thread and carries source-message provenance through to every
// extracted task.

import { runKAppsExtractTasks } from '../tasks.js';
import type { RecipeContext, RecipeDefinition, RecipeResult } from './registry.js';
import type { InferenceRouter } from '../router.js';

export const extractTasksRecipe: RecipeDefinition = {
  id: 'extract_tasks',
  name: 'Extract tasks',
  description:
    'Pull concrete action items, owners, and due dates out of a work thread, preserving source-message provenance for human review.',
  taskType: 'extract_tasks',
  preferredTier: 'e2b',
  async execute(
    router: InferenceRouter,
    context: RecipeContext,
  ): Promise<RecipeResult> {
    if (context.messages.length === 0) {
      return {
        status: 'refused',
        output: { tasks: [] },
        model: '',
        tier: 'e2b',
        reason: 'extract_tasks: thread is empty; refusing to extract tasks.',
      };
    }
    const resp = await runKAppsExtractTasks(router, {
      threadId: context.threadId ?? '',
      messages: context.messages,
    });
    // The router records its last decision on every run; surface its
    // tier + reason in the RecipeResult so the privacy strip can show
    // what ran.
    const decision = router.lastDecision();
    return {
      status: 'ok',
      output: {
        tasks: resp.tasks,
        threadId: resp.threadId,
        channelId: resp.channelId,
      },
      model: resp.model,
      tier: decision.tier ?? 'e2b',
      reason: decision.reason || 'extract_tasks routed to E2B.',
    };
  },
};
