// Drop a `dist-electron/package.json` with `type: commonjs` so Node /
// Electron treat the tsc-emitted .js files as CommonJS even though the
// outer `frontend/package.json` opts into ESM (`"type": "module"`).
//
// Run this after `tsc -p tsconfig.electron.json`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist-electron');
mkdirSync(distDir, { recursive: true });
writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
console.log('wrote dist-electron/package.json');
