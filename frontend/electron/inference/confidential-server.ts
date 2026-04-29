// ConfidentialServerAdapter — Phase 6 third-tier adapter that routes
// inference to a remote *confidential* server (TEE-backed, e.g. an
// Nitro Enclave or Confidential VM). The server is policy-gated:
// the bootstrap pings it on startup and only wires it when reachable
// AND when the workspace policy permits server compute. When the
// server is unreachable the router refuses server-bound requests
// with a clear error rather than silently falling back — the user
// must always know when their data is leaving the device.
//
// Wire format mirrors OllamaAdapter's NDJSON streaming for symmetry,
// but uses /v1/inference/{generate,stream} so a Phase 6+ TEE service
// can implement a distinct API surface without conflicting with the
// local Ollama daemon.

import type {
  Adapter,
  ConfidentialServerAdapter as ConfidentialServerAdapterInterface,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

export const DefaultConfidentialServerURL = 'http://localhost:8090';

interface ServerGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
}

interface ServerGenerateResponse {
  model?: string;
  response?: string;
  done?: boolean;
  eval_count?: number;
  total_duration_ms?: number;
  error?: string;
}

export interface ConfidentialServerAdapterOptions {
  serverURL?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export class ConfidentialServerAdapter
  implements Adapter, ConfidentialServerAdapterInterface
{
  readonly serverURL: string;
  model: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ConfidentialServerAdapterOptions = {}) {
    this.serverURL = (opts.serverURL || DefaultConfidentialServerURL).replace(
      /\/$/,
      '',
    );
    this.model = opts.model || 'confidential-large';
    this.fetchImpl =
      opts.fetchImpl || ((...a) => fetch(...(a as Parameters<typeof fetch>)));
  }

  name(): string {
    return 'confidential_server';
  }

  async run(
    req: InferenceRequest,
    signal?: AbortSignal,
  ): Promise<InferenceResponse> {
    const model = req.model || this.model;
    const body: ServerGenerateRequest = {
      model,
      prompt: req.prompt ?? '',
      stream: false,
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.serverURL}/v1/inference/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw new Error(
        `confidential_server: unreachable at ${this.serverURL}: ${
          (err as Error).message
        }`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `confidential_server: HTTP ${res.status}: ${text.trim()}`,
      );
    }
    const frame = (await res.json()) as ServerGenerateResponse;
    if (frame.error) throw new Error(`confidential_server: ${frame.error}`);
    return {
      taskType: req.taskType,
      model,
      output: frame.response ?? '',
      tokensUsed: frame.eval_count ?? 0,
      latencyMs: frame.total_duration_ms ?? 0,
      onDevice: false,
    };
  }

  async *stream(
    req: InferenceRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const model = req.model || this.model;
    const body: ServerGenerateRequest = {
      model,
      prompt: req.prompt ?? '',
      stream: true,
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.serverURL}/v1/inference/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      throw new Error(
        `confidential_server: unreachable at ${this.serverURL}: ${
          (err as Error).message
        }`,
      );
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `confidential_server: stream HTTP ${res.status}: ${text.trim()}`,
      );
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
            let frame: ServerGenerateResponse;
            try {
              frame = JSON.parse(line) as ServerGenerateResponse;
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

  // ping verifies the server is reachable and ready. Bootstrap calls
  // this on startup; if it throws, the router does NOT wire the
  // server tier and server-bound requests refuse with a clear error.
  async ping(signal?: AbortSignal): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.serverURL}/v1/health`, { signal });
    } catch (err) {
      throw new Error(
        `confidential_server: unreachable at ${this.serverURL}: ${
          (err as Error).message
        }`,
      );
    }
    if (!res.ok) {
      throw new Error(`confidential_server: ping HTTP ${res.status}`);
    }
  }
}
