import type {
  RetrievalResult,
  SelectedSource,
} from '../types/knowledge';
import { indexChannel, searchChannel } from './connectorApi';

interface RetrievalContextOptions {
  // Optional override for indexChannel — useful in tests.
  indexFn?: (channelId: string) => Promise<{ channelId: string; chunkCount: number }>;
  // Optional override for searchChannel — useful in tests.
  searchFn?: (
    channelId: string,
    query: string,
    topK?: number,
  ) => Promise<RetrievalResult[]>;
  // Cap how many top-K chunks to fetch per channel. Phase 5 default
  // is 5, matching the backend handler's default.
  topK?: number;
}

// gatherRetrievalContext is the renderer-side helper that wires the
// /api/channels/{id}/index and /api/channels/{id}/search endpoints
// into the AI action flow. Callers (Phase 5 recipe dispatch, future
// streaming inference adapters) hand it the user's picked sources +
// the natural-language prompt and get back a flat list of
// `RetrievalResult` chunks ranked by keyword overlap.
//
// The helper deduplicates picked sources by channel so a user who
// picked both a channel and one of its threads only triggers a
// single index/search round trip per channel. Failures are
// swallowed per-channel so a single offline channel doesn't block
// the rest of the prompt context.
export async function gatherRetrievalContext(
  sources: SelectedSource[],
  query: string,
  opts: RetrievalContextOptions = {},
): Promise<RetrievalResult[]> {
  if (!query.trim()) return [];
  const channelIds = new Set<string>();
  for (const s of sources) {
    if (s.kind === 'channel') {
      channelIds.add(s.id);
    } else if (s.kind === 'thread' && s.parentChannelId) {
      channelIds.add(s.parentChannelId);
    }
  }
  if (channelIds.size === 0) return [];

  const index = opts.indexFn ?? indexChannel;
  const search = opts.searchFn ?? searchChannel;
  const topK = opts.topK ?? 5;

  const chunks: RetrievalResult[] = [];
  for (const cid of channelIds) {
    try {
      await index(cid);
      const hits = await search(cid, query, topK);
      chunks.push(...hits);
    } catch {
      // Tolerate per-channel failures so the prompt still gets the
      // chunks we did manage to retrieve.
    }
  }

  // Sort by descending score so the highest-signal chunks are at
  // the top of whatever prompt context the caller assembles.
  chunks.sort((a, b) => b.score - a.score);
  return chunks;
}
