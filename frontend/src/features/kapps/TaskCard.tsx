import { useState } from 'react';
import type { Task, TaskStatus } from '../../types/kapps';

interface Props {
  task: Task;
  // Phase 3 — Tasks KApp lifecycle. Optional callbacks allow the card
  // to drive transitions without the parent having to wire its own
  // controls. When omitted the card renders read-only.
  onStatusChange?: (next: TaskStatus) => void;
  onEdit?: (patch: { title?: string; owner?: string; dueDate?: string | null }) => void;
  onClose?: () => void;
  onOpenSource?: (id: string) => void;
  // mode controls density: full (chat / Tasks KApp) vs compact
  // (ThreadPanel "Linked Objects" rail).
  mode?: 'full' | 'compact';
}

const STATUS_LABEL: Record<Task['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

// Forward order through the lifecycle.
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  open: ['in_progress', 'blocked', 'done'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'done'],
  done: ['open'],
};

function formatDueDate(iso?: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// TaskCard renders a Tasks KApp object as an inline chat card. Phase 3
// adds inline editing, status transition buttons, and a "compact" mode
// for the ThreadPanel rail (PROPOSAL.md §6.2 / ARCHITECTURE.md §6.1).
export function TaskCard({
  task,
  onStatusChange,
  onEdit,
  onClose,
  onOpenSource,
  mode = 'full',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftOwner, setDraftOwner] = useState(task.owner ?? '');
  const [draftDue, setDraftDue] = useState<string>(toDateInput(task.dueDate));
  const sourceID = task.sourceMessageId ?? task.sourceThreadId;

  function commitEdits() {
    onEdit?.({
      title: draftTitle.trim() || task.title,
      owner: draftOwner,
      dueDate: draftDue ? new Date(draftDue).toISOString() : null,
    });
    setEditing(false);
  }

  function cancelEdits() {
    setDraftTitle(task.title);
    setDraftOwner(task.owner ?? '');
    setDraftDue(toDateInput(task.dueDate));
    setEditing(false);
  }

  return (
    <article
      className={`kapp-card kapp-card--task kapp-card--${mode}`}
      data-testid="task-card"
      data-mode={mode}
      aria-label={`Task: ${task.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">Task</span>
        {task.aiGenerated && (
          <span className="kapp-card__ai-badge" data-testid="task-card-ai-badge">
            AI
          </span>
        )}
        <span
          className={`kapp-card__status kapp-card__status--${task.status}`}
          data-testid="task-card-status"
        >
          {STATUS_LABEL[task.status]}
        </span>
      </header>
      {editing ? (
        <div className="kapp-card__edit">
          <label>
            <span className="visually-hidden">Title</span>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              data-testid="task-card-edit-title"
              aria-label="Edit task title"
            />
          </label>
          <label>
            <span className="visually-hidden">Owner</span>
            <input
              type="text"
              value={draftOwner}
              onChange={(e) => setDraftOwner(e.target.value)}
              data-testid="task-card-edit-owner"
              placeholder="Owner"
              aria-label="Edit owner"
            />
          </label>
          <label>
            <span className="visually-hidden">Due date</span>
            <input
              type="date"
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
              data-testid="task-card-edit-due"
              aria-label="Edit due date"
            />
          </label>
          <div className="kapp-card__edit-actions">
            <button type="button" onClick={commitEdits} data-testid="task-card-edit-save">
              Save
            </button>
            <button type="button" onClick={cancelEdits} data-testid="task-card-edit-cancel">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <h4 className="kapp-card__title">{task.title}</h4>
          {mode === 'full' && (
            <dl className="kapp-card__meta">
              <div>
                <dt>Owner</dt>
                <dd>{task.owner ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatDueDate(task.dueDate)}</dd>
              </div>
            </dl>
          )}
        </>
      )}

      {mode === 'full' && !editing && onStatusChange && (
        <div className="kapp-card__actions" role="group" aria-label="Task transitions">
          {TRANSITIONS[task.status].map((next) => (
            <button
              type="button"
              key={next}
              className="kapp-card__action"
              onClick={() => onStatusChange(next)}
              data-testid={`task-card-transition-${next}`}
            >
              Move to {STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      )}

      {mode === 'full' && !editing && (onEdit || onClose) && (
        <div className="kapp-card__secondary">
          {onEdit && (
            <button
              type="button"
              className="kapp-card__edit-toggle"
              onClick={() => setEditing(true)}
              data-testid="task-card-edit-toggle"
            >
              Edit
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="kapp-card__close"
              onClick={onClose}
              data-testid="task-card-close"
            >
              Archive
            </button>
          )}
        </div>
      )}

      {mode === 'full' && sourceID && (
        <button
          type="button"
          className="kapp-card__source"
          onClick={() => onOpenSource?.(sourceID)}
        >
          View source message
        </button>
      )}
    </article>
  );
}
