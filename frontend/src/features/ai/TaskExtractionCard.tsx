import { useState } from 'react';
import type {
  ExtractedTask,
  KAppsExtractedTask,
  PrivacyStripData,
} from '../../types/ai';
import { PrivacyStrip } from './PrivacyStrip';

// TaskItem is the union shape rendered by the card. The B2C surface
// passes ExtractedTask values (title / dueDate / type); the B2B surface
// passes KAppsExtractedTask values (title / owner / dueDate / status /
// sourceMessageId). The component handles either gracefully.
export type TaskItem = (ExtractedTask | KAppsExtractedTask) & {
  // Optional B2B-only fields that ExtractedTask doesn't have.
  owner?: string;
  status?: string;
  sourceMessageId?: string;
};

interface Props {
  // Title shown in the badge. Defaults to "<n> items extracted".
  title?: string;
  tasks: TaskItem[];
  // Source-message ID for the privacy strip's linked-origin pin. Falls
  // back to the first task's sourceMessageId when omitted.
  sourceMessageId?: string;
  channelId?: string;
  model: string;
  computeLocation: PrivacyStripData['computeLocation'];
  dataEgressBytes: number;
  // The B2B surface labels accepted tasks differently ("Add to plan" vs
  // "Add to my list"). The default works for B2C.
  acceptLabel?: string;
  // Called once per task when the user clicks Accept. The card removes
  // the task from the proposed list locally so rapid double-clicks
  // don't double-create.
  onAccept?: (task: TaskItem) => void;
  onDiscard?: (task: TaskItem) => void;
}

// TaskExtractionCard renders the inline AI badge described in
// PROPOSAL.md §5.2 ("3 items extracted"), expandable to a list of
// proposed actions with Accept / Edit / Discard buttons. Each accepted
// task fires onAccept; the parent surface (ChatSurface for B2C, the B2B
// thread view for B2B) is responsible for instantiating a real TaskCard
// and adding it to the channel.
//
// PrivacyStrip renders below with on-device / Bonsai-8B / 0
// bytes egress so the eight elements from PROPOSAL.md §4.3 are always
// present.
export function TaskExtractionCard({
  title,
  tasks: initial,
  sourceMessageId,
  channelId,
  model,
  computeLocation,
  dataEgressBytes,
  acceptLabel = 'Accept',
  onAccept,
  onDiscard,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskItem[]>(initial);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const badgeTitle = title ?? `${tasks.length} ${tasks.length === 1 ? 'item' : 'items'} extracted`;
  const originID = sourceMessageId ?? tasks[0]?.sourceMessageId ?? channelId ?? 'unknown';

  function accept(idx: number) {
    const t = tasks[idx];
    if (!t) return;
    const merged: TaskItem = { ...t, title: edits[idx]?.trim() ? edits[idx].trim() : t.title };
    onAccept?.(merged);
    setTasks((prev) => prev.filter((_, i) => i !== idx));
    setEdits((prev) => {
      const out = { ...prev };
      delete out[idx];
      return out;
    });
  }

  function discard(idx: number) {
    const t = tasks[idx];
    if (!t) return;
    onDiscard?.(t);
    setTasks((prev) => prev.filter((_, i) => i !== idx));
    setEdits((prev) => {
      const out = { ...prev };
      delete out[idx];
      return out;
    });
  }

  if (tasks.length === 0) {
    return null;
  }

  const privacy: PrivacyStripData = {
    computeLocation,
    modelName: model,
    sources: [
      {
        kind: 'message',
        id: originID,
        label: 'Source message',
      },
    ],
    dataEgressBytes,
    confidence: 0.81,
    whySuggested: 'Detected actionable items in the message.',
    origin: {
      kind: 'message',
      id: originID,
      label: 'Source message',
    },
  };

  return (
    <article
      className="task-extraction-card"
      data-testid="task-extraction-card"
      aria-label="Extracted tasks"
    >
      <button
        type="button"
        className="task-extraction-card__badge"
        aria-expanded={open}
        data-testid="task-extraction-badge"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="task-extraction-card__ai">AI</span>
        <span className="task-extraction-card__title">{badgeTitle}</span>
      </button>
      {open && (
        <ul className="task-extraction-card__list" data-testid="task-extraction-list">
          {tasks.map((t, idx) => (
            <li
              key={`${idx}-${t.title}`}
              className="task-extraction-card__item"
              data-testid={`task-extraction-item-${idx}`}
            >
              <input
                type="text"
                className="task-extraction-card__input"
                aria-label="Task title"
                data-testid={`task-extraction-input-${idx}`}
                value={edits[idx] ?? t.title}
                onChange={(e) => {
                  const next = e.target.value;
                  setEdits((prev) => ({ ...prev, [idx]: next }));
                }}
              />
              <dl className="task-extraction-card__meta">
                {t.owner && (
                  <div>
                    <dt>Owner</dt>
                    <dd>{t.owner}</dd>
                  </div>
                )}
                {t.dueDate && (
                  <div>
                    <dt>Due</dt>
                    <dd>{t.dueDate}</dd>
                  </div>
                )}
                {'type' in t && t.type && (
                  <div>
                    <dt>Type</dt>
                    <dd>{t.type}</dd>
                  </div>
                )}
                {'status' in t && t.status && (
                  <div>
                    <dt>Status</dt>
                    <dd>{t.status}</dd>
                  </div>
                )}
              </dl>
              <div
                className="task-extraction-card__actions"
                role="group"
                aria-label="Task actions"
              >
                <button
                  type="button"
                  className="task-extraction-card__accept"
                  data-testid={`task-extraction-accept-${idx}`}
                  onClick={() => accept(idx)}
                >
                  {acceptLabel}
                </button>
                <button
                  type="button"
                  className="task-extraction-card__discard"
                  data-testid={`task-extraction-discard-${idx}`}
                  onClick={() => discard(idx)}
                >
                  Discard
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PrivacyStrip data={privacy} />
    </article>
  );
}
