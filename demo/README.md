# Demo assets

Screenshots and screen recordings of the key B2C and B2B user journeys
described in [`PROPOSAL.md` §5](../PROPOSAL.md), captured against the
real Electron app running on **Gemma 4 E2B + E4B** via Ollama (no mock
adapter, no MockAdapter fallback).

The capture environment was:
- macOS-style 1440 × 900 viewport, Electron renderer (Chromium)
- `gemma4:e2b` (7.2 GB, q4_k_m) aliased to `gemma-4-e2b`
- `gemma4:e4b` (9.6 GB) aliased to `gemma-4-e4b`
- Ollama daemon at `http://localhost:11434`
- Go data API at `http://localhost:8080`
- Both models reported as **Loaded** by `DeviceCapabilityPanel`
  (`modelStatus → { loaded: true, e4bLoaded: true, ramUsageMB: 7352, sidecar: 'running' }`)

Every screenshot shows a `gemma-4-e2b:latest · loaded` (or `gemma-4-e4b`)
pill in the top-bar and `On-device` / `0 B Egress` in the privacy strip
— i.e. zero bytes ever left the device.

## B2C journeys (PROPOSAL.md §5.1)

| File | PROPOSAL flow | What it shows |
|------|---------------|---------------|
| [`screenshots/b2c-morning-digest.png`](./screenshots/b2c-morning-digest.png) | §5.1 *Morning catch-up digest* | Right-rail Digest tab: `MorningDigestPanel` with Catch-up digest streaming (model: `gemma-4-e2b`), the per-card metric tiles (Chats / Messages / Egress / Compute) and the source list. |
| [`screenshots/b2c-task-extraction.png`](./screenshots/b2c-task-extraction.png) | §5.1 *Family task extraction* | Family Group chat with `TaskExtractionCard` ("Buy sunscreen for field trip") — owner `user_alice`, due 2026-05-01 — and the full privacy strip (compute, model, egress, sources, confidence, why, origin, accept/edit/discard). |
| [`screenshots/b2c-smart-reply.png`](./screenshots/b2c-smart-reply.png) | §5.1 *Smart reply chips* | Family Group chat with composer focused; "Drafting on-device replies…" indicator above the composer and the `⚡ AI` Action Launcher trigger inline next to the input. |
| [`screenshots/b2c-translation.png`](./screenshots/b2c-translation.png) | §5.1 *Inline translation* | Same chat with the per-message `TranslationCaption` mid-stream ("Translating…") under Bob Martinez's first message; original text always one tap away. |
| [`screenshots/b2c-shopping-nudges.png`](./screenshots/b2c-shopping-nudges.png) | §5.1 *Shopping nudges* | Right-rail Shopping tab: `ShoppingNudgesPanel` with the "Suggest from chat" CTA — nudges grounded in chat, never auto-purchased. |
| [`screenshots/b2c-event-rsvp.png`](./screenshots/b2c-event-rsvp.png) | §5.1 *Community event / RSVP* | Right-rail Events tab: `EventRSVPCard` extraction surface with "Find events" CTA. |
| [`screenshots/b2c-ai-memory.png`](./screenshots/b2c-ai-memory.png) | §5.1 *AI Memory page* | Right-rail Memory tab: AI Memory index with "Local-only memory index · 0 B egress" banner and the user-driven Add-to-memory form. |
| [`screenshots/b2c-metrics-dashboard.png`](./screenshots/b2c-metrics-dashboard.png) | §5.1 *Metrics dashboard* | Right-rail Stats tab: per-task AI run metrics (totals, latency, on-device %). |
| [`screenshots/b2c-privacy-strip.png`](./screenshots/b2c-privacy-strip.png) | §5.1 *Privacy strip closeup* | Close-up showing all 8 required elements: Compute (On-device), Model (`gemma-4-e2b`), Egress (0 B), Sources (MESSAGE Originating message), Confidence (86%), Why (the explanation), Origin (linked back to source), and the Accept / Edit / Discard controls. |

## B2B journeys (PROPOSAL.md §5.2)

