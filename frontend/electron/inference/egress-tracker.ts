// EgressTracker — Phase 6 singleton that records every server-bound
// inference request so the renderer can show a running tally of
// "data that has left the device". The tracker lives in the Electron
// main process and is exposed to the renderer via the `egress:summary`
// IPC channel and `window.electronAI.egressSummary()`.
//
// The tracker is *write-only* from the renderer's perspective: only
// the router records entries (after a successful server-routed
// inference) and only the renderer reads the summary. The reset
// button in `EgressSummaryPanel` is a separate explicit affordance,
// surfaced to the user the same way "clear browser history" is.

import type { TaskType } from './adapter.js';

export interface EgressEntry {
  // Wall-clock millis. Sortable, and easy for the renderer to format
  // with `Intl.DateTimeFormat`.
  timestamp: number;
  taskType: TaskType;
  // UTF-8 byte length of the *post-tokenization* prompt actually sent
  // to the server. Equals 0 for refused requests.
  egressBytes: number;
  // Number of redactions applied before dispatch. The renderer uses
  // this for the "3 items redacted" summary line.
  redactionCount: number;
  model: string;
  channelId?: string;
}

export interface EgressSummary {
  totalBytes: number;
  totalRequests: number;
  totalRedactions: number;
  byChannel: Record<string, { bytes: number; requests: number }>;
  byModel: Record<string, { bytes: number; requests: number }>;
  // Most-recent-first slice of recorded entries. Capped at 100 by the
  // tracker so the IPC payload stays bounded.
  recent: EgressEntry[];
}

const MaxRecent = 100;

export class EgressTracker {
  private entries: EgressEntry[] = [];

  record(entry: EgressEntry): void {
    this.entries.push(entry);
    // Cap memory usage. Drop the oldest when we exceed 4× MaxRecent
    // so the array doesn't grow unboundedly during long sessions.
    if (this.entries.length > MaxRecent * 4) {
      this.entries = this.entries.slice(-MaxRecent * 4);
    }
  }

  summary(): EgressSummary {
    const byChannel: Record<string, { bytes: number; requests: number }> = {};
    const byModel: Record<string, { bytes: number; requests: number }> = {};
    let totalBytes = 0;
    let totalRedactions = 0;
    for (const e of this.entries) {
      totalBytes += e.egressBytes;
      totalRedactions += e.redactionCount;
      const ck = e.channelId || '(unscoped)';
      byChannel[ck] ??= { bytes: 0, requests: 0 };
      byChannel[ck].bytes += e.egressBytes;
      byChannel[ck].requests += 1;
      const mk = e.model || '(unknown)';
      byModel[mk] ??= { bytes: 0, requests: 0 };
      byModel[mk].bytes += e.egressBytes;
      byModel[mk].requests += 1;
    }
    return {
      totalBytes,
      totalRequests: this.entries.length,
      totalRedactions,
      byChannel,
      byModel,
      recent: [...this.entries].reverse().slice(0, MaxRecent),
    };
  }

  reset(): void {
    this.entries = [];
  }

  // size returns the current number of stored entries. Exposed for
  // tests so they can assert recording behaviour without poking the
  // private field.
  size(): number {
    return this.entries.length;
  }
}

// Module-level singleton. The IPC handler wires this up to
// `egress:summary`; the router records into it on every server-routed
// inference. Tests can construct a fresh tracker via `new
// EgressTracker()` to avoid global state leakage.
export const globalEgressTracker = new EgressTracker();
