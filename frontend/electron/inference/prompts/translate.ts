// Translate prompt — drives the per-bubble TranslationCaption surface
// on the bilingual B2C demo (Alice ↔ Minh, EN ↔ VI). Promoted from an
// inline string in tasks.ts on 2026-05-01 after the live screenshots
// against Bonsai-1.7B showed three failure modes:
//
//   1. The model parroted its own format prefix back: a Vietnamese
//      bubble came out as `(to en) Chào Alice…` instead of the
//      English translation. Cause: the previous batch prompt
//      annotated each line with `(to <code>)` and the model treated
//      that fragment as part of the source text.
//   2. The model dropped into chat mode and hallucinated unrelated
//      content (French homework, restaurant tips, "Translation:"
//      preambles). Cause: raw `/completion` calls bypass the Qwen3
//      chat template — without a system role the 1.7B base just
//      generates plausible next tokens.
//   3. EN→VI requests came back in English (or with a stray
//      `Câu trả lời:` "Answer:" prefix). Cause: no explicit source-
//      language anchor, and no parser-side cleanup of common
//      labelling prefixes Bonsai emits at low temperature.
//
// The fixes here are layered:
//
//   • A dedicated system instruction frames the call as "translation
//     engine" with explicit "no commentary, no labels, no prefixes"
//     rules. (LlamaCppAdapter / OllamaAdapter wrap this into the
//     Qwen3 chat template before sending.)
//   • Source-language plumbing — when `MessageList` hands us a
//     detected source code we anchor the user turn with
//     "Translate from <SRC> to <DST>". For unknown sources the
//     prompt falls back to "Translate to <DST>" without inventing.
//   • A defensive `parseTranslateOutput` strips quoting, leading
//     numbering, language labels, and the `(to <code>)` echo so a
//     stray prefix never leaks into the rendered bubble.

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

export interface TranslateBuilderInput {
  text: string;
  // ISO-639-1 target language (`'en'`, `'vi'`, …). Falls back to
  // English when omitted.
  targetLanguage?: string;
  // ISO-639-1 source-language hint. Optional — when omitted the
  // prompt uses the target-only "Translate to <DST>" form.
  sourceLanguage?: string;
  // Optional preceding messages for disambiguation. Chat messages
  // are often short and typed over multiple lines, so a single
  // message in isolation can be ambiguous ("Yes! That's the one.",
  // "Trưa được nha!"). Feeding 2-3 earlier messages gives the
  // 1.7B model enough grounding to avoid hallucinating unrelated
  // content (French homework, restaurant tips, etc.) while staying
  // well within the 1024-token context window.
  context?: { sender: string; text: string }[];
}

export interface TranslatePromptParts {
  system: string;
  user: string;
}

export interface TranslateBatchBuilderInput {
  items: TranslateBuilderInput[];
}

// languageLabel returns a human-readable language name for the
// model. Falls back to the raw code if we don't have a mapping —
// Bonsai understands at least the four code↔name pairs we ship in
// the demo (en/vi/es/fr) but the lookup is stable for any code.
export function languageLabel(code: string | undefined): string {
  if (!code) return '';
  const base = code.toLowerCase().split(/[-_]/)[0] ?? '';
  return LANGUAGE_NAMES[base] ?? code;
}

const SYSTEM_INSTRUCTION =
  'You are a translation engine. Translate the user message into the requested ' +
  'target language and output ONLY the translation. STRICT RULES: ' +
  '(1) Single line. ' +
  '(2) No quotation marks, no leading labels, no numbering, no language tags. ' +
  '(3) No commentary, no explanation, no rationale, no preamble. ' +
  '(4) Do NOT repeat the original text. ' +
  '(5) Preserve names, emoji, and informal tone. ' +
  '(6) If the source is already in the target language, output it unchanged. ' +
  '(7) Never translate English into English or a language into itself. ' +
  '(8) Use the conversation context (if provided in the system block) ' +
  'to disambiguate the user message, but translate ONLY that user message — ' +
  'never echo, repeat, or include the conversation context in the output.';

