// MockAdapter — TypeScript port of `backend/internal/inference/mock.go`.
//
// Returns canned responses keyed by TaskType so the rest of the AI
// surface can be wired end-to-end without a real local model. Always
// reports OnDevice + zero egress.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

export class MockAdapter implements Adapter {
  model: string;

  constructor(model = 'ternary-bonsai-8b') {
    this.model = model;
  }

  name(): string {
    return 'mock';
  }

  async run(req: InferenceRequest): Promise<InferenceResponse> {
    const model = req.model || this.model;
    const output = mockOutputFor(req);
    const tokens = estimateTokens(output);
    const latency = mockLatencyMS(req.taskType, tokens);
    return {
      taskType: req.taskType,
      model,
      output,
      tokensUsed: tokens,
      latencyMs: latency,
      onDevice: true,
    };
  }

  async *stream(req: InferenceRequest): AsyncGenerator<StreamChunk, void, void> {
    const resp = await this.run(req);
    yield { delta: resp.output, done: false };
    yield { done: true };
  }
}

function mockOutputFor(req: InferenceRequest): string {
  switch (req.taskType) {
    case 'summarize':
      // Morning Catch-up digest (PROPOSAL 5.1). References the enriched
      // seed content (Family group: field-trip form, Lily's piano
      // recital, parent-teacher night, Grandma's birthday; Community:
      // block party + garage sale + lost pet Momo; Vendor thread:
      // Acme Logs decision) so the demo feels populated rather than
      // generic.
      return [
        'On-device summary — 4 threads with activity since last check:',
        '• Family group: field-trip form due Friday (sunscreen too),',
        '  Lily\'s piano recital Saturday 2pm, parent-teacher night',
        '  Thursday 6pm, Grandma\'s birthday next Tuesday.',
        '• Neighborhood: block-party Saturday (you\'re bringing drinks),',
        '  garage sale May 17, lost-pet notice (orange tabby "Momo"),',
        '  volunteer request for Saturday setup.',
        '• Vendor management: decision on the Q3 logging contract —',
        '  Acme Logs at $42k/yr, ready to approve.',
        '• #general: Q2 OKR owners assigned; Friday is a company holiday.',
      ].join('\n');
    case 'translate': {
      const prompt = (req.prompt ?? '').trim() || '(no source text)';
      return `Translation (en→es): ${prompt} → "[mocked Spanish translation of ${JSON.stringify(prompt)}]"`;
    }
    case 'extract_tasks':
      // Demo flow 5.2 — task extraction from the Family group.
      // Output lines reference the source message IDs (`msg_fam_*`) so
      // the renderer's `SourcePin` / provenance surface has concrete
      // anchors to render.
      return [
        '- Submit field-trip form (due Friday) [source: msg_fam_1]',
        '- Add sunscreen to shopping list [source: msg_fam_1]',
        '- Buy flowers for Lily\'s piano recital Saturday [source: msg_fam_5]',
        '- Grocery run: milk, eggs, bread, apples, pasta, marinara [source: msg_fam_7, msg_fam_8]',
        '- Parent-teacher night Thursday 6pm at Oakridge Elementary [source: msg_fam_9]',
        '- Pick up birthday card + potted plant for Grandma (next Tuesday) [source: msg_fam_11, msg_fam_12]',
      ].join('\n');
    case 'smart_reply':
      // Return 2-3 short candidate replies on separate lines. `tasks.ts:parseSmartReplies`
      // splits on newlines, strips leading bullets / numbered prefixes /
      // "suggested reply:" labels, and caps at 3 suggestions.
      return [
        'Sounds good — I\'ll handle the form tonight and grab sunscreen on the way home.',
        'Thanks for the reminder! I\'ll pick up sunscreen and sign the form after dinner.',
        'Can do — I\'ll swing by the store on my way back and knock both out tonight.',
      ].join('\n');
    case 'prefill_approval':
      // Demo flow 5.3 — approval prefill from the enriched vendor
      // thread. Fields match `msg_vend_r5` (pricing breakdown),
      // `msg_vend_r6` (SOC 2 / GDPR risk notes), and `msg_vend_r7`
      // (explicit decision line).
      return [
        'vendor: Acme Logs',
        'amount: $42,000 / yr',
        'justification: Lowest-cost SOC 2 Type II-cleared bidder with 30-day termination and 99.95% uptime SLA; BetterLog was $51k with 90-day termination, CloudTrace failed SOC 2.',
        'risk: medium',
      ].join('\n');
    case 'prefill_form':
      return [
        'vendor: Acme Logs',
        'amount: $42,000',
        'compliance: SOC 2',
        'justification: Logging vendor selection — see vendor-management thread (msg_vend_root).',
        'requester: alice',
      ].join('\n');
    case 'draft_artifact':
      return [
        '# Inline translation PRD (draft v1)',
        '',
        '## Goal',
        'Per-message translation rendered under the bubble; original always one tap away.',
        '',
        '## Requirements',
        '- Locale auto-detect',
        '- On-device only',
        '- Fall back to original on low confidence',
        '',
        '## Success metric',
        '% messages translated successfully without user toggling back. Target > 90% for top 5 locales.',
      ].join('\n');
    default:
      return 'Mock adapter has no canned output for this task type.';
  }
}

export function estimateTokens(s: string): number {
  if (!s) return 0;
  const t = Math.floor(s.length / 4);
  return t === 0 ? 1 : t;
}

export function mockLatencyMS(t: InferenceRequest['taskType'], tokens: number): number {
  const base: Record<InferenceRequest['taskType'], number> = {
    summarize: 180,
    translate: 90,
    extract_tasks: 220,
    smart_reply: 80,
    prefill_approval: 260,
    prefill_form: 240,
    draft_artifact: 620,
  };
  return (base[t] ?? 150) + Math.floor(tokens / 2);
}
