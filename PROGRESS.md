# KChat SLM Demo — Progress Tracker

Last updated: 2026-04-29 (Phase 4 in progress — AI Employee profiles, allowed-channel config, recipe registry + summarize / extract_tasks recipes)

---

## Overall status summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Consolidated prototype foundation | Complete | 100% |
| Phase 1: Local LLM MVP | Complete | 100% |
| Phase 2: B2C second-brain demo | Complete | 100% |
| Phase 3: B2B KApps MVP | Complete | 100% |
| Phase 4: AI Employees and recipe engine | In progress | ~55% |
| Phase 5: Connectors and knowledge graph | Not started | 0% |
| Phase 6: Confidential server mode | Not started | 0% |

---

## Phase 0 — Consolidated prototype foundation

- [x] React app shell with B2C/B2B mode switching
- [x] Electron shell hosting the React renderer (`frontend/electron/main.ts`, `preload.ts`, IPC bridge)
- [x] Go data-only backend skeleton with mock auth
- [x] Mock users and workspaces
- [x] Seeded demo data (B2C: personal/family/community chats; B2B: workspace/domain/channel with threads)
- [x] Shared card system (TaskCard, ApprovalCard, ArtifactCard, EventCard)
- [x] Privacy strip component
- [x] AI action launcher (B2C: Catch me up, Translate, Remind; B2B: Create, Analyze, Plan, Approve)
- [x] Local inference adapter interface (mocked responses)
- [x] Mobile-responsive layout (bottom tabs: Message, Notification, Tasks, Settings, More)
- [x] Web layout (sidebar + main chat + right panel)

---

## Phase 1 — Local LLM MVP

- [x] Local model status panel (model name, loaded/unloaded, memory usage)
- [x] Electron main-process inference adapter contract (`frontend/electron/inference/adapter.ts`)
- [x] Ollama adapter (TypeScript, in the Electron main process)
- [x] llama.cpp / llama-server adapter — stub `LlamaCppAdapter` (`frontend/electron/inference/llamacpp.ts`) implementing the `Adapter` contract; `run` / `stream` throw `not yet implemented` until the GGUF runtime lands.
- [x] E2B routing (short/private/latency-sensitive tasks)
- [x] E4B routing (reasoning-heavy tasks) — bootstrap now spins up two distinct `OllamaAdapter` instances (`E2B_MODEL`/`E4B_MODEL`); router exposes `hasE4B()` and reports `e4bModel`/`e4bLoaded` via `model:status`; `DeviceCapabilityPanel` shows both tiers.
- [x] IPC streaming responses (`ai:stream` channel + `ai:stream:chunk` events)
- [ ] WebSocket / native streaming for confidential server mode
- [x] Privacy strip with real compute location and model name (driven by `window.electronAI.route` decision)
- [x] B2C: Summarize unread chats
- [x] B2C: Smart reply generation
- [x] B2C: Inline translation
- [x] B2C: Task extraction from messages
- [x] B2B: Thread summarization
- [x] B2B: Task extraction from threads
- [x] B2B: Approval prefill (`window.electronAI.prefillApproval`, `ApprovalPrefillCard` with editable vendor / amount / risk / justification fields)
- [x] B2B: Draft short artifact section (`window.electronAI.draftArtifact`, `ArtifactDraftCard` streaming via `ai:stream`, supports PRD / RFC / Proposal / SOP / QBR with optional goal/requirements/risks section)

---

## Phase 2 — B2C second-brain demo

