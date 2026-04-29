import { describe, expect, it } from 'vitest';
import {
  DefaultRedactionPolicy,
  RedactionEngine,
  utf8ByteLength,
} from './redaction.js';

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte each', () => {
    expect(utf8ByteLength('hello')).toBe(5);
  });
  it('counts multibyte runes correctly', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('日本語')).toBe(9);
  });
});

describe('RedactionEngine.tokenize', () => {
  it('returns the input unchanged when no PII is present', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('just a regular message');
    expect(t.text).toBe('just a regular message');
    expect(t.redactions).toHaveLength(0);
    expect(t.mapping).toEqual({});
    expect(t.egressBytes).toBe(utf8ByteLength('just a regular message'));
  });

  it('tokenizes emails and stores the mapping', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('please reach me at alice@acme.com today');
    expect(t.text).toBe('please reach me at [EMAIL_1] today');
    expect(t.redactions).toHaveLength(1);
    expect(t.redactions[0].kind).toBe('email');
    expect(t.redactions[0].original).toBe('alice@acme.com');
    expect(t.mapping['[EMAIL_1]']).toBe('alice@acme.com');
  });

  it('numbers same-kind tokens sequentially', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('a@x.com talked to b@y.com about c@z.com');
    expect(t.text).toContain('[EMAIL_1]');
    expect(t.text).toContain('[EMAIL_2]');
    expect(t.text).toContain('[EMAIL_3]');
    expect(t.redactions).toHaveLength(3);
  });

  it('detects phones and SSN-like spans', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('call (415) 555-2671 or SSN 123-45-6789');
    const kinds = t.redactions.map((r) => r.kind).sort();
    expect(kinds).toEqual(['phone', 'ssn']);
  });

  it('detects two-word capitalized names by default', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('Alice Smith met Bob Johnson');
    expect(t.redactions.filter((r) => r.kind === 'name').length).toBe(2);
    expect(t.text).toMatch(/\[NAME_1\] met \[NAME_2\]/);
  });

  it('respects redactNames=false', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('Alice Smith called', {
      ...DefaultRedactionPolicy,
      redactNames: false,
    });
    expect(t.redactions).toHaveLength(0);
    expect(t.text).toBe('Alice Smith called');
  });

  it('respects redactPII=false (master switch)', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('alice@acme.com Alice Smith 415-555-2671', {
      redactPII: false,
      redactEmails: true,
      redactPhoneNumbers: true,
      redactNames: true,
    });
    expect(t.redactions).toHaveLength(0);
  });

  it('honors customPatterns', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('account ABC-123-XYZ debited', {
      ...DefaultRedactionPolicy,
      customPatterns: [{ name: 'account', pattern: /[A-Z]{3}-\d+-[A-Z]+/g }],
    });
    expect(t.text).toMatch(/\[CUSTOM_1\]/);
    expect(t.redactions[0].kind).toBe('custom');
  });

  it('reports utf-8 egressBytes (not js-string code units)', () => {
    const e = new RedactionEngine();
    const t = e.tokenize('日本 alice@acme.com');
    // Tokenized output: "日本 [EMAIL_1]" — 6 bytes for 日本, 1 space,
    // 9 chars [EMAIL_1] (well, 9 bytes ASCII).
    expect(t.egressBytes).toBe(utf8ByteLength(t.text));
  });
});

describe('RedactionEngine.detokenize', () => {
  it('round-trips: tokenize then detokenize produces the original', () => {
    const e = new RedactionEngine();
    const orig = 'Alice Smith at alice@acme.com or 415-555-2671';
    const t = e.tokenize(orig);
    expect(e.detokenize(t.text, t.mapping)).toBe(orig);
  });

  it('orders longest-token-first so [EMAIL_10] does not get clobbered by [EMAIL_1]', () => {
    const e = new RedactionEngine();
    const mapping: Record<string, string> = {
      '[EMAIL_1]': 'a@x',
      '[EMAIL_10]': 'b@y',
    };
    const out = e.detokenize('first=[EMAIL_10] second=[EMAIL_1]', mapping);
    expect(out).toBe('first=b@y second=a@x');
  });

  it('leaves unknown tokens intact (partial responses survive)', () => {
    const e = new RedactionEngine();
    const out = e.detokenize('hi [UNKNOWN_99]', {});
    expect(out).toBe('hi [UNKNOWN_99]');
  });
});

describe('RedactionEngine.redact', () => {
  it('produces an irreversible "[REDACTED]"-substituted text', () => {
    const e = new RedactionEngine();
    const r = e.redact('email me at alice@acme.com');
    expect(r.text).toBe('email me at [REDACTED]');
    expect(r.redactions[0].replacement).toBe('[REDACTED]');
    expect(r.redactions[0].original).toBe('alice@acme.com');
  });
});
