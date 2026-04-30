// Guardrail-rewrite skill — Phase 2 surface that scans an outgoing
// composer message for PII (phone numbers, emails, US-style SSNs),
// aggressive / inappropriate tone, and unverified factual claims, and
// proposes a rewritten version with the risky parts called out. Runs
// on the on-device Bonsai-8B model because the check is short
// and latency-sensitive (the user is waiting to send the message).
// Honours the INSUFFICIENT contract: if the
// model cannot determine risk level, the renderer treats the message
// as safe and shows no card.

import {
  GuardrailError,
  INSUFFICIENT_RULE,
  detectInsufficient,
  registerSkill,
  type SkillDefinition,
  type SkillResult,
  type SkillSource,
} from '../skill-framework.js';
import type { InferenceRouter } from '../router.js';

export interface GuardrailCheckInput {
  text: string;
  // Optional channel id for the privacy strip's routing reason.
  channelId?: string;
}

export type RiskCategory = 'pii' | 'tone' | 'unverified-claim';

export interface RiskFinding {
  category: RiskCategory;
  excerpt: string;
  reason: string;
  // Heuristic source: 'regex' for the deterministic checks the framework
  // runs locally before inference, 'model' for SLM-flagged risks.
  source: 'regex' | 'model';
}

export interface GuardrailRewriteResult {
  // True when the original text is safe to send as-is.
  safe: boolean;
  findings: RiskFinding[];
  rewrite?: string;
  // Free-form one-liner explaining what changed (or why it's safe).
  rationale: string;
}

const META_PROMPT = [
  'You are a privacy and tone reviewer for an outgoing chat message.',
  'You receive ONE message and must decide if it is safe to send.',
  'Categorise risks into: pii, tone, unverified-claim.',
  '- pii: phone numbers, emails, addresses, SSN, account numbers.',
  '- tone: aggressive, hostile, or harassing language.',
  '- unverified-claim: factual claims about a third party that the user',
  '  may not be able to back up.',
  '',
  'Output STRICT format (no extra prose):',
  'SAFE: <true|false>',
  'FINDINGS:',
  '- <category> | <excerpt> | <short reason>',
  '(repeat findings; omit the section entirely if SAFE=true)',
  'REWRITE: <one-line rewrite with risky parts removed/softened>',
  '(omit REWRITE if SAFE=true)',
  'RATIONALE: <one short sentence>',
].join('\n');

export const guardrailRewriteSkill: SkillDefinition<
  GuardrailCheckInput,
  GuardrailRewriteResult
> = {
  id: 'guardrail-rewrite',
  name: 'Guardrail rewrite',
  description: 'Scans outgoing chat messages for PII, tone, and unverified claims.',
  metaPrompt: META_PROMPT,
  steps: [
    {
      order: 1,
      action: 'regex_scan',
      description: 'Run deterministic PII regex pre-check (phones, emails, SSN).',
    },
    { order: 2, action: 'build_prompt', description: 'Build the SLM review prompt.' },
    { order: 3, action: 'run_inference', description: 'Run inference via the router on the on-device model.' },
    {
      order: 4,
      action: 'parse_output',
      description: 'Parse the SAFE/FINDINGS/REWRITE block.',
    },
  ],
  tools: [
    {
      id: 'local:regex-scan',
      type: 'local',
      description: 'Local regex-based PII detection.',
      required: true,
    },
  ],
  guardrails: {
    requireFields: ['text'],
    refusalTemplate:
      "I can't review this message — {reason}. Send it as-is or rewrite manually.",
    requireSourceAttribution: false,
  },
  responseTemplate: {
    format: 'card',
    requiredFields: ['safe', 'findings', 'rationale'],
  },
  preferredTier: 'local',
  taskType: 'smart_reply',
  parser(rawOutput) {
    const parsed = parseGuardrailOutput(rawOutput);
    return {
      result: parsed.result,
      sources: [],
      ...(typeof parsed.confidence === 'number' ? { confidence: parsed.confidence } : {}),
      ...(parsed.parseFailed ? { parseFailed: true } : {}),
    };
  },
  buildInputPrompt(input) {
    return `Message:\n${input.text}\n`;
  },
};

registerSkill(guardrailRewriteSkill as SkillDefinition<unknown, unknown>);

// Deterministic regex-based pre-pass. We always run this before calling
// the SLM so the renderer can show *something* even when the model is
// unavailable or unsure.
const PII_PATTERNS: { name: RiskCategory; reason: string; pattern: RegExp }[] = [
  {
    name: 'pii',
    reason: 'phone number',
    // North-American style 10–11 digit numbers with separators.
    pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
  },
  {
    name: 'pii',
    reason: 'email address',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    name: 'pii',
    reason: 'SSN-like number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
];

export function regexFindings(text: string): RiskFinding[] {
  const out: RiskFinding[] = [];
  for (const p of PII_PATTERNS) {
    p.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.pattern.exec(text))) {
      out.push({
        category: p.name,
        excerpt: m[0],
        reason: p.reason,
        source: 'regex',
      });
    }
  }
  return out;
}

export interface RunGuardrailArgs {
  input: GuardrailCheckInput;
}

