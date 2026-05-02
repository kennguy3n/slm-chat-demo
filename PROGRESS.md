# Progress Tracker

Last updated: 2026-05-02

This tracker captures per-phase deliverable status and a chronological
changelog. The phase scope itself is defined in
[PHASES.md](./PHASES.md); architectural detail lives in
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Overall status summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Consolidated prototype foundation | Complete | 100% |
| Phase 1: Local LLM MVP | Complete | 100% |
| Phase 2: B2C bilingual chat demo | Complete | 100% |
| Phase 3: B2B KApps MVP | Complete | 100% |
| Phase 4: AI Employees and recipe engine | Complete | 100% |
| Phase 5: Connectors and knowledge graph | Complete | 100% |
| Phase 6: Confidential server mode | In progress | ~85% |
| Phase 7: B2B real-LLM redesign | Complete | 100% |
| Phase 8: B2C ground-zero LLM redesign | Complete | 100% |
| Phase 9: B2B ground-zero LLM redesign | Complete | 100% |

---

## Phase 0 — Consolidated prototype foundation

- [x] React app shell with B2C/B2B mode switching
- [x] Electron shell hosting the React renderer (`frontend/electron/main.ts`, `preload.ts`, IPC bridge)
- [x] Go data-only backend skeleton with mock auth
- [x] Mock users and workspaces
- [x] Seeded demo data (B2C personal/family/community; B2B workspace/domain/channel)
- [x] Shared card system (`TaskCard`, `ApprovalCard`, `ArtifactCard`, `EventCard`)
- [x] Privacy strip component
- [x] AI action launcher (B2C: Catch up / Translate / Remind; B2B: Create / Analyze / Plan / Approve)
- [x] Local inference adapter interface (mocked responses)
- [x] Mobile-responsive layout (bottom tabs)
- [x] Web layout (sidebar + main chat + right panel)

---

## Phase 1 — Local LLM MVP

- [x] Local model status panel — `DeviceCapabilityPanel` shows model name, loaded state, RAM usage
- [x] Inference adapter contract (`frontend/electron/inference/adapter.ts`)
- [x] Ollama adapter (`frontend/electron/inference/ollama.ts`) — TypeScript, in the Electron main process
- [x] `LlamaCppAdapter` (`llamacpp.ts`) — talks to `llama-server` from the PrismML `llama.cpp` fork via `POST /completion` SSE; implements `Adapter` + `StatusProvider` + `Loader`
- [x] On-device routing — bootstrap probes llama-server first, then Ollama, then `MockAdapter`; the wired adapter is bound to `MODEL_NAME` (default `bonsai-1.7b`); router exposes one `local` tier
- [x] IPC streaming responses (`ai:stream` channel + `ai:stream:chunk` events)
- [x] WebSocket / native streaming — covered by Phase 6's NDJSON-over-HTTP `ConfidentialServerAdapter`; true WebSocket upgrade deferred
- [x] Privacy strip with real compute location and model name (`window.electronAI.route` decision)
- [x] B2C: summarize unread, smart reply, inline translation, task extraction
- [x] B2B: thread summary, task extraction, approval prefill (`prefillApproval`, `ApprovalPrefillCard`), draft artifact section (`draftArtifact`, `ArtifactDraftCard`; PRD / RFC / Proposal / SOP / QBR)

---

## Phase 2 — B2C bilingual chat demo

