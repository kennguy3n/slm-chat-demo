// Bootstrap — wires up the inference router based on the local
// environment. Mirrors `backend/cmd/server/main.go`'s logic: try to
// reach Ollama, prefer it for both tiers when reachable, fall back to
// the mock adapter so the app always boots.

import type { Adapter, Loader, StatusProvider } from './adapter.js';
import { MockAdapter } from './mock.js';
import { DefaultOllamaBaseURL, OllamaAdapter } from './ollama.js';
import { InferenceRouter } from './router.js';
import { MockSearchService, type SearchService } from './search-service.js';

export interface InferenceStack {
  router: InferenceRouter;
  status?: StatusProvider;
  loader?: Loader;
  defaultModel: string;
  defaultQuant: string;
  source: 'ollama' | 'mock';
  // The search service is used by the trip-planner skill. Phase 2 ships
  // a mock implementation; Phase 6 swaps in a server-backed one.
  search: SearchService;
}

export async function bootstrapInference(
  fetchImpl?: typeof fetch,
): Promise<InferenceStack> {
  const baseURL = process.env.OLLAMA_BASE_URL || DefaultOllamaBaseURL;
  const ollama = new OllamaAdapter({ baseURL, fetchImpl });
  const mock = new MockAdapter();

  let e2b: Adapter = mock;
  let e4b: Adapter = mock;
  let status: StatusProvider | undefined;
  let loader: Loader | undefined;
  let source: InferenceStack['source'] = 'mock';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 500);
  try {
    await ollama.ping(ac.signal);
    e2b = ollama;
    const e4bAdapter = new OllamaAdapter({ baseURL, fetchImpl, model: 'gemma-4-e4b' });
    e4b = e4bAdapter;
    status = ollama;
    loader = ollama;
    source = 'ollama';
  } catch {
    // ollama unreachable — keep the mock adapters
  } finally {
    clearTimeout(timer);
  }

  const router = new InferenceRouter(e2b, e4b, mock);
  const search = new MockSearchService();
  return {
    router,
    status,
    loader,
    defaultModel: 'gemma-4-e2b',
    defaultQuant: 'q4_k_m',
    source,
    search,
  };
}