export async function runGuardrailRewrite(
  router: InferenceRouter,
  args: RunGuardrailArgs,
): Promise<SkillResult<GuardrailRewriteResult>> {
  const { input } = args;
  if (!input?.text || input.text.trim().length === 0) {
    return refuse('the message is empty.');
  }

  // Local regex pre-pass.
  const local = regexFindings(input.text);

  // Build the prompt.
  let prompt = `${INSUFFICIENT_RULE}\n\n`;
  prompt += guardrailRewriteSkill.metaPrompt;
  prompt += '\n\n';
  prompt += guardrailRewriteSkill.buildInputPrompt(input);

  let resp;
  try {
    resp = await router.run({
      taskType: guardrailRewriteSkill.taskType,
      prompt,
      channelId: input.channelId,
    });
  } catch (e) {
    return refuse(e instanceof Error ? e.message : 'inference failed');
  }
  const decision = router.lastDecision();
  const decisionTier =
    decision.tier && decision.tier !== 'server' ? decision.tier : undefined;
  const tier: 'local' =
    decisionTier ?? guardrailRewriteSkill.preferredTier;
  const routeReason = decision.reason || 'Routed guardrail review to on-device Bonsai-8B.';

  if (detectInsufficient(resp.output)) {
    // Treat INSUFFICIENT as "no opinion" — return whatever the regex
    // pre-pass found so the user still gets a deterministic baseline.
    return {
      status: 'ok',
      skillId: guardrailRewriteSkill.id,
      result: {
        safe: local.length === 0,
        findings: local,
        rationale:
          local.length > 0
            ? 'Local checks flagged potential PII; the model declined to add detail.'
            : 'Model could not assess and local checks found nothing.',
      },
      sources: localSources(local),
      confidence: local.length === 0 ? 0.5 : 0.9,
      rawOutput: resp.output,
      privacy: {
        computeLocation: 'on_device',
        modelName: resp.model || 'bonsai-8b',
        tier,
        reason: routeReason,
        dataEgressBytes: 0,
        sources: localSources(local),
      },
    };
  }

  let parsed;
  try {
    parsed = parseGuardrailOutput(resp.output);
  } catch (e) {
    return refuse(e instanceof Error ? e.message : 'parser failed');
  }

  // Merge the regex pre-pass with the model's findings, dedup by excerpt.
  const merged = mergeFindings(local, parsed.result.findings);
  const safe = parsed.result.safe && local.length === 0;
  const rewrite = safe ? undefined : parsed.result.rewrite ?? rewriteFallback(input.text, merged);

  return {
    status: 'ok',
    skillId: guardrailRewriteSkill.id,
    result: {
      safe,
      findings: merged,
      ...(rewrite ? { rewrite } : {}),
      rationale: parsed.result.rationale || (safe ? 'No risks detected.' : 'See findings.'),
    },
    sources: localSources(merged),
    confidence: parsed.confidence ?? (safe ? 1 : 0.85),
    rawOutput: resp.output,
    privacy: {
      computeLocation: 'on_device',
      modelName: resp.model || 'bonsai-8b',
      tier,
      reason: routeReason,
      dataEgressBytes: 0,
      sources: localSources(merged),
    },
  };
}

function refuse(reason: string): SkillResult<GuardrailRewriteResult> {
  return {
    status: 'refused',
    skillId: guardrailRewriteSkill.id,
    refusal: {
      reason,
      origin: 'pre_inference',
      refusalText: guardrailRewriteSkill.guardrails.refusalTemplate
        .replace('{action}', 'review this message')
        .replace('{reason}', reason),
    },
    privacy: null,
  };
}

function localSources(findings: RiskFinding[]): SkillSource[] {
  const out: SkillSource[] = [];
  for (const f of findings) {
    out.push({ kind: 'tool', id: `regex:${f.category}:${f.excerpt}`, label: f.reason });
  }
  return out;
}

function mergeFindings(local: RiskFinding[], modelFindings: RiskFinding[]): RiskFinding[] {
  const seen = new Set<string>();
  const out: RiskFinding[] = [];
  for (const f of [...local, ...modelFindings]) {
    const k = `${f.category}|${f.excerpt.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function rewriteFallback(text: string, findings: RiskFinding[]): string {
  let rewritten = text;
  for (const f of findings) {
    if (f.source === 'regex') {
      rewritten = rewritten.split(f.excerpt).join('[redacted]');
    }
  }
  return rewritten;
}

interface ParsedOutput {
  result: GuardrailRewriteResult;
  confidence?: number;
  parseFailed?: boolean;
}

export function parseGuardrailOutput(out: string): ParsedOutput {
  const lines = out.split('\n').map((l) => l.trim());
  let safe = false;
  const findings: RiskFinding[] = [];
  let rewrite: string | undefined;
  let rationale = '';
  let inFindings = false;

  for (const line of lines) {
    if (!line) continue;
    const safeMatch = line.match(/^safe\s*:\s*(true|false)\s*$/i);
    if (safeMatch) {
      safe = safeMatch[1].toLowerCase() === 'true';
      inFindings = false;
      continue;
    }
    if (/^findings\s*:?\s*$/i.test(line)) {
      inFindings = true;
      continue;
    }
    const rewriteMatch = line.match(/^rewrite\s*:\s*(.+)$/i);
    if (rewriteMatch) {
      rewrite = rewriteMatch[1].trim();
      inFindings = false;
      continue;
    }
    const rationaleMatch = line.match(/^rationale\s*:\s*(.+)$/i);
    if (rationaleMatch) {
      rationale = rationaleMatch[1].trim();
      inFindings = false;
      continue;
    }
    if (inFindings) {
      const stripped = line.replace(/^[-*•·\s\t]+/, '');
      const parts = stripped.split('|').map((p) => p.trim());
      if (parts.length < 3) continue;
      const cat = parts[0].toLowerCase();
      if (cat !== 'pii' && cat !== 'tone' && cat !== 'unverified-claim') continue;
      findings.push({
        category: cat as RiskCategory,
        excerpt: parts[1],
        reason: parts[2],
        source: 'model',
      });
    }
  }
  if (!rationale && findings.length === 0 && !safe) {
    throw new GuardrailError('parser could not extract any guardrail signal.', 'parse_failed');
  }
  return {
    result: {
      safe,
      findings,
      ...(rewrite ? { rewrite } : {}),
      rationale,
    },
  };
}