| File | PROPOSAL flow | What it shows |
|------|---------------|---------------|
| [`screenshots/b2b-workspace-nav.png`](./screenshots/b2b-workspace-nav.png) | §5.2 *Workspace nav* | `B2BLayout` sidebar: Acme Corp workspace with the domain → channel hierarchy (Engineering / Finance domains, `# engineering` / `# general` / `# vendor-management` channels). |
| [`screenshots/b2b-thread-summary.png`](./screenshots/b2b-thread-summary.png) | §5.2 *Thread summary* | Engineering channel with `ThreadSummaryCard` mid-stream (Thread summary panel labelled `gemma-4-e2bE2B` · Loading summary…) and the Sources (4) accordion underneath. |
| [`screenshots/b2b-approval-flow.png`](./screenshots/b2b-approval-flow.png) | §5.2 *Vendor approval flow* | `# vendor-management` with the seeded `Q3 logging vendor contract` Approval card (REQUESTER, APPROVERS, VENDOR, AMOUNT, RISK, Decision log) and the `ApprovalPrefillCard` privacy strip + Accept / Edit / Discard. |
| [`screenshots/b2b-prd-draft.png`](./screenshots/b2b-prd-draft.png) | §5.2 *PRD draft (Create → PRD)* | Engineering channel with the `ArtifactDraftCard` streaming PRD (badged `PRD AI E4B Top-level draft`, "PRD: Kicking off the inline-translation feature…") plus Sources accordion — the streaming output of the Action Launcher's `Create > PRD` path. |
| [`screenshots/b2b-tasks-kapp.png`](./screenshots/b2b-tasks-kapp.png) | §5.2 *Tasks KApp* | Right-rail `TasksKApp`: All / Open / In progress / Blocked / Done filter chips with counts and the inline `New task` button + `CreateTaskForm` entrypoint. |
| [`screenshots/b2b-forms-intake.png`](./screenshots/b2b-forms-intake.png) | §5.2 *Forms intake (AI-prefilled)* | Vendor-management channel with the AI-prefill flow that backs `FormCard`: `Vendor onboarding form` Action Launcher path triggers `ai:prefill-form` and surfaces the prefilled fields in the right-rail thread context (Linked objects → Approval). |
| [`screenshots/b2b-output-review.png`](./screenshots/b2b-output-review.png) | §5.2 *OutputReview gate* | Engineering channel showing the `OutputReview` envelope around an AI-generated artifact (privacy strip + Accept / Edit / Discard) — the same gate that intercepts `Submit for review` / `Publish` transitions in `ArtifactWorkspace`. |
| [`screenshots/b2b-audit-log.png`](./screenshots/b2b-audit-log.png) | §5.2 *Immutable audit log* | Vendor approval card with the `Decision log` accordion expanded inline ("No decisions recorded yet.") — the `AuditTimeline` rendering of `GET /api/audit?entityId=…` for the `ApprovalCard`. |

## Videos

| File | Flow | Length |
|------|------|--------|
| [`video/b2c-user-journey.mp4`](./video/b2c-user-journey.mp4) | B2C: open Family Group → Action Launcher → `Catch me up` (digest streams via E2B) → re-open launcher → `Extract tasks` → Accept → privacy strip closeup. | ~45 s |
| [`video/b2b-user-journey.mp4`](./video/b2b-user-journey.mp4) | B2B: switch to B2B mode → navigate Engineering → Summarize thread → switch to vendor-management → Prefill approval → review prefilled fields → expand Decision log. | ~50 s |

## Reproducing locally

```bash
# 1. Pull and alias both Gemma 4 base models
./scripts/setup-models.sh

# 2. Start the data API
cd backend && go run ./cmd/server

# 3. In another shell, start the Electron app (talks IPC for AI, HTTP for data)
cd frontend && npm install && npm run electron:dev
```

Verify the **Local model** panel in the right sidebar shows
`E2B status: Loaded` and `E4B status: Loaded` and the top-bar pill
reads `gemma-4-e2b:latest · loaded` (not `mock`).
