import { describe, expect, it, vi } from 'vitest';
import { gatherRetrievalContext } from '../retrievalContext';
import type { RetrievalResult, SelectedSource } from '../../types/knowledge';

const HIT_A: RetrievalResult = {
  chunk: {
    id: 'chunk_a',
    channelId: 'ch_engineering',
    sourceKind: 'message',
    sourceId: 'msg_1',
    content: 'we should ship logging',
  },
  score: 0.9,
};

const HIT_B: RetrievalResult = {
  chunk: {
    id: 'chunk_b',
    channelId: 'ch_engineering',
    sourceKind: 'file',
    sourceId: 'file_acme_q3_prd',
    content: 'PRD excerpt about logging',
  },
  score: 0.6,
};

const HIT_C: RetrievalResult = {
  chunk: {
    id: 'chunk_c',
    channelId: 'ch_vendor_management',
    sourceKind: 'message',
    sourceId: 'msg_42',
    content: 'vendor SLA notes',
  },
  score: 0.75,
};

describe('gatherRetrievalContext', () => {
  it('indexes each picked channel and merges + sorts results by score', async () => {
    const indexFn = vi.fn().mockResolvedValue({ channelId: '', chunkCount: 0 });
    const searchFn = vi
      .fn<
        (
          channelId: string,
          query: string,
          topK?: number,
        ) => Promise<RetrievalResult[]>
      >()
      .mockImplementation(async (cid) => {
        if (cid === 'ch_engineering') return [HIT_A, HIT_B];
        if (cid === 'ch_vendor_management') return [HIT_C];
        return [];
      });

    const sources: SelectedSource[] = [
      { kind: 'channel', id: 'ch_engineering', name: 'engineering' },
      {
        kind: 'channel',
        id: 'ch_vendor_management',
        name: 'vendor-management',
      },
    ];
    const got = await gatherRetrievalContext(sources, 'logging vendor', {
      indexFn,
      searchFn,
    });

    expect(indexFn).toHaveBeenCalledWith('ch_engineering');
    expect(indexFn).toHaveBeenCalledWith('ch_vendor_management');
    expect(got.map((r) => r.chunk.id)).toEqual(['chunk_a', 'chunk_c', 'chunk_b']);
  });

  it('coalesces a channel + its picked thread into a single round trip', async () => {
    const indexFn = vi.fn().mockResolvedValue({ channelId: '', chunkCount: 0 });
    const searchFn = vi
      .fn<
        (
          channelId: string,
          query: string,
          topK?: number,
        ) => Promise<RetrievalResult[]>
      >()
      .mockResolvedValue([HIT_A]);

    const sources: SelectedSource[] = [
      { kind: 'channel', id: 'ch_engineering', name: 'engineering' },
      {
        kind: 'thread',
        id: 'th_1',
        name: 'Kickoff',
        parentChannelId: 'ch_engineering',
        parentChannelName: 'engineering',
      },
    ];
    await gatherRetrievalContext(sources, 'logging', { indexFn, searchFn });
    expect(indexFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('returns no chunks when the query is empty', async () => {
    const indexFn = vi.fn().mockResolvedValue({ channelId: '', chunkCount: 0 });
    const searchFn = vi
      .fn<
        (
          channelId: string,
          query: string,
          topK?: number,
        ) => Promise<RetrievalResult[]>
      >()
      .mockResolvedValue([HIT_A]);

    const got = await gatherRetrievalContext(
      [{ kind: 'channel', id: 'ch_engineering', name: 'engineering' }],
      '   ',
      { indexFn, searchFn },
    );
    expect(got).toEqual([]);
    expect(indexFn).not.toHaveBeenCalled();
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('tolerates per-channel failures and still returns chunks from healthy channels', async () => {
    const indexFn = vi
      .fn<(channelId: string) => Promise<{ channelId: string; chunkCount: number }>>()
      .mockImplementation(async (cid) => {
        if (cid === 'ch_engineering') throw new Error('boom');
        return { channelId: cid, chunkCount: 0 };
      });
    const searchFn = vi
      .fn<
        (
          channelId: string,
          query: string,
          topK?: number,
        ) => Promise<RetrievalResult[]>
      >()
      .mockResolvedValue([HIT_C]);

    const sources: SelectedSource[] = [
      { kind: 'channel', id: 'ch_engineering', name: 'engineering' },
      {
        kind: 'channel',
        id: 'ch_vendor_management',
        name: 'vendor-management',
      },
    ];
    const got = await gatherRetrievalContext(sources, 'vendor', {
      indexFn,
      searchFn,
    });
    expect(got).toEqual([HIT_C]);
  });
});
