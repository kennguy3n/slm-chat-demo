import { useEffect, useMemo, useState } from 'react';
import type { AIEmployee, AIEmployeeRecipe } from '../../types/aiEmployee';
import type { Channel } from '../../types/workspace';
import { updateAIEmployeeChannels } from '../../api/aiEmployeeApi';

interface Props {
  employee: AIEmployee | null;
  channels: Channel[];
  recipeCatalog: Record<string, AIEmployeeRecipe>;
  // onChange is called with the updated profile after a successful
  // PATCH. Parent components (AIEmployeeList, B2BLayout) use it to
  // refresh their in-memory list without re-fetching.
  onChange?: (employee: AIEmployee) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: AIEmployee['role']): string {
  switch (role) {
    case 'ops':
      return 'Operations';
    case 'pm':
      return 'Product management';
    case 'sales':
      return 'Sales';
    default:
      return role;
  }
}

// AIEmployeePanel renders a single AI Employee profile in the B2B
// right rail: avatar, role badge, description, allowed-channel chips,
// authorised recipes, and a token budget indicator. A "Configure
// channels" button opens an inline multi-select that optimistically
// updates the parent store on save (PROPOSAL.md §3.6 AI Employees,
// Phase 4).
export function AIEmployeePanel({ employee, channels, recipeCatalog, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setSelected(employee?.allowedChannelIds ?? []);
    setError(null);
    // Reset only when the *employee* changes. `allowedChannelIds` is
    // managed optimistically through `selected` above; re-seeding it
    // every render would fight the inline edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id]);

  const channelLookup = useMemo(() => {
    const map = new Map<string, Channel>();
    for (const c of channels) map.set(c.id, c);
    return map;
  }, [channels]);

  if (!employee) {
    return (
      <section className="ai-employee-panel" data-testid="ai-employee-panel">
        <p className="ai-employee-panel__empty">Select an AI Employee to view details.</p>
      </section>
    );
  }

  const budgetPct = employee.budget.maxTokensPerDay > 0
    ? Math.min(
        100,
        Math.round((employee.budget.usedTokensToday / employee.budget.maxTokensPerDay) * 100),
      )
    : 0;

  function toggleChannel(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    if (!employee) return;
    setSaving(true);
    setError(null);
    // Optimistic update — parents pass an onChange that can merge the
    // partial immediately so the UI reflects the pending state while
    // the request is in flight.
    onChange?.({ ...employee, allowedChannelIds: selected });
    try {
      const updated = await updateAIEmployeeChannels(employee.id, selected);
      onChange?.(updated);
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
      // Roll back the optimistic update.
      onChange?.(employee);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ai-employee-panel" data-testid="ai-employee-panel">
      <header className="ai-employee-panel__header">
        <div
          className="ai-employee-panel__avatar"
          style={{ backgroundColor: employee.avatarColor }}
          aria-hidden
        >
          {initials(employee.name)}
        </div>
        <div className="ai-employee-panel__ident">
          <h3 className="ai-employee-panel__name">{employee.name}</h3>
          <span
            className={`ai-employee-panel__role ai-employee-panel__role--${employee.role}`}
            data-testid="ai-employee-panel-role"
          >
            {roleLabel(employee.role)}
          </span>
          <span
            className={`ai-employee-panel__mode ai-employee-panel__mode--${employee.mode}`}
            data-testid="ai-employee-panel-mode"
          >
            {employee.mode === 'auto' ? 'Auto' : 'Inline'}
          </span>
        </div>
      </header>

      <p className="ai-employee-panel__description">{employee.description}</p>

      <div className="ai-employee-panel__section">
        <div className="ai-employee-panel__section-head">
          <h4 className="ai-employee-panel__heading">Allowed channels</h4>
          {!editing && (
            <button
              type="button"
              className="ai-employee-panel__edit"
              onClick={() => setEditing(true)}
              data-testid="ai-employee-panel-configure-channels"
            >
              Configure channels
            </button>
          )}
        </div>

        {!editing && (
          <ul className="ai-employee-panel__chips" data-testid="ai-employee-panel-channels">
            {employee.allowedChannelIds.length === 0 && (
              <li className="ai-employee-panel__empty">None</li>
            )}
            {employee.allowedChannelIds.map((id) => {
              const c = channelLookup.get(id);
              return (
                <li key={id} className="ai-employee-panel__chip">
                  # {c?.name ?? id}
                </li>
              );
            })}
          </ul>
        )}

        {editing && (
          <div className="ai-employee-panel__picker" data-testid="ai-employee-panel-channel-picker">
            <ul className="ai-employee-panel__picker-list">
              {channels.length === 0 && (
                <li className="ai-employee-panel__empty">No channels available.</li>
              )}
              {channels.map((c) => {
                const checked = selected.includes(c.id);
                return (
                  <li key={c.id} className="ai-employee-panel__picker-item">
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChannel(c.id)}
                        data-testid={`ai-employee-panel-channel-${c.id}`}
                      />
                      # {c.name}
                    </label>
                  </li>
                );
              })}
            </ul>
            {error && (
              <p className="ai-employee-panel__error" role="alert">
                {error}
              </p>
            )}
            <div className="ai-employee-panel__picker-actions">
              <button
                type="button"
                className="ai-employee-panel__save"
                onClick={handleSave}
                disabled={saving}
                data-testid="ai-employee-panel-save-channels"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="ai-employee-panel__cancel"
                onClick={() => {
                  setSelected(employee.allowedChannelIds);
                  setEditing(false);
                  setError(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ai-employee-panel__section">
        <h4 className="ai-employee-panel__heading">Recipes</h4>
        <ul className="ai-employee-panel__recipes" data-testid="ai-employee-panel-recipes">
          {employee.recipes.length === 0 && (
            <li className="ai-employee-panel__empty">None</li>
          )}
          {employee.recipes.map((rid) => {
            const r = recipeCatalog[rid];
            return (
              <li key={rid} className="ai-employee-panel__recipe">
                <span className="ai-employee-panel__recipe-name">
                  {r?.name ?? rid}
                </span>
                {r?.description && (
                  <span className="ai-employee-panel__recipe-desc">
                    {r.description}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ai-employee-panel__section">
        <h4 className="ai-employee-panel__heading">Budget</h4>
        <div className="ai-employee-panel__budget" data-testid="ai-employee-panel-budget">
          <div
            className="ai-employee-panel__budget-bar"
            role="progressbar"
            aria-valuenow={budgetPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="ai-employee-panel__budget-fill"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="ai-employee-panel__budget-text">
            {employee.budget.usedTokensToday.toLocaleString()} / {' '}
            {employee.budget.maxTokensPerDay.toLocaleString()} tokens today
          </p>
        </div>
      </div>
    </section>
  );
}
