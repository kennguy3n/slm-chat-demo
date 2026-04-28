// Local-only memory store backed by IndexedDB. Stores user-confirmed
// facts (people, preferences, routines, free-form notes) on-device and
// nowhere else. The AI never auto-writes — every fact passes through
// the AIMemoryPage UI. Egress for any operation is always 0 bytes.
//
// IndexedDB is awkward in jsdom / SSR / Vitest. The store falls back
// to an in-memory map when `indexedDB` is missing so renderer tests
// and headless builds keep working.

import type { MemoryFact, MemoryFactKind } from '../../types/ai';

const DB_NAME = 'kchat-slm-memory';
const DB_VERSION = 1;
const STORE_NAME = 'facts';

export interface MemoryStore {
  list(): Promise<MemoryFact[]>;
  put(fact: MemoryFact): Promise<MemoryFact>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

// Public factory. Picks IndexedDB when available, otherwise an
// in-memory shim with the same contract.
export function createMemoryStore(): MemoryStore {
  if (typeof indexedDB === 'undefined') return createInMemoryStore();
  try {
    return createIndexedDBStore();
  } catch {
    return createInMemoryStore();
  }
}

// nextFactId is exported for tests; returns a sortable, opaque id with
// enough entropy to avoid collisions inside a single demo session.
export function nextFactId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `fact_${Date.now().toString(36)}_${rand}`;
}

export function buildFact(input: {
  kind: MemoryFactKind;
  text: string;
  sourceChannelId?: string;
  sourceMessageId?: string;
  id?: string;
  createdAt?: string;
}): MemoryFact {
  const now = new Date().toISOString();
  return {
    id: input.id ?? nextFactId(),
    kind: input.kind,
    text: input.text.trim(),
    ...(input.sourceChannelId ? { sourceChannelId: input.sourceChannelId } : {}),
    ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {}),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

// ---------- IndexedDB implementation ----------

function createIndexedDBStore(): MemoryStore {
  return {
    list: () =>
      withStore('readonly', (s) =>
        wrap<MemoryFact[]>(s.getAll() as IDBRequest<MemoryFact[]>),
      ).then((rows) => rows.sort(byCreatedAtDesc)),
    put: async (fact) => {
      await withStore('readwrite', (s) => wrap(s.put(fact)));
      return fact;
    },
    remove: async (id) => {
      await withStore('readwrite', (s) => wrap(s.delete(id)));
    },
    clear: async () => {
      await withStore('readwrite', (s) => wrap(s.clear()));
    },
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve(fn(store))
      .then((value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'));
        tx.onabort = () => reject(tx.error ?? new Error('indexedDB tx aborted'));
      })
      .catch(reject);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

// ---------- In-memory fallback ----------

export function createInMemoryStore(): MemoryStore {
  const rows = new Map<string, MemoryFact>();
  return {
    list: async () => Array.from(rows.values()).sort(byCreatedAtDesc),
    put: async (fact) => {
      rows.set(fact.id, fact);
      return fact;
    },
    remove: async (id) => {
      rows.delete(id);
    },
    clear: async () => {
      rows.clear();
    },
  };
}

function byCreatedAtDesc(a: MemoryFact, b: MemoryFact): number {
  if (a.createdAt > b.createdAt) return -1;
  if (a.createdAt < b.createdAt) return 1;
  return 0;
}
