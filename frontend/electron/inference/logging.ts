// Phase 6 §7.2 — no-content logging utilities for the Electron main
// process. The renderer never sees these — they are used by ipc-handlers
// and the inference router so that any debug log line emitted by the
// main process records only structural metadata (taskType, model, tier,
// channelId, redaction counts, decisions). Free-text prompts and AI
// outputs MUST never appear in Electron's main-process console logs.

/**
 * Sensitive keys that may carry message bodies, AI prompts, AI outputs,
 * or artifact contents. Any value at one of these keys is replaced with
 * the literal string `"[redacted]"` before logging. Keep this list in
 * sync with `backend/internal/api/middleware_logging.go`'s
 * `sensitiveLogKeys`.
 */
export const SENSITIVE_LOG_KEYS = new Set<string>([
  'body',
  'content',
  'prompt',
  'output',
  'fields',
  'text',
  'message',
  'messages',
  'chunk',
]);

/**
 * Returns a shallow copy of `obj` with every sensitive key replaced by
 * `"[redacted]"`. Structural keys (e.g. `taskType`, `model`, `tier`,
 * `channelId`, `latencyMs`, `tokensUsed`, `redactionCount`,
 * `decision`) pass through untouched.
 */
export function sanitizeForLog(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_LOG_KEYS.has(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Structural-only debug log line for the Electron main process.
 *
 * `label` is a short event name (e.g. `"router:decide"`). `meta` is a
 * map of structural metadata about the event — never the prompt, never
 * the response. `meta` is run through `sanitizeForLog` defensively so
 * accidental inclusion of a sensitive key does not leak into stdout.
 */
export function logInference(
  label: string,
  meta: Record<string, unknown>,
): void {
  const safe = sanitizeForLog(meta);
  console.log(`[inference] ${label}`, safe);
}
