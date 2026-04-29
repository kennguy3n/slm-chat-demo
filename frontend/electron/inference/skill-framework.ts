// AI Skills Framework — the structured contract every skill in the
// Electron main-process inference layer follows. SLMs (Gemma 4 E2B/E4B)
// have limited world knowledge and a non-trivial hallucination rate,
// so every skill is built around four load-bearing rules:
//
//   1. The prompt MUST instruct the model to answer "INSUFFICIENT: <reason>"
//      when it cannot ground its answer in the provided context.
//   2. The prompt MUST be detailed and explicit — no implicit assumptions.
//   3. The skill MUST validate the model output against a response template
//      and fall back to a safe default if parsing fails.
//   4. Every output MUST attribute itself back to source messages or
//      memory facts so the renderer's privacy strip can render origins.
//
// Skills register with a small in-process registry; `runSkill` is the
// canonical executor that injects user context from AI Memory, runs
// pre-inference guardrails, dispatches inference via the router,
// detects refusals, parses the output, runs post-inference guardrails,
// and returns a structured `SkillResult` with privacy-strip metadata.

import type { TaskType } from './adapter.js';
import type { InferenceRouter } from './router.js';

// ---------- core types ----------

export interface SkillStep {
  order: number;
  // Action keyword the executor recognises. Custom skills may add their
  // own values; the canonical built-ins are listed below for clarity.
  action:
    | 'read_memory'
    | 'build_prompt'
    | 'run_inference'
    | 'parse_output'
    | 'validate'
    | string;
  description: string;
}

export type ToolType = 'local' | 'remote';

export interface ToolDeclaration {
  // Canonical id, e.g. `local:memory-read`, `remote:weather-search`.
  id: string;
  type: ToolType;
  description: string;
  required: boolean;
}

export interface GuardrailPolicy {
  // Pre-inference checks
  requireMinMessages?: number;
  requireFields?: string[]; // e.g. ['destination', 'duration']
  maxPromptTokens?: number;

  // Post-inference checks
  // 0–1 floor; if the parsed result reports a confidence below this,
  // surface a structured refusal instead of the parsed result.
  confidenceThreshold?: number;
  // Refusal template using {action} and {reason} placeholders.
  refusalTemplate: string;
  // Regex patterns that the raw model output MUST NOT match. Using
  // string sources rather than RegExp objects so SkillDefinitions are
  // serialisable in tests.
  prohibitedPatterns?: string[];
  // Whether the parsed result MUST carry at least one source attribution
  // (sourceMessageId / sourceMemoryId / sourceTool).
  requireSourceAttribution: boolean;
}

export type ResponseFormat = 'list' | 'card' | 'itinerary' | 'freeform';

export interface ResponseTemplate {
  format: ResponseFormat;
  // Structural fields the parsed response MUST carry; ordering matters
  // for human-readable error messages.
  requiredFields: string[];
  maxItems?: number;
}

// SkillDefinition — the static contract a skill registers. Skills are
// data-only; the executor is generic. A `parser` extracts the skill-
// specific structured response from the raw model output.
export interface SkillDefinition<Input = unknown, Output = unknown> {
  id: string; // e.g. 'family-checklist', 'trip-planner'
  name: string;
  description: string;

  // Meta prompt: system-level instructions. May contain
  // `[USER_CONTEXT_SLOT]` / `[INPUT_SLOT]` placeholders that
  // `runSkill` substitutes at execution time.
  metaPrompt: string;
  // Optional pre-resolved user context (e.g. from AI Memory) that the
  // executor stitches into the metaPrompt's slot.
  userContextSlot?: string;

  steps: SkillStep[];
  tools: ToolDeclaration[];
  guardrails: GuardrailPolicy;
  responseTemplate: ResponseTemplate;

  preferredTier: 'e2b' | 'e4b';
  taskType: TaskType;

  // Pure parser: takes the raw model output and the input context and
  // returns the structured response, the source attributions, and
  // optionally a confidence score.
  parser: (rawOutput: string, input: Input) => SkillParseResult<Output>;
  // Builds the input-specific prompt body (the part below the
  // metaPrompt + user context). Lets each skill stay declarative
  // about what it expects without hard-coding it in the executor.
  buildInputPrompt: (input: Input) => string;
}

