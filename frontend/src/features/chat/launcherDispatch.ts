// launcherDispatch turns an ActionLauncher path (e.g. ['create', 'prd'])
// into a `kapps:launcher` CustomEvent the right-rail ThreadPanel
// listens for. ChatSurface owns the dispatch site; this helper exists
// so the routing table can be unit-tested without mounting the whole
// chat surface.

export type LauncherDetail =
  | { kind: 'draft_artifact'; artifactType: 'PRD' | 'RFC' | 'Proposal' }
  | { kind: 'prefill_approval'; templateId: 'vendor' | 'budget' | 'access' }
  | { kind: 'create_task' }
  | { kind: 'summarize_thread'; focus: 'overview' | 'risks' | 'decisions' }
  | { kind: 'plan'; section: 'milestones' | 'sprint' | 'rollout' };

// dispatchLauncherAction maps a launcher path to a LauncherDetail and
// returns it. When `target` is supplied (typically `window`) the helper
// also dispatches a `kapps:launcher` CustomEvent so the live listener
// runs. Returns null when the path is not a B2B path the launcher
// integration handles.
export function dispatchLauncherAction(
  path: string[],
  target: EventTarget | null = typeof window === 'undefined' ? null : window,
): LauncherDetail | null {
  const detail = launcherDetailFor(path);
  if (!detail) return null;
  if (target) {
    target.dispatchEvent(new CustomEvent('kapps:launcher', { detail }));
  }
  return detail;
}

function launcherDetailFor(path: string[]): LauncherDetail | null {
  if (path[0] === 'create' && (path[1] === 'prd' || path[1] === 'rfc' || path[1] === 'proposal')) {
    const artifactType =
      path[1] === 'proposal' ? 'Proposal' : (path[1].toUpperCase() as 'PRD' | 'RFC');
    return { kind: 'draft_artifact', artifactType };
  }
  if (path[0] === 'create' && path[1] === 'task') {
    return { kind: 'create_task' };
  }
  if (
    path[0] === 'approve' &&
    (path[1] === 'vendor' || path[1] === 'budget' || path[1] === 'access')
  ) {
    return { kind: 'prefill_approval', templateId: path[1] };
  }
  if (
    path[0] === 'analyze' &&
    (path[1] === 'thread' || path[1] === 'risks' || path[1] === 'decisions')
  ) {
    return {
      kind: 'summarize_thread',
      focus: path[1] === 'thread' ? 'overview' : path[1],
    };
  }
  if (
    path[0] === 'plan' &&
    (path[1] === 'milestones' || path[1] === 'sprint' || path[1] === 'rollout')
  ) {
    return { kind: 'plan', section: path[1] };
  }
  return null;
}
