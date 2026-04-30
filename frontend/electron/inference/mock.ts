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
    case 'translate':
      // For the demo we hand-seed plausible translations of the
      // enriched DM/family seed lines so the TranslationCard shows
      // real bidirectional language content (Vietnamese ↔ English,
      // Spanish ↔ English, Japanese ↔ English). Anything else falls
      // back to a clearly-labelled mock line. `runTranslate` parses
      // the full prompt envelope ("Translate ... Message: <source>")
      // so we scan for the original text at the end of the prompt.
      return mockTranslate(req.prompt ?? '');
    case 'extract_tasks':
      // Demo flow 5.2 — task extraction from the Family group. Each
      // line appends `[source:msg_id,...]` provenance markers using the
      // same no-space convention as `CitationRenderer` so a future
      // citation surface can wire source pins. `parseExtractedTasks`
      // strips the markers from the rendered title.
      return [
        '- Submit field-trip form (due Friday) [source:msg_fam_1]',
        '- Add sunscreen to shopping list [source:msg_fam_1]',
        '- Buy flowers for Lily\'s piano recital Saturday [source:msg_fam_5]',
        '- Grocery run: milk, eggs, bread, apples, pasta, marinara [source:msg_fam_7,msg_fam_8]',
        '- Parent-teacher night Thursday 6pm at Oakridge Elementary [source:msg_fam_9]',
        '- Pick up birthday card + potted plant for Grandma (due next Tuesday) [source:msg_fam_11,msg_fam_12]',
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

// Hand-seeded bidirectional translations used by the demo. Keys are
// the original source text as it appears in `seed.go`, values are the
// plausible translated outputs per target language. The mock adapter
// matches loosely (trimmed + lowercased) so small whitespace or
// punctuation drift in the prompt doesn't break the lookup.
//
// Exported for tests.
export const SEEDED_TRANSLATIONS: Record<string, Record<string, string>> = {
  // ---- Alice ↔ Minh (English ↔ Vietnamese) ---------------------------
  'chào alice, tối mai bạn rảnh đi ăn phở không?': {
    en: 'Hi Alice, are you free to grab phở tomorrow night?',
  },
  "hi minh! i'd love to — 7pm at the lê văn sỹ place?": {
    vi: 'Chào Minh! Mình đi được — 7 giờ ở quán Lê Văn Sỹ nhé?',
  },
  'ok, mình đặt bàn cho hai người. bạn còn muốn gỏi cuốn như lần trước không?': {
    en: "Ok, I'll book a table for two. Do you still want spring rolls like last time?",
  },
  'yes please — extra peanut sauce if they have it.': {
    vi: 'Có nhé — thêm nước chấm đậu phộng nếu quán còn.',
  },
  'nhân tiện: team mình đang đánh giá một mô hình 8b chạy trên máy. bạn đã thử bonsai-8b chưa?':
    {
      en:
        "By the way: my team is evaluating an 8B on-device model. Have you tried bonsai-8b yet?",
    },
  "we're running it in this chat demo actually — latency under 300 ms on my laptop, quality is surprisingly good for summarisation and translation.":
    {
      vi:
        "Bọn mình đang chạy nó ngay trong chat demo này — độ trễ dưới 300 ms trên laptop của mình, chất lượng tóm tắt và dịch khá tốt.",
    },
  'tuyệt! gửi mình link repo được không? mình muốn thử trên máy linux.': {
    en: 'Awesome! Can you send me the repo link? I want to try it on my Linux box.',
  },
  "sure — i'll dm you after dinner. see you at 7!": {
    vi: 'Ok luôn — tối ăn xong mình nhắn. Hẹn gặp lúc 7 giờ!',
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
