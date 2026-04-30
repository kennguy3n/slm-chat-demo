// InferenceRouter — TypeScript port of
// `backend/internal/inference/router.go`. Implements the PROPOSAL.md §2
// scheduler rule:
//
//   1. on-device by default — every request runs through the local
//      Bonsai-8B adapter.
//   2. explicit `tier: 'server'` (or a model hint mentioning
//      "confidential") targets the confidential-server tier, gated on
//      workspace policy AND adapter availability. When the gate fails,
//      the router refuses with a clear reason rather than silently
//      downgrading.
//
// Records the most recent decision so the privacy strip can show
// model + reason without re-running the policy engine.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
  Tier,
} from './adapter.js';
import { globalEgressTracker, type EgressTracker } from './egress-tracker.js';
import {
  DefaultRedactionPolicy,
  RedactionEngine,
  type RedactionPolicy,
  type TokenizedText,
} from './redaction.js';

export interface Decision {
  allow: boolean;
  model: string;
  tier?: Tier;
  reason: string;
}

export interface RouterOptions {
  // Phase 6 — workspace policy gate for the confidential-server tier.
  // Even if a server adapter is wired, the router refuses to route
  // server-bound requests when this is false. Default false.
  policyAllowsServer?: boolean;
  // Default model name reported when a server-routed request does not
  // specify one. Set by the bootstrap to mirror the server's advertised
  // model.
  defaultServerModel?: string;
  // Default on-device model name reported in `decide()` when the
  // request does not specify one. Bootstrap passes the env-resolved
  // `MODEL_NAME` so an operator-configured alias is reflected in the
  // router's decision and therefore in the adapter request.
  defaultModel?: string;
  // Optional overrides for the redaction engine + egress tracker.
  // Tests inject a fresh tracker / engine to avoid global state.
  redactionEngine?: RedactionEngine;
  redactionPolicy?: RedactionPolicy;
  egressTracker?: EgressTracker;
}

export class InferenceRouter implements Adapter {
  private local: Adapter | null;
  private server: Adapter | null = null;
  private fallback: Adapter | null;
  private last: Decision = { allow: false, model: '', reason: '' };
  private policyAllowsServer: boolean;
  private defaultServerModel: string;
  private defaultModel: string;
  private redaction: RedactionEngine;
  private redactionPolicy: RedactionPolicy;
  private egressTracker: EgressTracker;

  constructor(
    local: Adapter | null,
    fallback: Adapter | null,
    opts: RouterOptions = {},
  ) {
    this.local = local;
    this.fallback = fallback;
    this.policyAllowsServer = opts.policyAllowsServer ?? false;
    this.defaultServerModel = opts.defaultServerModel ?? 'confidential-large';
    this.defaultModel = opts.defaultModel ?? 'bonsai-8b';
    this.redaction = opts.redactionEngine ?? new RedactionEngine();
    this.redactionPolicy = opts.redactionPolicy ?? DefaultRedactionPolicy;
    this.egressTracker = opts.egressTracker ?? globalEgressTracker;
  }

  // attachServer wires a Phase 6 ConfidentialServerAdapter as the
  // server tier. Bootstrap calls this after a successful health-ping
  // so the router only exposes a server tier when the host is
  // reachable AND workspace policy permits it.
  attachServer(adapter: Adapter, opts: { policyAllows?: boolean; model?: string } = {}): void {
    this.server = adapter;
    if (opts.policyAllows !== undefined) this.policyAllowsServer = opts.policyAllows;
    if (opts.model) this.defaultServerModel = opts.model;
  }

  // hasServer reports whether the router has a confidential-server
  // adapter wired AND the workspace policy currently permits its
  // use. Both conditions must hold before any server-bound request
  // will be allowed.
  hasServer(): boolean {
    return Boolean(this.server) && this.policyAllowsServer;
  }

  name(): string {
    return 'router';
  }

  lastDecision(): Decision {
    return this.last;
  }

