// LlamaCppAdapter — talks to `llama-server` from the PrismML
// llama.cpp fork (kennguy3n/llama.cpp branch `prism`). The fork
// exposes `POST /completion` for text completion (streaming via SSE),
// `GET /health` for health/readiness, and `GET /props` for model
// metadata. We use `/completion` with `stream: true` so the renderer
// can ship tokens through the existing `ai:stream` IPC channel.
//
// Reports `OnDevice=true` because llama-server runs on the same host
// as the Electron main process. The bootstrap probes this adapter
// first (priority over Ollama and the MockAdapter); when llama-server
// is reachable it becomes the primary local runtime.

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

// llama-server defaults to :11400 in this demo to avoid colliding
// with the Go data API on :8080 (see backend/cmd/server/main.go and
// frontend/vite.config.ts). Override with LLAMACPP_BASE_URL when
// running llama-server on a non-default port.
export const DefaultLlamaCppBaseURL = 'http://localhost:11400';

// Default token budget for `/completion`. -1 means "unlimited" in the
// llama-server API; we cap explicitly at 512 to keep CPU-only hosts
// from running away on a refusal-loop.
const DefaultMaxTokens = 512;

interface LlamaCppCompletionRequest {
  prompt: string;
  stream: boolean;
  // Sampling parameters. Mirrors the Modelfile defaults so on-device
  // behaviour matches across runtimes.
  temperature: number;
  top_p: number;
  // Token budget. -1 means "until EOS"; the demo defaults to a small
  // positive number so a stuck completion doesn't hold the CPU.
  n_predict: number;
  // Cache the prompt prefix when possible to speed up repeated calls
  // with the same skeleton.
  cache_prompt: boolean;
}

interface LlamaCppCompletionFrame {
  // Streaming token text. llama-server emits this incrementally on
  // every SSE frame.
  content?: string;
  // Final frame is `{"stop": true, ...}`.
  stop?: boolean;
  // Optional generation stats on the final frame.
  model?: string;
  // Server-side error payload.
  error?: { message?: string };
}

interface LlamaCppHealth {
  status?: string;
  error?: { message?: string };
}

interface LlamaCppProps {
  // Path of the loaded GGUF on disk. Used as a model identifier when
  // `MODEL_NAME` is not set on the request.
  default_generation_settings?: { model?: string };
  total_slots?: number;
}

export interface LlamaCppAdapterOptions {
  baseURL?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  // Quant label surfaced via status(). Bonsai-1.7B ships as a single
  // GGUF, so the default is the generic 'default' label. Operators
  // running an alternative quant can override via the MODEL_QUANT env
  // var so the DeviceCapabilityPanel surfaces the right label.
  quant?: string;
}

export class LlamaCppAdapter implements Adapter, StatusProvider, Loader {
  baseURL: string;
  model: string;
  quant: string;
  private fetchImpl: typeof fetch;
  private fetchInjected: boolean;

  constructor(opts: LlamaCppAdapterOptions = {}) {
    this.baseURL = (opts.baseURL || DefaultLlamaCppBaseURL).replace(/\/$/, '');
    this.model = opts.model || 'bonsai-1.7b';
    this.quant = opts.quant || 'default';
    this.fetchInjected = Boolean(opts.fetchImpl);
    this.fetchImpl = opts.fetchImpl || ((...a) => fetch(...(a as Parameters<typeof fetch>)));
  }

  name(): string {
    return 'llama.cpp';
  }

