import { describe, expect, it } from 'vitest';
import { LlamaCppAdapter } from '../llamacpp.js';

describe('LlamaCppAdapter', () => {
  it('reports the canonical adapter name', () => {
    expect(new LlamaCppAdapter().name()).toBe('llama.cpp');
  });

  it('throws a clear "not yet implemented" error from run()', async () => {
    const adapter = new LlamaCppAdapter();
    await expect(
      adapter.run({ taskType: 'smart_reply', prompt: 'hi' }),
    ).rejects.toThrow(/not yet implemented/);
  });

  it('throws from stream() without yielding any chunks', async () => {
    const adapter = new LlamaCppAdapter();
    const gen = adapter.stream({ taskType: 'smart_reply', prompt: 'hi' });
    await expect(gen.next()).rejects.toThrow(/not yet implemented/);
  });
});
