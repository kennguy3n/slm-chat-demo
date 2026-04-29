import { type FormEvent, useState } from 'react';
import { useKAppsStore } from '../../stores/kappsStore';

interface Props {
  channelId: string;
  // Optional thread the task is being authored from. When set, the
  // resulting task back-links to the originating thread/message which
  // powers ThreadPanel's "Linked Objects" section.
  sourceThreadId?: string;
  sourceMessageId?: string;
  // Pre-filled values, used when the user accepted an AI-extracted task
  // from `TaskExtractionCard` and the parent wants to let them edit
  // before persisting.
  initialTitle?: string;
  initialOwner?: string;
  initialDueDate?: string;
  // aiGenerated is forwarded so the persisted task carries the same AI
  // badge as the extraction card it came from.
  aiGenerated?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
  // Allow the parent to tag the form node for tests.
  'data-testid'?: string;
}

// CreateTaskForm — manual / accepted-AI task creation. Validates that
// the title is non-empty before calling the kapps store. PROPOSAL.md §6.2
// (Tasks KApp lifecycle).
export function CreateTaskForm({
  channelId,
  sourceThreadId,
  sourceMessageId,
  initialTitle,
  initialOwner,
  initialDueDate,
  aiGenerated,
  onCreated,
  onCancel,
  ...rest
}: Props) {
  const createTask = useKAppsStore((s) => s.createTask);
  const [title, setTitle] = useState(initialTitle ?? '');
  const [owner, setOwner] = useState(initialOwner ?? '');
  const [dueDate, setDueDate] = useState(initialDueDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Title is required');
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    try {
      await createTask({
        channelId,
        title: title.trim(),
        owner: owner.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        sourceThreadId,
        sourceMessageId,
        aiGenerated: aiGenerated ?? false,
      });
      setTitle('');
      setOwner('');
      setDueDate('');
      onCreated?.();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="create-task-form"
      onSubmit={handleSubmit}
      data-testid={rest['data-testid'] ?? 'create-task-form'}
      noValidate
    >
      <label className="create-task-form__label">
        <span>Title</span>
        <input
          type="text"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-required="true"
          aria-invalid={Boolean(validationError && !title.trim())}
          data-testid="create-task-title"
        />
      </label>
      <label className="create-task-form__label">
        <span>Owner</span>
        <input
          type="text"
          name="owner"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          data-testid="create-task-owner"
        />
      </label>
      <label className="create-task-form__label">
        <span>Due date</span>
        <input
          type="date"
          name="dueDate"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          data-testid="create-task-due"
        />
      </label>
      {validationError && (
        <p className="create-task-form__error" role="alert">
          {validationError}
        </p>
      )}
      <div className="create-task-form__actions">
        <button
          type="submit"
          disabled={submitting}
          className="create-task-form__submit"
          data-testid="create-task-submit"
        >
          {submitting ? 'Creating…' : 'Create task'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="create-task-form__cancel"
            data-testid="create-task-cancel"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
