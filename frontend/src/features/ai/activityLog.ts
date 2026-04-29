// Lightweight in-memory activity log for the Phase 2 metrics dashboard.
// Each successful AI skill execution logs an entry (skill id, model,
// tier, items produced, latency, egress bytes). The dashboard reads
// these entries to summarise on-device AI work for the user. `tier`
// here distinguishes local vs. confidential-server compute; the demo
// ships a single on-device model (Ternary-Bonsai-8B) so most entries
// will be `local`.
//
// This module deliberately keeps no IndexedDB persistence today — the
// metrics are session-scoped because that matches the demo flow ("how
// much did the assistant just do for me on this device, right now?").
// A persistent backing can be added later behind the same API.

export type Tier = 'local' | 'server';

export interface ActivityEntry {
  id: string;
  timestamp: string; // ISO-8601
  skillId: string;
  model: string;
  tier: Tier;
  itemsProduced: number;
  egressBytes: number;
  latencyMs: number;
}

export interface ActivitySummary {
  totalRuns: number;
  totalItems: number;
  totalEgressBytes: number;
  modelsUsed: string[];
  // Coarse "time saved" estimate: 30s per item the assistant produced
  // (PROPOSAL.md §4 talks about restoring user attention; we model the
  // same intuition as a lower-bound).
  timeSavedSeconds: number;
}

type Listener = (entries: ActivityEntry[]) => void;

const entries: ActivityEntry[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function nextId(): string {
  return `act_${Date.now().toString(36)}_${(++seq).toString(36)}`;
}

export function logActivity(input: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
  const entry: ActivityEntry = {
    id: nextId(),
    timestamp: new Date().toISOString(),
    ...input,
  };
  entries.push(entry);
  for (const fn of listeners) {
    try {
      fn([...entries]);
    } catch {
      // listener errors must not break the producer.
    }
  }
  return entry;
}

export function listActivity(): ActivityEntry[] {
  return [...entries];
}

export function listActivityByDate(date: string): ActivityEntry[] {
  // Match entries whose ISO timestamp begins with `YYYY-MM-DD`.
  return entries.filter((e) => e.timestamp.startsWith(date));
}

export function summarizeActivity(scope?: ActivityEntry[]): ActivitySummary {
  const rows = scope ?? entries;
  const models = new Set<string>();
  let totalItems = 0;
  let totalEgress = 0;
  for (const e of rows) {
    models.add(e.model);
    totalItems += e.itemsProduced;
    totalEgress += e.egressBytes;
  }
  return {
    totalRuns: rows.length,
    totalItems,
    totalEgressBytes: totalEgress,
    modelsUsed: Array.from(models).sort(),
    timeSavedSeconds: totalItems * 30,
  };
}

export function subscribeActivity(fn: Listener): () => void {
  listeners.add(fn);
  fn([...entries]);
  return () => {
    listeners.delete(fn);
  };
}

export function __resetActivityForTesting(): void {
  entries.length = 0;
  seq = 0;
  listeners.clear();
}