- [x] **Bilingual chat demo (Alice 🇺🇸 ↔ Minh 🇻🇳)** — auto-selected `ch_dm_alice_minh` channel, 16-message seeded conversation, every bubble exercises an on-device translation
- [x] Inline translation caption (`TranslationCaption`) — two-panel card with per-panel language flags and context-aware emphasis (viewer-language panel is primary)
- [x] Conversation summary (`MorningDigestPanel`) — bilingual-aware `summarize` call over the visible chat, written in the viewer's language
- [x] "Why suggested" explanations — `PrivacyStrip` expandable `whyDetails[]`
- [x] AI Memory page — `AIMemoryPage` + IndexedDB-backed `memoryStore.ts` (local-only, 0 B egress)
- [x] Guardrail rewrite (`ai:guardrail-check`, `runGuardrailRewrite` skill, `GuardrailRewriteCard`)
- [x] AI Skills Framework (`skill-framework.ts`) — `SkillDefinition`, `runSkill`, `INSUFFICIENT_RULE`, pre/post-inference guardrails
- [x] Local-only memory index — IndexedDB `kchat-slm-memory` / `facts` with in-memory fallback
- [x] Metrics dashboard — `MetricsDashboard` reading from `features/ai/activityLog.ts`
- [x] AI task-created pill (`TaskCreatedPill` after `TaskExtractionCard` accept)
- [x] Conversation Insights panel (`ConversationInsightsPanel`) — Phase 8 LLM-driven topic / action-item / decision / sentiment extraction in the right-rail Insights tab
- [-] Family checklist / Shopping nudges / Event RSVP / Trip planner — **deleted** in Phase 8 (all four were anchored to mock-seeded outputs that obscured the real LLM)

---

## Phase 3 — B2B KApps MVP

- [x] Workspace → Domain → Channel navigation (`/api/workspaces/{id}/domains`, `/api/domains/{id}/channels`, collapsible `B2BLayout` sidebar)
- [x] Thread linked-objects (`/api/threads/{id}/linked-objects`, `ThreadPanel` "Linked objects" section)
- [x] `KAppCardRenderer` `onAction` + `mode` API; status transitions, decision log, version history
- [x] Tasks KApp — task CRUD endpoints + `TasksKApp` + `CreateTaskForm` + `useKAppsStore`
- [x] Approvals KApp — `POST /api/kapps/approvals`, `CreateApprovalForm`, prefill → submit flow
- [x] Artifacts KApp — full CRUD on `/api/kapps/artifacts*`, `ArtifactWorkspace`, `ArtifactDraftCard` accept
- [x] Forms intake — `Form` model, vendor / expense / access templates, `FormCard`, `ai:prefill-form`
- [x] Artifact versioning — `POST /api/kapps/artifacts/{id}/versions`, `ArtifactDiffView` LCS line diff, `Publish`
- [x] Source pins — `ArtifactSourcePin` end-to-end (model → endpoint → inline footnote chip)
- [x] Audit log — `AuditService` append-only log + `GET /api/audit` + `AuditTimeline`
- [x] Human review gate — `OutputReview` mounted before artifact publish and approval submit
- [x] Action Launcher submenus wired end-to-end to KApp endpoints + AI IPCs

---

## Phase 4 — AI Employees and recipe engine

- [x] AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI) — `AIEmployee` model, service, `GET /api/ai-employees`, sidebar + right-rail panel
- [x] Allowed-channels editor — `PATCH /api/ai-employees/{id}/channels`, inline multi-select
- [x] Recipe registry (`recipes/registry.ts`, `RECIPE_REGISTRY`, `ai:recipe:run` IPC)
- [x] Recipe `summarize` (`recipes/summarize.ts`, wraps `buildThreadSummary`, `local`)
- [x] Recipe `extract_tasks` (`recipes/extract-tasks.ts`, source provenance, refuses empty threads)
- [x] Recipe `draft_prd` (`recipes/draft-prd.ts`, `buildDraftArtifact({ artifactType: 'PRD' })`)
- [x] Recipe `draft_proposal` (`recipes/draft-proposal.ts`)
- [x] Recipe `create_qbr` (`recipes/create-qbr.ts`)
- [x] Recipe `prefill_approval` (`recipes/prefill-approval.ts`); all six self-register through `recipes/index.ts`
- [x] Queue view — recipe-run model + endpoints + `QueueView` mounted in `AIEmployeePanel`
- [x] Budget controls — `PATCH /budget`, `POST /budget/increment` (429 on overrun), pre-execution gate in `runRecipe`
- [x] Human approval gate before publish — `RecipeOutputGate` wraps `OutputReview`, opens from completed runs
- [x] AI Employee mode badges — `AIEmployeeModeBadge` (`Auto`, `Inline`) wired into `MessageBubble`, `KAppCardRenderer`, `AIEmployeeList`

---

## Phase 5 — Connectors and knowledge graph