- [x] Inline translation under message bubbles (delivered in Phase 1 — `TranslationCaption`)
- [x] AI task-created pills (inline badges) — `TaskCreatedPill` rendered in `ChatSurface` after the user accepts items from a `TaskExtractionCard`
- [x] "Why suggested" explanations — `PrivacyStrip` now renders an expandable `whyDetails[]` list with per-signal source links
- [x] AI Memory page (learned facts, preferences, routines) — `AIMemoryPage` mounted on the B2C right-rail Memory tab; backed by an IndexedDB store with an in-memory fallback (`features/memory/memoryStore.ts`); local-only, 0 B egress
- [x] Family checklist generation — `ai:family-checklist` IPC + `runFamilyChecklist` (`electron/inference/secondBrain.ts`); `FamilyChecklistCard` accepts an event hint and renders an on-device checklist with source attribution and an E2B routing privacy strip
- [x] Shopping list with nudges ("Add sunscreen because field trip is tomorrow") — `ai:shopping-nudges` IPC + `runShoppingNudges`; `ShoppingNudgesPanel` owns a local list and folds AI suggestions into it without the list ever leaving the device
- [x] Community event / RSVP card generation — `ai:event-rsvp` IPC + `runEventRSVP`; `EventRSVPCard` lifts events out of community chats with title / when / location / RSVP-by and lets the user mark Yes / Maybe / No locally
- [x] Guardrail rewrite card (risky post detection) — `ai:guardrail-check` IPC + `runGuardrailRewrite` skill (`electron/inference/skills/guardrail-rewrite.ts`); `Composer` calls the check before sending and renders `GuardrailRewriteCard` inline with a regex+SLM finding list, suggested rewrite, and on-device privacy strip.
- [x] Morning digest (multi-chat summary) — `MorningDigestPanel` mounted in the B2C right rail, reuses the unread-summary IPC + `ai:stream` pattern with chats / messages / egress / compute metrics
- [x] Local-only memory index (IndexedDB) — `features/memory/memoryStore.ts` opens `kchat-slm-memory`/`facts` and falls back to an in-memory map under jsdom / SSR; the AI never auto-writes to memory. Connection is now cached per store with auto-reset on `versionchange`/`close` events.
- [x] AI Skills Framework — `electron/inference/skill-framework.ts` defines `SkillDefinition`, registry, `runSkill` executor, `INSUFFICIENT_RULE` refusal contract, pre/post-inference guardrails, and structured `SkillResult` privacy metadata. Existing `tasks.ts` and `secondBrain.ts` parsers honour the framework's INSUFFICIENT contract.
- [x] B2C trip planning skill — `electron/inference/skills/trip-planner.ts` + `electron/inference/search-service.ts` (mock weather/events/attractions); `TripPlannerCard` reads AI Memory (location / member / community-detail) and renders day-by-day itinerary with source attribution and a privacy strip. Wired through `ai:trip-plan` IPC.
- [x] Metrics dashboard ("I handled 6 items this morning") — `MetricsDashboard` reads from the new `features/ai/activityLog` module which captures `{ skillId, model, tier, itemsProduced, egressBytes, latencyMs }` for every successful AI call. Mounted as the B2C right-rail "Stats" tab.

---

## Phase 3 — B2B KApps MVP

