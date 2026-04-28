import { apiBase, DEMO_USER_ID } from './client';
import type { AIRunRequest } from '../types/ai';

export interface StreamAIHandlers {
  onChunk: (delta: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// streamAITask POSTs to /api/ai/stream and parses SSE frames out of the
// response body. Each `data: {...}` frame is decoded as JSON and dispatched
// as either onChunk(delta) or onDone(). EventSource is not used because the
// endpoint is a POST; instead we read the ReadableStream returned by fetch.
//
// The returned AbortController lets callers cancel the in-flight stream
// (e.g. when the user navigates away or hits "stop").
export function streamAITask(req: AIRunRequest, handlers: StreamAIHandlers): AbortController {
  const controller = new AbortController();

  let finished = false;
  const fireDone = () => {
    if (finished) return;
    finished = true;
    handlers.onDone?.();
  };

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
      // Read frames until the server closes the stream.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Process every complete
        // frame currently in the buffer; keep the partial tail for the next
        // read.
        let sepIdx = buffer.indexOf('\n\n');
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          handleFrame(frame, handlers, fireDone);
          sepIdx = buffer.indexOf('\n\n');
        }
      }
      // Flush any final buffered frame that didn't end with a blank line.
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
  // A frame is a series of lines; we only care about `data:` lines.
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