- [x] Google Drive connector — `Connector` model, `ConnectorService`, six endpoints; seed `conn_gdrive_acme` attached to `ch_vendor_management`
- [x] OneDrive connector — seed `conn_onedrive_acme` attached to `ch_engineering`; reuses Drive plumbing
- [x] Channel-scoped attachment — `ConnectorPanel` (right-rail), `SourcePicker` Files tab consumes `fetchChannelConnectorFiles`
- [x] Permission preview — `PermissionPreview` "AI will read from…" sheet between `SourcePicker` confirm and dispatch
- [x] Source picker — `SourcePicker` three tabs (Channels / Threads / Files) + chip list + Confirm/Cancel
- [x] Per-channel retrieval index — `RetrievalService` (`IndexChannel`, `Search`), `POST/GET /api/channels/{id}/{index,search}`
- [x] Knowledge graph: decisions, owners, risks, requirements, deadlines — `KnowledgeService.ExtractEntities`, `KnowledgeGraphPanel` (five collapsible sections)
- [x] Citation rendering — `CitationChip` + `CitationRenderer` parse `[source:id]` markers; wired into summary / draft / prefill / output-gate cards
- [x] Connector ACL sync — `ConnectorFile.ACL`, `ConnectorService.SyncACL` / `CheckFileAccess`, `RetrievalService` user-scoped filtering, `POST /api/connectors/{id}/sync-acl`

---

## Phase 6 — Confidential server mode and enterprise hardening

- [x] Confidential server adapter (`confidential-server.ts`) — NDJSON streaming to `CONFIDENTIAL_SERVER_URL`, refuses on unreachable, no silent fallback
- [x] Router server tier — `attachServer()`, `hasServer()`, policy-gated `decide()`, `model:status` reports `serverModel` / `serverAvailable`
- [x] Bootstrap probe — `/v1/health` ping gated on `CONFIDENTIAL_SERVER_POLICY=allow`; injectable `pingServer` for tests
- [x] Redaction engine (`redaction.ts`) — reversible `tokenize`/`detokenize` (emails, phones, SSNs, names) and non-reversible `redact`, longest-first replacement, UTF-8 byte counting
- [x] Router redaction + egress integration — every server-routed `run`/`stream` tokenizes prompt and detokenizes response; egress recorded
- [x] Egress tracker (`egress-tracker.ts`) — singleton, `record` / `summary` (totals + by channel/model + recent) / `reset`
- [x] `EgressSummaryPanel` + `useEgressSummary` + `formatEgressBytes` — zero-state, breakdowns, timeline, Reset
- [x] TopBar live egress badge — reads from the tracker via `useEgressSummary`
- [x] PrivacyStrip "Redaction" row for confidential-server outputs
- [x] Phase 6 inference test suite — 28+ cases across `confidential-server`, `redaction`, `egress-tracker`, `EgressSummaryPanel`, plus `router` / `bootstrap` / panel extensions
- [x] Model swap to Bonsai-1.7B — `models/Modelfile.bonsai1_7b`, single `bonsai-1.7b` alias, `prism-ml/Bonsai-1.7B-gguf` source (single GGUF, no per-arch quant split)
- [x] Tier collapse — `Tier` reduced to `'local' | 'server'`; single `OllamaAdapter` wired in bootstrap
- [x] Router model-name threading — `RouterOptions.defaultModel` propagates `MODEL_NAME` overrides into `decide()` reasons and `model:status`
- [x] `DeviceCapabilityPanel` single-tier UI; `setup-models.sh` reads only `MODEL_NAME`
- [ ] Confidential server periodic health check (`router.ts` recurring probe, real-time `hasServer()` updates)
- [ ] Redaction audit-trail integration (wire `RedactionEngine` events into `AuditService`)
- [ ] Server-tier recipe routing (recipes with `preferredTier: 'server'` honour the server tier)
- [ ] Egress budget enforcement (per-workspace daily ceiling; refusal surfaced in privacy strip)
- [ ] `ConfidentialServerAdapter` retry with backoff (exponential, max 3 attempts on 5xx / timeout)
- [x] No-content structural logging — Go `StructuralLogger` middleware + `SanitizeLogFields`; renderer `sanitizeForLog` / `logInference`
- [x] Policy admin (`WorkspacePolicy`, `PolicyService`, `GET / PATCH /api/workspaces/{id}/policy`, `PolicyAdminPanel`)
- [x] Audit export — `GET /api/audit/export?format=json|csv`, "Export JSON" / "Export CSV" buttons in `AuditLogPanel`
- [x] SSO middleware — `SSOAuth` (Bearer + email-domain check); falls back to `MockAuth` when disabled
- [x] SCIM v2 user provisioning — `/api/scim/v2/Users` GET/POST/PATCH/DELETE outside the `MockAuth` pipeline
- [x] Per-tenant encryption keys — `TenantEncryptionKey` + `EncryptionKeyService` (generate, get-active, rotate, list); 32-byte AES-256-GCM
- [x] Tenant storage config — `TenantStorageConfig` + `TenantStorageService`, `GET / PATCH /api/workspaces/{id}/storage`
- [x] Android AICore bridge — `AICoreBridge` interface + `StubAICoreBridge` (throws on every method in Electron)

