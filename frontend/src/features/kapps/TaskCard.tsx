import type { Task } from '../../types/kapps';

interface Props {
  task: Task;
  onOpenSource?: (id: string) => void;
}

const STATUS_LABEL: Record<Task['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

function formatDueDate(iso?: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No due date';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// TaskCard renders a Tasks KApp object as an inline chat card. It surfaces
// the title, owner, due date, status, the AI-generated badge, and a
// back-link to the originating message (PROPOSAL.md 4.3, ARCHITECTURE.md 6.1).
export function TaskCard({ task, onOpenSource }: Props) {
  const sourceID = task.sourceMessageId ?? task.sourceThreadId;
  return (
    <article
      className="kapp-card kapp-card--task"
      data-testid="task-card"
      aria-label={`Task: ${task.title}`}
    >
      <header className="kapp-card__header">
        <span className="kapp-card__kind">Task</span>
        {task.aiGenerated && <span className="kapp-card__ai-badge">AI</span>}
        <span className={`kapp-card__status kapp-card__status--${task.status}`}>
          {STATUS_LABEL[task.status]}
        </span>
      </header>
      <h4 className="kapp-card__title">{task.title}</h4>
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
      {sourceID && (
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