  async run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse> {
    const model = req.model || this.model;
    const t0 = Date.now();
    let output = '';
    let tokens = 0;
    for await (const chunk of this.stream(req, signal)) {
      if (chunk.error) throw new Error(`llama.cpp: ${chunk.error}`);
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
    const body: LlamaCppCompletionRequest = {
      prompt: req.prompt ?? '',
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      n_predict: DefaultMaxTokens,
      cache_prompt: true,
    };

    // Tests inject fetchImpl directly — keep using fetch in that path.
    if (this.fetchInjected) {
      yield* this.fetchStream(body, signal);
      return;
    }

    // Production path: use node:http for the same reason as
    // OllamaAdapter — Node's fetch (undici) enforces a body timeout
    // that fires before the model finishes longer drafts.
    yield* this.httpStream(body, signal);
  }

  private async *fetchStream(
    body: LlamaCppCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const res = await this.fetchImpl(`${this.baseURL}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`llama.cpp: stream HTTP ${res.status}: ${text.trim()}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // llama-server emits Server-Sent Events: each frame is
        // `data: {json}\n\n`. Frames are separated by a blank line.
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const parsed = parseSseFrame(frame);
          if (parsed) {
            const out = handleFrame(parsed);
            if (out) {
              yield out;
              if (out.done || out.error) return;
            }
          }
          sep = buffer.indexOf('\n\n');
        }
      }
      // Flush any trailing frame without the closing blank line.
      if (buffer.trim().length > 0) {
        const parsed = parseSseFrame(buffer);
        if (parsed) {
          const out = handleFrame(parsed);
          if (out) yield out;
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  }

  private async *httpStream(
    body: LlamaCppCompletionRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const url = new URL(`${this.baseURL}/completion`);
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
        timeout: 0,
      },
      (res) => {
        res.setEncoding('utf8');
        let buffer = '';
        const statusCode = res.statusCode ?? 0;
        const flushFrame = (raw: string) => {
          const parsed = parseSseFrame(raw);
          if (!parsed) return;
          const out = handleFrame(parsed);
          if (out) {
            queue.push(out);
            notify();
          }
        };
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let sep = buffer.indexOf('\n\n');
          while (sep !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            flushFrame(frame);
            sep = buffer.indexOf('\n\n');
          }
        });
        res.on('end', () => {
          if (buffer.trim().length > 0) {
            flushFrame(buffer);
            buffer = '';
          }
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

  // Health probe used by the bootstrap to decide whether llama-server
  // is reachable. Returns void on success and throws on failure so
  // callers can use it as a try/catch gate.
  async ping(signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.baseURL}/health`, { signal });
    if (!res.ok) {
      throw new Error(`llama.cpp: ping HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as LlamaCppHealth | null;
    if (body?.error?.message) {
      throw new Error(`llama.cpp: ${body.error.message}`);
    }
  }

  async status(signal?: AbortSignal): Promise<ModelStatus> {
    let healthRes: Response;
    try {
      healthRes = await this.fetchImpl(`${this.baseURL}/health`, { signal });
    } catch {
      return {
        loaded: false,
        model: this.model,
        quant: this.quant,
        ramUsageMB: 0,
        sidecar: 'stopped',
      };
    }
    if (!healthRes.ok) {
      return {
        loaded: false,
        model: this.model,
        quant: this.quant,
        ramUsageMB: 0,
        sidecar: 'stopped',
      };
    }

    // Best-effort: pull the model path from /props so the
    // DeviceCapabilityPanel can display the actual GGUF basename
    // when the operator hasn't set MODEL_NAME explicitly.
    let resolvedModel = this.model;
    try {
      const propsRes = await this.fetchImpl(`${this.baseURL}/props`, { signal });
      if (propsRes.ok) {
        const props = (await propsRes.json()) as LlamaCppProps;
        const modelPath = props.default_generation_settings?.model;
        if (modelPath && typeof modelPath === 'string') {
          resolvedModel = basename(modelPath) || this.model;
        }
      }
    } catch {
      // Non-fatal — keep the configured model name.
    }

    return {
      loaded: true,
      model: resolvedModel,
      quant: this.quant,
      // llama-server doesn't expose resident size on /health or
      // /props, and surfacing a synthetic value would mislead the
      // privacy strip. The DeviceCapabilityPanel renders a dash when
      // ramUsageMB is 0.
      ramUsageMB: 0,
      sidecar: 'running',
    };
  }

  // llama-server loads its single model at process startup, so
  // load()/unload() are no-ops on this adapter. The Loader interface
  // still requires the methods so callers can re-use the same shape
  // across adapters.
  async load(_model: string, _signal?: AbortSignal): Promise<void> {
    // No-op: the model is loaded by `llama-server -m <gguf>` at startup.
  }

  async unload(_model: string, _signal?: AbortSignal): Promise<void> {
    // No-op: llama-server holds the GGUF for its full process lifetime.
  }
}

// Parse a single SSE frame body. Returns the parsed JSON payload or
// null when the frame is empty / malformed / a control line.
function parseSseFrame(raw: string): LlamaCppCompletionFrame | null {
  if (!raw) return null;
  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('data:')) continue;
    const json = trimmed.slice('data:'.length).trim();
    if (!json || json === '[DONE]') return null;
    try {
      return JSON.parse(json) as LlamaCppCompletionFrame;
    } catch {
      return null;
    }
  }
  return null;
}

// Convert a parsed completion frame into a StreamChunk. Errors are
// surfaced as `{ error, done: true }`; the final stop frame yields
// `{ done: true }`; intermediate frames yield `{ delta }`. Returns
// null for frames that produce no output.
function handleFrame(frame: LlamaCppCompletionFrame): StreamChunk | null {
  if (frame.error?.message) {
    return { error: frame.error.message, done: true };
  }
  if (frame.content) {
    if (frame.stop) {
      // Final frame may carry both a tail token and the stop flag.
      // Yielding the delta first would lose the done signal, so emit
      // a combined chunk with both fields set.
      return { delta: frame.content, done: true };
    }
    return { delta: frame.content, done: false };
  }
  if (frame.stop) {
    return { done: true };
  }
  return null;
}

function basename(p: string): string {
  // Cross-platform basename — Windows uses '\', POSIX uses '/'.
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}
