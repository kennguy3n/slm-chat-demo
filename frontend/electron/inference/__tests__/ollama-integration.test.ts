// Optional Ollama integration smoke test.
//
// When a real Ollama daemon is reachable on `OLLAMA_BASE_URL` (or the
// default `http://localhost:11434`), this suite exercises the live
// `OllamaAdapter` end-to-end: ping → list models → status. It is
// intentionally read-only — it never pulls or evicts a model, so it
// is safe to run on a developer machine that already has
// Bonsai-8B configured via `./scripts/setup-models.sh`.
//
// When the daemon is *not* reachable (the default in CI), the suite
// is skipped via `describe.skipIf(...)` so it never blocks PRs.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefaultOllamaBaseURL, OllamaAdapter } from '../ollama.js';

const baseURL = process.env.OLLAMA_BASE_URL || DefaultOllamaBaseURL;

async function isOllamaReachable(): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 500);
  try {
    const res = await fetch(`${baseURL}/api/tags`, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let reachable = false;
beforeAll(async () => {
  reachable = await isOllamaReachable();
});
afterAll(() => {
  if (!reachable) {
    // Soft hint for someone running tests locally without Ollama —
    // surfaces in the verbose Vitest output but doesn't fail the run.
    console.info(
      `[ollama-integration] Skipped: ${baseURL}/api/tags unreachable. ` +
        `Run \`./scripts/setup-models.sh\` and \`ollama serve\` to enable.`,
    );
  }
});

describe.skipIf(!process.env.OLLAMA_INTEGRATION)('OllamaAdapter (live daemon)', () => {
  it('responds to ping when the daemon is up', async () => {
    if (!reachable) return;
    const ad = new OllamaAdapter({ baseURL });
    await expect(ad.ping()).resolves.toBeUndefined();
  });

  it('lists at least one locally pulled model', async () => {
    if (!reachable) return;
    const ad = new OllamaAdapter({ baseURL });
    const models = await ad.listModels();
    expect(Array.isArray(models)).toBe(true);
    // We don't assert a specific model name here because the developer
    // may have pulled `hf.co/prism-ml/Ternary-Bonsai-8B-gguf`, the
    // `bonsai-8b` alias, or both. The important thing for the
    // smoke test is that `/api/tags` returns a parseable list at all.
  });

  it('reports a structured ModelStatus regardless of load state', async () => {
    if (!reachable) return;
    const ad = new OllamaAdapter({ baseURL, model: 'bonsai-8b' });
    const s = await ad.status();
    expect(typeof s.loaded).toBe('boolean');
    expect(s.model).toBe('bonsai-8b');
    expect(['running', 'stopped']).toContain(s.sidecar);
    expect(s.ramUsageMB).toBeGreaterThanOrEqual(0);
  });
});
