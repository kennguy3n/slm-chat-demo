import { useEffect, useState } from 'react';
import type { EgressSummaryResult } from '../../types/electron';

// useEgressSummary reads the running egress tally from the Electron
// preload bridge. When no bridge is present (e.g. SSR, vitest, or
// pre-Electron dev), it returns null and consumers fall back to a
// zero-state ("0 B") presentation. The hook re-polls every 2s so the
// TopBar updates without requiring a full app refresh.
export function useEgressSummary(intervalMs: number = 2000): EgressSummaryResult | null {
  const [summary, setSummary] = useState<EgressSummaryResult | null>(null);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.electronAI : undefined;
    if (!bridge?.egressSummary) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await bridge.egressSummary();
        if (!cancelled) setSummary(s);
      } catch {
        // Swallow — the renderer should never crash because of an
        // egress poll; leaving the previous summary visible is safer
        // than going blank.
      }
    };
    void tick();
    const handle = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [intervalMs]);

  return summary;
}
