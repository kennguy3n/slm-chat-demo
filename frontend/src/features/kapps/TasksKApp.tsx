// TasksKApp — stub mounted into the B2B right rail. The full
// implementation arrives in Task 5; this stub keeps the layout
// rendering until the store + form are wired.

import { useEffect, useState } from 'react';
import type { TaskStatus } from '../../types/kapps';
import { useKAppsStore } from '../../stores/kappsStore';
import { CreateTaskForm } from './CreateTaskForm';
import { TaskCard } from './TaskCard';

interface Props {
  channelId: string | null;
}

const STATUS_FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

// TasksKApp lists tasks for the active channel, supports a status
// filter + sort by due date, and embeds CreateTaskForm. Phase 3 — first
// complete KApp lifecycle (PROPOSAL.md §6.2 / ARCHITECTURE.md §6.1).
export function TasksKApp({ channelId }: Props) {
  const { tasksByChannel, fetchTasks, updateStatus, removeTask, error, loading } = useKAppsStore();
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    void fetchTasks(channelId);
  }, [channelId, fetchTasks]);

  if (!channelId) {
    return (
      <section className="tasks-kapp" data-testid="tasks-kapp">
        <h3 className="tasks-kapp__title">Tasks</h3>
        <p className="tasks-kapp__empty">Select a channel to see its tasks.</p>
      </section>
    );
  }

  const tasks = tasksByChannel[channelId] ?? [];
  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return ad - bd;
  });

  const counts: Record<TaskStatus, number> = { open: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const t of tasks) counts[t.status]++;

  return (
    <section className="tasks-kapp" data-testid="tasks-kapp">
      <header className="tasks-kapp__header">
        <h3 className="tasks-kapp__title">Tasks</h3>
        <button
          type="button"
          className="tasks-kapp__new"
          onClick={() => setShowForm((v) => !v)}
          data-testid="tasks-kapp-new-toggle"
        >
          {showForm ? 'Cancel' : 'New task'}
        </button>
      </header>
      <ul className="tasks-kapp__filter" role="tablist">
        {STATUS_FILTERS.map((f) => (
          <li key={f.value}>
            <button
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              className={`tasks-kapp__filter-button${filter === f.value ? ' tasks-kapp__filter-button--active' : ''}`}
              onClick={() => setFilter(f.value)}
              data-testid={`tasks-kapp-filter-${f.value}`}
            >
              {f.label}
              {f.value !== 'all' && (
                <span className="tasks-kapp__count" aria-label={`${counts[f.value]} tasks`}>
                  {counts[f.value]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {showForm && (
        <CreateTaskForm
          channelId={channelId}
          onCreated={() => setShowForm(false)}
          data-testid="tasks-kapp-create-form"
        />
      )}

      {loading && <p className="tasks-kapp__status">Loading…</p>}
      {error && (
        <p className="tasks-kapp__status tasks-kapp__status--error" role="alert">
          {error}
        </p>
      )}
      {!loading && sorted.length === 0 && (
        <p className="tasks-kapp__empty">No tasks yet for this channel.</p>
      )}

      <ul className="tasks-kapp__list">
        {sorted.map((t) => (
          <li key={t.id} data-testid={`tasks-kapp-task-${t.id}`}>
            <TaskCard
              task={t}
              onStatusChange={(next) => void updateStatus(t.id, next)}
              onClose={() => void removeTask(t.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
