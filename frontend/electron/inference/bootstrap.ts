// Bootstrap — wires up the inference router based on the local
// environment. Mirrors `backend/cmd/server/main.go`'s logic: try to
// reach Ollama, prefer it for both tiers when reachable, fall back to
// the mock adapter so the app always boots.
//
// Phase 3 (E4B routing completion): the bootstrap now creates two
// distinct OllamaAdapter instances when both gemma-4-e2b and
// gemma-4-e4b models are pulled locally. If only e2b is available the
// E4B tier transparently falls back to the e2b adapter, and the router
// reports that fallback through `decide()`. The default model name for
// each tier is configurable via `E2B_MODEL` and `E4B_MODEL` env vars.

import type { Adapter, Loader, StatusProvider } from './adapter.js';
import { MockAdapter } from './mock.js';
import { DefaultOllamaBaseURL, OllamaAdapter } from './ollama.js';
import { InferenceRouter } from './router.js';
import { MockSearchService, type SearchService } from './search-service.js';

export interface InferenceStack {
  router: InferenceRouter;
  status?: StatusProvider;
  // Status provider for the E4B tier when a real adapter is wired.
  e4bStatus?: StatusProvider;
  loader?: Loader;
  // Loader for the E4B tier when a real adapter is wired.
  e4bLoader?: Loader;
  defaultModel: string;
  defaultE4BModel: string;
  defaultQuant: string;
  source: 'ollama' | 'mock';
  // True iff a real (non-mock, non-aliased-to-e2b) adapter is wired
  // for the E4B tier. Drives UI state in DeviceCapabilityPanel and the
  // `model:status` IPC response.
  hasE4B: boolean;
  // The search service is used by the trip-planner skill. Phase 2 ships
  // a mock implementation; Phase 6 swaps in a server-backed one.
  search: SearchService;
}

export interface BootstrapOptions {
  fetchImpl?: typeof fetch;
  // Tag-list probe override for tests. When provided, returns the list
  // of locally pulled model names so the bootstrap can decide whether
  // E4B is actually available without hitting the real Ollama daemon.
  listModels?: (signal?: AbortSignal) => Promise<string[]>;
}

const DefaultE2BModel = 'gemma-4-e2b';
const DefaultE4BModel = 'gemma-4-e4b';

export async function bootstrapInference(
  optsOrFetch?: BootstrapOptions | typeof fetch,
): Promise<InferenceStack> {
  const opts: BootstrapOptions =
    typeof optsOrFetch === 'function' ? { fetchImpl: optsOrFetch } : optsOrFetch ?? {};
  const { fetchImpl, listModels } = opts;
  const baseURL = process.env.OLLAMA_BASE_URL || DefaultOllamaBaseURL;
  const e2bModel = process.env.E2B_MODEL || DefaultE2BModel;
  const e4bModel = process.env.E4B_MODEL || DefaultE4BModel;

  const e2bOllama = new OllamaAdapter({ baseURL, fetchImpl, model: e2bModel });
  const e4bOllama = new OllamaAdapter({ baseURL, fetchImpl, model: e4bModel });
  const mock = new MockAdapter();

  let e2b: Adapter = mock;
  let e4b: Adapter = mock;
  let status: StatusProvider | undefined;
  let e4bStatus: StatusProvider | undefined;
  let loader: Loader | undefined;
  let e4bLoader: Loader | undefined;
  let source: InferenceStack['source'] = 'mock';
  let hasE4B = false;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 500);
  try {
    await e2bOllama.ping(ac.signal);
    e2b = e2bOllama;
    status = e2bOllama;
    loader = e2bOllama;
    source = 'ollama';

    // Probe for E4B availability separately. If the model is not
    // pulled locally we keep the e2b adapter for the e4b tier so the
    // router reports the fallback through `decide()`.
    const probe = listModels ?? ((signal) => e2bOllama.listModels(signal));
    try {
      const models = await probe(ac.signal);
      if (modelAvailable(models, e4bModel)) {
        e4b = e4bOllama;
        e4bStatus = e4bOllama;
        e4bLoader = e4bOllama;
        hasE4B = true;
      } else {
        e4b = e2bOllama;
      }
    } catch {
      // Tag listing failed — keep e2b for both tiers.
      e4b = e2bOllama;
    }
  } catch {
    // ollama unreachable — keep the mock adapters
  } finally {
    clearTimeout(timer);
  }

  const router = new InferenceRouter(e2b, e4b, mock, { hasRealE4B: hasE4B });
  const search = new MockSearchService();
  return {
    router,
    status,
    e4bStatus,
    loader,
    e4bLoader,
    defaultModel: e2bModel,
    defaultE4BModel: e4bModel,
    defaultQuant: 'q4_k_m',
    source,
    hasE4B,
    search,
  };
}

function modelAvailable(models: string[], target: string): boolean {
  const t = target.toLowerCase();
  return models.some((m) => {
    const name = m.toLowerCase();
    return name === t || name.startsWith(`${t}:`) || name.startsWith(`${t}-`);
  });
}