---

## Phase 7 — B2B real-LLM redesign

Strips the seed-driven mock scaffolding for B2B AI surfaces and routes
every flow through the on-device Bonsai-1.7B model via either the
`LlamaCppAdapter` (preferred) or the `OllamaAdapter`. The `MockAdapter`
now emits generic `[MOCK]`-labelled placeholders so it's obvious in
the UI when the real LLM isn't running.

- [x] Strip canned B2B outputs from `MockAdapter` — `prefill_approval`, `draft_artifact`, the B2B half of `extract_tasks` / `summarize` reduced to generic `[MOCK]`-labelled placeholders; `msg_fam_*` / `msg_vend_*` references removed.
- [x] Bonsai-1.7B prompt library (`frontend/electron/inference/prompts/`) — one module per task type (`summarize`, `extract-tasks`, `prefill-approval`, `draft-artifact`, `extract-knowledge`) exporting `buildPrompt(input)` + `parseOutput(output)`. System instructions kept under ~200 tokens; explicit `<owner> | <title> | <due>` / `<field>: <value>` shapes; one-shot examples; `INSUFFICIENT: <reason>` refusal contract.
- [x] Wired every B2B `tasks.ts` helper through the prompt library — `buildThreadSummary`, `runKAppsExtractTasks`, `runPrefillApproval`, `buildDraftArtifact`. Parsers (`parseKAppsExtractedTasks`, `parsePrefilledApprovalFields`) delegate to the library with legacy fallback parsing for backward compatibility.
- [x] Enriched B2B seed data (`backend/internal/store/seed.go`) — `vendor-management` thread now 12 messages with explicit pricing, risk, compliance, and decision content; new `ch_product_launch` channel with a 11-message cross-functional launch thread (marketing / engineering / sales); `#general` standup updates added.
- [x] LLM-driven knowledge extraction — `frontend/electron/inference/skills/extract-knowledge.ts` skill, new IPC channel `ai:extract-knowledge`, `window.electronAI.extractKnowledge`; renderer's `extractKnowledge` API tries the LLM bridge first and falls back to the legacy regex extractor at `POST /api/channels/{id}/knowledge/extract`.
- [x] Tests — prompt library unit tests (`prompts/__tests__/prompts.test.ts`, 20 cases), `runExtractKnowledge` skill tests (`skills/__tests__/extract-knowledge.test.ts`, 5 cases), updated `tasks.test.ts` (33 cases) and `mock.test.ts` (11 cases) to use a `StubAdapter` that decouples assertions from the canned mock outputs. Edge cases covered: extra whitespace, mixed bullet markers, missing fields, `INSUFFICIENT` refusal, `[MOCK]` prefix tolerance.
- [x] Optional live-LLM tests — pre-existing `OLLAMA_INTEGRATION=1` integration suite (`__tests__/ollama-integration.test.ts`) covers the prompt library by running through `OllamaAdapter` against a local Bonsai-1.7B; left in place as the opt-in B2B integration path.
- [x] Phase 6 (Phase 7) capture against real Bonsai-1.7B — superseded by the Phase 8 (B2C) and Phase 9 (B2B) ground-zero capture passes, which both shipped 10+ live-LLM screenshots against `llama-server` running `Bonsai-1.7B.gguf` from the PrismML `llama.cpp` fork. Benchmark numbers from the same runtime now live in [`docs/benchmarks.md`](./docs/benchmarks.md).

