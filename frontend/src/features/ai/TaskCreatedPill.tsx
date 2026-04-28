interface Props {
  count: number;
  // Origin label rendered after the count, e.g. the originating
  // message excerpt or the thread title.
  label?: string;
  // Optional click handler — typically scrolls to or opens the
  // originating TaskExtractionCard.
  onClick?: () => void;
  testId?: string;
}

// TaskCreatedPill is the inline AI badge that appears under a message
// after the user accepts items from a TaskExtractionCard
// (PROPOSAL.md §4.2 "AI lives inside the conversation"). It's tiny on
// purpose: chat surfaces should never grow vertically just because the
// user accepted some tasks.
export function TaskCreatedPill({ count, label, onClick, testId }: Props) {
  if (count <= 0) return null;
  const text = `${count} ${count === 1 ? 'task' : 'tasks'} created`;
  const suffix = label ? ` from "${label}"` : '';
  return (
    <button
      type="button"
      className="task-created-pill"
      data-testid={testId ?? 'task-created-pill'}
      onClick={onClick}
      aria-label={`${text}${suffix}`}
    >
      <span className="task-created-pill__icon" aria-hidden>
        🧠
      </span>
      <span className="task-created-pill__count">{text}</span>
      {label && <span className="task-created-pill__label">{suffix}</span>}
    </button>
  );
}
