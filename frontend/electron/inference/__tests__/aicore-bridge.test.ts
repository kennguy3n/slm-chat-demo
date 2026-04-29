import { describe, expect, it } from 'vitest';
import { StubAICoreBridge, type AICoreBridge } from '../aicore-bridge.js';

describe('StubAICoreBridge', () => {
  it('reports a stable name', () => {
    const bridge = new StubAICoreBridge();
    expect(bridge.name()).toBe('aicore-stub');
  });

  it('isAvailable resolves to unavailable in Electron', async () => {
    const bridge = new StubAICoreBridge();
    const cap = await bridge.isAvailable();
    expect(cap.available).toBe(false);
    expect(cap.models).toEqual([]);
    expect(cap.reason).toMatch(/not available in Electron/);
  });

  it('getSupportedModels returns an empty list', async () => {
    const bridge = new StubAICoreBridge();
    expect(await bridge.getSupportedModels()).toEqual([]);
  });

  it('initialize throws because AICore is not present in Electron', async () => {
    const bridge = new StubAICoreBridge();
    await expect(bridge.initialize()).rejects.toThrow(/not available in Electron/);
  });

  it('run throws because AICore is not present in Electron', async () => {
    const bridge = new StubAICoreBridge();
    await expect(
      bridge.run({ taskType: 'summarize', prompt: 'x' }),
    ).rejects.toThrow(/not available in Electron/);
  });

  it('stream throws because AICore is not present in Electron', async () => {
    const bridge = new StubAICoreBridge();
    const iter = bridge.stream({ taskType: 'summarize', prompt: 'x' });
    await expect(iter.next()).rejects.toThrow(/not available in Electron/);
  });

  it('the AICoreBridge type extends Adapter (compile-time)', () => {
    // Compile-time check: assigning a stub to the structural shape
    // should succeed because StubAICoreBridge implements every
    // Adapter + AICore lifecycle method.
    const bridge: AICoreBridge = new StubAICoreBridge();
    expect(typeof bridge.run).toBe('function');
    expect(typeof bridge.stream).toBe('function');
    expect(typeof bridge.initialize).toBe('function');
    expect(typeof bridge.isAvailable).toBe('function');
    expect(typeof bridge.getSupportedModels).toBe('function');
  });
});
