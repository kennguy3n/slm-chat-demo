// IPC handlers for the renderer ↔ main inference bridge. Each handler
// dispatches into the inference router or one of the task helpers in
// `inference/tasks.ts`. The bootstrap is lazily resolved on first call
// so we can `app.whenReady()` → `registerIPCHandlers()` without an
// async race against the constructor.

import { ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import {
  bootstrapInference,
  type InferenceStack,
} from './inference/bootstrap.js';
import {
  buildDraftArtifact,
  buildThreadSummary,
  buildUnreadSummary,
  runExtractTasks,
  runKAppsExtractTasks,
  runPrefillApproval,
  runPrefillForm,
  runSmartReply,
  runTranslate,
} from './inference/tasks.js';
import {
  runEventRSVP,
  runFamilyChecklist,
  runShoppingNudges,
} from './inference/secondBrain.js';
import {
  runTripPlanner,
  type RunTripPlannerArgs,
} from './inference/skills/trip-planner.js';
import {
  runGuardrailRewrite,
  type RunGuardrailArgs,
} from './inference/skills/guardrail-rewrite.js';
import {
  getRecipe,
  type RecipeContext,
  type RecipeResult,
} from './inference/recipes/index.js';
import type { InferenceRouter } from './inference/router.js';
import type {
  DraftArtifactRequest,
  EventRSVPRequest,
  ExtractTasksRequest,
  FamilyChecklistRequest,
  InferenceRequest,
  KAppsExtractTasksRequest,
  PrefillApprovalRequest,
  PrefillFormRequest,
  RouteDecision,
  ShoppingNudgesRequest,
  SmartReplyRequest,
  ThreadSummaryRequest,
  TranslateRequest,
  UnreadSummaryRequest,
} from './inference/adapter.js';

let stackPromise: Promise<InferenceStack> | null = null;
let registered = false;

function getStack(): Promise<InferenceStack> {
  if (!stackPromise) stackPromise = bootstrapInference();
  return stackPromise;
}

// activeStreams tracks in-flight streams keyed by the renderer-supplied
// id so cancel events can abort them cleanly.
const activeStreams = new Map<string, AbortController>();

export function registerIPCHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('ai:run', async (_e, req: InferenceRequest) => {
    const { router } = await getStack();
    return router.run(req);
  });

  ipcMain.handle('ai:route', async (_e, req: InferenceRequest): Promise<RouteDecision> => {
    const { router, defaultQuant } = await getStack();
    const d = router.decide(req);
    if (!d.allow) {
      return {
        decision: 'deny',
        allow: false,
        model: '',
        quant: defaultQuant,
        computeLocation: 'on_device',
        redactionRequired: false,
        dataEgressBytes: 0,
        sourcesAllowed: [],
        reason: d.reason,
      };
    }
    return {
      decision: 'allow',
      allow: true,
      model: d.model,
      tier: d.tier,
      quant: defaultQuant,
      computeLocation: 'on_device',
      redactionRequired: false,
      dataEgressBytes: 0,
      sourcesAllowed: [],
      reason: d.reason,
    };
  });

  ipcMain.on(
    'ai:stream:start',
    (event: IpcMainEvent, { id, request }: { id: string; request: InferenceRequest }) => {
      void runStream(event.sender, id, request);
    },
  );
  ipcMain.on('ai:stream:cancel', (_e, { id }: { id: string }) => {
    const ctrl = activeStreams.get(id);
    if (ctrl) {
      ctrl.abort();
      activeStreams.delete(id);
    }
  });

  ipcMain.handle('ai:smart-reply', async (_e, req: SmartReplyRequest) => {
    const { router } = await getStack();
    return runSmartReply(router, req);
  });

  ipcMain.handle('ai:translate', async (_e, req: TranslateRequest) => {
    const { router } = await getStack();
    return runTranslate(router, req);
  });

  ipcMain.handle('ai:extract-tasks', async (_e, req: ExtractTasksRequest) => {
    const { router } = await getStack();
    return runExtractTasks(router, req);
  });

  ipcMain.handle('ai:summarize-thread', async (_e, req: ThreadSummaryRequest) => {
    const { router } = await getStack();
    return buildThreadSummary(router, req);
  });

  ipcMain.handle('ai:kapps-extract-tasks', async (_e, req: KAppsExtractTasksRequest) => {
    const { router } = await getStack();
    return runKAppsExtractTasks(router, req);
  });

  ipcMain.handle('ai:prefill-approval', async (_e, req: PrefillApprovalRequest) => {
    const { router } = await getStack();
    return runPrefillApproval(router, req);
  });

  ipcMain.handle('ai:prefill-form', async (_e, req: PrefillFormRequest) => {
    const { router } = await getStack();
    return runPrefillForm(router, req);
  });

  ipcMain.handle('ai:draft-artifact', async (_e, req: DraftArtifactRequest) => {
    const { router } = await getStack();
    return buildDraftArtifact(router, req);
  });

  ipcMain.handle('ai:unread-summary', async (_e, req: UnreadSummaryRequest) => {
    return buildUnreadSummary(req);
  });

  ipcMain.handle('ai:family-checklist', async (_e, req: FamilyChecklistRequest) => {
    const { router } = await getStack();
    return runFamilyChecklist(router, req);
  });

  ipcMain.handle('ai:shopping-nudges', async (_e, req: ShoppingNudgesRequest) => {
    const { router } = await getStack();
    return runShoppingNudges(router, req);
  });

  ipcMain.handle('ai:event-rsvp', async (_e, req: EventRSVPRequest) => {
    const { router } = await getStack();
    return runEventRSVP(router, req);
  });

  ipcMain.handle('ai:trip-plan', async (_e, req: RunTripPlannerArgs) => {
    const { router, search } = await getStack();
    return runTripPlanner(router, search, req);
  });

  ipcMain.handle('ai:guardrail-check', async (_e, req: RunGuardrailArgs) => {
    const { router } = await getStack();
    return runGuardrailRewrite(router, req);
  });

  // Phase 4 — generic AI-Employee recipe runner. All recipes share
  // this channel; the renderer identifies which one to run by id and
  // passes the caller's allowed-recipes list so the main process can
  // refuse recipes the AI Employee is not authorised for.
  ipcMain.handle(
    'ai:recipe:run',
    async (
      _e,
      req: RecipeContext & {
        recipeId: string;
        allowedRecipes?: string[];
        apiBaseUrl?: string;
      },
    ): Promise<RecipeResult> => {
      const { router } = await getStack();
      return runRecipe(router, req);
    },
  );

  ipcMain.handle('model:status', async () => {
    const stack = await getStack();
    const { status, e4bStatus, defaultModel, defaultE4BModel, defaultQuant, hasE4B } = stack;
    let base;
    if (!status) {
      base = {
        loaded: false,
        model: defaultModel,
        quant: defaultQuant,
        ramUsageMB: 0,
        sidecar: 'unstarted',
      };
    } else {
      base = await status.status();
      if (!base.model) base.model = defaultModel;
      if (!base.quant) base.quant = defaultQuant;
    }
    let e4bLoaded = false;
    let e4bModelName = defaultE4BModel;
    if (hasE4B && e4bStatus) {
      try {
        const e4bSt = await e4bStatus.status();
        e4bLoaded = e4bSt.loaded;
        e4bModelName = e4bSt.model || defaultE4BModel;
      } catch {
        // tolerate transient e4b status errors — leave defaults
      }
    }
    return {
      ...base,
      e4bModel: e4bModelName,
      e4bLoaded,
      hasE4B,
    };
  });

  ipcMain.handle('model:load', async (_e, { model }: { model?: string }) => {
    const stack = await getStack();
    if (!stack.loader) throw new Error('no model loader configured');
    const m = model || stack.defaultModel;
    await stack.loader.load(m);
    return { loaded: true, model: m };
  });

  ipcMain.handle('model:unload', async (_e, { model }: { model?: string }) => {
    const stack = await getStack();
    if (!stack.loader) throw new Error('no model loader configured');
    const m = model || stack.defaultModel;
    await stack.loader.unload(m);
    return { loaded: false, model: m };
  });
}

