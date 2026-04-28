import type { Approval, ApprovalDecision, Artifact, KAppCard, Task, TaskStatus } from '../../types/kapps';
import { TaskCard } from './TaskCard';
import { ApprovalCard } from './ApprovalCard';
import { ArtifactCard } from './ArtifactCard';
import { EventCard } from './EventCard';

// CardAction is the union of every callback parents can hook into. Phase 3
// renders cards as live KApp objects (status transitions, approve / reject,
// open artifact); the dispatcher delegates to the appropriate child card and
// folds child-specific callbacks into a single onAction prop so chat surfaces
// don't need to know about each card kind.
export type CardAction =
  | { type: 'task:status'; task: Task; status: TaskStatus }
  | { type: 'task:edit'; task: Task; patch: { title?: string; owner?: string; dueDate?: string | null } }
  | { type: 'task:close'; task: Task }
  | { type: 'task:open-source'; task: Task; sourceId: string }
  | { type: 'approval:decide'; approval: Approval; decision: ApprovalDecision; note?: string }
  | { type: 'approval:open-source'; approval: Approval; sourceId: string }
  | { type: 'artifact:view'; artifact: Artifact };

interface Props {
  card: KAppCard;
  onAction?: (action: CardAction) => void;
  // mode controls density across all card kinds. 'compact' is used by
  // ThreadPanel's "Linked Objects" rail.
  mode?: 'full' | 'compact';
}

// KAppCardRenderer is the dispatcher referenced in ARCHITECTURE.md section
// 2.1 — it inspects the card kind and forwards to the matching component.
// It returns null for an unknown / mis-shaped card so consumers can map over
// a heterogeneous list without filtering first.
export function KAppCardRenderer({ card, onAction, mode = 'full' }: Props) {
  switch (card.kind) {
    case 'task':
      if (!card.task) return null;
      return (
        <TaskCard
          task={card.task}
          mode={mode}
          onStatusChange={
            onAction
              ? (status) => onAction({ type: 'task:status', task: card.task!, status })
              : undefined
          }
          onEdit={
            onAction
              ? (patch) => onAction({ type: 'task:edit', task: card.task!, patch })
              : undefined
          }
          onClose={onAction ? () => onAction({ type: 'task:close', task: card.task! }) : undefined}
          onOpenSource={
            onAction
              ? (sourceId) => onAction({ type: 'task:open-source', task: card.task!, sourceId })
              : undefined
          }
        />
      );
    case 'approval':
      if (!card.approval) return null;
      return (
        <ApprovalCard
          approval={card.approval}
          mode={mode}
          onDecide={
            onAction
              ? (decision, note) =>
                  onAction({ type: 'approval:decide', approval: card.approval!, decision, note })
              : undefined
          }
          onOpenSource={
            onAction
              ? (sourceId) =>
                  onAction({ type: 'approval:open-source', approval: card.approval!, sourceId })
              : undefined
          }
        />
      );
    case 'artifact':
      if (!card.artifact) return null;
      return (
        <ArtifactCard
          artifact={card.artifact}
          mode={mode}
          onOpen={
            onAction ? (artifact) => onAction({ type: 'artifact:view', artifact }) : undefined
          }
        />
      );
    case 'event':
      return card.event ? <EventCard event={card.event} /> : null;
    default:
      return null;
  }
}
