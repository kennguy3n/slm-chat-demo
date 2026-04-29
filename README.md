# KChat SLM Demo

KChat SLM Demo is an **Electron desktop app** that proves the AI features
inside KChat can run on-device using quantized local small language models
(Gemma 4 E2B / E4B). The Electron **main process** owns all inference and
talks directly to a local Ollama daemon (or `MockAdapter` when Ollama
isn't running). A small Go **data API** provides chats, threads,
workspaces and seeded KApp cards. No AI traffic ever leaves the device.

The demo runs the **same product surface in two contexts**:

- **B2C** — personal chats, family groups, community groups, on-device AI
  memory, smart reply, inline translation, task extraction, RSVP cards.
- **B2B** — workspace / domain / channel collaboration with KApps, AI
  employees, approvals, artifacts (PRD / RFC / SOP / QBR), and
  human-reviewable AI output anchored to the chat thread that produced it.

For the full product thesis, architecture, phasing, and progress, see:

- [PROPOSAL.md](./PROPOSAL.md) — product vision and "one shell, two contexts"
  design
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Electron renderer, Electron main
  process inference, Go data API, AI policy engine, KApps object model
- [PHASES.md](./PHASES.md) — seven-phase delivery plan (Phase 0 → Phase 6)
- [PROGRESS.md](./PROGRESS.md) — per-phase task tracker

## Tech stack

| Layer       | Stack                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Shell       | Electron 31 (main + preload + renderer), TypeScript                            |
| Renderer    | React + TypeScript + Vite, TanStack Router / Query, Zustand, Vitest + RTL      |
| Inference   | Electron main process (`frontend/electron/inference/`): TS port of the Go adapter contract with `MockAdapter`, `OllamaAdapter` and an `InferenceRouter` that picks E2B / E4B per task. |
| IPC         | `contextBridge.exposeInMainWorld('electronAI', …)` exposes `run`, `stream`, `smartReply`, `translate`, `extractTasks`, `summarizeThread`, `extractKAppTasks`, `unreadSummary`, `prefillApproval`, `draftArtifact`, `familyChecklist`, `shoppingNudges`, `eventRSVP`, `tripPlan`, `guardrailCheck`, `modelStatus`, `loadModel`, `unloadModel`, `route`. |
| Local memory | `features/memory/memoryStore.ts` — IndexedDB (`kchat-slm-memory` / `facts`) with an in-memory fallback. The AI never auto-writes; users add / edit / remove facts from the AI Memory page. 0 B egress. |
| Data API    | Go 1.25 + chi router + chi/cors, in-memory store, standard `net/http/httptest` |
| Persistence | (Phase 0) in-memory; (Phase 6+) PostgreSQL + NATS JetStream + MinIO/S3         |

## Quick start

```bash
# 1) Data API (Go on :8080, optional in dev — only needed for chat / thread data)
cd backend
go run ./cmd/server

# 2) Electron app (spawns Vite + Electron, talks IPC for AI, HTTP for data)
cd frontend
npm install
npm run electron:dev
```

`npm run electron:dev` starts the Vite renderer dev server on
`http://localhost:5173` and launches Electron with `ELECTRON_DEV=1`.
The renderer loads the dev server URL; the main process boots the
inference router (`frontend/electron/inference/bootstrap.ts`) and
registers all IPC handlers. Use the **B2C / B2B** button in the top bar
to switch shells; the sidebar lists seeded chats.

For a plain browser dev loop (no Electron, no IPC), `npm run dev` still
works — every API helper falls back to the legacy HTTP endpoints when
`window.electronAI` is undefined, which is also how the Vitest suite
runs.

### Optional: run with a real local model (Ollama)

The Electron main process auto-detects an Ollama daemon on
`http://localhost:11434` (or `OLLAMA_BASE_URL`). When it's reachable,
the inference router wires Ollama as the E2B and E4B adapter; otherwise
it falls back to the bundled `MockAdapter` so the demo always works
without a model present.

The bootstrap (`frontend/electron/inference/bootstrap.ts`) defaults
`E2B_MODEL` to `gemma-4-e2b` and `E4B_MODEL` to `gemma-4-e4b`. Those
names are *aliases*, not the upstream Ollama tags — the `models/`
directory ships two Modelfiles that create the aliases on top of the
real Gemma 4 base models published by Google to the Ollama library
(`gemma4:e2b` and `gemma4:e4b`, verified against
[ollama.com/library/gemma4/tags](https://ollama.com/library/gemma4/tags)
on 2026-04-29).

The fastest way to set both aliases up is the bundled script:

```bash
# Pulls gemma4:e2b + gemma4:e4b and creates the gemma-4-e2b /
# gemma-4-e4b aliases the bootstrap looks for.
./scripts/setup-models.sh

# Make sure the daemon is running in the background.
ollama serve &
export OLLAMA_BASE_URL=http://localhost:11434

cd frontend && npm run electron:dev
```

If you only want one tier, pull the base model and create the matching
alias by hand:

```bash
ollama pull gemma4:e2b
ollama create gemma-4-e2b -f models/Modelfile.e2b

# Optional: high-tier model for reasoning-heavy tasks.
ollama pull gemma4:e4b
ollama create gemma-4-e4b -f models/Modelfile.e4b
```

If only the E2B alias exists, the bootstrap aliases the E4B slot to the
E2B adapter and the router reports the fallback through `decide()` so
the **Local model** panel and privacy strip show that reasoning-heavy
tasks ran on E2B. If you want different alias names (e.g. you've
pulled `gemma3:4b-it-qat` and want to point the app at it without
renaming anything), override at runtime:

```bash
export E2B_MODEL=gemma3:4b-it-qat
export E4B_MODEL=gemma3:12b-it-qat
cd frontend && npm run electron:dev
```

See [`models/README.md`](./models/README.md) for the full list of
Modelfile knobs (context length, temperature, system prompt) and for
quantisation alternatives like `gemma4:e4b-it-q8_0`.

The **Local model** panel in the right sidebar (`DeviceCapabilityPanel`)
calls `window.electronAI.modelStatus()` over IPC; the main process
queries Ollama's `/api/ps` for *currently resident* models. Load /
Unload buttons issue the same IPC channels (`model:load`, `model:unload`)
which the main process translates into a small `/api/generate` warm-up
request and a `keep_alive=0` eviction respectively.

### Production build

```bash
cd frontend
npm run electron:build
```

`npm run electron:build` runs three stages:

1. `npm run build` — Vite builds the renderer into `dist/`.
2. `npm run electron:tsc` — `tsconfig.electron.json` compiles
   `electron/` to CommonJS in `dist-electron/`, then
   `scripts/finalize-electron-build.mjs` writes a
   `dist-electron/package.json` with `"type": "commonjs"` so Electron
   treats the `.js` files as CommonJS even though the outer
   `frontend/package.json` is ESM.
3. `electron-builder` packages the result into a platform installer
   under `frontend/release/`. Targets are configured in the
   `"build"` block of `frontend/package.json`:

   - **Linux**: `AppImage` (x64).
   - **macOS**: `dmg` (x64 + arm64; unsigned by default).
   - **Windows**: `nsis` installer (x64).

Build only one target with `npx electron-builder --linux AppImage`,
`--mac dmg`, or `--win nsis`. The Linux AppImage build has been
verified end-to-end on this snapshot — it produces a single
`~107 MB` self-contained executable that bundles Electron + the
React renderer + the TypeScript inference layer.

Code-signing certificates are not configured. When you're ready to
ship signed builds, set `CSC_LINK` / `CSC_KEY_PASSWORD` (macOS) or
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (Windows) in your CI.

## Project structure

```
slm-chat-demo/
├── backend/                     # Go data API (no AI inference)
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── router.go        (data-only routes)
│   │   │   ├── middleware.go
│   │   │   ├── handlers/        (chat, workspace, kapps, privacy, artifacts*)
│   │   │   └── userctx/         (request-scoped user helpers)
│   │   ├── services/            (identity, workspace, chat, kapps)
│   │   ├── models/              (user, workspace, message, task, approval, artifact, event, card)
│   │   └── store/               (memory store + Phase-0 seed)
│   └── go.mod
├── frontend/
│   ├── electron/
│   │   ├── main.ts              (BrowserWindow, lifecycle, dev/prod URL switch)
│   │   ├── preload.ts           (contextBridge → window.electronAI)
│   │   ├── ipc-handlers.ts      (ipcMain.handle for ai:* and model:*)
│   │   └── inference/
│   │       ├── adapter.ts       (Adapter / Loader / StatusProvider interfaces, types)
│   │       ├── mock.ts          (canned MockAdapter; same outputs as the Go port)
│   │       ├── ollama.ts        (HTTP client for the local daemon, NDJSON streaming)
│   │       ├── llamacpp.ts      (LlamaCppAdapter stub; throws "not yet implemented")
│   │       ├── router.ts        (PROPOSAL.md §2 scheduler — E2B / E4B / fallback)
│   │       ├── tasks.ts         (smart-reply / translate / extract-tasks / summary helpers)
│   │       ├── secondBrain.ts   (Phase 2: family checklist, shopping nudges, RSVP extraction)
│   │       ├── skill-framework.ts  (declarative SkillDefinition contract + runSkill executor)
│   │       ├── search-service.ts   (SearchService interface + MockSearchService for trip planner)
│   │       ├── skills/
│   │       │   ├── trip-planner.ts       (B2C trip / event planning skill)
│   │       │   └── guardrail-rewrite.ts  (PII / tone / unverified-claim detection + rewrite)
│   │       └── bootstrap.ts     (pings Ollama; chooses real vs. mock adapter set; instantiates SearchService)
│   ├── src/
│   │   ├── app/                 (AppShell, B2CLayout, B2BLayout, TopBar, MobileTabBar, useMediaQuery)
│   │   ├── features/
│   │   │   ├── chat/            (ChatSurface, ThreadPanel, MessageList, MessageBubble, Composer)
│   │   │   ├── ai/              (PrivacyStrip, ActionLauncher, DeviceCapabilityPanel, DigestCard, SmartReplyBar, TranslationCaption, TaskExtractionCard, ThreadSummaryCard, ApprovalPrefillCard, ArtifactDraftCard, TaskCreatedPill, MorningDigestPanel, FamilyChecklistCard, ShoppingNudgesPanel, EventRSVPCard, TripPlannerCard, GuardrailRewriteCard, MetricsDashboard, activityLog)
│   │   │   ├── memory/          (AIMemoryPage + memoryStore — local-only IndexedDB-backed second brain)
│   │   │   ├── kapps/           (TaskCard, ApprovalCard, ArtifactCard, EventCard, KAppCardRenderer)
│   │   │   ├── artifacts/       (placeholder)
│   │   │   ├── ai-employees/    (placeholder)
│   │   │   └── knowledge/       (placeholder)
│   │   ├── stores/              (workspaceStore, chatStore*, aiStore*)
│   │   ├── api/                 (client, chatApi, aiApi, streamAI, kappsApi, electronBridge)
│   │   ├── types/               (chat, ai, kapps, workspace, electron.d.ts)
│   │   ├── router.tsx
│   │   ├── styles.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.electron.json
│   └── vite.config.ts
├── PROPOSAL.md
├── ARCHITECTURE.md
├── PHASES.md
└── PROGRESS.md
```

`*` = Phase-1+ placeholder; the file exists but most logic ships in a later
phase.

## Running the tests

```bash
# Frontend (Vitest + React Testing Library + jsdom; covers the renderer
# components AND the Electron main-process inference modules).
cd frontend
npm test

# Backend (Go's standard `testing` + `net/http/httptest` — data endpoints
# and the legacy inference package's routing rules).
cd backend
go test ./...
```

## Phase 0 — what's actually shipped

- React app shell with **B2C ↔ B2B mode switching** in the top bar
- B2C layout: personal chats, family groups, community groups
- B2B layout: workspace → domain → channel hierarchy + DM section
- Three-column shell (sidebar / main chat / right panel) per
  ARCHITECTURE.md section 2 and PROPOSAL.md section 4.1
- **Mobile-responsive layout** that collapses to a single column with a
  five-tab bottom navigation (Message / Notification / Tasks / Settings /
  More) at ≤ 768 px; resize the browser or use device emulation to test
- **Shared KApp card system** — `TaskCard`, `ApprovalCard`, `ArtifactCard`,
  `EventCard`, plus a `KAppCardRenderer` dispatcher rendering wire-format
  `Card` envelopes from `GET /api/kapps/cards`
- **Privacy strip** rendered below every AI-generated card with all eight
  PROPOSAL.md §4.3 elements (compute location, model name, sources,
  egress, confidence, why-suggested, accept/edit/discard, linked origin)
- **AI Action Launcher** in the composer: B2C quick actions (Catch me up,
  Translate, Remind me, Extract tasks) and B2B four-intent grid (Create,
  Analyze, Plan, Approve) with submenus
- **Electron shell** — `frontend/electron/main.ts` opens a
  BrowserWindow, registers IPC, picks dev URL vs. built `index.html`
- **Local inference adapter interface in TypeScript** + `MockAdapter`
  returning canned responses for `summarize`, `translate`,
  `extract_tasks`, `smart_reply`, `prefill_approval`, `draft_artifact`
  — wired into `window.electronAI.run` and `window.electronAI.route`
  (the latter returns the Phase-0 policy: allow / E2B / on-device / 0
  egress)
- Go data API on `:8080` with chi router, chi/cors, JSON content-type, and
  a mock-auth middleware that injects a user from the `X-User-ID` header
- Five seeded users (Alice, Bob, Carol, Dave, Eve) and two workspaces
  (Personal, Acme Corp with Engineering / Finance domains)
- Realistic seed messages backing the demo flows in PROPOSAL.md section 5
  plus four seeded KApp cards (family task, neighborhood event, vendor
  approval, engineering PRD draft)
- 319 frontend tests (renderer components + Electron main-process
  inference) covering the Phase 2 skills framework, the Phase 3
  KApp lifecycle (`TaskCard`, `ApprovalCard`, `ArtifactCard`,
  `KAppCardRenderer`, `TasksKApp`, `CreateTaskForm`,
  `CreateApprovalForm`, `FormCard`, `ArtifactWorkspace`,
  `ArtifactDiffView`, `SourcePin`, `workspaceApi`, `B2BLayout`),
  the new `ai:prefill-form` task helper (`runPrefillForm` /
  `parseFormFields`), the E4B routing tier (`bootstrap.test.ts`,
  `router.test.ts`), and the full Phase 0 → Phase 2 baseline plus
  full Go test coverage of the data endpoints, including the
  Phase 3 task lifecycle, approval submit + decision, artifact CRUD
  + versions, forms intake, linked-objects, and workspace-domain
  endpoints.

## Phase 1 — complete

- **E4B routing tier** — `bootstrap.ts` now creates two distinct
  `OllamaAdapter` instances (`E2B_MODEL` / `E4B_MODEL`, defaulting to
  `gemma-4-e2b` / `gemma-4-e4b`), pings each model independently, and
  aliases the E4B slot to the E2B adapter when the larger model is not
  pulled. The `InferenceRouter` exposes `hasE4B()`; `decide()` reports
  the real tier so the privacy strip and `model:status` (`e4bModel`,
  `e4bLoaded`, `hasE4B`) reflect what actually ran. The
  `DeviceCapabilityPanel` shows both tiers side-by-side.

## Phase 3 — what's in progress

- **Workspace → Domain → Channel navigation** — backend exposes
  `GET /api/workspaces/{id}/domains` and
  `GET /api/domains/{id}/channels`; frontend's `B2BLayout` renders a
  collapsible domain tree (auto-expanded on first mount), and
  `workspaceStore` tracks `selectedDomainId` / `expandedDomainIds`.
- **Thread linked objects** — `Card.ThreadID` plus
  `GET /api/threads/{id}/linked-objects` powers the new
  *Linked objects (n)* `<details>` rail in `ThreadPanel` (compact
  KApp cards rendered inline).
- **KApp card lifecycle** — `KAppCardRenderer` accepts `onAction`
  (typed union for status / decide / open-source / view) plus a
  `mode` prop (`full` | `compact`). `TaskCard` ships status
  transitions and inline edit; `ApprovalCard` ships
  approve/reject/comment with a confirmation pane and a
  decision-log timeline; `ArtifactCard` ships `View` + version
  history.
- **Tasks KApp** — `POST /api/kapps/tasks`,
  `GET /api/kapps/tasks?channelId=`, `PATCH /api/kapps/tasks/{id}`,
  `PATCH /api/kapps/tasks/{id}/status`,
  `DELETE /api/kapps/tasks/{id}`, and
  `POST /api/kapps/approvals/{id}/decide` (immutable history /
  decision log) are wired through a zustand `useKAppsStore`,
  `TasksKApp` (filter by status, sort by due date, counts), and
  `CreateTaskForm`.
- **Approvals KApp — submit flow** — `POST /api/kapps/approvals`
  + `CreateApprovalForm`; the `ApprovalPrefillCard` Accept button
  and Action Launcher's `Approve > Vendor / Budget / Access` paths
  both feed AI-prefilled fields into the new endpoint.
- **Docs/Artifacts KApp** — full `POST/GET/PATCH /api/kapps/artifacts*`
  CRUD plus `POST /api/kapps/artifacts/{id}/versions` and
  `GET /api/kapps/artifacts/{id}/versions/{version}`. The new
  `ArtifactWorkspace` (right-rail) renders the artifact body split
  by section, source pins inline as footnote chips, version history
  with line-by-line LCS diffs (`ArtifactDiffView`), and `Submit for
  review` / `Publish` status transitions.
- **Forms intake** — `Form` model + `POST/GET /api/kapps/forms` +
  seeded `vendor_onboarding_v1` / `expense_report_v1` /
  `access_request_v1` templates; new `FormCard` renderer (highlights
  AI-prefilled fields) and a new `ai:prefill-form` IPC channel +
  `runPrefillForm` task helper that prefers E4B.
- **Source pins** — `ArtifactSourcePin` flows from the streamed
  `ArtifactDraftCard` `sources[]` into the artifact's first
  version's `sourcePins`, then renders inline next to the
  referenced section in `ArtifactWorkspace`.

## Earlier — what's already in place

- **Ollama HTTP adapter in TypeScript**
  (`frontend/electron/inference/ollama.ts`) talking to a local daemon
  at `http://localhost:11434` (configurable via `OLLAMA_BASE_URL`); the
  Electron main process pings on startup and falls back to the
  `MockAdapter` when the daemon is unreachable so `npm run electron:dev`
  always works.
- **Inference router** (`frontend/electron/inference/router.ts`)
  implementing PROPOSAL.md §2's scheduler rule: short / private /
  latency-sensitive tasks (`summarize`, `translate`, `extract_tasks`,
  `smart_reply`) route to E2B; reasoning-heavy tasks (`draft_artifact`,
  `prefill_approval`) prefer E4B with a fallback to E2B when no E4B
  adapter is available. The router exposes its decision (model, tier,
  reason) over IPC so the privacy strip can show *why* a model was
  chosen.
- **IPC streaming** on the `ai:stream` channel — the main process pumps
  per-chunk `ai:stream:chunk` events back to the renderer, where
  `frontend/src/api/streamAI.ts` translates them into the same
  `onDelta` / `onDone` callback shape the SSE client used to expose,
  with an `AbortController` for cancellation.
- **Live model status panel** (`DeviceCapabilityPanel`,
  ARCHITECTURE.md module #10): polls `window.electronAI.modelStatus()`
  every 10 s and surfaces model name, loaded/unloaded badge, quant
  level, model RAM usage, sidecar state, plus device RAM and WebGPU
  support; Load / Unload buttons hit `model:load` / `model:unload`
  IPC channels.
- **B2C "Catch me up" digest** end-to-end: the renderer fetches B2C
  message data from `GET /api/chats?context=b2c` and `GET
  /api/chats/{id}/messages`, then calls `window.electronAI.unreadSummary`
  (or streams via `window.electronAI.stream` with `taskType:
  summarize`). The Go side stays data-only.
- **B2C smart reply, inline translation, task extraction** — same
  pattern: the renderer pulls message context from the Go data API
  and forwards it to `window.electronAI.smartReply`,
  `window.electronAI.translate`, `window.electronAI.extractTasks`.
  E2B routing, on-device / 0-byte egress privacy strip on every output.
- **B2B thread summarization + task extraction** — the renderer pulls
  thread messages from `GET /api/threads/{threadId}/messages` and
  forwards them to `window.electronAI.summarizeThread` /
  `window.electronAI.extractKAppTasks`.
- **B2B Approval prefill** — `window.electronAI.prefillApproval` runs a
  single E4B inference over the thread, parses the result into
  `{ vendor, amount, risk, justification }`, attaches the source
  message ids it found supporting evidence in, and the renderer
  shows them in `ApprovalPrefillCard` with editable fields, a
  missing-info hint, and a privacy strip with per-source provenance.
- **B2B Draft artifact section** — `window.electronAI.draftArtifact`
  returns the prompt + sources for a PRD / RFC / Proposal / SOP / QBR
  (optionally scoped to `goal | requirements | risks`); the renderer
  streams the body via `ai:stream` exactly once, exactly like the
  thread summary flow, into `ArtifactDraftCard`.

## Phase 2 — what's in progress

- **AI task-created pills** — `TaskCreatedPill` renders an inline AI
  badge below the originating message after the user accepts items
  from a `TaskExtractionCard` ("2 tasks created from …"). Keeps the
  conversation surface compact rather than letting accepted-task
  cards balloon vertically.
- **"Why suggested" expandable explanations** — `PrivacyStrip`'s `Why`
  row now toggles open into a `whyDetails[]` list with per-signal
  source links, fully accessible (`aria-expanded`, keyboardable
  toggle).
- **Morning digest panel** — `MorningDigestPanel` mounted in the B2C
  right rail. One button generates an on-device catch-up across all
  seeded B2C chats and renders chats / messages / egress / compute
  metrics next to the streamed digest body.
- **Family checklist** — `FamilyChecklistCard` reads the active family
  chat and asks the on-device router for a concrete prep list (with an
  optional event focus like "Soccer practice tomorrow"). Each item
  back-links to the chat message that produced it; the privacy strip
  shows E2B routing and 0 B egress.
- **Shopping list with nudges** — `ShoppingNudgesPanel` owns a small
  local shopping list. The "Suggest from chat" button asks the model
  for additions grounded in the conversation ("Add sunscreen because
  field trip is tomorrow"); the existing list is forwarded as a
  dedup hint and never leaves the device.
- **Community event / RSVP cards** — `EventRSVPCard` lifts events out
  of community chats with title / when / location / RSVP-by metadata
  and lets the user mark Yes / Maybe / No locally.
- **AI Memory page** — `features/memory/AIMemoryPage` renders the
  user's local-only memory index (people, preferences, routines,
  free-form notes), with add / edit / remove. Backed by a tiny
  IndexedDB-or-in-memory store (`memoryStore.ts`); the AI never
  auto-writes — every entry passes through a confirmation step.
- **Tabbed B2C right rail** — `B2CLayout` now switches between Digest /
  Family / Shopping / Events / Trip / Memory / Stats in the right rail
  so the second-brain surfaces share one column without overflowing.
- **AI Skills Framework** — `electron/inference/skill-framework.ts`
  defines a declarative `SkillDefinition` contract (meta prompt, steps,
  tools, guardrails, response template, preferred tier) plus a
  `runSkill(router, def, ctx)` executor that injects user context, runs
  pre-/post-inference guardrails, parses the model output, and detects
  the `INSUFFICIENT: <reason>` refusal pattern that all skills share.
  Existing `tasks.ts` / `secondBrain.ts` parsers honour the same
  refusal contract.
- **Trip planner** — `TripPlannerCard` mounted as the right-rail "Trip"
  tab. Reads AI Memory (`location`, `member`, `community-detail`)
  for the family/community context, calls the new `MockSearchService`
  for weather / events / attractions at the destination, and asks the
  on-device router for a day-by-day itinerary. Every item is back-
  linked to its source (search tool or memory fact); the privacy
  strip shows routing + 0 B egress for inference.
- **Guardrail rewrite card** — `Composer` now calls
  `window.electronAI.guardrailCheck` before sending. The
  `runGuardrailRewrite` skill combines a deterministic PII regex with
  the on-device SLM's tone / claim review and surfaces a
  `GuardrailRewriteCard` inline with the original, suggested rewrite,
  category-tagged findings, and Accept / Keep original / Edit actions.
- **Metrics dashboard** — `MetricsDashboard` mounted as the right-rail
  "Stats" tab. Reads from the new in-memory `activityLog` module which
  records `{ skillId, model, tier, itemsProduced, egressBytes,
  latencyMs }` for every successful AI call across smart reply,
  translate, extract-tasks, summary, family checklist, shopping
  nudges, RSVP, trip plan, and guardrail review. Renders runs / items
  / egress / time-saved cards plus a per-run drilldown — confirming
  that "all AI ran on-device" with 0 bytes egressed.

## What's deferred to later phases

The architecture documents reference PostgreSQL, NATS JetStream, MinIO/S3,
Meilisearch, additional local-model sidecars (llama.cpp / llama-server,
Unsloth Studio), the full policy engine, AI Employees, connectors, and
the knowledge graph. See [PHASES.md](./PHASES.md) for the full plan and
[PROGRESS.md](./PROGRESS.md) for the current per-task tracker.
