import { useEffect, useRef, useState } from 'react';
import type { ContextMode } from '../../types/workspace';
import type { SelectedSource } from '../../types/knowledge';
import { SourcePicker } from '../knowledge/SourcePicker';

export interface ActionLauncherAction {
  id: string;
  label: string;
  // Optional submenu of sub-actions (e.g. Create → PRD/RFC/Proposal/Task in B2B).
  submenu?: ActionLauncherAction[];
}

interface Props {
  context: ContextMode;
  // onAction may return a boolean indicating whether the caller actually
  // handled the action. When true, the launcher suppresses its built-in
  // "queued" placeholder toast (the caller is rendering its own progress
  // UI). When false / undefined, the placeholder toast still fires so the
  // user gets feedback for unwired actions.
  //
  // Phase 5 — callers receive the set of SelectedSource entries the
  // user picked in the SourcePicker (when one is opened). If the
  // action didn't route through the picker, `sources` is undefined.
  onAction?: (
    path: string[],
    sources?: SelectedSource[],
  ) => boolean | void;
  // Render-prop hook so callers can mount the trigger button inside their
  // own composer toolbar. The launcher provides the popover; the caller
  // decides where the trigger lives.
  triggerLabel?: string;
  // Phase 5 — workspaceId enables the SourcePicker step for the B2B
  // Create / Analyze / Plan intents. When omitted the picker is
  // skipped entirely and the launcher behaves as it did in Phase 4.
  workspaceId?: string;
  // Top-level action ids that should route through SourcePicker
  // before `onAction` fires. Defaults to the B2B knowledge intents;
  // tests override this to avoid opening the picker.
  intentsRequiringSources?: string[];
}

// Phase 0 menu definitions. PROPOSAL.md section 4.2 describes the B2C quick
// actions; ARCHITECTURE.md module #4 describes the B2B four-intent grid.
const B2C_ACTIONS: ActionLauncherAction[] = [
  { id: 'catch_me_up', label: 'Catch me up' },
  { id: 'translate', label: 'Translate' },
  { id: 'remind_me', label: 'Remind me' },
  { id: 'extract_tasks', label: 'Extract tasks' },
];

const B2B_ACTIONS: ActionLauncherAction[] = [
  {
    id: 'create',
    label: 'Create',
    submenu: [
      { id: 'prd', label: 'PRD' },
      { id: 'rfc', label: 'RFC' },
      { id: 'proposal', label: 'Proposal' },
      { id: 'task', label: 'Task' },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    submenu: [
      { id: 'thread', label: 'Thread summary' },
      { id: 'risks', label: 'Risks & blockers' },
      { id: 'decisions', label: 'Decisions made' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    submenu: [
      { id: 'milestones', label: 'Milestones' },
      { id: 'sprint', label: 'Sprint plan' },
      { id: 'rollout', label: 'Rollout plan' },
    ],
  },
  {
    id: 'approve',
    label: 'Approve',
    submenu: [
      { id: 'vendor', label: 'Vendor contract' },
      { id: 'budget', label: 'Budget request' },
      { id: 'access', label: 'Access request' },
    ],
  },
];

// ActionLauncher renders the AI action button + popover described in
// ARCHITECTURE.md module #4. B2C surfaces the four quick actions; B2B
// surfaces the four core intents with submenus. Phase 0 invokes onAction
// with the path of action ids; full wiring (route + run + privacy strip)
// lands in Phase 1.
export function ActionLauncher({
  context,
  onAction,
  triggerLabel = 'AI',
  workspaceId,
  intentsRequiringSources = ['create', 'analyze', 'plan'],
}: Props) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Phase 5 — when the user picks a knowledge-intent action we defer
  // running it until the SourcePicker returns. The pending path +
  // label live here while the picker is open.
  const [pendingPick, setPendingPick] = useState<
    | { path: string[]; label: string }
    | null
  >(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const actions = context === 'b2c' ? B2C_ACTIONS : B2B_ACTIONS;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setOpenSubmenu(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function trigger(path: string[], label: string) {
    // Phase 5 — knowledge-intent actions route through SourcePicker
    // so the user can scope which channels / threads the AI reads
    // from. We only open the picker when a workspaceId is supplied
    // (callers that don't know their workspace keep the Phase 4
    // behaviour).
    const topIntent = path[0];
    if (
      workspaceId &&
      intentsRequiringSources.includes(topIntent)
    ) {
      setPendingPick({ path, label });
      setOpen(false);
      setOpenSubmenu(null);
      return;
    }

    const handled = onAction?.(path) === true;
    if (!handled) {
      setToast(`Queued ${label} (Phase 1 will wire this to the inference adapter)`);
    }
    setOpen(false);
    setOpenSubmenu(null);
  }

  function handleSourcesConfirmed(sources: SelectedSource[]) {
    if (!pendingPick) return;
    const { path, label } = pendingPick;
    setPendingPick(null);
    const handled = onAction?.(path, sources) === true;
    if (!handled) {
      setToast(
        `Queued ${label} with ${sources.length} source${sources.length === 1 ? '' : 's'}`,
      );
    }
  }

  return (
    <div className="action-launcher" ref={rootRef} data-testid="action-launcher">
      <button
        type="button"
        className="action-launcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="action-launcher-trigger"
      >
        <span aria-hidden>⚡</span>
        <span className="action-launcher__trigger-label">{triggerLabel}</span>
      </button>
      {open && (
        <div
          className={`action-launcher__menu action-launcher__menu--${context}`}
          role="menu"
          data-testid="action-launcher-menu"
        >
          {actions.map((action) => {
            const hasSubmenu = !!action.submenu?.length;
            const isOpenSubmenu = openSubmenu === action.id;
            return (
              <div key={action.id} className="action-launcher__item-wrapper">
                <button
                  type="button"
                  role="menuitem"
                  className="action-launcher__item"
                  onClick={() => {
                    if (hasSubmenu) {
                      setOpenSubmenu(isOpenSubmenu ? null : action.id);
                    } else {
                      trigger([action.id], action.label);
                    }
                  }}
                  aria-haspopup={hasSubmenu ? 'menu' : undefined}
                  aria-expanded={hasSubmenu ? isOpenSubmenu : undefined}
                  data-testid={`action-launcher-item-${action.id}`}
                >
                  {action.label}
                  {hasSubmenu && <span className="action-launcher__chevron">›</span>}
                </button>
                {hasSubmenu && isOpenSubmenu && (
                  <div
                    className="action-launcher__submenu"
                    role="menu"
                    data-testid={`action-launcher-submenu-${action.id}`}
                  >
                    {action.submenu!.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        className="action-launcher__item"
                        onClick={() => trigger([action.id, sub.id], `${action.label} › ${sub.label}`)}
                        data-testid={`action-launcher-item-${action.id}-${sub.id}`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {toast && (
        <div className="action-launcher__toast" role="status" data-testid="action-launcher-toast">
          {toast}
        </div>
      )}
      {pendingPick && workspaceId && (
        <SourcePicker
          workspaceId={workspaceId}
          onCancel={() => setPendingPick(null)}
          onSelect={handleSourcesConfirmed}
        />
      )}
    </div>
  );
}
