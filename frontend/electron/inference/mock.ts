// MockAdapter — deterministic stand-in for the on-device LLM, used
// **only in tests and as a last-resort fallback when Ollama is
// unreachable**. Every B2B demo flow now routes through the real
// `OllamaAdapter` whenever the daemon is up, and the canned outputs
// here are intentionally generic + clearly labelled `[MOCK] …` so it
// is obvious from the privacy strip and any captured artefact when
// the real model wasn't running.
//
// The B2C translation seed table is preserved because the
// translation tests assert on specific bidirectional pairs.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

export class MockAdapter implements Adapter {
  model: string;

  constructor(model = 'bonsai-8b') {
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
      // Generic mock summary — clearly labelled so the privacy strip /
      // captured screenshot reveals when the real LLM didn't run. The
      // bullets are shaped like the prompt library's expected output
      // so parsers stay happy in tests.
      return [
        '- [MOCK] Decision: routing summary placeholder produced by MockAdapter.',
        '- [MOCK] Open question: real Bonsai-8B output replaces this when Ollama is reachable.',
        '- [MOCK] Owner: alice (placeholder).',
        '- [MOCK] Deadline: this week (placeholder).',
      ].join('\n');
    case 'translate':
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
      // anymore. Real Bonsai-8B fills these from whatever thread the
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
        '[MOCK] Real Bonsai-8B output replaces this body when Ollama is reachable.',
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

// Hand-seeded bidirectional translations used by the B2C translation
// tests. Keys are the source text (lowercased + trimmed); values map
// the target language to the translated string. The mock adapter
// matches loosely so small whitespace or punctuation drift in the
// prompt doesn't break the lookup.
//
// Exported for tests.
export const SEEDED_TRANSLATIONS: Record<string, Record<string, string>> = {
  // ---- Alice ↔ Minh (English ↔ Vietnamese) ---------------------------
  'chào alice, tối mai bạn rảnh đi ăn phở không?': {
    en: 'Hi Alice, are you free to grab phở tomorrow night?',
  },
  "hi minh! i'd love to — 7pm at that pho place on the corner?": {
    vi: 'Chào Minh! Mình đi được — 7 giờ ở quán phở góc đường nhé?',
  },
  'ok, mình đặt bàn cho hai người.': {
    en: "Ok, I'll book a table for two.",
  },
  'sounds perfect — see you at 7!': {
    vi: 'Tuyệt — hẹn gặp lúc 7 giờ!',
  },

  // ---- Alice ↔ Bob (Spanish snippet) --------------------------------
  '¿nos vemos a las siete en el restaurante de siempre?': {
    en: 'See you at seven at our usual restaurant?',
  },
  "sí! 7pm confirmed — carol is in too, she'll meet us there": {
    es: '¡Sí! 7 de la tarde confirmado — Carol también se apunta, nos vemos allí.',
  },
};

function extractSource(prompt: string): string {
  // runTranslate wraps the text as `...\n\nMessage: <source>`. If that
  // envelope is present, extract the source. Otherwise treat the full
  // prompt as the source so ad-hoc callers (tests, one-off demos) still
  // get a useful translation.
  const idx = prompt.lastIndexOf('Message:');
  if (idx >= 0) {
    return prompt.slice(idx + 'Message:'.length).trim();
  }
  return prompt.trim();
}

function extractTarget(prompt: string): string {
  // runTranslate prefaces the prompt with "Translate the following chat
  // message into <lang>". Extract the language so we can pick the right
  // seeded translation. Defaults to English.
  const m = prompt.match(/into ([A-Za-z]{2,})[.\s]/);
  if (m && m[1]) return m[1].trim().toLowerCase();
  return 'en';
}

export function mockTranslate(prompt: string): string {
  const source = extractSource(prompt) || '(no source text)';
  const target = extractTarget(prompt);
  const key = source.toLowerCase().trim();
  const targetKey = target.toLowerCase().slice(0, 2);
  const seeded = SEEDED_TRANSLATIONS[key];
  if (seeded && seeded[targetKey]) {
    return seeded[targetKey];
  }
  // Fallback: still produce something useful and clearly labelled so
  // the demo surfaces don't render empty / identical strings.
  return `[${targetKey}] ${source}`;
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