// buildTranslatePrompt builds the (system, user) pair for a single-
// message translation. The split is the contract LlamaCppAdapter and
// OllamaAdapter use to route system instructions through the Qwen3
// chat template instead of dumping them into the user role.
//
// Conversation context is attached to the *system* role rather than
// the user role on purpose. We initially shipped context as a
// "Recent conversation:" block inside the user turn, but the live-
// LLM screenshots against Bonsai-1.7B showed the model was simply
// regurgitating the entire context block as its "translation" — the
// 1.7B instruct model is not strong enough to reliably follow a
// "translate only the Text line" rule when the context shares the
// same role as the target text. Routing context through the system
// role frames it as background metadata for the engine, not as
// input to translate, which empirically gives a clean translation
// while still letting the model disambiguate short chat lines like
// "Yes! That's the one." or "Trưa được nha!".
export function buildTranslatePrompt(input: TranslateBuilderInput): TranslatePromptParts {
  const target = (input.targetLanguage ?? '').trim() || 'en';
  const targetName = languageLabel(target) || target;
  const sourceCode = (input.sourceLanguage ?? '').trim();
  const sourceName = sourceCode ? languageLabel(sourceCode) : '';
  const direction = sourceName
    ? `Translate from ${sourceName} to ${targetName}.`
    : `Translate to ${targetName}.`;

  // Include up to 3 preceding messages as background context. Per-
  // line text is capped at 100 chars so the whole context block
  // stays well under ~300 chars (~120 tokens), leaving plenty of
  // room inside the 1024-token Bonsai window for the actual Text
  // and the model's reply.
  let system = SYSTEM_INSTRUCTION;
  if (input.context && input.context.length > 0) {
    const recent = input.context.slice(-3);
    const lines = recent.map((c) => `${c.sender}: ${c.text.slice(0, 100)}`);
    system +=
      '\n\nRecent conversation (background only — DO NOT translate, ' +
      'DO NOT echo, DO NOT include in output; use only to disambiguate ' +
      'the user message):\n' +
      lines.join('\n');
  }

  const user = `${direction}\nText: ${input.text}`;
  return { system, user };
}

const BATCH_SYSTEM_INSTRUCTION =
  'You are a translation engine. The user gives you a numbered list of chat ' +
  'messages, each annotated with its source and target language. For each ' +
  'item, output one line in the form `<N>. <translation>`. STRICT RULES: ' +
  '(1) Output exactly one line per item, in order. ' +
  '(2) The translation must be in the requested target language only. ' +
  '(3) Do NOT echo the source text, the language annotation, or the source ' +
  'language code. ' +
  '(4) No quotes, no commentary, no explanation, no extra blank lines. ' +
  '(5) Preserve names, emoji, and informal tone. ' +
  '(6) If the source is already in the target language, output it unchanged. ' +
  '(7) Never translate a language into itself.';

// buildTranslateBatchPrompt mirrors `buildTranslatePrompt` but for a
// list of items. Items keep their array index so the parser can
// reconstruct the per-message mapping even if the model drops or
// reorders lines.
export function buildTranslateBatchPrompt(
  input: TranslateBatchBuilderInput,
): TranslatePromptParts {
  const lines = input.items.map((it, i) => {
    const target = (it.targetLanguage ?? '').trim() || 'en';
    const targetName = languageLabel(target) || target;
    const sourceCode = (it.sourceLanguage ?? '').trim();
    const sourceName = sourceCode ? languageLabel(sourceCode) : '';
    const direction = sourceName ? `${sourceName} → ${targetName}` : `to ${targetName}`;
    return `${i + 1}. [${direction}] ${it.text}`;
  });
  const user =
    'Translate each of the following chat messages. Output one translation ' +
    'per line as `<N>. <translation>`, in the same order, with no other text.\n\n' +
    lines.join('\n');
  return { system: BATCH_SYSTEM_INSTRUCTION, user };
}

// parseTranslateOutput cleans up a single-message response. Strips
// surrounding whitespace, leading numbering, common label prefixes
// the 1.7B model emits ("Translation:", "Câu trả lời:", "Answer:",
// etc.), `(to en)` / `(to vi)` echoes from the legacy prompt format,
// and surrounding quotes. Returns the cleaned string; an empty
// string means "model produced no usable output" and the caller
// should fall back to the original text.
export function parseTranslateOutput(raw: string): string {
  if (!raw) return '';
  let s = stripThinkBlock(raw).trim();
  if (!s) return '';
  // Many small models like to start with one of these labelling
  // prefixes. Strip them iteratively in case the model stacks two
  // (e.g. `Translation: (to vi) ...`).
  for (let i = 0; i < 4; i += 1) {
    const before = s;
    s = stripLeadingPrefix(s);
    if (s === before) break;
  }
  s = unquote(s);
  return s.trim();
}

