// OllamaAdapter — TypeScript port of
// `backend/internal/inference/ollama.go`. Talks to a local Ollama
// daemon over its HTTP API. Reports OnDevice=true since the daemon
// runs on the same host as the Electron main process.

import http from 'node:http';
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
  // Optional system instruction. Ollama wires this into the
  // model's chat template before issuing the completion call, which
  // is the only way to make instruct models (Bonsai-1.7B is fine-
  // tuned from Qwen3) treat `prompt` as a user turn rather than as
  // raw next-token continuation.
  system?: string;
  // Disables reasoning-model "thinking" mode on qwen3 / deepseek-r1
  // family GGUFs. When true (the Ollama default for those families)
  // the model emits a long `<think>…</think>` preamble into the
  // `thinking` field and leaves `response` empty until the thinking
  // budget runs out — on a CPU-only VM with a small SLM that can
  // burn the entire streaming window before a single user-visible
  // token arrives. We default to `false` throughout the app so every
  // on-device call produces direct response tokens.
  think?: boolean;
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  thinking?: string;
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
  // Quantisation label reported via status(). The Bonsai-1.7B GGUF
  // ships as a single artifact, so the default is the generic
  // 'default' label — operators running an alternative quant can
  // override via the MODEL_QUANT env var so the
  // DeviceCapabilityPanel surfaces the right label.
  quant?: string;
}

export class OllamaAdapter implements Adapter, StatusProvider, Loader {
  baseURL: string;
  model: string;
  quant: string;
  private fetchImpl: typeof fetch;
  private fetchInjected: boolean;

  constructor(opts: OllamaAdapterOptions = {}) {
    this.baseURL = (opts.baseURL || DefaultOllamaBaseURL).replace(/\/$/, '');
    // Default alias matches `scripts/setup-models.sh` and the
    // Modelfile in `models/` (a single Bonsai-1.7B GGUF artifact).
    this.model = opts.model || 'bonsai-1.7b';
    this.quant = opts.quant || 'default';
    this.fetchInjected = Boolean(opts.fetchImpl);
    this.fetchImpl = opts.fetchImpl || ((...a) => fetch(...(a as Parameters<typeof fetch>)));
  }

  name(): string {
    return 'ollama';
  }

  async run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse> {
    // We always use streaming under the hood — Bonsai-1.7B is fast
    // enough that small completions return in ~1 s on commodity
    // CPUs, but longer drafts still need streaming to keep bytes
    // flowing past Node's fetch body timeout.
    const model = req.model || this.model;
    const t0 = Date.now();
    let output = '';
    let tokens = 0;
    for await (const chunk of this.stream(req, signal)) {
      if (chunk.error) throw new Error(`ollama: ${chunk.error}`);
      if (chunk.delta) {
        output += chunk.delta;
        tokens += 1;
      }
    }
    return {
      taskType: req.taskType,
      model,
      output,
      tokensUsed: tokens,
      latencyMs: Date.now() - t0,
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
      think: false,
    };
    if (req.system) body.system = req.system;

    // Tests inject fetchImpl directly — keep using fetch in that path.
    if (this.fetchInjected) {
      yield* this.fetchStream(body, signal);
      return;
    }

    // Production path: use node:http directly. Node's fetch (undici)
    // enforces a 5-minute bodyTimeout on slow streams even with keep-
    // alive heartbeats, and Electron's main-process fetch inherits
    // that. Using http.request gives us a raw socket with no body
    // timer so longer streams on weaker hosts can keep flowing
    // without the body timeout firing.

    yield* this.httpStream(body, signal);
  }

