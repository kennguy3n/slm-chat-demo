import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SENSITIVE_LOG_KEYS,
  logInference,
  sanitizeForLog,
} from '../logging.js';

describe('sanitizeForLog', () => {
  it('redacts every known sensitive key', () => {
    const out = sanitizeForLog({
      prompt: 'summarize this email',
      output: 'meeting at 3pm',
      content: 'Hi all',
      body: 'Confidential body',
      text: 'free text',
      fields: { vendor: 'Acme' },
      message: 'whisper',
      messages: [{ role: 'user', content: 'x' }],
      chunk: 'streamed delta',
    });
    for (const k of [
      'prompt',
      'output',
      'content',
      'body',
      'text',
      'fields',
      'message',
      'messages',
      'chunk',
    ]) {
      expect(out[k]).toBe('[redacted]');
    }
  });

  it('preserves structural keys', () => {
    const out = sanitizeForLog({
      taskType: 'draft_artifact',
      model: 'confidential-large',
      tier: 'server',
      channelId: 'ch_engineering',
      latencyMs: 142,
      tokensUsed: 87,
      redactionCount: 3,
      decision: 'allow',
    });
    expect(out).toEqual({
      taskType: 'draft_artifact',
      model: 'confidential-large',
      tier: 'server',
      channelId: 'ch_engineering',
      latencyMs: 142,
      tokensUsed: 87,
      redactionCount: 3,
      decision: 'allow',
    });
  });

  it('returns an empty object for nullish input', () => {
    // @ts-expect-error verifying defensive behaviour for runtime callers
    expect(sanitizeForLog(null)).toEqual({});
    // @ts-expect-error verifying defensive behaviour for runtime callers
    expect(sanitizeForLog(undefined)).toEqual({});
  });

  it('exposes a stable sensitive-key list shared with the backend', () => {
    expect(SENSITIVE_LOG_KEYS.has('prompt')).toBe(true);
    expect(SENSITIVE_LOG_KEYS.has('output')).toBe(true);
    expect(SENSITIVE_LOG_KEYS.has('taskType')).toBe(false);
    expect(SENSITIVE_LOG_KEYS.has('model')).toBe(false);
  });
});

describe('logInference', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('writes a sanitized payload through console.log', () => {
    logInference('router:decide', {
      taskType: 'draft_artifact',
      model: 'confidential-large',
      tier: 'server',
      prompt: 'leak me',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [label, meta] = logSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe('[inference] router:decide');
    expect(meta.prompt).toBe('[redacted]');
    expect(meta.model).toBe('confidential-large');
    expect(meta.taskType).toBe('draft_artifact');
    expect(meta.tier).toBe('server');
  });
});
