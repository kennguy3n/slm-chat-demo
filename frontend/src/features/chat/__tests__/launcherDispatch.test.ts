import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchLauncherAction } from '../launcherDispatch';

describe('dispatchLauncherAction', () => {
  const target = new EventTarget();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureNext(): Promise<CustomEvent['detail']> {
    return new Promise((resolve) => {
      target.addEventListener(
        'kapps:launcher',
        (e) => resolve((e as CustomEvent).detail),
        { once: true },
      );
    });
  }

  it('routes Create > PRD to draft_artifact with type PRD', async () => {
    const captured = captureNext();
    const detail = dispatchLauncherAction(['create', 'prd'], target);
    expect(detail).toEqual({ kind: 'draft_artifact', artifactType: 'PRD' });
    await expect(captured).resolves.toEqual({ kind: 'draft_artifact', artifactType: 'PRD' });
  });

  it('routes Create > RFC to draft_artifact with type RFC', () => {
    const detail = dispatchLauncherAction(['create', 'rfc'], target);
    expect(detail).toEqual({ kind: 'draft_artifact', artifactType: 'RFC' });
  });

  it('preserves mixed-case Proposal (not uppercased) for Create > Proposal', () => {
    const detail = dispatchLauncherAction(['create', 'proposal'], target);
    expect(detail).toEqual({ kind: 'draft_artifact', artifactType: 'Proposal' });
  });

  it('routes Create > Task to create_task', () => {
    const detail = dispatchLauncherAction(['create', 'task'], target);
    expect(detail).toEqual({ kind: 'create_task' });
  });

  it('routes Approve > Vendor to prefill_approval with templateId vendor', () => {
    const detail = dispatchLauncherAction(['approve', 'vendor'], target);
    expect(detail).toEqual({ kind: 'prefill_approval', templateId: 'vendor' });
  });

  it('routes Approve > Budget and Access through prefill_approval', () => {
    expect(dispatchLauncherAction(['approve', 'budget'], target)).toEqual({
      kind: 'prefill_approval',
      templateId: 'budget',
    });
    expect(dispatchLauncherAction(['approve', 'access'], target)).toEqual({
      kind: 'prefill_approval',
      templateId: 'access',
    });
  });

  it('routes Analyze > Thread to summarize_thread with focus=overview', () => {
    expect(dispatchLauncherAction(['analyze', 'thread'], target)).toEqual({
      kind: 'summarize_thread',
      focus: 'overview',
    });
  });

  it('routes Analyze > Risks and Decisions with their focus labels', () => {
    expect(dispatchLauncherAction(['analyze', 'risks'], target)).toEqual({
      kind: 'summarize_thread',
      focus: 'risks',
    });
    expect(dispatchLauncherAction(['analyze', 'decisions'], target)).toEqual({
      kind: 'summarize_thread',
      focus: 'decisions',
    });
  });

  it('routes all Plan submenu items through plan with the matching section', () => {
    for (const section of ['milestones', 'sprint', 'rollout'] as const) {
      expect(dispatchLauncherAction(['plan', section], target)).toEqual({
        kind: 'plan',
        section,
      });
    }
  });

  it('returns null for paths the launcher integration does not handle', () => {
    expect(dispatchLauncherAction(['translate'], target)).toBeNull();
    expect(dispatchLauncherAction(['catch_me_up'], target)).toBeNull();
    expect(dispatchLauncherAction(['extract_tasks'], target)).toBeNull();
    expect(dispatchLauncherAction(['create', 'unknown'], target)).toBeNull();
    expect(dispatchLauncherAction([], target)).toBeNull();
  });
});