---

## Phase 8 — B2C ground-zero LLM redesign

The B2C surface now exercises the on-device model on every visible
affordance. Every translation, summary, smart reply, task extraction,
and conversation insight routes through `OllamaAdapter` (or
`LlamaCppAdapter`) against the Bonsai model — no canned mock seeds.
The `MockAdapter` returns labelled `[MOCK]` placeholders so the
operator can immediately tell when the real LLM is not running.

- [x] Strip dead components — `FamilyChecklistCard`, `ShoppingNudgesPanel`, `EventRSVPCard`, `TripPlannerCard` and their tests deleted.
- [x] Strip second-brain helpers — `inference/secondBrain.ts` + tests, `inference/skills/trip-planner.ts`, `inference/search-service.ts` deleted.
- [x] Strip B2C IPC handlers — `ai:family-checklist`, `ai:shopping-nudges`, `ai:event-rsvp`, `ai:trip-plan` and their request/response types removed from `adapter.ts` / `electron.d.ts` / `aiApi.ts` / `preload.ts`.
- [x] Strip mock translation seeds — `SEEDED_TRANSLATIONS`, `mockTranslate`, `mockIsBilingualSummary` removed; `translate` and `summarize` now return labelled `[MOCK]` placeholders.
- [x] Strip B2C seed data — `ch_dm_alice_bob`, `ch_family`, `ch_neighborhood` channels and their messages removed; seed cards `task_sunscreen` and `evt_block_party` removed. `ch_dm_alice_minh` (16-message bilingual VI↔EN conversation) is the single remaining B2C channel.
- [x] New prompt module `frontend/electron/inference/prompts/conversation-insights.ts` — `buildConversationInsightsPrompt` + tolerant `parseConversationInsightsOutput`; pipe-delimited TOPICS / ACTIONS / DECISIONS / SENTIMENT output; ≤200-token system instructions; `INSUFFICIENT: <reason>` refusal contract.
- [x] New `ai:conversation-insights` IPC channel + `runConversationInsights` task helper that routes through the same `InferenceRouter` as every other AI surface (so privacy / metering / model-status semantics are identical to summarise / translate / extract-tasks).
- [x] New `ConversationInsightsPanel` — renders topics, action items, decisions, sentiment + privacy strip showing `compute: on_device`, `egress: 0 B`, model name.
- [x] Right-rail tabs reordered to **Summary / Insights / Stats** (replaces the old Memory tab in the B2C demo).
- [x] B2CLayout simplified — single Personal-chats sidebar section; auto-selects `ch_dm_alice_minh` on first mount.
- [x] Tests — frontend `B2CLayout` tests rewritten for the new tabs / sidebar; `mock.test.ts` rewritten for `[MOCK]`-placeholder semantics; backend tests updated to point at `ch_dm_alice_minh` / `ch_vendor_management` fixtures.
- [x] Live-LLM screenshot capture against Bonsai (10 PNGs in `demo/b2c/`) — captured with `llama-server` from the PrismML `llama.cpp` fork (`prism` branch) running `Bonsai-1.7B.gguf`. The translate prompt now feeds 2-3 preceding messages as background context (system role) and pins temperature to 0 so short / ambiguous chat lines don't trigger Bonsai-1.7B hallucinations.

---

## Phase 9 — B2B ground-zero LLM redesign

The B2B surface now mirrors Phase 8's B2C overhaul: every visible
right-rail affordance is generated by the on-device Bonsai-1.7B
model at runtime. Seeded approval/artifact cards were the last
mock-coupled scaffolding in the demo — every B2B card now flows
through the Action Launcher → on-device LLM → human-review path
documented in `PROPOSAL.md` §5.3 / §5.4.

