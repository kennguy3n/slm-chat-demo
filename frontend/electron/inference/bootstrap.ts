// Bootstrap — wires up the inference router based on the local
// environment. Tries the on-device runtimes in priority order:
//
//   1. `llama-server` from the PrismML llama.cpp fork
//      (`LLAMACPP_BASE_URL`, default http://localhost:11400). The
//      :11400 default avoids a collision with the Go data API on
//      :8080.
//   2. Ollama daemon (`OLLAMA_BASE_URL`, default localhost:11434).
//   3. MockAdapter for offline demo.
//
// The demo ships a single on-device model (Bonsai-1.7B). One adapter
// is wired when its runtime is reachable; otherwise the router falls
// back to MockAdapter so the UI remains usable offline. The
// configured alias / model is read from `MODEL_NAME` (default
// `bonsai-1.7b`) and surfaced in `model:status` for the
// DeviceCapabilityPanel.
//
// `scripts/setup-models.sh` creates the `bonsai-1.7b` Ollama alias
// from `models/Bonsai-1.7B.gguf`. The DeviceCapabilityPanel's
// "RAM (model)" line reads ~1.1 GB when the right GGUF is loaded.
// A sanity check in `OllamaAdapter.status` flags mismatches.

import type { Adapter, Loader, StatusProvider } from './adapter.js';
import {
  ConfidentialServerAdapter,
  DefaultConfidentialServerURL,
} from './confidential-server.js';
import { DefaultLlamaCppBaseURL, LlamaCppAdapter } from './llamacpp.js';
import { MockAdapter } from './mock.js';
import { DefaultOllamaBaseURL, OllamaAdapter } from './ollama.js';
import { InferenceRouter } from './router.js';

export interface InferenceStack {
  router: InferenceRouter;
  status?: StatusProvider;
  loader?: Loader;
  defaultModel: string;
  defaultQuant: string;
  source: 'llama.cpp' | 'ollama' | 'mock';
  // Phase 6 — confidential-server tier. True when the bootstrap
  // successfully pinged the server and the workspace policy permits
  // server compute. Drives the "Server" section in
  // DeviceCapabilityPanel and the AI-mode dropdown.
  hasServer: boolean;
  defaultServerModel: string;
  serverUrl?: string;
}

export interface BootstrapOptions {
  fetchImpl?: typeof fetch;
  // Confidential-server ping override for tests. When provided,
  // resolves to indicate the server is reachable, rejects to indicate
  // it is not. The default uses ConfidentialServerAdapter.ping() to
  // probe `CONFIDENTIAL_SERVER_URL` (default localhost:8090).
  pingServer?: (signal?: AbortSignal) => Promise<void>;
}

// The demo ships a single Bonsai-1.7B GGUF artifact. Operators can
// rename the alias at runtime via `MODEL_NAME`.
const DefaultModel = 'bonsai-1.7b';
const DefaultServerModel = 'confidential-large';
// Bonsai-1.7B ships as a single GGUF, so there is no
// quant-specific arch split here. The label is surfaced verbatim
// by the DeviceCapabilityPanel — set MODEL_QUANT explicitly to
// override (e.g. MODEL_QUANT=q4_k_m for a mainline llama.cpp build).
const DefaultQuant = 'default';

export async function bootstrapInference(
  optsOrFetch?: BootstrapOptions | typeof fetch,
): Promise<InferenceStack> {
  const opts: BootstrapOptions =
    typeof optsOrFetch === 'function' ? { fetchImpl: optsOrFetch } : optsOrFetch ?? {};
  const { fetchImpl, pingServer } = opts;
  const ollamaURL = process.env.OLLAMA_BASE_URL || DefaultOllamaBaseURL;
  const llamaCppURL = process.env.LLAMACPP_BASE_URL || DefaultLlamaCppBaseURL;
  const modelName = process.env.MODEL_NAME || DefaultModel;
  const modelQuant = process.env.MODEL_QUANT || DefaultQuant;
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

  const llamaCpp = new LlamaCppAdapter({
    baseURL: llamaCppURL,
    fetchImpl,
    model: modelName,
    quant: modelQuant,
  });
  const ollama = new OllamaAdapter({
    baseURL: ollamaURL,
    fetchImpl,
    model: modelName,
    quant: modelQuant,
  });
  const mock = new MockAdapter(modelName);

  // Probe llama-server first — it is the demo's recommended on-device
  // runtime. Fall back to Ollama, then MockAdapter. The ping is also
  // informational: if the chosen runtime stops responding mid-request
  // the router surfaces the error to the user instead of silently
  // dropping to a mock response, because the demo's privacy strip
  // promises on-device SLM output.
  let local: Adapter = ollama;
  let status: StatusProvider | undefined;
  let loader: Loader | undefined;
  let source: InferenceStack['source'] = 'mock';

  const llamaAc = new AbortController();
  const llamaTimer = setTimeout(() => llamaAc.abort(), 1500);
  let llamaReady = false;
  try {
    await llamaCpp.ping(llamaAc.signal);
    llamaReady = true;
  } catch (err) {
    console.log(
      `[bootstrap] llama-server unreachable at ${llamaCppURL}: ${(err as Error).message}. Will try Ollama.`,
    );
  } finally {
    clearTimeout(llamaTimer);
  }

  if (llamaReady) {
    local = llamaCpp;
    status = llamaCpp;
    loader = llamaCpp;
    source = 'llama.cpp';
    console.log(
      `[bootstrap] on-device adapter ready: llama-server @ ${llamaCppURL} (model=${modelName})`,
    );
  } else {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    try {
      await ollama.ping(ac.signal);
      local = ollama;
      status = ollama;
      loader = ollama;
      source = 'ollama';
      console.log(
        `[bootstrap] on-device adapter ready: Ollama @ ${ollamaURL} (model=${modelName})`,
      );
    } catch (err) {
      // Ping failed but keep ollama wired as the local adapter — the
      // first request will retry and either succeed (if the daemon
      // comes up) or surface the error. We flip `source` to 'mock'
      // so the DeviceCapabilityPanel shows a degraded state.
      local = ollama;
      status = undefined;
      loader = undefined;
      source = 'mock';
      console.log(
        `[bootstrap] Ollama ping failed at ${ollamaURL}: ${(err as Error).message}. Adapter still wired — requests will retry on demand.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  void mock; // MockAdapter is kept for unit tests only — never routed in production.

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

  return {
    router,
    status,
    loader,
    defaultModel: modelName,
    defaultQuant: modelQuant,
    source,
    hasServer,
    defaultServerModel: serverModel,
    serverUrl: serverURL,
  };
}
