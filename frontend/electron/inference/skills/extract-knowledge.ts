// LLM-driven knowledge extraction (Phase 7 — B2B real-LLM redesign).
//
// The renderer's KnowledgeGraphPanel previously hit
// `POST /api/channels/{id}/knowledge/extract`, which ran a pure
// regex/keyword heuristic in `backend/internal/services/knowledge.go`.
// The redesign adds an LLM path on top: we ask Bonsai-1.7B to identify
// decisions, owners, risks, requirements, and deadlines from the
// channel's messages and project them onto the existing
// KnowledgeEntity shape so the rest of the graph (renderer + API)
// is unchanged.
//
// The Go regex extractor stays in place as a fallback so the panel
// keeps working in environments without Ollama.

import type { InferenceRouter } from '../router.js';
import {
  buildExtractKnowledgePrompt,
  parseExtractKnowledgeOutput,
  type KnowledgeKind,
  type KnowledgeRow,
} from '../prompts/index.js';

export interface ExtractKnowledgeMessage {
  id: string;
  channelId: string;
  threadId?: string;
  senderId: string;
  content: string;
  createdAt?: string;
}

export interface ExtractKnowledgeRequest {
  channelId: string;
  messages: ExtractKnowledgeMessage[];
}

// Mirrors the Go `models.KnowledgeEntity` shape so the renderer can
// drop these straight into its existing `entities` state without an
// adapter layer.
export interface ExtractedKnowledgeEntity {
  id: string;
  channelId: string;
  threadId: string;
  sourceMessageId: string;
  kind: KnowledgeKind;
  title: string;
  description: string;
  actors: string[];
  // Free-form due-date string lifted from the LLM row when present
  // (e.g. `"next Tuesday"`, `"EOW"`). Renderers display it as-is —
  // there's no calendar parsing here.
  dueDate?: string;
  status: 'open';
  createdAt: string;
  confidence: number;
  source: 'ollama' | 'mock';
}

export interface ExtractKnowledgeResponse {
  channelId: string;
  entities: ExtractedKnowledgeEntity[];
  model: string;
  source: 'ollama' | 'mock';
}

export async function runExtractKnowledge(
  router: InferenceRouter,
  req: ExtractKnowledgeRequest,
): Promise<ExtractKnowledgeResponse> {
  if (req.messages.length === 0) {
    return {
      channelId: req.channelId,
      entities: [],
      model: '',
      source: 'mock',
    };
  }
  const prompt = buildExtractKnowledgePrompt({
    messages: req.messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      content: m.content,
    })),
  });
  // Knowledge extraction is a structured-output flow — reuse the
  // `extract_tasks` task type so the router's policy decisions and
  // egress accounting stay consistent (it already covers structured
  // multi-row output and is policy-allowed for B2B channels by
  // default).
  const resp = await router.run({
    taskType: 'extract_tasks',
    prompt,
    channelId: req.channelId,
  });
  // Detect MockAdapter via the router's last decision. The router's
  // `decide()` method returns a reason string containing the literal
  // word `fallback` whenever the local adapter is unavailable and it
  // routes through the MockAdapter (see `router.ts:155-156`). The
  // adapter's reported `model` name is `bonsai-1.7b` either way, so it
  // is *not* a reliable signal for this distinction.
  const decisionReason = router.lastDecision().reason.toLowerCase();
  const adapterSource: 'ollama' | 'mock' = decisionReason.includes('fallback')
    ? 'mock'
    : 'ollama';
  const parsed = parseExtractKnowledgeOutput(resp.output);
  const entities: ExtractedKnowledgeEntity[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const sourceMessageId = matchSourceMessage(row, req.messages);
    const sourceMsg = req.messages.find((m) => m.id === sourceMessageId);
    const threadId = sourceMsg?.threadId || sourceMsg?.id || req.messages[0]!.id;
    const createdAt = sourceMsg?.createdAt ?? new Date().toISOString();
    entities.push({
      id: `kg_llm_${row.kind}_${sourceMessageId || 'row'}_${i}`,
      channelId: req.channelId,
      threadId,
      sourceMessageId: sourceMessageId || (sourceMsg?.id ?? req.messages[0]!.id),
      kind: row.kind,
      title: titleFor(row.kind, row.description),
      description: row.description,
      actors: row.actor ? [row.actor.replace(/^@/, '').toLowerCase()] : [],
      ...(row.dueDate ? { dueDate: row.dueDate } : {}),
      status: 'open',
      createdAt,
      // Bonsai-1.7B is genuinely noisier than the larger
      // confidential-server model, so we mark LLM-extracted entities
      // with a slightly lower confidence than the regex heuristic
      // (which the user can audit + delete in the panel).
      confidence: 0.65,
      source: adapterSource,
    });
  }
  return {
    channelId: req.channelId,
    entities,
    model: resp.model,
    source: adapterSource,
  };
}

function titleFor(kind: KnowledgeKind, description: string): string {
  const head = kind.charAt(0).toUpperCase() + kind.slice(1);
  const tail = description.length > 60 ? description.slice(0, 60) + '…' : description;
  return `${head}: ${tail}`;
}

// Best-effort source attribution: pick the message whose body shares
// the most distinct keywords with the description. Falls back to the
// first message in the channel when nothing matches.
export function matchSourceMessage(
  row: KnowledgeRow,
  messages: ExtractKnowledgeMessage[],
): string {
  if (messages.length === 0) return '';
  const target = row.description.toLowerCase();
  const words = Array.from(
    new Set(target.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)),
  );
  if (words.length === 0) return messages[0]!.id;
  let bestId = messages[0]!.id;
  let bestScore = 0;
  for (const m of messages) {
    const c = m.content.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (c.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = m.id;
    }
  }
  return bestId;
}