// parseTranslateBatchOutput recovers an `<N>. <translation>` array
// from the model's batched response. The previous regex-based
// parser is kept (it's tolerant of `1)`, `1:` and `[1]` numbering)
// but every recovered line is now run through `parseTranslateOutput`
// so stray label prefixes inside the body of the line are stripped.
export function parseTranslateBatchOutput(raw: string, expected: number): string[] {
  const result: string[] = new Array(expected).fill('');
  if (!raw) return result;
  const cleaned = stripThinkBlock(raw);
  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^\s*\(?(\d+)[.):\]]?\s+(.+)$/);
    if (!m) continue;
    const idx = Number.parseInt(m[1]!, 10) - 1;
    if (idx < 0 || idx >= expected) continue;
    if (result[idx]) continue;
    result[idx] = parseTranslateOutput(m[2]!);
  }
  return result;
}

// Strip a single layer of labelling prefix from the start of `s`.
// Returns `s` unchanged if no prefix matched. Patterns covered:
//
//   • `Translation:`, `Translated:`, `English:`, `Vietnamese:`,
//     `Vietnamese translation:`, `In English:`, etc.
//   • `Câu trả lời:` (Vietnamese for "Answer:") and `Câu:` —
//     idiosyncratic Bonsai outputs at low temperature.
//   • `Answer:`, `Output:`, `Result:` — generic instruct-tuned
//     labels.
//   • `(to en)`, `(to vi)`, `[en→vi]`, `[Vietnamese → English]` —
//     echoes of the previous batch prompt format that the model
//     occasionally still copies into its output.
//   • Leading numbering like `1.`, `1)`, `(1)` — the per-item
//     numbering the batch parser already stripped, kept here so
//     `parseTranslateOutput` is also safe to call on raw single-
//     message responses that came back numbered.
function stripLeadingPrefix(s: string): string {
  // (to en) / (to vi) / (to Vietnamese) and the `[from → to]` form.
  let m = s.match(/^\s*\(\s*to\s+[A-Za-z\u00C0-\u024F]+\s*\)\s*[:\-–]?\s*/i);
  if (m) return s.slice(m[0].length);
  m = s.match(/^\s*\[[^\]]*?(?:→|->|to|từ)[^\]]*\]\s*[:\-–]?\s*/i);
  if (m) return s.slice(m[0].length);

  // Numbering: `1.`, `1)`, `(1)`, `1:`. Only strip when followed by
  // whitespace so we don't eat a translated number ("1 đồng").
  m = s.match(/^\s*\(?\d+[.):\]]\s+/);
  if (m) return s.slice(m[0].length);

  // Generic "<label>:" prefix. Bonsai labels include translation /
  // translated / answer / output / result / câu trả lời / câu /
  // english / vietnamese / spanish / french / japanese / korean /
  // chinese, optionally with "translation" suffix.
  const labelRe =
    /^\s*(?:in\s+)?(?:translation|translated|answer|output|result|câu(?:\s+trả\s+lời)?|english|vietnamese|spanish|french|japanese|korean|chinese|german)\s*(?:translation)?\s*[:\-–]\s+/i;
  m = s.match(labelRe);
  if (m) return s.slice(m[0].length);

  return s;
}

// Trim a single layer of matched surrounding quotes (ASCII `"`/`'`,
// or Unicode `“…”`/`‘…’`/`「…」`). Bonsai sometimes wraps the whole
// translation in quotes despite the system instruction.
function unquote(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
    ['「', '」'],
    ['«', '»'],
  ];
  for (const [open, close] of pairs) {
    if (first === open && last === close) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

// Defensive `<think>…</think>` stripper. The Qwen3 chat template
// pre-fills an empty `<think></think>` block (see
// `formatQwen3Chat` in llamacpp.ts) so the model usually skips the
// reasoning preamble entirely, but if the model emits its own block
// for some reason we strip it here to keep parser invariants.
function stripThinkBlock(s: string): string {
  if (!s.includes('<think>')) return s;
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf('<think>', i);
    if (open < 0) {
      out.push(s.slice(i));
      break;
    }
    out.push(s.slice(i, open));
    const close = s.indexOf('</think>', open);
    if (close < 0) break;
    i = close + '</think>'.length;
  }
  return out.join('');
}
