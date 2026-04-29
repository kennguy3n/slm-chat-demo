import { useMemo } from 'react';
import { OutputReview, type OutputReviewSource } from '../kapps/OutputReview';
import { CitationRenderer } from '../knowledge/CitationRenderer';
import type { CitationSource } from '../knowledge/CitationChip';
import type { AuditObjectKind } from '../../types/audit';
import type { AIEmployeeRecipe } from '../../types/aiEmployee';
import type { PrivacyStripData } from '../../types/ai';

// RecipeResultEnvelope is the renderer-visible projection of the
// `RecipeResult` that flows out of the Electron main process. It
// intentionally avoids importing the main-process types so the
// renderer module graph stays clean.
export interface RecipeResultEnvelope {
  status: 'ok' | 'refused';
  output: unknown;
  model: string;
  tier: string;
  reason: string;
}

interface Props {
  recipeId: string;
  recipe?: AIEmployeeRecipe;
  result: RecipeResultEnvelope;
  // `aiEmployeeName` is stamped on the heading + privacy strip so the
  // reviewer can see which employee produced the output.
  aiEmployeeName?: string;
  // Accept persists the reviewed (and potentially edited) content.
  // The caller owns the KApp persistence — RecipeOutputGate does not
  // directly call kappsApi so the same component works for tasks,
  // approvals, and artifacts.
  onAccept: (edited: string) => void | Promise<void>;
  onDiscard: () => void;
  onEdit?: (edited: string) => void;
}

// OBJECT_KIND_BY_RECIPE maps a recipe id to the AuditObjectKind its
// accepted output becomes. Creation recipes (draft_prd, draft_proposal,
// create_qbr) produce artifacts; extract_tasks produces a task batch;
// prefill_approval produces an approval. Summarize is treated as a
// thread-level artifact (saved as a draft summary card) and therefore
// also uses the `artifact` kind for heading purposes.
const OBJECT_KIND_BY_RECIPE: Record<string, AuditObjectKind> = {
  draft_prd: 'artifact',
  draft_proposal: 'artifact',
  create_qbr: 'artifact',
  summarize: 'artifact',
  extract_tasks: 'task',
  prefill_approval: 'approval',
};

// Creation recipes need inline editing; status-transition-only flows
// do not. Phase 4 has no pure status-transition recipes, but the
// prop is surfaced so future recipes can opt out.
const ALLOW_EDIT_BY_RECIPE: Record<string, boolean> = {
  draft_prd: true,
  draft_proposal: true,
  create_qbr: true,
  summarize: true,
  extract_tasks: true,
  prefill_approval: false,
};