  decide(req: InferenceRequest): Decision {
    // Server-tier gate: an explicit `tier === 'server'` (set by the
    // "Confidential Server" UI mode) or a model hint mentioning
    // 'confidential' both target the server. The router refuses
    // server-bound requests when no server adapter is wired or when
    // workspace policy does not permit server compute.
    const wantsServer =
      req.tier === 'server' ||
      Boolean(req.model && req.model.toLowerCase().includes('confidential'));
    if (wantsServer) {
      if (!this.server) {
        return {
          allow: false,
          model: req.model ?? '',
          reason: 'confidential server unreachable; refusing to route',
        };
      }
      if (!this.policyAllowsServer) {
        return {
          allow: false,
          model: req.model ?? '',
          reason: 'workspace policy does not allow confidential-server compute',
        };
      }
      return {
        allow: true,
        model: req.model || this.defaultServerModel,
        tier: 'server',
        reason: `Routed "${req.taskType}" to confidential server (policy permits server compute).`,
      };
    }

    // Local path. The demo ships a single on-device model
    // (Bonsai-8B) so there is no tier preference — every
    // non-server request runs through the local adapter, falling back
    // to the MockAdapter when Ollama is unreachable.
    const adapter = this.local ?? this.fallback;
    if (!adapter) {
      return { allow: false, model: '', reason: 'no inference adapter available for this task' };
    }
    const model = req.model || this.defaultModel;
    const reason =
      adapter === this.local
        ? `Routed "${req.taskType}" to on-device ${model}.`
        : `No real local adapter; using ${adapter.name()} fallback.`;
    return { allow: true, model, tier: 'local', reason };
  }

  private resolveAdapter(d: Decision): Adapter | null {
    if (!d.tier) return null;
    if (d.tier === 'server') return this.server;
    return this.local ?? this.fallback;
  }

  async run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse> {
    const d = this.decide(req);
    this.last = d;
    if (!d.allow) throw new Error(d.reason);
    const adapter = this.resolveAdapter(d);
    if (!adapter) throw new Error('router: no adapter resolved');
    if (d.tier === 'server') {
      // Server-routed: tokenize prompt before dispatch, detokenize
      // response, record egress entry. The tokenized prompt is the
      // ONLY representation that ever crosses the network.
      const tok = this.redaction.tokenize(req.prompt ?? '', this.redactionPolicy);
      const resp = await adapter.run(
        { ...req, model: d.model, prompt: tok.text },
        signal,
      );
      if (!resp.model) resp.model = d.model;
      resp.output = this.redaction.detokenize(resp.output ?? '', tok.mapping);
      this.recordServerEgress(req, d.model, tok);
      return resp;
    }
    const resp = await adapter.run({ ...req, model: d.model }, signal);
    if (!resp.model) resp.model = d.model;
    return resp;
  }

  async *stream(
    req: InferenceRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    const d = this.decide(req);
    this.last = d;
    if (!d.allow) throw new Error(d.reason);
    const adapter = this.resolveAdapter(d);
    if (!adapter) throw new Error('router: no adapter resolved');
    if (d.tier === 'server') {
      // Stream variant: tokenize once, detokenize each chunk's
      // delta as it arrives. Tokens are short and unique so a
      // simple split/join is safe.
      const tok = this.redaction.tokenize(req.prompt ?? '', this.redactionPolicy);
      this.recordServerEgress(req, d.model, tok);
      for await (const chunk of adapter.stream(
        { ...req, model: d.model, prompt: tok.text },
        signal,
      )) {
        if (chunk.delta) {
          chunk.delta = this.redaction.detokenize(chunk.delta, tok.mapping);
        }
        yield chunk;
      }
      return;
    }
    yield* adapter.stream({ ...req, model: d.model }, signal);
  }

  // recordServerEgress writes a single entry to the egress tracker
  // describing exactly what wire bytes left the device. The router
  // uses this for both run() and stream() so the privacy strip's
  // "egress" counter never undercounts streaming dispatches.
  private recordServerEgress(
    req: InferenceRequest,
    model: string,
    tok: TokenizedText,
  ): void {
    this.egressTracker.record({
      timestamp: Date.now(),
      taskType: req.taskType,
      egressBytes: tok.egressBytes,
      redactionCount: tok.redactions.length,
      model,
      channelId: req.channelId,
    });
  }
}
