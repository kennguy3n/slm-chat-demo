import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetActivityForTesting,
  listActivity,
  listActivityByDate,
  logActivity,
  subscribeActivity,
  summarizeActivity,
} from '../activityLog';

afterEach(() => {
  __resetActivityForTesting();
  vi.useRealTimers();
});

describe('activityLog', () => {
  it('records entries and assigns an id + timestamp', () => {
    const entry = logActivity({
      skillId: 'family-checklist',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 3,
      egressBytes: 0,
      latencyMs: 25,
    });
    expect(entry.id).toMatch(/^act_/);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(listActivity()).toHaveLength(1);
  });

  it('summarizes runs, items, egress, and unique models', () => {
    logActivity({
      skillId: 'family-checklist',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 3,
      egressBytes: 0,
      latencyMs: 25,
    });
    logActivity({
      skillId: 'trip-planner',
      model: 'ternary-bonsai-8b-alt',
      tier: 'e4b',
      itemsProduced: 4,
      egressBytes: 0,
      latencyMs: 80,
    });
    const s = summarizeActivity();
    expect(s.totalRuns).toBe(2);
    expect(s.totalItems).toBe(7);
    expect(s.totalEgressBytes).toBe(0);
    expect(s.modelsUsed).toEqual(['ternary-bonsai-8b', 'ternary-bonsai-8b-alt']);
    expect(s.timeSavedSeconds).toBe(7 * 30);
  });

  it('filters entries by date prefix', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T10:00:00Z'));
    logActivity({
      skillId: 'family-checklist',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 1,
      egressBytes: 0,
      latencyMs: 10,
    });
    vi.setSystemTime(new Date('2026-04-29T10:00:00Z'));
    logActivity({
      skillId: 'family-checklist',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 2,
      egressBytes: 0,
      latencyMs: 12,
    });
    expect(listActivityByDate('2026-04-28')).toHaveLength(1);
    expect(listActivityByDate('2026-04-29')).toHaveLength(1);
    expect(listActivityByDate('2026-04-30')).toHaveLength(0);
  });

  it('notifies subscribers on every new entry', () => {
    const spy = vi.fn();
    const unsubscribe = subscribeActivity(spy);
    expect(spy).toHaveBeenCalledTimes(1); // initial replay
    logActivity({
      skillId: 'guardrail-rewrite',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 1,
      egressBytes: 0,
      latencyMs: 5,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    unsubscribe();
    logActivity({
      skillId: 'guardrail-rewrite',
      model: 'ternary-bonsai-8b',
      tier: 'e2b',
      itemsProduced: 1,
      egressBytes: 0,
      latencyMs: 5,
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