export interface SkillParseResult<Output> {
  result: Output;
  // Source attributions (source-message ids, memory fact ids, or tool
  // result ids). Used for guardrail enforcement + privacy strip.
  sources: SkillSource[];
  // Optional 0–1 confidence; if undefined the executor treats it as 1.0.
  confidence?: number;
  // True when the parser believes the model output was unparseable and
  // it returned a safe-default Output. Promoted to refusal by `runSkill`.
  parseFailed?: boolean;
}

export type SkillSourceKind = 'message' | 'memory' | 'tool' | 'thread';

export interface SkillSource {
  kind: SkillSourceKind;
  id: string;
  label?: string;
}

// SkillRefusal — the structured shape `runSkill` returns when a guardrail
// fires. Carries enough context for the renderer to show *why* the AI
// refused without leaking model-internal text.
export interface SkillRefusal {
  reason: string;
  // 'pre_inference' | 'insufficient' | 'post_inference' | 'parse_failed'.
  origin: 'pre_inference' | 'insufficient' | 'post_inference' | 'parse_failed';
  refusalText: string;
}

export interface PrivacyStripMetadata {
  computeLocation: 'on_device';
  modelName: string;
  tier: 'e2b' | 'e4b';
  reason: string;
  dataEgressBytes: 0;
  sources: SkillSource[];
}

export interface SkillSuccess<Output> {
  status: 'ok';
  skillId: string;
  result: Output;
  sources: SkillSource[];
  confidence: number;
  privacy: PrivacyStripMetadata;
  rawOutput: string;
}

export interface SkillRefusalResult {
  status: 'refused';
  skillId: string;
  refusal: SkillRefusal;
  privacy: PrivacyStripMetadata | null;
}

export type SkillResult<Output> = SkillSuccess<Output> | SkillRefusalResult;

export interface SkillContext<Input> {
  input: Input;
  channelId?: string;
  // Resolved user context slot (e.g. assembled from MemoryFacts).
  userContext?: string;
}

// ---------- registry ----------

const REGISTRY = new Map<string, SkillDefinition<unknown, unknown>>();

export function registerSkill<I, O>(def: SkillDefinition<I, O>): void {
  REGISTRY.set(def.id, def as SkillDefinition<unknown, unknown>);
}

export function getSkill<I = unknown, O = unknown>(
  id: string,
): SkillDefinition<I, O> | undefined {
  return REGISTRY.get(id) as SkillDefinition<I, O> | undefined;
}

export function listSkills(): SkillDefinition[] {
  return Array.from(REGISTRY.values()) as SkillDefinition[];
}

// `__resetSkillsForTesting` is used by the framework tests to keep the
// global registry from leaking between cases. Not exported on `index.ts`.
export function __resetSkillsForTesting(): void {
  REGISTRY.clear();
}

// ---------- prompt building ----------

// SLM-required hard rule. Every skill prompt prepends this so the model
// has explicit permission to refuse rather than fabricate.
export const INSUFFICIENT_RULE =
  "If you do not have enough information or are not confident in your answer, " +
  "respond ONLY with 'INSUFFICIENT: <reason>' and do not attempt to guess or " +
  'fabricate information.';

const USER_CONTEXT_PLACEHOLDER = '[USER_CONTEXT_SLOT]';
const INPUT_PLACEHOLDER = '[INPUT_SLOT]';

export function assemblePrompt<I>(
  def: SkillDefinition<I, unknown>,
  ctx: SkillContext<I>,
): string {
  let meta = def.metaPrompt;
  const userContext = ctx.userContext ?? def.userContextSlot ?? '';
  if (meta.includes(USER_CONTEXT_PLACEHOLDER)) {
    meta = meta.replace(USER_CONTEXT_PLACEHOLDER, userContext);
  } else if (userContext) {
    meta = `${meta}\n\nUser context:\n${userContext}`;
  }
  const inputBody = def.buildInputPrompt(ctx.input);
  if (meta.includes(INPUT_PLACEHOLDER)) {
    meta = meta.replace(INPUT_PLACEHOLDER, inputBody);
    return `${INSUFFICIENT_RULE}\n\n${meta}`;
  }
  return `${INSUFFICIENT_RULE}\n\n${meta}\n\n${inputBody}`.trim();
}

