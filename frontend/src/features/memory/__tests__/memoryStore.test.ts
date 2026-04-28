import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildFact,
  createInMemoryStore,
  createMemoryStore,
  nextFactId,
} from '../memoryStore';

describe('buildFact', () => {
  it('trims whitespace, fills timestamps, and reuses an existing id', () => {
    const fact = buildFact({
      id: 'fact_existing',
      kind: 'person',
      text: '  Mira plays soccer  ',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    expect(fact.id).toBe('fact_existing');
    expect(fact.text).toBe('Mira plays soccer');
    expect(fact.createdAt).toBe('2026-04-27T10:00:00.000Z');
    expect(fact.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('generates an id when none is supplied', () => {
    const fact = buildFact({ kind: 'preference', text: 'Likes oat milk' });
    expect(fact.id).toMatch(/^fact_/);
  });

  it('drops optional source pins when missing', () => {
    const fact = buildFact({ kind: 'note', text: 'Foo' });
    expect(fact.sourceChannelId).toBeUndefined();
    expect(fact.sourceMessageId).toBeUndefined();
  });
});

describe('nextFactId', () => {
  it('returns a unique-ish id', () => {
    const a = nextFactId();
    const b = nextFactId();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^fact_/);
  });
});

describe('in-memory MemoryStore', () => {
  let store: ReturnType<typeof createInMemoryStore>;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('round-trips puts and lists most-recent first', async () => {
    const a = buildFact({
      id: 'a',
      kind: 'person',
      text: 'A',
      createdAt: '2026-04-27T10:00:00.000Z',
    });
    const b = buildFact({
      id: 'b',
      kind: 'preference',
      text: 'B',
      createdAt: '2026-04-28T10:00:00.000Z',
    });
    await store.put(a);
    await store.put(b);
    const rows = await store.list();
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('upserts on put', async () => {
    const v1 = buildFact({ id: 'a', kind: 'person', text: 'V1' });
    await store.put(v1);
    const v2 = { ...v1, text: 'V2' };
    await store.put(v2);
    const rows = await store.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('V2');
  });

  it('removes by id', async () => {
    const a = buildFact({ id: 'a', kind: 'note', text: 'A' });
    const b = buildFact({ id: 'b', kind: 'note', text: 'B' });
    await store.put(a);
    await store.put(b);
    await store.remove('a');
    const rows = await store.list();
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  it('clear() empties the store', async () => {
    await store.put(buildFact({ id: 'a', kind: 'note', text: 'A' }));
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});

describe('createMemoryStore', () => {
  it('falls back to in-memory when indexedDB is missing', async () => {
    // jsdom does not ship a full IndexedDB; the factory should still
    // return a working store with the same contract.
    const store = createMemoryStore();
    const f = buildFact({ id: 'a', kind: 'note', text: 'hello' });
    await store.put(f);
    const rows = await store.list();
    expect(rows.find((r) => r.id === 'a')?.text).toBe('hello');
    await store.clear();
  });
});
