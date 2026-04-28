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
import type {
  DraftArtifactRequest,
  EventRSVPRequest,
  ExtractTasksRequest,
  FamilyChecklistRequest,
  InferenceRequest,
  KAppsExtractTasksRequest,
  PrefillApprovalRequest,
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
