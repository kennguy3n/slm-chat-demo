// MockAdapter — deterministic stand-in for the on-device LLM, used
// **only in tests and as a last-resort fallback when Ollama is
// unreachable**. Every demo flow (B2B *and* B2C) now routes through
// the real `OllamaAdapter` / `LlamaCppAdapter` whenever a runtime is
// up. The canned outputs here are intentionally generic + clearly
// labelled `[MOCK] …` so it is obvious from the privacy strip and
// any captured artefact when the real model wasn't running.
//
// The B2C ground-zero LLM redesign (2026-05-01) removed the seeded
// translation table so every translation, summary, and conversation
// insight in the demo exercises the real on-device model rather
// than hand-curated lookups.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

export class MockAdapter implements Adapter {
  model: string;

  constructor(model = 'bonsai-1.7b') {
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
      // Generic [MOCK] placeholder — the B2C redesign stripped the
      // seeded bilingual summary here so it's obvious in screenshots
      // / privacy strips when the real LLM didn't run. Bullets are
      // shaped like the prompt library's expected output so parsers
      // in tests stay happy.
      return [
        '- [MOCK] Decision: routing summary placeholder produced by MockAdapter.',
        '- [MOCK] Open question: real Bonsai output replaces this when llama-server or Ollama is reachable.',
        '- [MOCK] Owner: alice (placeholder).',
        '- [MOCK] Deadline: this week (placeholder).',
      ].join('\n');
    case 'translate':
      // No seeded translation table anymore. The MockAdapter just
      // surfaces the source text wrapped with [MOCK] so the missing
      // model is unmistakable in screenshots and tests.
      return mockTranslate(req.prompt ?? '');
    case 'extract_tasks':
      // Generic mock task list — pipe-delimited so the KApps parser
      // accepts it, plain B2C-style fallback also kept for the
      // legacy `parseExtractedTasks` parser.
      return [
        '- [MOCK] task | Review the thread above | ',
        '- [MOCK] reminder | Confirm decision with the owner | ',
      ].join('\n');
    case 'smart_reply':
      return [
        '[MOCK] Sounds good — will follow up shortly.',
        '[MOCK] Thanks for the update!',
        '[MOCK] Let me check and get back to you.',
      ].join('\n');
    case 'prefill_approval':
      // Generic placeholder fields — no references to seed data
      // anymore. Real Bonsai-1.7B fills these from whatever thread the
      // caller passes through.
      return [
        '[MOCK] vendor: <vendor name from thread>',
        '[MOCK] amount: <currency amount>',
        '[MOCK] justification: <one-sentence reason>',
        '[MOCK] risk: low',
      ].join('\n');
    case 'prefill_form':
      return [
        '[MOCK] vendor: <vendor>',
        '[MOCK] amount: <amount>',
        '[MOCK] compliance: <standard>',
      ].join('\n');
    case 'draft_artifact':
      return [
        '# [MOCK] artifact draft',
        '',
        '## Goal',
        '[MOCK] Real Bonsai-1.7B output replaces this body when llama-server or Ollama is reachable.',
        '',
        '## Requirements',
        '- [MOCK] requirement 1',
        '- [MOCK] requirement 2',
        '',
        '## Risks',
        '- [MOCK] risk placeholder',
      ].join('\n');
    default:
      return '[MOCK] no canned output for this task type.';
  }
}

// extractPromptText pulls the source `Message: <body>` out of the
// translate envelope built by `runTranslate`. Falls back to the
// trimmed prompt body for ad-hoc callers (tests, one-off demos) so
// the mock surface still produces something visible.
function extractPromptText(prompt: string): string {
  const idx = prompt.lastIndexOf('Message:');
  if (idx >= 0) {
    return prompt.slice(idx + 'Message:'.length).trim();
  }
  return prompt.trim();
}

// mockTranslate returns a clearly-labelled `[MOCK] <source>` string
// when the real LLM is not reachable. The B2C ground-zero redesign
// removed the hand-curated bilingual translation table — every
// translation in the demo now requires the on-device model to
// produce a real result, and the placeholder makes a missing model
// obvious in screenshots / privacy strips.
export function mockTranslate(prompt: string): string {
  const source = extractPromptText(prompt) || '(no source text)';
  return `[MOCK] ${source}`;
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