// serializeRecipeOutput reduces the recipe's (heterogeneous) output
// shape to a reviewable string. Recipes that already emit a prompt or
// body use that; structured outputs (extract_tasks, prefill_approval)
// are pretty-printed so the reviewer can see the fields before
// accepting.
function serializeRecipeOutput(recipeId: string, output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  const o = output as Record<string, unknown>;
  if (typeof o.prompt === 'string' && o.prompt.length > 0) {
    return o.prompt;
  }
  if (recipeId === 'extract_tasks' && Array.isArray(o.tasks)) {
    const tasks = o.tasks as Array<Record<string, unknown>>;
    if (tasks.length === 0) return 'No tasks extracted.';
    return tasks
      .map((t, i) => {
        const title = typeof t.title === 'string' ? t.title : `Task ${i + 1}`;
        const owner = typeof t.owner === 'string' ? ` (owner: ${t.owner})` : '';
        const due = typeof t.dueDate === 'string' ? ` [due ${t.dueDate}]` : '';
        return `${i + 1}. ${title}${owner}${due}`;
      })
      .join('\n');
  }
  if (recipeId === 'prefill_approval') {
    const lines: string[] = [];
    if (typeof o.title === 'string') lines.push(`Title: ${o.title}`);
    if (typeof o.vendor === 'string') lines.push(`Vendor: ${o.vendor}`);
    if (typeof o.amount === 'string') lines.push(`Amount: ${o.amount}`);
    if (typeof o.risk === 'string') lines.push(`Risk: ${o.risk}`);
    if (typeof o.justification === 'string')
      lines.push(`Justification: ${o.justification}`);
    return lines.join('\n');
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

// extractSources pulls source attribution (for the OutputReview
// "Sources" section) out of the recipe output, tolerating the varied
// shapes each recipe emits.
function extractSources(output: unknown): OutputReviewSource[] {
  if (output == null || typeof output !== 'object') return [];
  const o = output as Record<string, unknown>;
  if (Array.isArray(o.sources)) {
    return (o.sources as Array<Record<string, unknown>>).map((s, i) => ({
      id: typeof s.id === 'string' ? s.id : `source-${i}`,
      label:
        typeof s.sender === 'string' && typeof s.excerpt === 'string'
          ? `${s.sender}: ${s.excerpt}`
          : typeof s.label === 'string'
          ? s.label
          : `Source ${i + 1}`,
      excerpt:
        typeof s.excerpt === 'string' && typeof s.sender !== 'string'
          ? s.excerpt
          : undefined,
    }));
  }
  if (Array.isArray(o.sourceMessageIds)) {
    return (o.sourceMessageIds as string[]).map((id, i) => ({
      id,
      label: `Message ${i + 1}`,
    }));
  }
  return [];
}

// RecipeOutputGate is the Phase 4 human-approval gate that stands
// between a recipe run and any KApp persistence. The renderer never
// auto-writes recipe output to the KApps API — every recipe result
// passes through this component first, the user reviews + optionally
// edits the content, and only on Accept does the caller persist the
// KApp (task / approval / artifact).
//
// The gate wraps the existing `OutputReview` component, so its
// privacy-strip, source-attribution, and edit affordances stay
// consistent with Phase 3's artifact / task preview flows.
export function RecipeOutputGate({
  recipeId,
  recipe,
  result,
  aiEmployeeName,
  onAccept,
  onDiscard,
  onEdit,
}: Props) {
  const content = useMemo(
    () => serializeRecipeOutput(recipeId, result.output),
    [recipeId, result.output],
  );
  const sources = useMemo(
    () => extractSources(result.output),
    [result.output],
  );

  // Refused runs don't reach the gate in the normal path, but when
  // they do we show a read-only refusal banner so the user knows why
  // nothing will be persisted.
  if (result.status === 'refused') {
    return (
      <section
        className="recipe-output-gate recipe-output-gate--refused"
        data-testid="recipe-output-gate-refused"
        role="alert"
      >
        <h3 className="recipe-output-gate__heading">
          {recipe?.name ?? recipeId} refused
        </h3>
        <p className="recipe-output-gate__reason">{result.reason}</p>
        <button
          type="button"
          onClick={onDiscard}
          data-testid="recipe-output-gate-dismiss"
        >
          Dismiss
        </button>
      </section>
    );
  }

  const objectKind = OBJECT_KIND_BY_RECIPE[recipeId] ?? 'artifact';
  const allowEdit = ALLOW_EDIT_BY_RECIPE[recipeId] ?? true;
  const heading = recipe
    ? `Review ${recipe.name}${aiEmployeeName ? ` from ${aiEmployeeName}` : ''}`
    : undefined;

  const privacy: PrivacyStripData = {
    computeLocation: 'on_device',
    modelName: result.model || 'ternary-bonsai-8b',
    sources: sources.map((s) => ({
      kind: 'message' as const,
      id: s.id,
      label: s.label,
    })),
    dataEgressBytes: 0,
    whySuggested:
      result.reason ||
      'Drafted on-device for review. Nothing has been saved yet.',
    origin: {
      kind: 'thread',
      id: '',
      label: aiEmployeeName
        ? `${aiEmployeeName} recipe output`
        : 'Recipe output',
    },
  };

  const hasCitations = /\[source:[a-zA-Z0-9_\-:.]+\]/.test(content);
  const citationSources: CitationSource[] = sources.map((s) => ({
    kind: 'message',
    id: s.id,
    label: s.label,
    excerpt: s.excerpt,
  }));

  return (
    <div
      className="recipe-output-gate"
      data-testid="recipe-output-gate"
      data-recipe-id={recipeId}
    >
      {hasCitations && (
        <div
          className="recipe-output-gate__citations"
          data-testid="recipe-output-gate-citations"
        >
          <CitationRenderer text={content} sources={citationSources} />
        </div>
      )}
      <OutputReview
        content={content}
        sources={sources}
        objectKind={objectKind}
        heading={heading}
        description={
          recipe?.description
            ? `${recipe.description} Review before anything is written to the workspace.`
            : 'Review the recipe output before it is persisted.'
        }
        privacy={privacy}
        allowEdit={allowEdit}
        onAccept={onAccept}
        onDiscard={onDiscard}
        onEdit={onEdit}
      />
    </div>
  );
}