// estimateRecipeTokens returns a coarse token-cost estimate for a
// recipe run. The Phase 4 demo has no tokenizer attached so we
// approximate using message character counts (roughly four characters
// per token). This is sufficient for the budget gate, which only
// needs to know roughly how much to charge per run.
function estimateRecipeTokens(req: RecipeContext): number {
  let chars = 0;
  for (const m of req.messages) chars += m.content.length;
  return Math.max(256, Math.ceil(chars / 4));
}

// runRecipe looks the recipe up, validates the AI Employee is
// authorised to run it, enforces the per-employee token budget by
// calling the backend's budget/increment endpoint before execution,
// and returns a `refused` envelope (instead of throwing) when any of
// those pre-flight checks fails. Exported for direct unit-testing
// without going through ipcMain.
export async function runRecipe(
  router: InferenceRouter,
  req: RecipeContext & {
    recipeId: string;
    allowedRecipes?: string[];
    // apiBaseUrl lets tests point the budget fetch at an in-process
    // mock server without mutating global state. Falls back to the
    // BACKEND_URL env var (used by the Electron dev server) and
    // finally `http://localhost:8080`.
    apiBaseUrl?: string;
  },
): Promise<RecipeResult> {
  const recipe = getRecipe(req.recipeId);
  if (!recipe) {
    return {
      status: 'refused',
      output: null,
      model: '',
      tier: 'e2b',
      reason: `recipe "${req.recipeId}" is not registered`,
    };
  }
  if (req.allowedRecipes && !req.allowedRecipes.includes(req.recipeId)) {
    return {
      status: 'refused',
      output: null,
      model: '',
      tier: recipe.preferredTier,
      reason: `AI Employee "${req.aiEmployeeId}" is not authorised to run recipe "${req.recipeId}"`,
    };
  }

  // Budget gate. We increment *before* executing so concurrent runs
  // can't both squeeze through just below the ceiling — the backend
  // does the atomic check. On 429 we refuse without running the
  // recipe. Network errors fall open so the demo remains usable
  // offline (the backend is the source of truth for enforcement, not
  // the main process).
  const base = req.apiBaseUrl ?? process.env.BACKEND_URL ?? 'http://localhost:8080';
  const tokensUsed = estimateRecipeTokens(req);
  try {
    const res = await fetch(
      `${base}/api/ai-employees/${encodeURIComponent(req.aiEmployeeId)}/budget/increment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': 'user_alice',
        },
        body: JSON.stringify({ tokensUsed }),
      },
    );
    if (res.status === 429) {
      return {
        status: 'refused',
        output: null,
        model: '',
        tier: recipe.preferredTier,
        reason: `budget exceeded for AI Employee "${req.aiEmployeeId}"`,
      };
    }
    if (res.status === 404) {
      // Treat an unknown employee as a soft refusal rather than a
      // hard crash — the renderer already surfaces refusals uniformly.
      return {
        status: 'refused',
        output: null,
        model: '',
        tier: recipe.preferredTier,
        reason: `AI Employee "${req.aiEmployeeId}" not found`,
      };
    }
  } catch {
    // Fall open on network errors — see note above.
  }

  return recipe.execute(router, {
    aiEmployeeId: req.aiEmployeeId,
    channelId: req.channelId,
    threadId: req.threadId,
    messages: req.messages,
  });
}

async function runStream(
  sender: WebContents,
  id: string,
  request: InferenceRequest,
): Promise<void> {
  const ctrl = new AbortController();
  activeStreams.set(id, ctrl);
  try {
    const { router } = await getStack();
    const stream = router.stream(request, ctrl.signal);
    for await (const chunk of stream) {
      if (sender.isDestroyed()) return;
      sender.send(`ai:stream:chunk:${id}`, chunk);
      if (chunk.done) break;
    }
    if (!sender.isDestroyed()) sender.send(`ai:stream:done:${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!sender.isDestroyed()) sender.send(`ai:stream:error:${id}`, message);
  } finally {
    activeStreams.delete(id);
  }
}