- [x] Workspace → Domain → Channel navigation — `GET /api/workspaces/{id}/domains` and `GET /api/domains/{id}/channels` plus a collapsible `B2BLayout` sidebar; `workspaceStore` tracks `selectedDomainId` / `expandedDomainIds`.
- [x] Thread view with linked objects — `GET /api/threads/{id}/linked-objects` plus a `Linked objects (n)` section in `ThreadPanel` rendering compact KApp cards.
- [x] KApp card renderer — `KAppCardRenderer` now takes an `onAction` callback union and a `mode` prop; `TaskCard` ships status transitions + inline edit, `ApprovalCard` ships approve/reject/comment with a confirmation pane and decision-log timeline, `ArtifactCard` ships `View` + version history.
- [x] Tasks KApp (create, assign, track, close) — `POST /api/kapps/tasks`, `GET /api/kapps/tasks?channelId=`, `PATCH /api/kapps/tasks/{id}`, `PATCH /api/kapps/tasks/{id}/status`, `DELETE /api/kapps/tasks/{id}` plus `TasksKApp` (filter / sort / counts), `CreateTaskForm`, and a `useKAppsStore` zustand store.
- [x] Approvals KApp (submit, review, approve/reject, decision log) — `POST /api/kapps/approvals` + `CreateApprovalForm`; the `ApprovalPrefillCard` Accept button persists via the new endpoint, and the Action Launcher `Approve > Vendor / Budget / Access` paths feed the same prefill → submit flow.
- [x] Docs/Artifacts KApp (PRD, RFC, Proposal, SOP, QBR) — `POST/GET/PATCH /api/kapps/artifacts*` plus `ArtifactWorkspace` (right-rail viewer) and `ArtifactDraftCard` Accept wiring.
- [x] Forms intake (AI-prefilled from thread context) — `Form` model + `POST/GET /api/kapps/forms`, seeded vendor / expense / access templates, `FormCard`, and a new `ai:prefill-form` IPC channel + `runPrefillForm` task helper.
- [x] Artifact versioning (v1, v2, ... with diffs) — `POST /api/kapps/artifacts/{id}/versions` and `GET /api/kapps/artifacts/{id}/versions/{version}` plus an `ArtifactDiffView` (LCS line diff) and a `Publish` button that transitions `draft → in_review → published`.
- [x] Source pins (link artifact sections to source messages) — `ArtifactSourcePin` carried end-to-end (artifact / version models, create + version endpoints, `SourcePin` inline footnote chip rendered next to the section it references).
- [x] Audit log (immutable event log) — `AuditService` (append-only in-memory log) wired through all KApp mutations (`CreateTask`, `UpdateTask`, `DeleteTask`, `CreateApproval`, `SubmitApprovalDecision`, `CreateArtifact`, `UpdateArtifact`, `CreateArtifactVersion`, `CreateForm`); `GET /api/audit` endpoint; frontend `AuditTimeline` rendering in `ApprovalCard` decision log.
- [x] Human review gates (review before publish) — `OutputReview` component (`features/kapps/OutputReview.tsx`) with `allowEdit` prop; mounted before artifact status transitions (`ArtifactWorkspace`) and approval submissions; every AI-generated KApp object passes through Accept / Edit / Discard before persisting.
- [x] Action Launcher integration (Create/Analyze/Plan/Approve) — Action Launcher's B2B submenus (`Create > PRD / RFC / Proposal / SOP / QBR`, `Analyze > Summarize thread`, `Plan > Extract tasks`, `Approve > Vendor / Budget / Access`) now wire through to the real KApp endpoints and AI IPC channels end-to-end.

---

## Phase 4 — AI Employees and recipe engine

- [x] AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI) — `AIEmployee` model + store + seed (`backend/internal/models/ai_employee.go`, `seed.go`) plus `AIEmployeeService` + `GET /api/ai-employees`, `GET /api/ai-employees/{id}` endpoints; `AIEmployeeList` sidebar and `AIEmployeePanel` right-rail panel in `B2BLayout` render all three seeded employees with role / mode badges and budget usage.
- [x] Allowed channels configuration per AI Employee — `PATCH /api/ai-employees/{id}/channels` validates every channel id against the workspace store and returns 400 on unknown; `AIEmployeePanel` ships an inline multi-select picker with Save / Cancel and optimistic refresh through the TanStack Query cache.
- [x] Recipe registry — `frontend/electron/inference/recipes/registry.ts` defines `RecipeDefinition` / `RecipeContext` / `RecipeResult` plus `RECIPE_REGISTRY` + `registerRecipe` / `getRecipe` / `listRecipes`; generic `ai:recipe:run` IPC channel looks recipes up by id and refuses recipes the AI Employee is not authorised for. Intentionally separate from the AI Skills Framework — skills own low-level prompts + guardrails, recipes compose existing task helpers into AI-Employee-scoped actions.
- [x] Recipe: summarize — `recipes/summarize.ts` wraps `buildThreadSummary` with a short-thread heuristic (`preferredTierForThread`, E2B ≤ 8 msgs, E4B otherwise) and returns prompt + sources + message count.
- [x] Recipe: extract_tasks — `recipes/extract-tasks.ts` wraps `runKAppsExtractTasks`, preserves per-task source provenance (`sourceMessageId`), and returns a `refused` envelope for empty threads without crashing.
- [ ] Recipe: draft_prd
- [ ] Recipe: draft_proposal
- [ ] Recipe: create_qbr
- [ ] Recipe: prefill_approval
- [ ] Queue view (pending AI tasks)
- [ ] Budget controls (token/compute limits)
- [ ] Human approval before publish gate
- [ ] Auto mode badge
- [ ] Inline mode badge

