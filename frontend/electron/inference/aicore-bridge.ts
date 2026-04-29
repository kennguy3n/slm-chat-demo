// Phase 6 §4.3b — Android native local-inference path.
//
// The KChat SLM demo currently ships as an Electron desktop app, but
// the proposal calls for an Android port that runs Ternary-Bonsai-8B
// on-device through Google's AICore / ML Kit GenAI runtime. This
// module is the architecture stub for that future port: it defines the
// `AICoreBridge` interface a React Native (or fully native) Android
// build would implement, plus a `StubAICoreBridge` class that throws
// on every method when imported from the Electron build.
//
// The interface mirrors the Electron `Adapter` contract
// (`run` / `stream`) but adds Android lifecycle hooks (`initialize`,
// `isAvailable`, `getSupportedModels`) so the Android process can
// surface AICore install state to the UI exactly the way the Electron
// build surfaces Ollama state today.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
} from './adapter.js';

/**
 * Lifecycle metadata reported by AICore on Android. AICore is an
 * on-device service whose availability depends on the device model,
 * Android version, and a system-managed model download. The Android
 * shell uses this to decide whether to fall back to the
 * confidential-server tier or refuse the task entirely.
 */
export interface AICoreCapabilities {
  /** True when AICore is installed and the requested model is loaded. */
  available: boolean;
  /** Models AICore reports as installed (e.g. `gemini-nano`). */
  models: string[];
  /** Free-text reason when `available === false`. */
  reason?: string;
}

/**
 * AICoreBridge is the contract a React Native / native Android port
 * implements to surface Google AICore (ML Kit GenAI) to the renderer.
 * It is a strict superset of the existing `Adapter` interface — every
 * method on `Adapter` is required, plus the lifecycle hooks below.
 *
 * NOTE: this module is shipped in the Electron build as a stub. The
 * Electron renderer never imports a working implementation; calling
 * `StubAICoreBridge.run` always throws.
 */
export interface AICoreBridge extends Adapter {
  /**
   * Initialise AICore. On a real device this triggers the AICore
   * service install / model download if necessary; it MUST be called
   * before `run` or `stream`.
   */
  initialize(): Promise<void>;

  /**
   * Returns the live availability + model list. The Android shell
   * polls this from a settings screen so users can see AICore status.
   */
  isAvailable(): Promise<AICoreCapabilities>;

  /**
   * Returns the list of models AICore currently has loaded. Empty
   * array when AICore is not installed.
   */
  getSupportedModels(): Promise<string[]>;
}

/**
 * StubAICoreBridge is the implementation shipped in the Electron build.
 * Every method throws "Android AICore not available in Electron". The
 * stub exists so renderer code can `import type { AICoreBridge }`
 * symmetrically with `Adapter` without conditional-import boilerplate.
 *
 * The Android port replaces this class with a real implementation
 * backed by `expo-modules-core` (or a custom JSI module) calling the
 * AICore Java SDK.
 */
export class StubAICoreBridge implements AICoreBridge {
  /** Identifier surfaced by the Adapter contract. */
  name(): string {
    return 'aicore-stub';
  }

  async initialize(): Promise<void> {
    throw new Error('Android AICore not available in Electron');
  }

  async isAvailable(): Promise<AICoreCapabilities> {
    return {
      available: false,
      models: [],
      reason: 'Android AICore not available in Electron',
    };
  }

  async getSupportedModels(): Promise<string[]> {
    return [];
  }

  async run(_req: InferenceRequest, _signal?: AbortSignal): Promise<InferenceResponse> {
    throw new Error('Android AICore not available in Electron');
  }

  // eslint-disable-next-line require-yield
  async *stream(_req: InferenceRequest, _signal?: AbortSignal): AsyncGenerator<StreamChunk, void, void> {
    throw new Error('Android AICore not available in Electron');
  }
}
