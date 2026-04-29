import type {
  Approval,
  ApprovalDecision,
  Artifact,
  Form,
  FormFieldDef,
  KAppCard,
  Task,
  TaskStatus,
} from '../../types/kapps';
import type { AIEmployee } from '../../types/aiEmployee';
import { TaskCard } from './TaskCard';
import { ApprovalCard } from './ApprovalCard';
import { ArtifactCard } from './ArtifactCard';
import { EventCard } from './EventCard';
import { FormCard } from './FormCard';
import { AIEmployeeModeBadge } from '../ai/AIEmployeeModeBadge';

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
  | { type: 'artifact:view'; artifact: Artifact }
  | { type: 'form:submit'; form: Form; fields: Record<string, string> }
  | { type: 'form:discard'; form: Form };

interface Props {
  card: KAppCard;
  onAction?: (action: CardAction) => void;
  // mode controls density across all card kinds. 'compact' is used by
  // ThreadPanel's "Linked Objects" rail.
  mode?: 'full' | 'compact';
  // Optional template lookup so FormCard can render its layout. Without
  // this, form cards fall back to a minimal 1-column grid using the
  // field names that exist on Form.fields.
  formTemplateLookup?: (templateId: string) => FormFieldDef[] | undefined;
  // Phase 4 — when the card was produced by an AI Employee, the
  // renderer wraps the child card with a header row containing the
  // employee's mode badge. Parents pass in the full employee record
  // (not just an id) so the badge doesn't have to fetch.
  aiEmployee?: AIEmployee;
}

// KAppCardRenderer is the dispatcher referenced in ARCHITECTURE.md section
// 2.1 — it inspects the card kind and forwards to the matching component.
// It returns null for an unknown / mis-shaped card so consumers can map over
// a heterogeneous list without filtering first.
export function KAppCardRenderer({
  card,
  onAction,
  mode = 'full',
  formTemplateLookup,
  aiEmployee,
}: Props) {
  const inner = renderChild({ card, onAction, mode, formTemplateLookup });
  if (inner && aiEmployee) {
    return (
      <div
        className="kapp-card-renderer kapp-card-renderer--ai"
        data-testid="kapp-card-renderer"
      >
        <div
          className="kapp-card-renderer__header"
          data-testid="kapp-card-renderer-ai-header"
        >
          <AIEmployeeModeBadge
            mode={aiEmployee.mode}
            employeeName={aiEmployee.name}
            size="md"
          />
        </div>
        {inner}
      </div>
    );
  }
  return inner;
}

function renderChild({
  card,
  onAction,
  mode,
  formTemplateLookup,
}: {
  card: KAppCard;
  onAction?: (action: CardAction) => void;
  mode: 'full' | 'compact';
  formTemplateLookup?: (templateId: string) => FormFieldDef[] | undefined;
}) {
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
    case 'form': {
      if (!card.form) return null;
      const tmplFields =
        formTemplateLookup?.(card.form.templateId) ??
        Object.keys(card.form.fields).map((name) => ({ name, label: name }));
      return (
        <FormCard
          form={card.form}
          templateFields={tmplFields}
          aiPrefilledFieldNames={card.form.aiGenerated ? Object.keys(card.form.fields) : []}
          sourceThreadId={card.form.sourceThreadId}
          onSubmit={
            onAction
              ? async (fields) =>
                  onAction({ type: 'form:submit', form: card.form!, fields })
              : undefined
          }
          onDiscard={
            onAction ? () => onAction({ type: 'form:discard', form: card.form! }) : undefined
          }
        />
      );
    }
    default:
      return null;
  }
}
