import { describe, expect, it } from 'vitest';
import {
  parseGuardrailOutput,
  regexFindings,
  runGuardrailRewrite,
} from '../skills/guardrail-rewrite.js';
import { InferenceRouter } from '../router.js';
import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from '../adapter.js';

class CannedAdapter implements Adapter {
  public lastReq: InferenceRequest | null = null;
  constructor(public output: string, public modelLabel = 'ternary-bonsai-8b') {}
  name() {
    return 'canned';
  }
  async run(req: InferenceRequest): Promise<InferenceResponse> {
    this.lastReq = req;
    return {
      taskType: req.taskType,
      model: req.model || this.modelLabel,
      output: this.output,
      tokensUsed: 1,
      latencyMs: 1,
      onDevice: true,
    };
  }
  async *stream(): AsyncGenerator<StreamChunk, void, void> {
    yield { done: true };
  }
}

function makeRouter(output: string): InferenceRouter {
  const e2b = new CannedAdapter(output, 'ternary-bonsai-8b');
  const e4b = new CannedAdapter(output, 'ternary-bonsai-8b');
  const mock = new CannedAdapter(output, 'ternary-bonsai-8b');
  return new InferenceRouter(e2b, e4b, mock);
}

describe('regexFindings', () => {
  it('flags phone numbers, emails, and SSNs', () => {
    const findings = regexFindings(
      'Call me at 415-555-1234 or email me at me@example.com. SSN 123-45-6789.',
    );
    const reasons = findings.map((f) => f.reason);
    expect(reasons).toEqual(
      expect.arrayContaining(['phone number', 'email address', 'SSN-like number']),
    );
    for (const f of findings) expect(f.source).toBe('regex');
  });

  it('returns nothing for clean text', () => {
    expect(regexFindings('Hello there, friend!')).toEqual([]);
  });
});

describe('parseGuardrailOutput', () => {
  it('parses a SAFE=false response with findings and a rewrite', () => {
    const parsed = parseGuardrailOutput(
      [
        'SAFE: false',
        'FINDINGS:',
        '- pii | 415-555-1234 | phone number',
        '- tone | shut up | aggressive language',
        'REWRITE: Hi — please call me when you can.',
        'RATIONALE: Stripped a phone number and softened the tone.',
      ].join('\n'),
    );
    expect(parsed.result.safe).toBe(false);
    expect(parsed.result.findings).toHaveLength(2);
    expect(parsed.result.rewrite).toMatch(/please call/);
    expect(parsed.result.rationale).toMatch(/Stripped a phone number/);
  });

  it('parses a SAFE=true response with just a rationale', () => {
    const parsed = parseGuardrailOutput(['SAFE: true', 'RATIONALE: looks fine.'].join('\n'));
    expect(parsed.result.safe).toBe(true);
    expect(parsed.result.rewrite).toBeUndefined();
  });
});

describe('runGuardrailRewrite', () => {
  it('refuses on empty text without invoking the model', async () => {
    const router = makeRouter('');
    const result = await runGuardrailRewrite(router, { input: { text: '   ' } });
    expect(result.status).toBe('refused');
  });

  it('returns regex findings even when the model says INSUFFICIENT', async () => {
    const router = makeRouter('INSUFFICIENT: not sure');
    const text = 'Call me at 415-555-1234';
    const result = await runGuardrailRewrite(router, { input: { text } });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.result.safe).toBe(false);
    expect(result.result.findings.some((f) => f.reason === 'phone number')).toBe(true);
  });

  it('merges regex + model findings and surfaces a rewrite', async () => {
    const modelOut = [
      'SAFE: false',
      'FINDINGS:',
      '- tone | shut up | aggressive language',
      'REWRITE: Please call me when you can.',
      'RATIONALE: softened tone, removed phone number.',
    ].join('\n');
    const router = makeRouter(modelOut);
    const result = await runGuardrailRewrite(router, {
      input: { text: 'Call me at 415-555-1234 and shut up' },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.result.safe).toBe(false);
    expect(result.result.findings.some((f) => f.source === 'regex')).toBe(true);
    expect(result.result.findings.some((f) => f.source === 'model')).toBe(true);
    expect(result.result.rewrite).toContain('Please call me');
    expect(result.result.rationale).toMatch(/softened/);
    expect(result.privacy).toBeTruthy();
    if (result.privacy) {
      expect(result.privacy.computeLocation).toBe('on_device');
      expect(result.privacy.dataEgressBytes).toBe(0);
    }
  });

  it('reports safe=true when model says so AND regex finds nothing', async () => {
    const router = makeRouter('SAFE: true\nRATIONALE: nothing risky.');
    const result = await runGuardrailRewrite(router, {
      input: { text: 'Hi! Hope you are doing well.' },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.result.safe).toBe(true);
    expect(result.result.findings).toEqual([]);
  });
});
