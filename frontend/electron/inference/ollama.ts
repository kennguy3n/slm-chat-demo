// OllamaAdapter — TypeScript port of
// `backend/internal/inference/ollama.go`. Talks to a local Ollama
// daemon over its HTTP API. Reports OnDevice=true since the daemon
// runs on the same host as the Electron main process.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  Loader,
  ModelStatus,
  StatusProvider,
  StreamChunk,
} from './adapter.js';

export const DefaultOllamaBaseURL = 'http://localhost:11434';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  keep_alive?: number;
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  done?: boolean;
  eval_count?: number;
  total_duration?: number; // nanoseconds
  error?: string;
}

interface OllamaPsResponse {
  models?: { name?: string; model?: string; size?: number }[];
}

interface OllamaTagsResponse {
  models?: { name?: string; model?: string }[];
}

export interface OllamaAdapterOptions {
  baseURL?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaAdapter implements Adapter, StatusProvider, Loader {
  baseURL: string;
  model: string;
  private fetchImpl: typeof fetch;

  constructor(opts: OllamaAdapterOptions = {}) {
    this.baseURL = (opts.baseURL || DefaultOllamaBaseURL).replace(/\/$/, '');
    this.model = opts.model || 'gemma-4-e2b';
    // Allow tests to inject a fake fetch.
    this.fetchImpl = opts.fetchImpl || ((...a) => fetch(...(a as Parameters<typeof fetch>)));
  }

  name(): string {
    return 'ollama';
  }

  async run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse> {
    const model = req.model || this.model;
    const body: OllamaGenerateRequest = {
      model,
      prompt: req.prompt ?? '',
      stream: false,
    };
    const res = await this.fetchImpl(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ollama: HTTP ${res.status}: ${text.trim()}`);
    }
    const frame = (await res.json()) as OllamaGenerateResponse;
    if (frame.error) throw new Error(`ollama: ${frame.error}`);
    return {
      taskType: req.taskType,
      model,
      output: frame.response ?? '',
      tokensUsed: frame.eval_count ?? 0,
      latencyMs: Math.floor((frame.total_duration ?? 0) / 1_000_000),
      onDevice: true,
    };
  }

  async *stream(
    req: InferenceRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const model = req.model || this.model;
    const body: OllamaGenerateRequest = {
      model,
      prompt: req.prompt ?? '',
      stream: true,
    };
    const res = await this.fetchImpl(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`ollama: stream HTTP ${res.status}: ${text.trim()}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) {
            let frame: OllamaGenerateResponse;
            try {
              frame = JSON.parse(line) as OllamaGenerateResponse;
            } catch {
              nl = buffer.indexOf('\n');
              continue;
            }
            if (frame.error) {
              yield { error: frame.error, done: true };
              return;
            }
            if (frame.response) {
              yield { delta: frame.response, done: false };
            }
            if (frame.done) {
              yield { done: true };
              return;
            }
          }
          nl = buffer.indexOf('\n');
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  async ping(signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.baseURL}/api/tags`, { signal });
    if (!res.ok) throw new Error(`ollama: ping HTTP ${res.status}`);
  }

  // listModels returns the names of every locally pulled model. Used by
  // the bootstrap to decide whether the E4B adapter should be wired
  // separately or aliased to E2B.
  async listModels(signal?: AbortSignal): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseURL}/api/tags`, { signal });
    if (!res.ok) throw new Error(`ollama: tags HTTP ${res.status}`);
    const body = (await res.json()) as OllamaTagsResponse;
    const models = body.models ?? [];
    return models.map((m) => m.name || m.model || '').filter((n) => n.length > 0);
  }

  async status(signal?: AbortSignal): Promise<ModelStatus> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseURL}/api/ps`, { signal });
    } catch {
      return { loaded: false, model: this.model, quant: 'q4_k_m', ramUsageMB: 0, sidecar: 'stopped' };
    }
    if (!res.ok) {
      return { loaded: false, model: this.model, quant: 'q4_k_m', ramUsageMB: 0, sidecar: 'stopped' };
    }
    const ps = (await res.json()) as OllamaPsResponse;
    const models = ps.models ?? [];
    const loaded = models.length > 0;
    let model = this.model;
    let ramMB = 0;
    if (loaded) {
      const first = models[0];
      model = first.name || first.model || this.model;
      ramMB = Math.floor((first.size ?? 0) / (1024 * 1024));
    }
    return { loaded, model, quant: 'q4_k_m', ramUsageMB: ramMB, sidecar: 'running' };
  }

  async load(model: string, signal?: AbortSignal): Promise<void> {
    const m = model || this.model;
    const body: OllamaGenerateRequest = { model: m, prompt: '', stream: false };
    const res = await this.fetchImpl(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`ollama: load HTTP ${res.status}`);
  }

  async unload(model: string, signal?: AbortSignal): Promise<void> {
    if (!model) throw new Error('ollama: unload requires a model name');
    const body = { model, keep_alive: 0, stream: false };
    const res = await this.fetchImpl(`${this.baseURL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`ollama: unload HTTP ${res.status}`);
  }
}