- [x] Strip seeded `Approval` and `Artifact` cards from `backend/internal/store/seed.go::seedCards` — production seed is a no-op; `seedTestKAppFixtures` (in `backend/internal/api/handlers/chat_test.go`) carries the existing handler tests.
- [x] Redesign B2B right-rail tabs in `frontend/src/app/B2BLayout.tsx` to **Summary | Tasks | Knowledge | AI Employees**. Default tab is Summary. The Connectors and Policy panels were demoted off the primary rail; their components remain at `frontend/src/features/knowledge/ConnectorPanel.tsx` and `frontend/src/features/ai/PolicyAdminPanel.tsx` for an admin surface.
- [x] New `frontend/src/features/ai/ThreadSummaryPanel.tsx` — auto-runs `ai:summarize-thread` against the active channel's primary thread on selection, streams the result through `streamAITask`, caches per-channel via `useQueryClient`, and renders the existing `ThreadSummaryCard` + `PrivacyStrip`. B2B counterpart of B2C's `MorningDigestPanel`.
- [x] New `frontend/src/features/ai/ThreadTasksPanel.tsx` — auto-runs `ai:kapps-extract-tasks` for the active channel, surfaces owner / due / source provenance via the existing `TaskExtractionCard`, caches per-channel, and exposes a `Re-extract tasks` action.
- [x] Knowledge tab continues to mount `KnowledgeGraphPanel`, which already routes through `ai:extract-knowledge`; verified the Phase 5 path is unchanged.
- [x] Approval prefill (`ai:prefill-approval`) and PRD draft (`ai:draft-artifact`) flows already routed through the prompt library in Phase 7; verified no regressions and confirmed both go through the on-device LLM via `streamAITask` from `ThreadPanel` → `ApprovalPrefillCard` / `ArtifactDraftCard`.
- [x] Verified `MockAdapter` B2B outputs remain `[MOCK]`-prefixed (`mock.test.ts` 11 cases still green).
- [x] Tests — `frontend/src/app/__tests__/B2BLayout.test.tsx` updated for the four-tab structure + auto-mount of `ThreadSummaryPanel`; new `frontend/src/features/ai/__tests__/ThreadSummaryPanel.test.tsx` (5 cases — auto-run, empty state, per-channel cache replay, manual refresh, error alert) and `frontend/src/features/ai/__tests__/ThreadTasksPanel.test.tsx` (4 cases — auto-extract, empty state, per-channel cache, error alert). Backend handler tests rerouted through `seedTestKAppFixtures` so the existing approval/artifact assertions stay green.
- [x] Live-LLM screenshot capture against Bonsai (10 PNGs in `demo/b2b/`) — captured with `llama-server` from the PrismML `llama.cpp` fork (`prism` branch) running `Bonsai-1.7B.gguf`.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-02 | **Bonsai-1.7B CPU-only benchmark capture + post-Phase-9 doc audit.** Built `llama-server` and `llama-bench` from the PrismML `llama.cpp` fork (`prism` branch, commit `d6cea6ec`) on the EPYC 7763 reference VM (8 vCPU, AVX2+FMA, no AVX-512) and ran a full thread sweep (`t=1..8`), context-depth sweep (`d=0..4096`), and 10-surface end-to-end demo benchmark (5 B2C + 5 B2B) against `Bonsai-1.7B.gguf`. Captured results into the new `docs/benchmarks.md` + `docs/benchmarks-raw.json`, with the demo-surface driver checked in as `scripts/bench-demo-surfaces.py`. Replaced the §9 placeholder in `docs/cpu-perf-tuning.md` with the measured numbers (`tg32`=38.72 tok/s at `t=8`, `tg128`=23.43 tok/s at depth 4096) and added a cross-reference. Audited and rewrote all top-level markdown for post-Phase-9 consistency: `ARCHITECTURE.md` §1 now lists `llama-server` as the primary runtime in both prose and the ASCII diagram; `PROPOSAL.md` drops every reference to deleted B2C features (family checklist, RSVP, trip planner, shopping nudges) from the §1 context table, §1 B2C surface detail, §2 workload routing, §3.1 shared-feature table, §3.2 B2C section intro, §6 MVP scope, and the §5 mobile-tab mapping; `PROGRESS.md` marks the dangling Phase 7 capture item as superseded by the Phase 8 / Phase 9 capture passes; `README.md` link text is now "phased delivery plan (Phases 0–9)" with a new entry for `docs/benchmarks.md`; `demo/README.md` makes the Ollama-API shim explicitly optional and keeps `LlamaCppAdapter` as the primary reproduction path. |
| 2026-05-01 | **B2C translation prompt — conversation context + greedy decoding.** Added an optional `context` field to `TranslateBuilderInput` / `TranslateRequest` / `TranslateBatchRequest` and routed it through `runTranslate` / `runTranslateBatch` / `MessageList` so each translation now carries up to 3 preceding messages from the same channel. The context block is rendered in the **system** role (not the user role) of the Qwen3 chat template — empirically, the 1.7B Bonsai model regurgitates context verbatim when context shares the user turn with the line to translate, but treats it as background metadata when delivered via system. Also added an optional `temperature` override on `InferenceRequest`; `runTranslate` pins it to `0` so each translate call is greedy (at any non-zero temperature the 1.7B model will, on a non-trivial fraction of calls, produce a free-form rewrite of the source instead of a translation — caught Bonsai treating "Hey Minh!" as English-completion fodder during demo capture). Frontend tests: 596 pass / 3 skip; backend `go test ./...` green. Regenerated all 10 B2C demo screenshots in `demo/b2c/` against the live `llama-server` running Bonsai-1.7B with context-aware, greedy translation. |
| 2026-05-01 | **Phase 9 — B2B ground-zero LLM redesign.** Mirrored Phase 8's B2C overhaul on the B2B surface so every visible affordance exercises the on-device Bonsai-1.7B model. Stripped the seeded `Approval` and `Artifact` cards from `store.seedCards` (now a no-op; tests reroute through a new `seedTestKAppFixtures` helper). Redesigned `B2BLayout`'s right-rail to **Summary | Tasks | Knowledge | AI Employees**, demoting Connectors and Policy off the primary rail. Added `ThreadSummaryPanel` (auto-runs `ai:summarize-thread`, per-channel cache, B2B counterpart of `MorningDigestPanel`) and `ThreadTasksPanel` (auto-runs `ai:kapps-extract-tasks`, renders the existing `TaskExtractionCard`). The Knowledge tab continues to drive `ai:extract-knowledge` via `KnowledgeGraphPanel`. Approval prefill and PRD draft flows were already routed through the prompt library in Phase 7 — verified no regressions. Frontend tests: 585 pass / 3 skip; backend `go test ./...` green. Captured 10 demo screenshots into `demo/b2b/` against a real `llama-server` running Bonsai-1.7B from the PrismML fork. |
| 2026-05-01 | **B2C ground-zero LLM redesign.** Stripped all mock-heavy B2C surfaces (family checklist, shopping nudges, event RSVP, trip planner, mock translation seeds). Rebuilt B2C around real on-device LLM usage: every translation, summary, smart reply, task extraction, and conversation insight now routes through the on-device Bonsai model via `OllamaAdapter` / `LlamaCppAdapter`. Added `ConversationInsightsPanel` (LLM-driven topic / action-item / decision / sentiment extraction) backed by the new `ai:conversation-insights` IPC channel and `frontend/electron/inference/prompts/conversation-insights.ts` prompt module. Removed `SEEDED_TRANSLATIONS`, `mockTranslate`, and `mockIsBilingualSummary` from `MockAdapter` so `translate` and `summarize` now emit labelled `[MOCK]` placeholders when no real LLM is reachable. B2C seed data collapsed to the single `ch_dm_alice_minh` bilingual conversation; `ch_dm_alice_bob`, `ch_family`, `ch_neighborhood`, `task_sunscreen`, `evt_block_party` removed. Right-rail tabs renamed **Summary / Insights / Stats**. Frontend lint, typecheck, and tests (541 pass / 3 skip) green; backend `go test ./...` green. |
| 2026-04-30 | **Bonsai-1.7B + llama-server upgrade.** Adopted Bonsai-1.7B (`prism-ml/Bonsai-1.7B-gguf`, single ~237 MB GGUF) as the only on-device default. `models/Modelfile.bonsai1_7b` is set to `num_ctx=1024`; `scripts/setup-models.sh` downloads `Bonsai-1.7B.gguf` and creates the `bonsai-1.7b` Ollama alias. Replaced the `LlamaCppAdapter` stub with a full implementation that talks to `llama-server` from the PrismML `llama.cpp` fork via `POST /completion` (SSE streaming), `GET /health`, and `GET /props`; the adapter implements `Adapter` + `StatusProvider` + `Loader` and uses `node:http` for streaming. The bootstrap probes llama-server first (1.5 s `/health` timeout, `LLAMACPP_BASE_URL`), then Ollama, then falls back to `MockAdapter`. Tightened the prompt library for the 1.7B context window (`PROMPT_MESSAGE_CAP=120`, `PROMPT_THREAD_CAP=15`) and added one-shot examples to `summarize`, `extract-tasks`, and `prefill-approval`. Test suites pass: 587 frontend + Go handlers / services / store. |
| 2026-04-30 | Phase 7 — B2B real-LLM redesign. Stripped seed-coupled `MockAdapter` outputs (no more `msg_fam_*` / `msg_vend_*` IDs, generic `[MOCK]` placeholders). Added the `frontend/electron/inference/prompts/` library tuned for Bonsai-1.7B (≤200-token system instructions, structured `\|`-delimited / `key: value` outputs, `INSUFFICIENT: <reason>` refusal contract). Wired every B2B task helper through the library. Added LLM-driven knowledge extraction (`ai:extract-knowledge` IPC + `runExtractKnowledge` skill) with the regex extractor as the fallback. Enriched B2B seed data to 12 vendor-management messages and added a new `ch_product_launch` cross-functional thread. Test suites pass: 559 frontend + Go handlers / services / store. |
| 2026-04-30 | **B2C ground-zero redesign.** Stripped the mock-heavy second-brain surfaces (family checklist, shopping nudges, event RSVP, trip planner) from `B2CLayout` and rebuilt B2C around an LLM-first bilingual chat demo (English ↔ Vietnamese). `ch_dm_alice_minh` now seeds a 16-message Alice/Minh conversation with proper diacritics and is auto-selected on B2C mount. `TranslationCaption` gained per-panel language flags (🇺🇸/🇻🇳) and context-aware emphasis (the panel in the viewer's language is primary). The right rail collapsed to three tabs — **Summary / Memory / Stats** — and the Summary panel now drives a real bilingual `summarize` call over the visible chat with the on-device adapter. `MockAdapter.mockTranslate` got hand-curated VI↔EN seeds for every new bubble; `MockAdapter` summarize now branches on a bilingual prompt marker. Phase 2 status updated below to reflect the redesign. |
| 2026-04-30 | Demo screenshot capture pass: refreshed all 27 screenshots (12 B2C, 12 B2B, 3 standalone) via Playwright over Electron CDP against the live Vite + Go stack. `demo/README.md` pending markers reset to captured. |
| 2026-04-30 | Post-PR-#44 documentation audit: confirmed `scripts/setup-models.sh`, `models/Modelfile.bonsai1_7b`, `frontend/electron/inference/mock.ts`, and `docs/cpu-perf-tuning.md` already match the canonical-model rename. README and ARCHITECTURE re-verified; both test suites green. |
| 2026-04-30 | Real-LLM demo capture pass — built the PrismML `llama.cpp` fork and ran an Ollama-API shim so the existing `OllamaAdapter` could talk to `llama-server`; re-captured non-streaming surfaces under the live on-device model. Streaming surfaces re-captured after the Bonsai-1.7B swap above brought the per-token latency comfortably into the interactive band on the same hardware. |
| 2026-04-30 | Post-development B2B documentation audit: walked Phase 3/4/5 B2B claims against the running stack and fixed two doc drifts (`ARCHITECTURE.md` recipe list, `demo/README.md` knowledge-graph row); captured the previously-pending `b2b/03-action-launcher.png`. Two B2B shots remain pending until the Electron shell can fake a live AI stream from the Vite-only harness. |
| 2026-04-30 | Post-development documentation audit: verified PR #35 (perf — batch translation, auto-run morning digest, smart-reply IPC guard) merged cleanly. Corrected Phase 6 from `Complete \| 100%` to `In progress \| ~85%` to reflect five still-open items. |
| 2026-04-29 | Post-development demo polish: enriched `seed.go` with realistic multi-day B2C activity and richer B2B source material; updated `mock.ts` so canonical recipes reference the seeded entities; created `demo/` with the B2C and B2B README tables and 15 captured screenshots. |
