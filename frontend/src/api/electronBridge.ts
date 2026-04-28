// Helpers for routing AI calls to the Electron main process when the
// preload bridge is available, falling back to the legacy HTTP path
// when running in a plain browser (e.g. `npm run dev`, Vitest, demos
// hosted as a static web build).

export function getElectronAI(): NonNullable<Window['electronAI']> | null {
  if (typeof window === 'undefined') return null;
  return window.electronAI ?? null;
}

export function hasElectronAI(): boolean {
  return getElectronAI() !== null;
}
