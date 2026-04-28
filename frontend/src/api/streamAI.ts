import { apiBase, DEMO_USER_ID } from './client';
import { getElectronAI } from './electronBridge';
import type { AIRunRequest } from '../types/ai';

export interface StreamAIHandlers {
  onChunk: (delta: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// streamAITask streams an inference run.
//
// In Electron mode (window.electronAI present) it dispatches over IPC
// and the main process pumps back chunk events.
//
// In web mode it POSTs to /api/ai/stream and parses SSE frames from
// the response body.
//
// Both paths return an AbortController callers can use to cancel the
// in-flight stream.
export function streamAITask(req: AIRunRequest, handlers: StreamAIHandlers): AbortController {
  const controller = new AbortController();
  const ipc = getElectronAI();

  let finished = false;
  const fireDone = () => {
    if (finished) return;
    finished = true;
    handlers.onDone?.();
  };

  if (ipc) {
    let cancel: () => void = () => undefined;
    let errored = false;
    cancel = ipc.stream(
      req,
      (chunk) => {
        if (controller.signal.aborted) return;
        if (chunk.error) {
          if (!errored) {
            errored = true;
            handlers.onError?.(new Error(chunk.error));
          }
          return;
        }
        if (typeof chunk.delta === 'string' && chunk.delta.length > 0) {
          handlers.onChunk(chunk.delta);
        }
        if (chunk.done) fireDone();
      },
      () => {
        if (controller.signal.aborted) return;
        fireDone();
      },
      (err) => {
        if (controller.signal.aborted) return;
        if (!errored) {
          errored = true;
          handlers.onError?.(err);
        }
      },
    );
    controller.signal.addEventListener('abort', () => cancel());
    return controller;
  }

  const run = async () => {
    let res: Response;
    try {
      res = await fetch(`${apiBase}/api/ai/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-User-ID': DEMO_USER_ID,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err as Error);
      return;
    }

    if (!res.ok || !res.body) {
      handlers.onError?.(new Error(`stream failed: HTTP ${res.status}`));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sepIdx = buffer.indexOf('\n\n');
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          handleFrame(frame, handlers, fireDone);
          sepIdx = buffer.indexOf('\n\n');
        }
      }
      if (buffer.trim().length > 0) {
        handleFrame(buffer, handlers, fireDone);
      }
      fireDone();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      handlers.onError?.(err as Error);
    }
  };

  void run();
  return controller;
}

function handleFrame(frame: string, handlers: StreamAIHandlers, fireDone: () => void): void {
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    let parsed: { delta?: string; done?: boolean; error?: string };
    try {
      parsed = JSON.parse(payload) as typeof parsed;
    } catch {
      continue;
    }
    if (parsed.error) {
      handlers.onError?.(new Error(parsed.error));
      continue;
    }
    if (typeof parsed.delta === 'string' && parsed.delta.length > 0) {
      handlers.onChunk(parsed.delta);
    }
    if (parsed.done) {
      fireDone();
    }
  }
}
