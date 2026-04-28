import { useNavigate } from '@tanstack/react-router';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { Workspace } from '../types/workspace';

interface Props {
  workspaces: Workspace[];
}

// TopBar renders the shell-level controls described in PROPOSAL.md section 4.1:
// workspace switcher, search placeholder, AI mode badge, E2EE badge, and the
// egress counter. AI mode and egress are static in Phase 0 — Phase 1 wires them
// to the policy engine.
export function TopBar({ workspaces }: Props) {
  const { context, workspaceId, setWorkspaceId } = useWorkspaceStore();
  const navigate = useNavigate();

  const switchContext = () => {
    const next = context === 'b2c' ? '/b2b' : '/b2c';
    void navigate({ to: next });
  };

  const visible = workspaces.filter((w) => w.context === context);
  const currentId = workspaceId ?? visible[0]?.id ?? '';

  return (
    <header className="topbar" role="banner">
      <div className="topbar__group">
        <label className="topbar__label" htmlFor="workspace-select">
          Workspace
        </label>
        <select
          id="workspace-select"
          className="topbar__select"
          value={currentId}
          onChange={(e) => setWorkspaceId(e.target.value || null)}
        >
          {visible.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
          {visible.length === 0 && <option value="">(no workspace)</option>}
        </select>
      </div>

      <div className="topbar__group topbar__group--grow">
        <input
          type="search"
          className="topbar__search"
          placeholder="Search KChat (coming soon)"
          aria-label="Search"
          disabled
        />
      </div>

      <div className="topbar__group">
        <span className="topbar__badge" title="AI compute mode">
          AI: On-device
        </span>
        <span className="topbar__badge topbar__badge--secure" title="End-to-end encrypted">
          E2EE
        </span>
        <span className="topbar__badge" title="Bytes leaving the device">
          Egress 0 B
        </span>
        <button
          type="button"
          className="topbar__mode"
          onClick={switchContext}
          aria-label={`Switch to ${context === 'b2c' ? 'B2B' : 'B2C'} context`}
        >
          {context === 'b2c' ? 'B2C' : 'B2B'} mode
        </button>
      </div>
    </header>
  );
}
