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
      // Two flavours of canned summary depending on what the prompt
      // looks like:
      //  - Bilingual chat summary (the new B2C demo) — detected by
      //    matching the Vietnamese phrase "Việt Nam" or the Vietnamese
      //    diacritic "phở" in the prompt body. Returns an
      //    English-language conversation summary that calls out the
      //    decisions, action items, and that the chat spans EN ↔ VI.
      //  - Default Morning Catch-up digest (PROPOSAL 5.1) referencing
      //    the enriched family / community / vendor seed content so the
      //    digest card feels populated.
      if (mockIsBilingualSummary(req.prompt ?? '')) {
        return [
          'Bilingual conversation summary — English ↔ Vietnamese, summarised on-device:',
          '• Plan: Alice and Minh confirmed Saturday lunch at the new',
          '  Vietnamese restaurant downtown, meeting at 12 noon.',
          '• Order: Minh will book a table for two and pre-order phở bò,',
          '  gỏi cuốn (fresh spring rolls), Vietnamese iced coffee, and',
          '  chè ba màu for dessert; mild spice level for Alice.',
          '• Action items: Minh to make the reservation; Alice to bring',
          '  an umbrella (rain in the forecast).',
          '• Tone: friendly, looking forward to it. Conversation ran across',
          '  two languages — Alice in English, Minh in Vietnamese — with',
          '  every bubble translated on-device.',
        ].join('\n');
      }
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
  // Each English line gets a Vietnamese translation; each Vietnamese
  // line gets an English translation. Keeps the bilingual demo
  // working even when Ollama isn't running.
  'hey minh! are you free this saturday? i was thinking we could check out that new vietnamese restaurant downtown.':
    {
      vi:
        'Chào Minh! Thứ Bảy này bạn rảnh không? Mình đang nghĩ tụi mình thử nhà hàng Việt Nam mới mở ở trung tâm.',
    },
  'chào alice! thứ bảy này mình rảnh. nhà hàng nào vậy? mình nghe nói có một quán phở mới mở ở trung tâm.':
    {
      en:
        "Hi Alice! I'm free this Saturday. Which restaurant? I heard there's a new pho place that just opened downtown.",
    },
  "yes! that's the one. i heard their pho is amazing. want to meet around noon?":
    {
      vi:
        'Đúng quán đó luôn! Mình nghe nói phở ở đó rất ngon. Hẹn nhau khoảng buổi trưa nhé?',
    },
  'trưa được nha! mình sẽ đặt bàn trước. bạn có ăn được cay không?': {
    en:
      "Noon works! I'll book a table in advance. Can you handle spicy food?",
  },
  'i can handle a little spice but not too much 😄 can you order for us since you know vietnamese food better?':
    {
      vi:
        'Mình ăn cay được chút thôi, không quá cay nha 😄 Bạn gọi giúp tụi mình được không, vì bạn rành đồ Việt hơn?',
    },
  'được rồi, mình sẽ gọi món cho. mình sẽ chọn phở bò và gỏi cuốn. bạn muốn uống gì?':
    {
      en:
        "Okay, I'll order for us. I'll pick beef pho and fresh spring rolls. What would you like to drink?",
    },
  "iced vietnamese coffee sounds perfect! i've been wanting to try the real thing.":
    {
      vi:
        'Cà phê sữa đá Việt Nam nghe tuyệt vời! Mình muốn thử bản chính gốc lâu rồi.',
    },
  'cà phê sữa đá là lựa chọn tuyệt vời! mình cũng sẽ gọi thêm chè cho tráng miệng.':
    {
      en:
        "Iced milk coffee is a great choice! I'll also order some chè for dessert.",
    },
  "what's chè? i don't think i've tried that before.": {
    vi: 'Chè là gì vậy? Hình như mình chưa thử bao giờ.',
  },
  'chè là món tráng miệng truyền thống của việt nam, có nhiều loại lắm. mình sẽ chọn chè ba màu cho bạn thử - rất ngon!':
    {
      en:
        "Chè is a traditional Vietnamese dessert — there are many kinds. I'll pick chè ba màu (three-colour) for you to try — it's really good!",
    },
  'that sounds amazing! i love trying new desserts. should i bring anything?': {
    vi:
      'Nghe ngon quá! Mình rất thích thử món tráng miệng mới. Mình có cần mang theo gì không?',
  },
  'không cần đâu, chỉ cần mang theo sự háo hức thôi! 😊 gặp bạn lúc 12 giờ trưa thứ bảy nhé.':
    {
      en:
        "No need, just bring your appetite! 😊 See you at 12 noon on Saturday.",
    },
  "perfect! see you saturday at noon. can't wait! 🎉": {
    vi: 'Tuyệt vời! Hẹn gặp trưa thứ Bảy. Mình háo hức quá! 🎉',
  },
  'hẹn gặp bạn! mình chắc chắn bạn sẽ thích đồ ăn việt nam. à, nhớ mang theo ô phòng khi trời mưa nhé.':
    {
      en:
        "See you then! I'm sure you'll love Vietnamese food. Oh, remember to bring an umbrella in case it rains.",
    },
  'good call on the umbrella — the forecast does show some rain. thanks for the heads up!':
    {
      vi:
        'Ý kiến hay đó — dự báo có mưa thật. Cảm ơn bạn đã nhắc!',
    },
  'không có gì! thời tiết mùa này hay thay đổi lắm. thôi mình đi đặt bàn trước nhé. tạm biệt!':
    {
      en:
        "No problem! The weather changes a lot this season. I'll go book the table now. Bye!",
    },

  // ---- Alice ↔ Bob (Spanish snippet) --------------------------------
  '¿nos vemos a las siete en el restaurante de siempre?': {
    en: 'See you at seven at our usual restaurant?',
  },
  "sí! 7pm confirmed — carol is in too, she'll meet us there": {
    es: '¡Sí! 7 de la tarde confirmado — Carol también se apunta, nos vemos allí.',
  },
};

// mockIsBilingualSummary inspects a summarize prompt and returns true
// when it carries the bilingual marker `buildUnreadSummary` writes
// (Vietnamese / English bilingual chat) or contains enough Vietnamese
// diacritic content to be a clear bilingual conversation summary.
// Exported for tests.
export function mockIsBilingualSummary(prompt: string): boolean {
  if (!prompt) return false;
  // Explicit marker the bilingual prompt writes ("Vietnamese ↔
  // English bilingual chat" or similar) — phrase order may vary.
  const lower = prompt.toLowerCase();
  if (lower.includes('bilingual chat') || lower.includes('bilingual conversation')) {
    return true;
  }
  // Heuristic: a Vietnamese diacritic + at least one Vietnamese word
  // strongly correlates with the Alice ↔ Minh demo channel.
  const viDiacritic = /[ăâđêôơưỳ]/i;
  return viDiacritic.test(prompt) && /phở|chè|cà phê/.test(prompt);
}

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
