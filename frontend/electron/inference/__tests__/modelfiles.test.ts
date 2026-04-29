// Modelfile existence + content sanity tests.
//
// The bootstrap (`frontend/electron/inference/bootstrap.ts`) defaults the
// E2B / E4B model names to `gemma-4-e2b` / `gemma-4-e4b`, and the
// repo-level `scripts/setup-models.sh` creates those exact aliases
// from the Modelfiles under `models/`. If those files drift apart the
// installation flow documented in `README.md` silently breaks, so we
// pin the contract here.

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __tests__ → inference → electron → frontend → repo root
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const modelsDir = path.join(repoRoot, 'models');
const scriptsDir = path.join(repoRoot, 'scripts');

function readModelfile(name: string): string {
  const p = path.join(modelsDir, name);
  expect(existsSync(p), `${name} should exist at ${p}`).toBe(true);
  return readFileSync(p, 'utf8');
}

function fromTag(contents: string): string | null {
  const m = contents.match(/^FROM\s+(\S+)/m);
  return m ? m[1]! : null;
}

describe('models/ Modelfiles', () => {
  it('ships an E2B Modelfile that points at a real Ollama Gemma 4 base tag', () => {
    const body = readModelfile('Modelfile.e2b');
    const base = fromTag(body);
    expect(base).toBeTruthy();
    // Lock the default to a Gemma-family base so an accidental swap to
    // a different model family is caught in CI. The exact tag suffix
    // (e.g. `:e2b`, `:e2b-it-q4_K_M`) is left flexible so quantisation
    // can change without breaking the test.
    expect(base!.toLowerCase()).toMatch(/^gemma\d?:?/);
    expect(body).toMatch(/^PARAMETER\s+temperature\s/m);
    expect(body).toMatch(/^PARAMETER\s+num_ctx\s/m);
    expect(body).toMatch(/^SYSTEM\s/m);
  });

  it('ships an E4B Modelfile that points at a real Ollama Gemma 4 base tag', () => {
    const body = readModelfile('Modelfile.e4b');
    const base = fromTag(body);
    expect(base).toBeTruthy();
    expect(base!.toLowerCase()).toMatch(/^gemma\d?:?/);
    expect(body).toMatch(/^PARAMETER\s+temperature\s/m);
    expect(body).toMatch(/^PARAMETER\s+num_ctx\s/m);
    expect(body).toMatch(/^SYSTEM\s/m);
  });

  it('ships a models/README.md that documents both aliases', () => {
    const readmePath = path.join(modelsDir, 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const body = readFileSync(readmePath, 'utf8');
    expect(body).toContain('gemma-4-e2b');
    expect(body).toContain('gemma-4-e4b');
    expect(body).toContain('Modelfile.e2b');
    expect(body).toContain('Modelfile.e4b');
  });

  it('ships an executable scripts/setup-models.sh that references both Modelfiles', () => {
    const scriptPath = path.join(scriptsDir, 'setup-models.sh');
    expect(existsSync(scriptPath)).toBe(true);
    const body = readFileSync(scriptPath, 'utf8');
    expect(body.startsWith('#!')).toBe(true);
    expect(body).toContain('models/Modelfile.e2b');
    expect(body).toContain('models/Modelfile.e4b');
    // Bootstrap defaults — these are the aliases the script must create.
    expect(body).toContain('gemma-4-e2b');
    expect(body).toContain('gemma-4-e4b');
    // Honours the same env-var overrides the bootstrap reads.
    expect(body).toMatch(/E2B_MODEL/);
    expect(body).toMatch(/E4B_MODEL/);

    // POSIX exec bit (skipped on platforms where stat doesn't expose
    // the bit, e.g. Windows CI).
    if (process.platform !== 'win32') {
      const mode = statSync(scriptPath).mode;
      expect((mode & 0o111) !== 0, 'setup-models.sh must be executable').toBe(true);
    }
  });
});
