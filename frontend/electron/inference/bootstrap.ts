// Bootstrap — wires up the inference router based on the local
// environment. Mirrors `backend/cmd/server/main.go`'s logic: try to
// reach Ollama, prefer it when reachable, fall back to the mock adapter
// so the app always boots.
//
// The demo ships a single on-device model (Ternary-Bonsai-8B) via
// Ollama. One OllamaAdapter is instantiated when the daemon is
// reachable; otherwise the router falls back to MockAdapter so the UI
// remains usable offline. The configured alias is read from
// `MODEL_NAME` (default `ternary-bonsai-8b`) and surfaced in
// `model:status` for the DeviceCapabilityPanel.

import type { Loader, StatusProvider } from './adapter.js';
import {
  ConfidentialServerAdapter,
  DefaultConfidentialServerURL,
} from './confidential-server.js';
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
  // Phase 6 — confidential-server tier. True when the bootstrap
  // successfully pinged the server and the workspace policy permits
  // server compute. Drives the "Server" section in
  // DeviceCapabilityPanel and the AI-mode dropdown.
  hasServer: boolean;
  defaultServerModel: string;
  serverUrl?: string;
  // The search service is used by the trip-planner skill. Phase 2 ships
  // a mock implementation; Phase 6 swaps in a server-backed one.
  search: SearchService;
}

export interface BootstrapOptions {
  fetchImpl?: typeof fetch;
  // Confidential-server ping override for tests. When provided,
  // resolves to indicate the server is reachable, rejects to indicate
  // it is not. The default uses ConfidentialServerAdapter.ping() to
  // probe `CONFIDENTIAL_SERVER_URL` (default localhost:8090).
  pingServer?: (signal?: AbortSignal) => Promise<void>;
}

const DefaultModel = 'ternary-bonsai-8b';
const DefaultServerModel = 'confidential-large';

export async function bootstrapInference(
  optsOrFetch?: BootstrapOptions | typeof fetch,
): Promise<InferenceStack> {
  const opts: BootstrapOptions =
    typeof optsOrFetch === 'function' ? { fetchImpl: optsOrFetch } : optsOrFetch ?? {};
  const { fetchImpl, pingServer } = opts;
  const baseURL = process.env.OLLAMA_BASE_URL || DefaultOllamaBaseURL;
  const modelName = process.env.MODEL_NAME || DefaultModel;
  const serverURL =
    process.env.CONFIDENTIAL_SERVER_URL || DefaultConfidentialServerURL;
  const serverModel =
    process.env.CONFIDENTIAL_SERVER_MODEL || DefaultServerModel;
  // Workspace-policy gate. The Phase 6 demo defaults to *deny* so the
  // server tier is only reachable when the operator opts in via the
  // `CONFIDENTIAL_SERVER_POLICY=allow` env var. The renderer's
  // DeviceCapabilityPanel surfaces this as the gating reason when the
  // tier is unavailable.
  const policyAllowsServer =
    (process.env.CONFIDENTIAL_SERVER_POLICY ?? '').toLowerCase() === 'allow';

  const ollama = new OllamaAdapter({ baseURL, fetchImpl, model: modelName });
  const mock = new MockAdapter();

  let local: typeof ollama | MockAdapter = mock;
  let status: StatusProvider | undefined;
  let loader: Loader | undefined;
  let source: InferenceStack['source'] = 'mock';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 500);
  try {
    await ollama.ping(ac.signal);
    local = ollama;
    status = ollama;
    loader = ollama;
    source = 'ollama';
  } catch {
    // ollama unreachable — keep the mock adapter
  } finally {
    clearTimeout(timer);
  }

  const router = new InferenceRouter(local, mock, {
    policyAllowsServer,
    defaultServerModel: serverModel,
    defaultModel: modelName,
  });

  // Probe the confidential server. Reachable AND policy-allowed →
  // wire as the server tier. Otherwise leave the slot empty so the
  // router refuses server-bound requests with a clear reason.
  let hasServer = false;
  const serverAdapter = new ConfidentialServerAdapter({
    serverURL,
    fetchImpl,
    model: serverModel,
  });
  if (policyAllowsServer) {
    const sac = new AbortController();
    const sTimer = setTimeout(() => sac.abort(), 500);
    try {
      const probe = pingServer ?? ((sig) => serverAdapter.ping(sig));
      await probe(sac.signal);
      router.attachServer(serverAdapter, {
        policyAllows: true,
        model: serverModel,
      });
      hasServer = true;
    } catch {
      // server unreachable — leave the slot null so server-bound
      // requests refuse with a clear error rather than silently
      // falling back to local inference.
    } finally {
      clearTimeout(sTimer);
    }
  }

  const search = new MockSearchService();
  return {
    router,
    status,
    loader,
    defaultModel: modelName,
    defaultQuant: 'q4_k_m',
    source,
    hasServer,
    defaultServerModel: serverModel,
    serverUrl: serverURL,
    search,
  };
}