// ---------- guardrails ----------

export class GuardrailError extends Error {
  origin: SkillRefusal['origin'];
  constructor(message: string, origin: SkillRefusal['origin']) {
    super(message);
    this.name = 'GuardrailError';
    this.origin = origin;
  }
}

// runPreInferenceGuardrails throws `GuardrailError` on failure so callers
// can surface the reason in a privacy-strip-friendly refusal.
export function runPreInferenceGuardrails<I>(
  def: SkillDefinition<I, unknown>,
  input: I,
  // Optional structural payload for `requireMinMessages` style checks.
  meta?: { messageCount?: number; fieldsPresent?: Record<string, unknown> },
): void {
  const policy = def.guardrails;
  if (typeof policy.requireMinMessages === 'number') {
    const n = meta?.messageCount ?? 0;
    if (n < policy.requireMinMessages) {
      throw new GuardrailError(
        `${def.name} requires at least ${policy.requireMinMessages} message(s); got ${n}.`,
        'pre_inference',
      );
    }
  }
  if (policy.requireFields && policy.requireFields.length > 0) {
    const fields = (meta?.fieldsPresent ?? (input as unknown as Record<string, unknown>)) ?? {};
    const missing = policy.requireFields.filter((f) => {
      const v = (fields as Record<string, unknown>)[f];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    });
    if (missing.length > 0) {
      throw new GuardrailError(
        `${def.name} requires field(s): ${missing.join(', ')}.`,
        'pre_inference',
      );
    }
  }
}

