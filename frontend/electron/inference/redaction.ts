// RedactionEngine — Phase 6 PII redaction + tokenization layer that
// runs on every prompt the inference router dispatches to the
// confidential-server tier. Tokenization is reversible: outbound
// prompts are rewritten with placeholder tokens (`[EMAIL_1]`,
// `[PHONE_2]`, `[NAME_3]`) and the returned response is detokenized
// against a per-request mapping before it reaches the renderer.
//
// The design point is that *no original PII byte ever leaves the
// device* — the network sees only placeholders, and the renderer
// sees only the original PII. The PrivacyStrip surfaces both the
// redaction summary ("3 items redacted: 2 names, 1 email") and the
// `egressBytes` count from the tokenized prompt.

export type RedactionKind = 'email' | 'phone' | 'ssn' | 'name' | 'custom';

export interface Redaction {
  // The original substring (kept locally only; never sent to the
  // server). Detokenization restores this verbatim.
  original: string;
  // The placeholder token written into the outbound text in place of
  // `original` (e.g. `[EMAIL_1]`).
  replacement: string;
  kind: RedactionKind;
  // Byte offset of the redaction in the *post-tokenization* text.
  // Useful for the privacy strip when highlighting which segments
  // were redacted.
  offset: number;
}

export interface RedactedText {
  text: string;
  redactions: Redaction[];
  // Byte length of the post-tokenization text — the number the
  // egress tracker will record after dispatch. UTF-8 bytes, not
  // JS-string code units.
  egressBytes: number;
}

// TokenizedText is the reversible variant of RedactedText. The
// `mapping` field can be passed back to `detokenize()` to restore
// the original values in the model response.
export interface TokenizedText extends RedactedText {
  mapping: TokenMapping;
}

// TokenMapping records replacement → original pairs in insertion
// order so detokenize is O(redactions × text).
export type TokenMapping = Record<string, string>;

export interface RedactionPolicy {
  redactPII: boolean;
  redactEmails: boolean;
  redactPhoneNumbers: boolean;
  redactNames: boolean;
  customPatterns?: { name: string; pattern: RegExp }[];
}

export const DefaultRedactionPolicy: RedactionPolicy = {
  redactPII: true,
  redactEmails: true,
  redactPhoneNumbers: true,
  redactNames: true,
  customPatterns: [],
};

// PII_PATTERNS mirrors the regex set in
// `frontend/electron/inference/skills/guardrail-rewrite.ts` so the
// detection surface is consistent across the redaction engine and
// the on-device guardrail skill. Phase 6 keeps these regex-based;
// phase 7+ may swap in NER-driven span detection.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
// NAME_RE matches an English-style "Capitalized Capitalized" pair
// (or three) — a simple enough heuristic for the demo without
// hauling in a full NER model. We deliberately avoid lower-case
// detection so common English words don't get redacted as names.
const NAME_RE = /\b(?:[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){1,2})\b/g;

interface DetectedSpan {
  kind: RedactionKind;
  match: string;
  start: number;
  end: number;
}

export class RedactionEngine {
  // tokenize replaces every PII span with a placeholder token, returns
  // the rewritten text, the per-request mapping needed to detokenize
  // the model's response, and the byte length of the rewritten text.
  // When `policy` is omitted the default redacts every category.
  tokenize(text: string, policy: RedactionPolicy = DefaultRedactionPolicy): TokenizedText {
    const spans = this.detect(text, policy);
    if (spans.length === 0) {
      return {
        text,
        redactions: [],
        mapping: {},
        egressBytes: utf8ByteLength(text),
      };
    }
    spans.sort((a, b) => a.start - b.start);

    const counters: Record<RedactionKind, number> = {
      email: 0,
      phone: 0,
      ssn: 0,
      name: 0,
      custom: 0,
    };
    const mapping: TokenMapping = {};
    const redactions: Redaction[] = [];
    let cursor = 0;
    let out = '';
    for (const span of spans) {
      // Skip overlaps — keep the earliest match, drop nested ones.
      if (span.start < cursor) continue;
      counters[span.kind] += 1;
      const token = `[${tokenLabel(span.kind)}_${counters[span.kind]}]`;
      out += text.slice(cursor, span.start);
      const offset = utf8ByteLength(out);
      out += token;
      cursor = span.end;
      mapping[token] = span.match;
      redactions.push({
        original: span.match,
        replacement: token,
        kind: span.kind,
        offset,
      });
    }
    out += text.slice(cursor);
    return {
      text: out,
      redactions,
      mapping,
      egressBytes: utf8ByteLength(out),
    };
  }

  // redact is the non-reversible cousin of tokenize: it replaces every
  // PII span with the literal string "[REDACTED]" so the result can be
  // logged or displayed without leaking the originals. Used by the
  // privacy strip's "Show redacted prompt" view.
  redact(text: string, policy: RedactionPolicy = DefaultRedactionPolicy): RedactedText {
    const tokenized = this.tokenize(text, policy);
    let out = tokenized.text;
    for (const r of tokenized.redactions) {
      out = out.replace(r.replacement, '[REDACTED]');
    }
    return {
      text: out,
      redactions: tokenized.redactions.map((r) => ({
        ...r,
        replacement: '[REDACTED]',
      })),
      egressBytes: utf8ByteLength(out),
    };
  }

  // detokenize restores the original PII values in `text` using
  // `mapping` returned by a prior `tokenize()` call. Tokens not in
  // the mapping are left intact so partial responses survive.
  detokenize(text: string, mapping: TokenMapping): string {
    let out = text;
    // Order longest-token-first so [EMAIL_10] doesn't get partially
    // matched by [EMAIL_1] before its turn.
    const tokens = Object.keys(mapping).sort((a, b) => b.length - a.length);
    for (const t of tokens) {
      out = out.split(t).join(mapping[t]);
    }
    return out;
  }

  // detect locates every PII span the policy asks for and returns
  // them sorted by start offset. Exposed for tests.
  detect(text: string, policy: RedactionPolicy): DetectedSpan[] {
    const out: DetectedSpan[] = [];
    if (!policy.redactPII) return out;
    if (policy.redactEmails) collect(out, text, EMAIL_RE, 'email');
    if (policy.redactPhoneNumbers) collect(out, text, PHONE_RE, 'phone');
    if (policy.redactPII) collect(out, text, SSN_RE, 'ssn');
    if (policy.redactNames) collect(out, text, NAME_RE, 'name');
    if (policy.customPatterns) {
      for (const cp of policy.customPatterns) {
        collect(out, text, cp.pattern, 'custom');
      }
    }
    return out;
  }
}

function collect(
  out: DetectedSpan[],
  text: string,
  pattern: RegExp,
  kind: RedactionKind,
): void {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({
      kind,
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
}

function tokenLabel(kind: RedactionKind): string {
  switch (kind) {
    case 'email':
      return 'EMAIL';
    case 'phone':
      return 'PHONE';
    case 'ssn':
      return 'SSN';
    case 'name':
      return 'NAME';
    case 'custom':
      return 'CUSTOM';
  }
}

// utf8ByteLength returns the number of bytes the given string occupies
// when UTF-8 encoded. Used for the egress-byte calculation so the
// privacy strip and tracker show wire bytes, not code units.
export function utf8ByteLength(s: string): number {
  // TextEncoder is available in both the Electron main process
  // (Node) and the renderer (DOM) without imports.
  return new TextEncoder().encode(s).length;
}
