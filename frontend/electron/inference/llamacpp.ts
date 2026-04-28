// LlamaCppAdapter — Phase 1 stub for the planned llama.cpp / GGUF
// runtime. The real adapter will load a quantised gguf file from disk
// (see PHASES.md Phase 1) and bind to llama.cpp's node-addon. Until
// that lands, both `run()` and `stream()` throw a clearly-labelled
// error so callers (router, IPC handlers) can fall through to the
// Ollama or Mock adapter without silently masking the missing runtime.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

const NOT_IMPLEMENTED = 'llama.cpp adapter not yet implemented';

export class LlamaCppAdapter implements Adapter {
  name(): string {
    return 'llama.cpp';
  }

  async run(_req: InferenceRequest): Promise<InferenceResponse> {
    throw new Error(NOT_IMPLEMENTED);
  }

  // eslint-disable-next-line require-yield
  async *stream(_req: InferenceRequest): AsyncGenerator<StreamChunk, void, void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
