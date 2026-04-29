import { describe, expect, it } from 'vitest';
import { EgressTracker, type EgressEntry } from './egress-tracker.js';

function entry(over: Partial<EgressEntry> = {}): EgressEntry {
  return {
    timestamp: 1_700_000_000_000,
    taskType: 'summarize',
    egressBytes: 50,
    redactionCount: 1,
    model: 'confidential-large',
    channelId: 'ch_engineering',
    ...over,
  };
}

describe('EgressTracker', () => {
  it('starts empty with a zero-state summary', () => {
    const t = new EgressTracker();
    const s = t.summary();
    expect(s.totalRequests).toBe(0);
    expect(s.totalBytes).toBe(0);
    expect(s.totalRedactions).toBe(0);
    expect(s.recent).toEqual([]);
  });

  it('records and aggregates total bytes / requests / redactions', () => {
    const t = new EgressTracker();
    t.record(entry({ egressBytes: 100, redactionCount: 2 }));
    t.record(entry({ egressBytes: 30, redactionCount: 0 }));
    const s = t.summary();
    expect(s.totalRequests).toBe(2);
    expect(s.totalBytes).toBe(130);
    expect(s.totalRedactions).toBe(2);
  });

  it('breaks down by channel and by model', () => {
    const t = new EgressTracker();
    t.record(entry({ channelId: 'ch_a', egressBytes: 10, model: 'm1' }));
    t.record(entry({ channelId: 'ch_a', egressBytes: 20, model: 'm2' }));
    t.record(entry({ channelId: 'ch_b', egressBytes: 5, model: 'm1' }));
    const s = t.summary();
    expect(s.byChannel.ch_a.bytes).toBe(30);
    expect(s.byChannel.ch_a.requests).toBe(2);
    expect(s.byChannel.ch_b.bytes).toBe(5);
    expect(s.byModel.m1.bytes).toBe(15);
    expect(s.byModel.m2.bytes).toBe(20);
  });

  it('groups channelless entries under "(unscoped)"', () => {
    const t = new EgressTracker();
    t.record(entry({ channelId: undefined, egressBytes: 7 }));
    expect(t.summary().byChannel['(unscoped)'].bytes).toBe(7);
  });

  it('returns recent entries newest-first', () => {
    const t = new EgressTracker();
    t.record(entry({ timestamp: 1, egressBytes: 1 }));
    t.record(entry({ timestamp: 2, egressBytes: 2 }));
    t.record(entry({ timestamp: 3, egressBytes: 3 }));
    const recent = t.summary().recent;
    expect(recent.map((r) => r.timestamp)).toEqual([3, 2, 1]);
  });

  it('reset() clears all entries', () => {
    const t = new EgressTracker();
    t.record(entry());
    t.record(entry());
    expect(t.size()).toBe(2);
    t.reset();
    expect(t.size()).toBe(0);
    expect(t.summary().totalRequests).toBe(0);
  });
});
