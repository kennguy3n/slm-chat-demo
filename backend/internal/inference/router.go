package inference

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

// Tier identifies the local model tier an adapter serves.
type Tier string

const (
	// TierE2B is the small Gemma-4 (~2B params) model used for short, private,
	// latency-sensitive tasks (summarize, translate, extract_tasks, smart_reply).
	TierE2B Tier = "e2b"
	// TierE4B is the larger Gemma-4 (~4B params) model used for reasoning-heavy
	// tasks (draft_artifact, prefill_approval) on devices that can run it.
	TierE4B Tier = "e4b"
)

// Decision captures the router's choice for a given request. It is recorded
// alongside the response so the privacy strip can show "model" + "why".
type Decision struct {
	Allow  bool
	Model  string
	Tier   Tier
	Reason string
}

// RouterTask classifies an inference Request into a tier preference.
func taskPreference(t TaskType) Tier {
	switch t {
	case TaskTypeDraftArtifact, TaskTypePrefillApproval:
		return TierE4B
	default:
		return TierE2B
	}
}

// InferenceRouter is the Phase 1 routing front-end. It implements Adapter and
// dispatches to the correct underlying adapter based on PROPOSAL.md §2's
// "Scheduler rule": short/private/latency-sensitive tasks go to E2B; tasks
// that benefit from better reasoning go to E4B when an E4B-capable adapter
// is available; server inference is not yet wired (Phase 2+).
type InferenceRouter struct {
	mu       sync.RWMutex
	adapters map[Tier]Adapter
	fallback Adapter
	last     Decision
}

// NewInferenceRouter constructs a router. e2b is the small-model adapter
// (required); e4b is the larger-model adapter (optional — if nil, E4B
// requests fall back to e2b). fallback is used when no tier adapter is
// configured (e.g. MockAdapter in dev).
func NewInferenceRouter(e2b, e4b, fallback Adapter) *InferenceRouter {
	r := &InferenceRouter{
		adapters: map[Tier]Adapter{},
		fallback: fallback,
	}
	if e2b != nil {
		r.adapters[TierE2B] = e2b
	}
	if e4b != nil {
		r.adapters[TierE4B] = e4b
	}
	return r
}

// Name implements Adapter. The router itself reports "router" so callers can
// distinguish a routed call from a direct adapter call in logs.
func (r *InferenceRouter) Name() string { return "router" }

// LastDecision returns a snapshot of the most recent routing decision. Used
// by /api/ai/route to expose the router's decision without re-running it.
func (r *InferenceRouter) LastDecision() Decision {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.last
}

// Decide returns the routing decision for the given request without
// executing it. It is exposed so /api/ai/route can preview the policy
// engine without invoking inference.
func (r *InferenceRouter) Decide(req Request) Decision {
	pref := taskPreference(req.TaskType)
	// User-supplied model override locks the tier.
	if req.Model != "" {
		// Heuristic: anything with "e4b" in the name → E4B, else E2B.
		if containsFold(req.Model, "e4b") {
			pref = TierE4B
		} else {
			pref = TierE2B
		}
	}

	chosen, tier, reason := r.pick(pref, req.TaskType)
	if chosen == nil {
		return Decision{
			Allow:  false,
			Reason: "no inference adapter available for this task",
		}
	}
	model := req.Model
	if model == "" {
		switch tier {
		case TierE4B:
			model = "gemma-4-e4b"
		default:
			model = "gemma-4-e2b"
		}
	}
	return Decision{
		Allow:  true,
		Model:  model,
		Tier:   tier,
		Reason: reason,
	}
}

// pick returns the adapter, the tier it actually serves, and a human-readable
// reason. The decision tree:
//  1. If the requested tier has a real adapter → use it.
//  2. If the requested tier is E4B but no E4B adapter exists, fall back to E2B
//     and record the fallback in the reason.
//  3. If no tier adapter exists at all, fall back to the fallback adapter
//     (typically MockAdapter in dev) and record the fallback.
//  4. Otherwise return (nil, "", "no adapter").
func (r *InferenceRouter) pick(pref Tier, task TaskType) (Adapter, Tier, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if a, ok := r.adapters[pref]; ok {
		switch pref {
		case TierE4B:
			return a, TierE4B, fmt.Sprintf("Routed %q to E4B for stronger reasoning.", task)
		default:
			return a, TierE2B, fmt.Sprintf("Routed %q to E2B (short, private, latency-sensitive).", task)
		}
	}
	if pref == TierE4B {
		if a, ok := r.adapters[TierE2B]; ok {
			return a, TierE2B, fmt.Sprintf("Wanted E4B for %q but device only has E2B; fallback to E2B.", task)
		}
	}
	if r.fallback != nil {
		return r.fallback, pref, fmt.Sprintf("No real local adapter; using %s fallback.", r.fallback.Name())
	}
	return nil, "", ""
}

// Run implements Adapter by routing to the chosen adapter.
func (r *InferenceRouter) Run(ctx context.Context, req Request) (Response, error) {
	d := r.Decide(req)
	r.recordDecision(d)
	if !d.Allow {
		return Response{}, errors.New(d.Reason)
	}
	a, _, _ := r.pick(d.Tier, req.TaskType)
	if a == nil {
		return Response{}, errors.New("router: no adapter resolved")
	}
	req.Model = d.Model
	resp, err := a.Run(ctx, req)
	if err != nil {
		return resp, err
	}
	if resp.Model == "" {
		resp.Model = d.Model
	}
	return resp, nil
}

// Stream implements Adapter by routing to the chosen adapter's Stream.
func (r *InferenceRouter) Stream(ctx context.Context, req Request) (<-chan StreamChunk, error) {
	d := r.Decide(req)
	r.recordDecision(d)
	if !d.Allow {
		return nil, errors.New(d.Reason)
	}
	a, _, _ := r.pick(d.Tier, req.TaskType)
	if a == nil {
		return nil, errors.New("router: no adapter resolved")
	}
	req.Model = d.Model
	return a.Stream(ctx, req)
}

func (r *InferenceRouter) recordDecision(d Decision) {
	r.mu.Lock()
	r.last = d
	r.mu.Unlock()
}

// containsFold is a tiny case-insensitive substring check that avoids
// pulling in strings.EqualFold over a loop.
func containsFold(haystack, needle string) bool {
	if len(needle) == 0 {
		return true
	}
	if len(needle) > len(haystack) {
		return false
	}
	hl := toLowerASCII(haystack)
	nl := toLowerASCII(needle)
	for i := 0; i+len(nl) <= len(hl); i++ {
		if hl[i:i+len(nl)] == nl {
			return true
		}
	}
	return false
}

func toLowerASCII(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

// Compile-time interface check.
var _ Adapter = (*InferenceRouter)(nil)
