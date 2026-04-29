import { describe, expect, it } from 'vitest';
import { ConfidentialServerAdapter } from './confidential-server.js';
import type { InferenceRequest } from './adapter.js';

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
}

function ndjsonResponse(frames: unknown[]): Response {
  const body = frames.map((f) => JSON.stringify(f) + '\n').join('');
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function makeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(typeof input === 'string' ? input : (input as URL).toString(), init);
  }) as typeof fetch;
}

const baseReq: InferenceRequest = {
  taskType: 'summarize',
  prompt: 'hello',
};

describe('ConfidentialServerAdapter', () => {
  it('reports its name as confidential_server', () => {
    const a = new ConfidentialServerAdapter();
    expect(a.name()).toBe('confidential_server');
  });

  it('POSTs to /v1/inference/generate and returns the response shape', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = makeFetch((url, init) => {
      calls.push({ url, body: (init?.body as string) ?? '' });
      return jsonResponse({
        model: 'confidential-large',
        response: 'pong',
        eval_count: 5,
        total_duration_ms: 12,
      });
    });
    const a = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:8090',
      fetchImpl,
      model: 'confidential-large',
    });
    const resp = await a.run(baseReq);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:8090/v1/inference/generate');
    expect(JSON.parse(calls[0].body)).toMatchObject({
      model: 'confidential-large',
      prompt: 'hello',
      stream: false,
    });
    expect(resp.model).toBe('confidential-large');
    expect(resp.output).toBe('pong');
    expect(resp.tokensUsed).toBe(5);
    expect(resp.latencyMs).toBe(12);
    expect(resp.onDevice).toBe(false);
  });

  it('throws a clear "unreachable" error when fetch rejects', async () => {
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
    const a = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:9999',
      fetchImpl,
    });
    await expect(a.run(baseReq)).rejects.toThrow(/unreachable/i);
  });

  it('throws including HTTP status when the server returns non-2xx', async () => {
    const fetchImpl = makeFetch(() =>
      new Response('boom', { status: 500 }),
    );
    const a = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:8090',
      fetchImpl,
    });
    await expect(a.run(baseReq)).rejects.toThrow(/500/);
  });

  it('streams NDJSON deltas and yields done at end', async () => {
    const fetchImpl = makeFetch(() =>
      ndjsonResponse([
        { response: 'hello ' },
        { response: 'world' },
        { done: true },
      ]),
    );
    const a = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:8090',
      fetchImpl,
    });
    const chunks: string[] = [];
    let sawDone = false;
    for await (const c of a.stream(baseReq)) {
      if (c.delta) chunks.push(c.delta);
      if (c.done) sawDone = true;
    }
    expect(chunks).toEqual(['hello ', 'world']);
    expect(sawDone).toBe(true);
  });

  it('ping resolves on 2xx and rejects on non-2xx', async () => {
    const ok = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:8090',
      fetchImpl: makeFetch(() => new Response('', { status: 200 })),
    });
    await expect(ok.ping()).resolves.toBeUndefined();

    const fail = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:8090',
      fetchImpl: makeFetch(() => new Response('', { status: 503 })),
    });
    await expect(fail.ping()).rejects.toThrow(/503/);
  });

  it('ping rejects with "unreachable" when the network is down', async () => {
    const a = new ConfidentialServerAdapter({
      serverURL: 'http://localhost:9999',
      fetchImpl: (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch,
    });
    await expect(a.ping()).rejects.toThrow(/unreachable/i);
  });
});
