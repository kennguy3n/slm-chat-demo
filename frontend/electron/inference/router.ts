// InferenceRouter — TypeScript port of
// `backend/internal/inference/router.go`. Implements the PROPOSAL.md §2
// scheduler rule:
//
//   1. short / private / latency-sensitive → E2B
//   2. reasoning-heavy → E4B (with E2B fallback if no E4B adapter)
//   3. otherwise → fallback adapter (typically MockAdapter)
//
// Records the most recent decision so the privacy strip can show
// model + reason without re-running the policy engine.

import type {
  Adapter,
  InferenceRequest,
  InferenceResponse,
  StreamChunk,
  TaskType,
  Tier,
} from './adapter.js';

export interface Decision {
  allow: boolean;
  model: string;
  tier?: Tier;
  reason: string;
}

export function taskPreference(t: TaskType): Tier {
  switch (t) {
    case 'draft_artifact':
    case 'prefill_approval':
    case 'prefill_form':
      return 'e4b';
    default:
      return 'e2b';
  }
}

export interface RouterOptions {
  // hasRealE4B distinguishes "a real E4B-class adapter is wired" from
  // "the E4B slot is aliased to the E2B adapter". When false, the
  // router reports decisions for E4B-preferred tasks as fallbacks even
  // if `adapters.e4b` is populated, so the UI / privacy strip can show
  // the user that they are running on E2B.
  hasRealE4B?: boolean;
}

export class InferenceRouter implements Adapter {
  private adapters: Partial<Record<Tier, Adapter>> = {};
  private fallback: Adapter | null;
  private last: Decision = { allow: false, model: '', reason: '' };
  private realE4B: boolean;

  constructor(
    e2b: Adapter | null,
    e4b: Adapter | null,
    fallback: Adapter | null,
    opts: RouterOptions = {},
  ) {
    if (e2b) this.adapters.e2b = e2b;
    if (e4b) this.adapters.e4b = e4b;
    this.fallback = fallback;
    // Default to "real E4B" when an explicit e4b adapter was passed,
    // unless the caller overrides. The bootstrap always sets the flag
    // explicitly so existing callers (tests) keep their semantics.
    this.realE4B = opts.hasRealE4B ?? Boolean(e4b);
  }

  // hasE4B reports whether the router can route to a real E4B-class
  // adapter (not an alias of the E2B adapter). The IPC `model:status`
  // handler and DeviceCapabilityPanel use this to drive UI state.
  hasE4B(): boolean {
    return this.realE4B && Boolean(this.adapters.e4b);
  }

  name(): string {
    return 'router';
  }

  lastDecision(): Decision {
    return this.last;
  }

  decide(req: InferenceRequest): Decision {
    let pref = taskPreference(req.taskType);
    if (req.model) {
      pref = req.model.toLowerCase().includes('e4b') ? 'e4b' : 'e2b';
    }

    const picked = this.pick(pref, req.taskType);
    if (!picked) {
      return { allow: false, model: '', reason: 'no inference adapter available for this task' };
    }
    const { tier, reason } = picked;
    let model = req.model;
    if (!model) {
      model = tier === 'e4b' ? 'gemma-4-e4b' : 'gemma-4-e2b';
    }
    return { allow: true, model, tier, reason };
  }

  // pick returns the adapter to dispatch to and the human-readable
  // reason for the choice. Mirrors the Go router's decision tree.
  private pick(pref: Tier, task: TaskType): { adapter: Adapter; tier: Tier; reason: string } | null {
    const direct = this.adapters[pref];
    if (direct) {
      // When the e4b slot is aliased to the e2b adapter (no real E4B
      // model pulled), route through the e2b tier so the privacy strip
      // and `model:status` reflect what really ran.
      if (pref === 'e4b' && !this.realE4B) {
        return {
          adapter: direct,
          tier: 'e2b',
          reason: `Wanted E4B for "${task}" but device only has E2B; fallback to E2B.`,
        };
      }
      const reason =
        pref === 'e4b'
          ? `Routed "${task}" to E4B for stronger reasoning.`
          : `Routed "${task}" to E2B (short, private, latency-sensitive).`;
      return { adapter: direct, tier: pref, reason };
    }
    if (pref === 'e4b' && this.adapters.e2b) {
      return {
        adapter: this.adapters.e2b,
        tier: 'e2b',
        reason: `Wanted E4B for "${task}" but device only has E2B; fallback to E2B.`,
      };
    }
    if (this.fallback) {
      return {
        adapter: this.fallback,
        tier: pref,
        reason: `No real local adapter; using ${this.fallback.name()} fallback.`,
      };
    }
    return null;
  }

  private resolveAdapter(d: Decision): Adapter | null {
    if (!d.tier) return null;
    return this.adapters[d.tier] || (d.tier === 'e4b' ? this.adapters.e2b : null) || this.fallback;
  }

  async run(req: InferenceRequest, signal?: AbortSignal): Promise<InferenceResponse> {
    const d = this.decide(req);
    this.last = d;
    if (!d.allow) throw new Error(d.reason);
    const adapter = this.resolveAdapter(d);
    if (!adapter) throw new Error('router: no adapter resolved');
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
    yield* adapter.stream({ ...req, model: d.model }, signal);
  }
}
