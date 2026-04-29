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
      return 'On-device summary: 3 unread threads, 1 deadline (field-trip form Friday), 1 RSVP pending, 1 reply needed.';
    case 'translate': {
      const prompt = (req.prompt ?? '').trim() || '(no source text)';
      return `Translation (en→es): ${prompt} → "[mocked Spanish translation of ${JSON.stringify(prompt)}]"`;
    }
    case 'extract_tasks':
      return [
        '- Submit field-trip form (due Friday)',
        '- Add sunscreen to shopping list',
        '- Set Friday reminder',
      ].join('\n');
    case 'smart_reply':
      return 'Suggested reply: "Sounds good — I\'ll handle the form tonight and grab sunscreen on the way home."';
    case 'prefill_approval':
      return [
        'vendor: Acme Logs',
        'amount: $42,000 / yr',
        'justification: Lowest-cost SOC 2-cleared bidder.',
        'risk: medium',
      ].join('\n');
    case 'prefill_form':
      return [
        'vendor: Acme Logs',
        'amount: $42,000',
        'compliance: SOC 2',
        'justification: Logging vendor selection — see thread.',
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