---

## Phase 5 — Connectors and knowledge graph

- [ ] Google Drive connector
- [ ] OneDrive connector (optional)
- [ ] Channel-scoped connector attachment
- [ ] Permission preview before AI access
- [ ] Source picker UI
- [ ] Per-channel retrieval index
- [ ] Knowledge graph: decisions
- [ ] Knowledge graph: owners
- [ ] Knowledge graph: risks
- [ ] Knowledge graph: requirements
- [ ] Knowledge graph: deadlines
- [ ] Citation rendering in AI outputs
- [ ] Connector ACL sync

---

## Phase 6 — Confidential server mode and enterprise hardening

- [ ] Confidential server compute mode
- [ ] Redaction/tokenization before data egress
- [ ] Data egress summary display
- [ ] No-content server logging
- [ ] Policy admin controls (per-workspace AI compute rules)
- [ ] Audit exports
- [ ] SSO integration
- [ ] SCIM provisioning
- [ ] Per-tenant encryption keys
- [ ] Optional dedicated DB/storage/region
- [ ] Android native local inference path (AICore / ML Kit GenAI)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-29 | Phase 4 kickoff: shipped AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI) with `AIEmployee` model + RWMutex-guarded store, seed, `AIEmployeeService`, `GET /api/ai-employees`, `GET /api/ai-employees/{id}`, `PATCH /api/ai-employees/{id}/channels`, `PATCH /api/ai-employees/{id}/recipes`. Frontend adds `AIEmployeeList` (B2B sidebar) and `AIEmployeePanel` (B2B right-rail "AI Employees" tab) with an inline channel picker backed by optimistic TanStack Query cache updates. Added `frontend/electron/inference/recipes/registry.ts` recipe registry (`RecipeDefinition` / `RecipeContext` / `RecipeResult` + `registerRecipe` / `getRecipe` / `listRecipes`), canonical `summarize` and `extract_tasks` recipes that compose existing `buildThreadSummary` / `runKAppsExtractTasks` helpers, and a generic `ai:recipe:run` IPC channel with authorisation refusal. |
| 2026-04-29 | Phase 3 complete: shipped audit log (`AuditService` + `GET /api/audit`), `OutputReview` human review gate with `allowEdit` prop, and full Action Launcher integration for Create/Analyze/Plan/Approve B2B flows. All 12 Phase 3 deliverables now checked off. PR #21. |
| 2026-04-29 | Added `demo/` directory with B2C and B2B screenshots and video walkthroughs of key user journeys running on real Gemma 4 E2B/E4B models via Ollama. |
| 2026-04-29 | Phase 1 follow-up: shipped `models/Modelfile.e2b` + `models/Modelfile.e4b` + `models/README.md` + `scripts/setup-models.sh` so `./scripts/setup-models.sh` pulls `gemma4:e2b` / `gemma4:e4b` (verified against [ollama.com/library/gemma4/tags](https://ollama.com/library/gemma4/tags)) and creates the `gemma-4-e2b` / `gemma-4-e4b` aliases the bootstrap defaults to. Added `prefill_form` to `MockAdapter` + `taskPreference` test coverage, a Modelfile / setup-script existence test, and an opt-in (`OLLAMA_INTEGRATION=1`) live `OllamaAdapter` smoke test. README "Optional: run with a real local model" section rewritten to drive the script + alias flow. |
| 2026-04-28 | Phase 1 close: real E4B routing — `bootstrap.ts` wires two `OllamaAdapter` instances (`E2B_MODEL`/`E4B_MODEL`); router exposes `hasE4B()` and falls back to E2B when only the smaller model is pulled; `model:status` returns `e4bModel`/`e4bLoaded` and the renderer surfaces both tiers in `DeviceCapabilityPanel`. |
| 2026-04-28 | Phase 3: Workspace → Domain → Channel navigation — added `Domain.WorkspaceID`, `GET /api/workspaces/{id}/domains`, `GET /api/domains/{id}/channels`, `frontend/src/api/workspaceApi.ts`, and a collapsible domain tree in `B2BLayout`; `workspaceStore` now tracks `selectedDomainId` and `expandedDomainIds`. |
| 2026-04-28 | Phase 3: Thread linked-objects — `Card.ThreadID`, `GET /api/threads/{id}/linked-objects`, `fetchLinkedObjects()`, and a `Linked objects (n)` `<details>` section in `ThreadPanel` rendering compact KApp cards. |
| 2026-04-28 | Phase 3: KApp card lifecycle — `KAppCardRenderer` accepts `onAction` (typed union) and `mode` (`full`/`compact`); `TaskCard` ships transitions + inline edit, `ApprovalCard` ships approve/reject/comment with a confirmation pane and decision-log timeline, `ArtifactCard` ships `View` + version history. |
| 2026-04-28 | Phase 3: Tasks KApp — `POST/GET/PATCH/DELETE /api/kapps/tasks*`, `POST /api/kapps/approvals/{id}/decide` plus `useKAppsStore`, `TasksKApp` (filter / sort / counts), and `CreateTaskForm`. Backend records every change in `Task.History` / `Approval.DecisionLog` (immutable audit trail). |
| 2026-04-29 | Phase 3: Approvals submit flow — `POST /api/kapps/approvals` + `CreateApprovalForm` + `useKAppsStore.createApproval`; `ApprovalPrefillCard` Accept and Action Launcher `Approve > Vendor / Budget / Access` both persist via the new endpoint. |
| 2026-04-29 | Phase 3: Docs/Artifacts CRUD + versioning + source pins — real `POST/GET/PATCH /api/kapps/artifacts*`, `POST /api/kapps/artifacts/{id}/versions`, `GET /api/kapps/artifacts/{id}/versions/{version}`; `ArtifactWorkspace` (right-rail) renders sections, source pins inline, version history with diffs, and `Publish`/`Submit for review` status transitions. `ArtifactDraftCard` Accept persists the streamed body + `sources[]` as the artifact's first version's `sourcePins`. |
| 2026-04-29 | Phase 3: Forms intake — `Form` model + `POST/GET /api/kapps/forms` + seeded `vendor_onboarding_v1` / `expense_report_v1` / `access_request_v1` templates; `FormCard` renderer with AI-prefilled field highlights; `ai:prefill-form` IPC channel + `runPrefillForm` task helper (preferring E4B). |
| 2026-04-29 | Phase 3: Audit log — `models/audit.go` (`AuditEntry` + 9 event types), `Memory.AppendAuditEntry` / `ListAuditEntries`, `services/AuditService.Record`, `KApps.WithAudit` integration recording every task / approval / artifact / form mutation, `GET /api/audit?objectId=…&objectKind=…&channelId=…`, plus frontend `auditApi.ts`, `types/audit.ts`, and `AuditLogPanel` rendering the per-object timeline. |
| 2026-04-29 | Phase 3: Human review gates — `OutputReview` component (ARCHITECTURE.md module #12) gates AI-generated KApp creation and artifact `draft → in_review → published` status transitions; renders the proposed body, source attribution, privacy strip, and Accept / Edit / Discard actions. Wired into `ArtifactWorkspace` Publish / Submit-for-review buttons. |
| 2026-04-29 | Phase 3: Action Launcher integration — `frontend/src/features/chat/launcherDispatch.ts` maps every B2B path to a `kapps:launcher` CustomEvent: Create > PRD/RFC/Proposal/Task, Analyze > Thread/Risks/Decisions (via `summarize_thread` with a focus hint), Plan > Milestones/Sprint/Rollout (via `draft_artifact` with a section hint), Approve > Vendor/Budget/Access. `ChatSurface.handleAIAction` returns true for every wired path so the launcher suppresses its placeholder toast. |
| 2026-04-28 | Initial progress tracker created. Project kickoff. |
| 2026-04-28 | Phase 1: Go inference proxy adapter interface landed (`backend/internal/inference/adapter.go`). |
| 2026-04-28 | Phase 1: Ollama HTTP adapter landed (`backend/internal/inference/ollama.go`) — `Run`, `Stream`, `Ping`, `Status` (via `/api/ps`), `Load`, `Unload` (via `keep_alive=0`, never `DELETE /api/delete`). |
| 2026-04-28 | Phase 1: E2B/E4B router landed (`backend/internal/inference/router.go`) — short/private tasks → E2B; `draft_artifact`/`prefill_approval` → E4B with E2B fallback. `POST /api/ai/route` now uses the router. |
| 2026-04-28 | Phase 1: SSE streaming wired on `POST /api/ai/stream` and consumed by the frontend via `frontend/src/api/streamAI.ts`. |
| 2026-04-28 | Phase 1: Local model status panel (`DeviceCapabilityPanel`) and TopBar `ModelStatusBadge` polling `/api/model/status` every 5s. |
| 2026-04-28 | Phase 1: B2C "Catch me up" digest end-to-end — `GET /api/chats/unread-summary` returns prompt + sources (no inference) and the frontend streams via `/api/ai/stream` so we never double-infer. Rune-aware truncation prevents broken UTF-8 in excerpts. |
| 2026-04-28 | Phase 1: Status row bumped to ~40%; `frontend/src/features/ai/index.ts` now re-exports the AI feature components. |
| 2026-04-28 | Phase 0: Added React app shell with B2C/B2B switching, Go backend with mock auth, seeded demo data, and three-column web layout. |
| 2026-04-28 | Phase 0 complete: Added shared card system, privacy strip, AI action launcher, mocked inference adapter, and mobile-responsive layout. |
| 2026-04-28 | Phase 1 in progress: Ollama HTTP adapter (`backend/internal/inference/ollama.go`), inference router with E2B/E4B decision tree (`router.go`), SSE streaming on `/api/ai/stream` plus a `streamAITask` browser client, real model status / load / unload endpoints, `DeviceCapabilityPanel` component (ARCHITECTURE.md module #10), and the first end-to-end AI feature: `GET /api/chats/unread-summary` wired through the SSE stream into a `DigestCard` with sources and an AI-route-driven privacy strip. |
| 2026-04-28 | Phase 1: B2C smart reply (`POST /api/ai/smart-reply`, `SmartReplyBar`) — composer renders 2–3 contextual suggestion chips above the input with E2B routing, on-device / 0 byte egress privacy strip. |
| 2026-04-28 | Phase 1: B2C inline translation (`POST /api/ai/translate`, `TranslationCaption`) — per-message translation rendered as a caption under the bubble with tap-to-see-original toggle. E2B routing, original + translated returned together so the toggle never re-fetches. |
| 2026-04-28 | Phase 1: B2C task extraction (`POST /api/ai/extract-tasks`, `TaskExtractionCard`) — wired to ChatSurface via the launcher's "Extract tasks" action; renders an inline AI badge expandable to Accept / Edit / Discard rows with type classification (task / reminder / shopping). |
| 2026-04-28 | Phase 1/2: Skills framework landed (`electron/inference/skill-framework.ts`) — declarative `SkillDefinition` contract, registry, `runSkill` executor, `INSUFFICIENT` refusal pattern, pre/post-inference guardrails, and structured privacy metadata. Existing `tasks.ts` / `secondBrain.ts` parsers honour the new INSUFFICIENT contract. |
| 2026-04-28 | Phase 1: `LlamaCppAdapter` stub added (`electron/inference/llamacpp.ts`) — implements the `Adapter` contract; `run` / `stream` throw a clearly-labelled "not yet implemented" error. Phase 1 status bumped to ~95%. |
| 2026-04-28 | Phase 2: B2C trip planner skill (`electron/inference/skills/trip-planner.ts`, `electron/inference/search-service.ts`) — mock weather/events/attractions search service; `TripPlannerCard` reads AI Memory (`location`, `member`, `community-detail`) and renders a day-by-day itinerary with per-item source attribution. Wired through `ai:trip-plan` IPC + new "Trip" right-rail tab. |
| 2026-04-28 | Phase 2: Guardrail rewrite card (`electron/inference/skills/guardrail-rewrite.ts`, `features/ai/GuardrailRewriteCard.tsx`) — composer calls `ai:guardrail-check` before sending; combines deterministic PII regex with SLM tone/claim review and surfaces a rewrite + on-device privacy strip. |
| 2026-04-28 | Phase 2: Metrics dashboard (`features/ai/activityLog.ts`, `features/ai/MetricsDashboard.tsx`) — every successful AI call logs `{skillId, model, tier, itemsProduced, egressBytes, latencyMs}`; dashboard mounted as the B2C right-rail "Stats" tab. Phase 2 marked complete. |
| 2026-04-28 | Phase 1/2 cleanup: Cached the IndexedDB connection inside `createIndexedDBStore` (auto-reset on `versionchange` / `close`); added barrel exports for `GuardrailRewriteCard`, `MetricsDashboard`, `TripPlannerCard`, and the activity-log helpers; removed the deprecated `backend/internal/inference` line from the README project-structure tree. |
| 2026-04-28 | Phase 1: B2B thread summarization (`POST /api/ai/summarize-thread`, `ThreadSummaryCard`) — same no-double-inference pattern as the digest; tier hint (E2B for short threads, E4B for long) included in the response so the privacy strip can show real routing. |
| 2026-04-28 | Phase 1: B2B task extraction from threads (`POST /api/kapps/tasks/extract`, `ThreadPanel` + reusable `TaskExtractionCard`) — replaces the Phase-3 stub with a real handler that returns owner / due-date / status / source-message provenance. |
| 2026-04-28 | Phase 1 status row bumped to ~75% (5 new B2C + B2B AI features end-to-end). New frontend types in `types/ai.ts`, new API clients in `api/aiApi.ts` and `api/kappsApi.ts`. |
| 2026-04-28 | Architecture realignment: KChat SLM Demo became an **Electron desktop app**. Step 1 added the Electron shell (`frontend/electron/main.ts`, `preload.ts`, `electron:dev` / `electron:build` scripts, `tsconfig.electron.json`). Step 2 ported the Go inference layer to TypeScript under `frontend/electron/inference/` (`adapter.ts`, `mock.ts`, `ollama.ts`, `router.ts`, `tasks.ts`, `bootstrap.ts`) and wired all `ai:*` / `model:*` IPC channels in `electron/ipc-handlers.ts`. |
| 2026-04-28 | Step 3: frontend API layer (`api/aiApi.ts`, `api/streamAI.ts`, `api/kappsApi.ts`) now routes through `window.electronAI.*` when present and falls back to HTTP when running in a plain browser (Vitest, `npm run dev`). New `api/electronBridge.ts` helper and `types/electron.d.ts` declaration; `TranslationCaption` carries `channelId` so the IPC path can resolve the message text. |
| 2026-04-28 | Step 4: stripped AI inference from the Go backend. Removed `/api/ai/*`, `/api/model/*`, `/api/chats/unread-summary`, `/api/kapps/tasks/extract`, `/api/kapps/approvals/prefill`, `/api/artifacts/*`, plus their handlers and tests. Go `cmd/server` no longer bootstraps Ollama; `internal/inference/` is marked deprecated and kept only as reference for the TS port. The data API now exposes only `/api/users`, `/api/workspaces`, `/api/chats`, `/api/threads/*`, `/api/kapps/cards`, and `/api/privacy/egress-preview`. |
| 2026-04-28 | Step 5: Vitest specs for the Electron main-process inference modules (`router.test.ts`, `mock.test.ts`, `ollama.test.ts`) covering taskPreference, the E2B/E4B/fallback decision tree, NDJSON streaming and `/api/ps` status parsing. Frontend test count: 89 → 112. |
| 2026-04-28 | Step 6: docs realigned (this PROGRESS entry, README.md quick-start now `npm run electron:dev`, ARCHITECTURE.md system diagram + §3.3 IPC channels + §4.1 Electron-main-→-Ollama path, PROPOSAL.md §6 MVP scope, PHASES.md Phase 0 + Phase 1 deliverables). |
| 2026-04-28 | Follow-up to the Electron realignment: wired `electron-builder` so `npm run electron:build` produces a real platform installer (Linux AppImage / macOS dmg / Windows nsis); Linux AppImage build verified end-to-end (~107 MB). Deleted the deprecated `backend/internal/inference/` package — the canonical inference code now lives only in `frontend/electron/inference/`. |
| 2026-04-28 | Phase 1: B2B Approval prefill — new `ai:prefill-approval` IPC channel, `runPrefillApproval` task in `electron/inference/tasks.ts` with a colon-key parser (`parsePrefilledApprovalFields`) and source attribution (`collectApprovalSources`), `ApprovalPrefillCard` renders editable vendor / amount / risk / justification fields plus a missing-info hint and the privacy strip with per-source provenance. |
| 2026-04-28 | Phase 1: B2B Draft artifact section — new `ai:draft-artifact` IPC channel, `buildDraftArtifact` returns prompt + sources for streaming via `ai:stream` (same single-inference pattern as ThreadSummary), `ArtifactDraftCard` renders the streamed body with a blinking cursor, sources expandable, accept / edit / discard controls, and supports PRD / RFC / Proposal / SOP / QBR plus optional goal / requirements / risks section. |
| 2026-04-28 | Phase 1 status row bumped to ~90% (the two remaining B2B items shipped); preload bridge + `types/electron.d.ts` extended with `prefillApproval` / `draftArtifact`. |
| 2026-04-28 | Phase 2 kicked off (~25%): `TaskCreatedPill` inline badge in `ChatSurface` records accepted items from a `TaskExtractionCard` keyed by source message id; `PrivacyStrip` gained an expandable `whyDetails[]` list with per-signal source links and `aria-expanded` on the toggle button; `MorningDigestPanel` mounted in `B2CLayout`'s right rail, reuses the unread-summary IPC pattern and renders chats / messages / egress / compute metrics next to the streamed digest. |
| 2026-04-28 | Phase 2 second-brain batch — 5 surfaces shipped. New `ai:family-checklist`, `ai:shopping-nudges`, `ai:event-rsvp` IPC channels (handlers in `electron/ipc-handlers.ts`, helpers in `electron/inference/secondBrain.ts`, contract types in `electron/inference/adapter.ts`). New renderer components: `FamilyChecklistCard`, `ShoppingNudgesPanel`, `EventRSVPCard`, plus a tabbed B2C right rail (Digest / Family / Shopping / Events / Memory). New `features/memory/` module: `AIMemoryPage` UI and a local-only `MemoryStore` (`memoryStore.ts`) backed by IndexedDB (object store `facts` in DB `kchat-slm-memory`) with an in-memory fallback for jsdom / SSR. Renderer types in `types/ai.ts` and `types/electron.d.ts` extended; preload bridge wired in `electron/preload.ts`. New Vitest specs: `secondBrain.test.ts` (17 cases), `memoryStore.test.ts` (9), `AIMemoryPage.test.tsx` (6), `FamilyChecklistCard.test.tsx` (3), `ShoppingNudgesPanel.test.tsx` (4), `EventRSVPCard.test.tsx` (4) — frontend test count 152 → 189. Phase 2 status row: ~25% → ~85%. |