  private async *fetchStream(
    body: OllamaGenerateRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
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

  private async *httpStream(
    body: OllamaGenerateRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const url = new URL(`${this.baseURL}/api/generate`);
    const payload = Buffer.from(JSON.stringify(body));
    const queue: (StreamChunk | { type: 'end' } | { type: 'error'; err: Error })[] = [];
    let waiter: (() => void) | null = null;

    const notify = () => {
      const w = waiter;
      waiter = null;
      if (w) w();
    };

    const request = http.request(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : 80,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.byteLength.toString(),
          Connection: 'close',
        },
        // Disable Node's default socket idle timeout (~0 = off).
        timeout: 0,
      },
      (res) => {
        res.setEncoding('utf8');
        let buffer = '';
        const statusCode = res.statusCode ?? 0;
        const parseFrame = (raw: string) => {
          const line = raw.trim();
          if (!line) return;
          let frame: OllamaGenerateResponse;
          try {
            frame = JSON.parse(line) as OllamaGenerateResponse;
          } catch {
            return;
          }
          if (frame.error) {
            queue.push({ error: frame.error, done: true });
            notify();
            return;
          }
          if (frame.response) {
            queue.push({ delta: frame.response, done: false });
            notify();
          }
          if (frame.done) {
            queue.push({ done: true });
            notify();
          }
        };
        res.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const raw of lines) parseFrame(raw);
        });
        res.on('end', () => {
          // Ollama sends single-line error responses (e.g. HTTP 404
          // `{"error":"model 'X' not found"}`) without a trailing
          // newline, so the buffer-driven loop above never sees them.
          // Flush whatever's left so error chunks reach the consumer.
          if (buffer.length > 0) {
            parseFrame(buffer);
            buffer = '';
          }
          // Non-200 responses with no parseable body still need to
          // surface as an error to avoid silently degrading the
          // translate / summarize pipeline (`output: ''` would
          // otherwise look like a successful empty completion).
          if (statusCode >= 400) {
            const empty = queue.length === 0;
            if (empty) {
              queue.push({
                error: `HTTP ${statusCode}`,
                done: true,
              });
              notify();
            }
          }
          queue.push({ type: 'end' });
          notify();
        });
        res.on('error', (err: Error) => {
          queue.push({ type: 'error', err });
          notify();
        });
      },
    );
    request.setSocketKeepAlive(true, 1000);
    request.on('error', (err: Error) => {
      queue.push({ type: 'error', err });
      notify();
    });

    if (signal) {
      if (signal.aborted) {
        request.destroy(new Error('aborted'));
      } else {
        signal.addEventListener('abort', () => request.destroy(new Error('aborted')), { once: true });
      }
    }

    request.write(payload);
    request.end();

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
        continue;
      }
      const item = queue.shift()!;
      if ('type' in item) {
        if (item.type === 'end') return;
        throw item.err;
      }
      if (item.error) {
        yield item;
        return;
      }
      yield item;
      if (item.done) return;
    }
  }

  async ping(signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.baseURL}/api/tags`, { signal });
    if (!res.ok) throw new Error(`ollama: ping HTTP ${res.status}`);
  }

  // listModels returns the names of every locally pulled model. Used
  // by the bootstrap to sanity-check that the configured alias is
  // actually available on the local Ollama daemon.
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
      return { loaded: false, model: this.model, quant: this.quant, ramUsageMB: 0, sidecar: 'stopped' };
    }
    if (!res.ok) {
      return { loaded: false, model: this.model, quant: this.quant, ramUsageMB: 0, sidecar: 'stopped' };
    }
    const ps = (await res.json()) as OllamaPsResponse;
    const models = ps.models ?? [];
    // Report only on the model this adapter represents — finding any
    // other model in /api/ps does NOT mean this adapter's model is
    // loaded. Strip Ollama's optional `:tag` suffix (e.g.
    // "bonsai-1.7b:q4_k_m") on BOTH sides of the comparison: the
    // operator may set MODEL_NAME to a tagged name and the daemon may
    // report a different tag, but matching bare-vs-bare lets us track
    // the model regardless of quantisation.
    const wanted = this.model.toLowerCase().split(':')[0];
    const match = models.find((m) => {
      const raw = (m.name || m.model || '').toLowerCase();
      const bare = raw.split(':')[0];
      return bare === wanted;
    });
    if (!match) {
      return { loaded: false, model: this.model, quant: this.quant, ramUsageMB: 0, sidecar: 'running' };
    }
    const ramUsageMB = Math.floor((match.size ?? 0) / (1024 * 1024));
    // Sanity check the resident size against the expected GGUF.
    // Bonsai-1.7B lands at ~1.0–1.2 GB; anything over ~3 GB almost
    // certainly means the alias is pointing at the wrong GGUF (a
    // mid-sized model bound to the same alias name, for example).
    // Emit a loud warning — inference may still work, but the UI
    // will misrepresent the on-device cost.
    if (ramUsageMB > 3_000) {
      console.warn(
        `[ollama] model "${match.name || match.model || this.model}" loaded at ` +
          `${ramUsageMB} MB resident; the Bonsai-1.7B target expects ~1 GB. ` +
          `Check that the Ollama alias points at the Bonsai-1.7B GGUF ` +
          `(see scripts/setup-models.sh).`,
      );
    }
    return {
      loaded: true,
      model: match.name || match.model || this.model,
      quant: this.quant,
      ramUsageMB,
      sidecar: 'running',
    };
  }

  async load(model: string, signal?: AbortSignal): Promise<void> {
    const m = model || this.model;
    const body: OllamaGenerateRequest = { model: m, prompt: '', stream: false, think: false };
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