// detectInsufficient parses the canonical "INSUFFICIENT: <reason>" prefix
// the SLM is instructed to use. Returns null when the output looks like a
// real response.
export function detectInsufficient(output: string): string | null {
  const trimmed = (output ?? '').trim();
  // Match at the very start of the response, case-insensitive, with an
  // optional bullet/quote prefix the model sometimes adds.
  const m = trimmed.match(/^[\s>"']*INSUFFICIENT\s*:\s*(.+)/i);
  if (!m) return null;
  // Stop at the first newline so we never echo a multi-line refusal back
  // verbatim into the privacy strip.
  return m[1].split('\n')[0].trim();
}

export function runPostInferenceGuardrails<I, O>(
  def: SkillDefinition<I, O>,
  rawOutput: string,
  parsed: SkillParseResult<O>,
): void {
  const policy = def.guardrails;
  if (parsed.parseFailed) {
    throw new GuardrailError(
      `${def.name} could not parse the model output into the required template.`,
      'parse_failed',
    );
  }
  if (
    policy.requireSourceAttribution &&
    (!parsed.sources || parsed.sources.length === 0)
  ) {
    throw new GuardrailError(
      `${def.name} produced a response without source attribution.`,
      'post_inference',
    );
  }
  if (
    typeof policy.confidenceThreshold === 'number' &&
    typeof parsed.confidence === 'number' &&
    parsed.confidence < policy.confidenceThreshold
  ) {
    throw new GuardrailError(
      `${def.name} confidence ${parsed.confidence.toFixed(2)} below threshold ${policy.confidenceThreshold}.`,
      'post_inference',
    );
  }
  if (policy.prohibitedPatterns && policy.prohibitedPatterns.length > 0) {
    for (const p of policy.prohibitedPatterns) {
      let re: RegExp;
      try {
        re = new RegExp(p, 'i');
      } catch {
        continue;
      }
      if (re.test(rawOutput)) {
        throw new GuardrailError(
          `${def.name} output matched a prohibited pattern.`,
          'post_inference',
        );
      }
    }
  }
}

// ---------- executor ----------

export interface RunSkillOptions {
  // Override the prompt the executor sends to the router. Used by
  // tests and by callers that have already done custom prompt assembly.
  promptOverride?: string;
  // Override the rawOutput the executor will parse. Used by guardrail
  // tests that want to validate the post-inference path without
  // dispatching an inference call.
  rawOutputOverride?: string;
}

export async function runSkill<I, O>(
  router: InferenceRouter,
  def: SkillDefinition<I, O>,
  ctx: SkillContext<I>,
  opts: RunSkillOptions = {},
): Promise<SkillResult<O>> {
  // 1. Pre-inference guardrails. Auto-detect a `messages` field on the
  // input shape so most skills get `requireMinMessages` for free without
  // having to pass meta explicitly.
  const meta = autoMeta(ctx.input);
  try {
    runPreInferenceGuardrails(def, ctx.input, meta);
  } catch (e) {
    return refuseFromError(def, e);
  }

  // 2. Build prompt.
  const prompt = opts.promptOverride ?? assemblePrompt(def, ctx);

  // 3. Run inference (unless the caller pre-supplied raw output).
  let rawOutput: string;
  let model = '';
  let tier: 'e2b' | 'e4b' = def.preferredTier;
  let routeReason = '';
  if (opts.rawOutputOverride !== undefined) {
    rawOutput = opts.rawOutputOverride;
  } else {
    try {
      const resp = await router.run({
        taskType: def.taskType,
        prompt,
        channelId: ctx.channelId,
      });
      rawOutput = resp.output ?? '';
      model = resp.model;
      const decision = router.lastDecision();
      if (decision.tier && decision.tier !== 'server') tier = decision.tier;
      routeReason = decision.reason;
    } catch (e) {
      return refuseFromError(def, e);
    }
  }

  // 4. INSUFFICIENT check.
  const insufficient = detectInsufficient(rawOutput);
  if (insufficient) {
    const refusalText = formatRefusalTemplate(def, {
      action: def.name.toLowerCase(),
      reason: insufficient,
    });
    return {
      status: 'refused',
      skillId: def.id,
      refusal: { reason: insufficient, origin: 'insufficient', refusalText },
      privacy: model
        ? {
            computeLocation: 'on_device',
            modelName: model,
            tier,
            reason: routeReason || `Routed ${def.id} to ${tier.toUpperCase()}.`,
            dataEgressBytes: 0,
            sources: [],
          }
        : null,
    };
  }

  // 5. Parse.
  let parsed: SkillParseResult<O>;
  try {
    parsed = def.parser(rawOutput, ctx.input);
  } catch (e) {
    return refuseFromError(def, e, 'parse_failed');
  }

  // 6. Post-inference guardrails.
  try {
    runPostInferenceGuardrails(def, rawOutput, parsed);
  } catch (e) {
    return refuseFromError(def, e);
  }

  return {
    status: 'ok',
    skillId: def.id,
    result: parsed.result,
    sources: parsed.sources,
    confidence: parsed.confidence ?? 1,
    privacy: {
      computeLocation: 'on_device',
      modelName: model || `gemma-4-${tier}`,
      tier,
      reason: routeReason || `Routed ${def.id} to ${tier.toUpperCase()}.`,
      dataEgressBytes: 0,
      sources: parsed.sources,
    },
    rawOutput,
  };
}

function refuseFromError<I, O>(
  def: SkillDefinition<I, O>,
  e: unknown,
  fallbackOrigin: SkillRefusal['origin'] = 'pre_inference',
): SkillRefusalResult {
  const origin =
    e instanceof GuardrailError ? e.origin : fallbackOrigin;
  const reason =
    e instanceof Error ? e.message : 'unknown error during skill execution';
  return {
    status: 'refused',
    skillId: def.id,
    refusal: {
      reason,
      origin,
      refusalText: formatRefusalTemplate(def, {
        action: def.name.toLowerCase(),
        reason,
      }),
    },
    privacy: null,
  } as SkillRefusalResult;
  // Generic O is preserved at the type level via the cast: callers see
  // `SkillResult<O>` and this branch is the refusal variant.
}

function autoMeta(
  input: unknown,
): { messageCount?: number; fieldsPresent?: Record<string, unknown> } {
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    const out: { messageCount?: number; fieldsPresent?: Record<string, unknown> } = {
      fieldsPresent: rec,
    };
    if (Array.isArray(rec.messages)) out.messageCount = rec.messages.length;
    return out;
  }
  return {};
}

function formatRefusalTemplate<I, O>(
  def: SkillDefinition<I, O>,
  vars: { action: string; reason: string },
): string {
  return def.guardrails.refusalTemplate
    .replace('{action}', vars.action)
    .replace('{reason}', vars.reason);
}
