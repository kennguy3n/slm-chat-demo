import type { AIEmployee } from '../../types/aiEmployee';
import { AIEmployeeModeBadge } from '../ai/AIEmployeeModeBadge';

interface Props {
  employees: AIEmployee[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// AIEmployeeList renders the seeded AI Employees as compact cards in
// the B2B sidebar. Clicking a card sets the active employee; the
// right-rail AIEmployeePanel renders the details.
export function AIEmployeeList({ employees, selectedId, onSelect }: Props) {
  return (
    <div className="sidebar__section" data-testid="ai-employees-list">
      <h3 className="sidebar__heading">AI Employees</h3>
      {employees.length === 0 && (
        <p className="sidebar__empty">No AI Employees configured.</p>
      )}
      <ul className="sidebar__list">
        {employees.map((e) => {
          const active = e.id === selectedId;
          return (
            <li key={e.id}>
              <button
                type="button"
                className={`ai-employee-card${active ? ' ai-employee-card--active' : ''}`}
                onClick={() => onSelect(e.id)}
                data-testid={`ai-employee-card-${e.id}`}
              >
                <span
                  className="ai-employee-card__avatar"
                  style={{ backgroundColor: e.avatarColor }}
                  aria-hidden
                >
                  {initials(e.name)}
                </span>
                <span className="ai-employee-card__meta">
                  <span className="ai-employee-card__name-row">
                    <span className="ai-employee-card__name">{e.name}</span>
                    <AIEmployeeModeBadge mode={e.mode} employeeName={e.name} />
                  </span>
                  <span className="ai-employee-card__role">{e.role}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
