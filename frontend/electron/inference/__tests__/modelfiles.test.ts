// Modelfile existence + content sanity tests.
//
// The bootstrap (`frontend/electron/inference/bootstrap.ts`) defaults the
// E2B / E4B model names to `ternary-bonsai-8b` (both tiers point at the
// same on-device model), and the repo-level `scripts/setup-models.sh`
// creates that exact alias from the Modelfile under `models/`. If those
// files drift apart the installation flow documented in `README.md`
// silently breaks, so we pin the contract here.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
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
  it('ships a single Modelfile.bonsai8b that points at the Ternary-Bonsai-8B GGUF repo', () => {
    const body = readModelfile('Modelfile.bonsai8b');
    const base = fromTag(body);
    expect(base).toBeTruthy();
    // Lock the default to the Ternary-Bonsai-8B HuggingFace GGUF repo
    // (via Ollama's `hf.co/<user>/<repo>` shorthand), or to a local
    // `.gguf` file fallback for environments where the shorthand is
    // unsupported.
    expect(base!.toLowerCase()).toMatch(
      /^(hf\.co\/prism-ml\/ternary-bonsai-8b-gguf|\.\/.*\.gguf|\/.*\.gguf)/,
    );
    expect(body).toMatch(/^PARAMETER\s+temperature\s/m);
    expect(body).toMatch(/^PARAMETER\s+num_ctx\s/m);
    expect(body).toMatch(/^SYSTEM\s/m);
  });

  it('does not ship legacy Gemma Modelfiles alongside the Bonsai one', () => {
    // Protect against a regression where both the old and the new
    // Modelfiles end up in the tree simultaneously.
    const entries = readdirSync(modelsDir);
    for (const name of entries) {
      expect(name.toLowerCase()).not.toContain('gemma');
    }
    expect(existsSync(path.join(modelsDir, 'Modelfile.e2b'))).toBe(false);
    expect(existsSync(path.join(modelsDir, 'Modelfile.e4b'))).toBe(false);
  });

  it('ships a models/README.md that documents the ternary-bonsai-8b alias', () => {
    const readmePath = path.join(modelsDir, 'README.md');
    expect(existsSync(readmePath)).toBe(true);
    const body = readFileSync(readmePath, 'utf8');
    expect(body).toContain('ternary-bonsai-8b');
    expect(body).toContain('Modelfile.bonsai8b');
    // Legacy names should have been purged.
    expect(body.toLowerCase()).not.toContain('gemma');
  });

  it('ships an executable scripts/setup-models.sh that references the Modelfile and alias', () => {
    const scriptPath = path.join(scriptsDir, 'setup-models.sh');
    expect(existsSync(scriptPath)).toBe(true);
    const body = readFileSync(scriptPath, 'utf8');
    expect(body.startsWith('#!')).toBe(true);
    expect(body).toContain('models/Modelfile.bonsai8b');
    // Bootstrap default — the alias the script must create.
    expect(body).toContain('ternary-bonsai-8b');
    // Honours `MODEL_NAME` for operator overrides.
    expect(body).toMatch(/MODEL_NAME/);
    // Legacy names should have been purged.
    expect(body.toLowerCase()).not.toContain('gemma');

    // POSIX exec bit (skipped on platforms where stat doesn't expose
    // the bit, e.g. Windows CI).
    if (process.platform !== 'win32') {
      const mode = statSync(scriptPath).mode;
      expect((mode & 0o111) !== 0, 'setup-models.sh must be executable').toBe(true);
    }
  });
});
