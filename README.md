# KChat SLM Demo

KChat SLM Demo is an **Electron desktop app** that proves the AI features
inside KChat can run on-device using a quantized local small language
model — **Ternary-Bonsai-8B** ([prism-ml/Ternary-Bonsai-8B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf))
served through Ollama. The Electron **main process** owns all inference
and talks directly to the local Ollama daemon (or `MockAdapter` when
Ollama isn't running). A small Go **data API** provides chats, threads,
workspaces and seeded KApp cards. No AI traffic ever leaves the device.

The router distinguishes exactly two destinations: a single on-device
`local` adapter (the Ternary-Bonsai-8B model) and a policy-gated
`server` adapter for confidential-server tasks. Operators can override
the on-device alias via the `MODEL_NAME` env var without touching any
code.

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
| Inference   | Electron main process (`frontend/electron/inference/`): TS port of the Go adapter contract with `MockAdapter`, `OllamaAdapter` (default model: `ternary-bonsai-8b`) and an `InferenceRouter` that picks `local` vs. `server` per task. |
| IPC         | `contextBridge.exposeInMainWorld('electronAI', …)` exposes `run`, `stream`, `smartReply`, `translate`, `extractTasks`, `summarizeThread`, `extractKAppTasks`, `unreadSummary`, `prefillApproval`, `draftArtifact`, `familyChecklist`, `shoppingNudges`, `eventRSVP`, `tripPlan`, `guardrailCheck`, `recipeRun` (Phase 4 generic AI-Employee recipe runner), `modelStatus`, `loadModel`, `unloadModel`, `route`. |
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
the inference router wires a single Ollama adapter bound to
`MODEL_NAME` (default `ternary-bonsai-8b`); otherwise it falls back
to the bundled `MockAdapter` so the demo always works without a model
present.

The bootstrap (`frontend/electron/inference/bootstrap.ts`) defaults
`MODEL_NAME` to `ternary-bonsai-8b`. That name is
an *alias*, not the upstream Ollama tag — the `models/` directory
ships a single [`Modelfile.bonsai8b`](./models/Modelfile.bonsai8b)
that creates the alias on top of the
[`hf.co/prism-ml/Ternary-Bonsai-8B-gguf`](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf)
HuggingFace GGUF repo (served through Ollama's
`FROM hf.co/<user>/<repo>` shorthand).

The fastest way to set the alias up is the bundled script:

```bash
# Pulls hf.co/prism-ml/Ternary-Bonsai-8B-gguf and creates the
# ternary-bonsai-8b alias the bootstrap looks for.
./scripts/setup-models.sh

# Make sure the daemon is running in the background.
ollama serve &
export OLLAMA_BASE_URL=http://localhost:11434

cd frontend && npm run electron:dev
```

To set up the alias by hand:

```bash
ollama pull hf.co/prism-ml/Ternary-Bonsai-8B-gguf
ollama create ternary-bonsai-8b -f models/Modelfile.bonsai8b
```

A single pull is enough to light up on-device routing. If you later
pull a different model and want the router to use it without renaming
anything, override at runtime:

```bash
export MODEL_NAME=some-other-alias
cd frontend && npm run electron:dev
```

When `MODEL_NAME` resolves to a model the daemon hasn't pulled, the
bootstrap falls back to the `MockAdapter` so the demo still works —
the **Local model** panel and privacy strip surface the fallback.

See [`models/README.md`](./models/README.md) for the full list of
Modelfile knobs (context length, temperature, system prompt) and for
local-GGUF fallback instructions for environments where the
`FROM hf.co/<user>/<repo>` shorthand is not yet supported.

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
│   │   │   ├── handlers/        (chat, workspace, kapps, privacy, artifacts, audit, ai_employees, recipe_runs, connectors, retrieval, knowledge)
│   │   │   └── userctx/         (request-scoped user helpers)
│   │   ├── services/            (identity, workspace, chat, kapps, audit, ai_employees, recipe_runs, connectors, retrieval, knowledge)
│   │   ├── models/              (user, workspace, message, task, approval, artifact, event, card, audit, ai_employee, recipe_run, connector, retrieval, knowledge)
│   │   └── store/               (memory store + Phase-0 seed + Phase-4 AI Employee seed)
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
│   │       ├── router.ts        (PROPOSAL.md §2 scheduler — local / server)
│   │       ├── tasks.ts         (smart-reply / translate / extract-tasks / summary helpers)
│   │       ├── secondBrain.ts   (Phase 2: family checklist, shopping nudges, RSVP extraction)
│   │       ├── skill-framework.ts  (declarative SkillDefinition contract + runSkill executor)
│   │       ├── search-service.ts   (SearchService interface + MockSearchService for trip planner)
│   │       ├── skills/
│   │       │   ├── trip-planner.ts       (B2C trip / event planning skill)
│   │       │   └── guardrail-rewrite.ts  (PII / tone / unverified-claim detection + rewrite)
│   │       ├── recipes/
│   │       │   ├── registry.ts           (RecipeDefinition + RECIPE_REGISTRY + register/get/list)
│   │       │   ├── summarize.ts          (wraps buildThreadSummary; preferredTier: local)
│   │       │   ├── extract-tasks.ts      (wraps runKAppsExtractTasks; source provenance)
│   │       │   ├── draft-prd.ts          (wraps buildDraftArtifact, artifactType='PRD')
│   │       │   ├── draft-proposal.ts     (wraps buildDraftArtifact, artifactType='Proposal')
│   │       │   ├── create-qbr.ts         (wraps buildDraftArtifact, artifactType='QBR')
│   │       │   ├── prefill-approval.ts   (wraps runPrefillApproval; flattens vendor/amount/risk/justification)
│   │       │   └── index.ts              (barrel — self-registers all 6 canonical recipes)
│   │       └── bootstrap.ts     (pings Ollama; chooses real vs. mock adapter set; instantiates SearchService)
│   ├── src/
│   │   ├── app/                 (AppShell, B2CLayout, B2BLayout, TopBar, MobileTabBar, useMediaQuery)
│   │   ├── features/
│   │   │   ├── chat/            (ChatSurface, ThreadPanel, MessageList, MessageBubble, Composer, launcherDispatch)
│   │   │   ├── ai/              (PrivacyStrip, ActionLauncher, DeviceCapabilityPanel, DigestCard, SmartReplyBar, TranslationCaption, TaskExtractionCard, ThreadSummaryCard, ApprovalPrefillCard, ArtifactDraftCard, TaskCreatedPill, MorningDigestPanel, FamilyChecklistCard, ShoppingNudgesPanel, EventRSVPCard, TripPlannerCard, GuardrailRewriteCard, MetricsDashboard, activityLog)
│   │   │   ├── memory/          (AIMemoryPage + memoryStore — local-only IndexedDB-backed second brain)
│   │   │   ├── kapps/           (TaskCard, ApprovalCard, ArtifactCard, EventCard, KAppCardRenderer, TasksKApp, CreateTaskForm, CreateApprovalForm, FormCard, AuditLogPanel, OutputReview)
│   │   │   ├── artifacts/       (ArtifactWorkspace, ArtifactDiffView, SourcePin, lineDiff, sections)
│   │   │   ├── ai-employees/    (AIEmployeeList, AIEmployeePanel, QueueView, RecipeOutputGate, recipeCatalog)
│   │   │   └── knowledge/       (SourcePicker, ConnectorPanel, PermissionPreview, CitationChip, CitationRenderer, KnowledgeGraphPanel — Phase 5 channel/thread/file scoping, mock connector attach, egress-aware permission preview, inline citation rendering, workspace knowledge-graph extraction)
│   │   ├── stores/              (workspaceStore, chatStore*, aiStore*, useKAppsStore)
│   │   ├── api/                 (client, chatApi, aiApi, streamAI, kappsApi, auditApi, aiEmployeeApi, recipeRunApi, connectorApi, knowledgeApi, retrievalContext, electronBridge)
│   │   ├── types/               (chat, ai, kapps, workspace, audit, aiEmployee, knowledge — includes Connector, ConnectorFile, RetrievalChunk, RetrievalResult, KnowledgeEntity — electron.d.ts)
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
  (the latter returns the Phase-0 policy: allow / on-device / 0
  egress)
- Go data API on `:8080` with chi router, chi/cors, JSON content-type, and
  a mock-auth middleware that injects a user from the `X-User-ID` header
- Five seeded users (Alice, Bob, Carol, Dave, Eve) and two workspaces
  (Personal, Acme Corp with Engineering / Finance domains)
- Realistic seed messages backing the demo flows in PROPOSAL.md section 5
  plus four seeded KApp cards (family task, neighborhood event, vendor
  approval, engineering PRD draft)
- 358 frontend tests (renderer components + Electron main-process
  inference) covering the Phase 2 skills framework, the Phase 3
  KApp lifecycle (`TaskCard`, `ApprovalCard`, `ArtifactCard`,
  `KAppCardRenderer`, `TasksKApp`, `CreateTaskForm`,
  `CreateApprovalForm`, `FormCard`, `ArtifactWorkspace`,
  `ArtifactDiffView`, `SourcePin`, `workspaceApi`, `B2BLayout`),
  the Phase 3 audit log (`AuditLogPanel`), human review gates
  (`OutputReview`), and Action Launcher integration
  (`launcherDispatch`), the `ai:prefill-form` task helper
  (`runPrefillForm` / `parseFormFields`), the on-device routing tier
  (`bootstrap.test.ts`, `router.test.ts`), and the full Phase 0 →
  Phase 2 baseline plus full Go test coverage of the data
  endpoints, including the Phase 3 task lifecycle, approval submit
  + decision, artifact CRUD + versions, forms intake, audit log
  (`audit_test.go`), linked-objects, and workspace-domain endpoints.

## Phase 1 — complete

- **Single on-device routing tier** — `bootstrap.ts` creates one
  `OllamaAdapter` instance (`MODEL_NAME`, defaulting to
  `ternary-bonsai-8b`), pings the Ollama daemon, and falls back to
  the mock adapter when the model is not pulled. The
  `InferenceRouter` `decide()` reports the real model so the privacy
  strip and `model:status` (`model`, `loaded`) reflect what actually
  ran. The `DeviceCapabilityPanel` shows the on-device model status.

## Phase 6 — in progress

- **Confidential server compute mode** —
  `frontend/electron/inference/confidential-server.ts` adds a third
  `ConfidentialServerAdapter` tier that POSTs to a configurable
  `CONFIDENTIAL_SERVER_URL` (default `http://localhost:8090`) using the
  same NDJSON streaming pattern as the Ollama adapter, but always with
  `onDevice: false`. The router is two-tier (`'local' | 'server'`)
  with `attachServer()` / `hasServer()` and a policy-gated `decide()`
  that requires both adapter availability AND
  `CONFIDENTIAL_SERVER_POLICY=allow`. Bootstrap probes
  `${url}/v1/health` on startup and only wires the server tier when both
  the ping resolves and the policy permits — otherwise the router refuses
  with a clear "unreachable" error (no silent fallback). The
  `model:status` IPC reports `serverModel` / `serverAvailable` /
  `serverUrl`, which `DeviceCapabilityPanel` surfaces in a new
  "Confidential server" sub-section.
- **Redaction / tokenization before egress** —
  `frontend/electron/inference/redaction.ts` introduces a
  `RedactionEngine` with `tokenize` (reversible — replaces emails,
  phones, SSNs, and two-word names with `[EMAIL_n]`, `[PHONE_n]`,
  `[SSN_n]`, `[NAME_n]` placeholders and stores the mapping), `redact`
  (non-reversible `[REDACTED]` substitution), and `detokenize`
  (longest-token-first replacement so `[EMAIL_10]` doesn't get clobbered
  by `[EMAIL_1]`). The `RedactionPolicy` carries fine-grained boolean
  flags plus a `customPatterns` escape hatch. The router now tokenizes
  the prompt before dispatching to the server adapter and detokenizes
  the response (or each stream delta) before returning to the renderer
  — so the server only ever sees placeholder tokens, and the user-facing
  text is always restored. `PrivacyStrip` renders a "Redaction" row
  ("3 items redacted (2 names, 1 email)") only for confidential-server
  outputs.
- **Data egress summary** — `frontend/electron/inference/egress-tracker.ts`
  introduces an `EgressTracker` singleton that records every
  server-routed inference (`{ timestamp, taskType, egressBytes,
  redactionCount, model, channelId }`) and reports
  `{ totalBytes, totalRequests, totalRedactions, byChannel, byModel,
  recent }` via the new `egress:summary` / `egress:reset` IPC channels.
  The renderer's new `EgressSummaryPanel` (`src/features/ai/`) shows a
  prominent "0 B" zero-state, per-channel and per-model breakdowns, a
  recent-activity timeline, and a Reset button; the existing TopBar
  "Egress" badge now reads from the live tracker via the new
  `useEgressSummary` hook. UTF-8 byte length drives the tally so
  reported bytes match wire bytes.

## Phase 5 — complete

- **Source picker UI** — `features/knowledge/SourcePicker.tsx` +
  `types/knowledge.ts` (`SelectedSource`, `SelectedSourceKind`,
  `ThreadSummary`) lets B2B users scope which channels, threads, and
  files an AI Employee may read before running a knowledge intent.
  Three tabs (Channels / Threads / Files), a chip list with per-chip
  × removal, Confirm / Cancel buttons, and optional `initialSelected`
  seeding. The Files tab now lists real channel-attached connector
  files (replacing the kickoff "Coming soon" placeholder); chips
  surface the connector name. Wired into `ActionLauncher` via
  `workspaceId` + `channelId` + `intentsRequiringSources` props and
  into `ArtifactDraftCard` via `pickedSources`.
- **Google Drive connector (mock)** — backend `models/connector.go`
  (`Connector`, `ConnectorKind`, `ConnectorStatus`, `ConnectorFile`),
  `services.ConnectorService`, six handlers (`GET /api/connectors`,
  `GET /api/connectors/{id}`, `GET /api/connectors/{id}/files`,
  `GET /api/channels/{channelId}/connector-files`,
  `POST /api/connectors/{id}/channels`,
  `DELETE /api/connectors/{id}/channels/{channelId}`). Seed adds
  `conn_gdrive_acme` (Acme Corp Drive) attached to `ch_vendor_management`
  with four mock files (PRD, vendor contract, budget spreadsheet,
  design brief). Frontend `connectorApi.ts` mirrors all six endpoints.
- **Channel-scoped connector attachment** —
  `features/knowledge/ConnectorPanel.tsx` mounted in the B2B right-rail
  "Connectors" tab. Lists workspace connectors, shows attach status
  against the active channel, exposes per-row file counts, and toggles
  attach / detach via `connectorApi`. The SourcePicker Files tab uses
  `fetchChannelConnectorFiles(channelId)` so a file is only selectable
  when its connector is attached to the active channel — matching
  PROPOSAL.md §7 rule 2.
- **Permission preview before AI access** —
  `features/knowledge/PermissionPreview.tsx` renders the "AI will read
  from…" sheet with one row per channel / thread / file, a
  `0 bytes will leave this device` egress badge, and Confirm / Cancel
  actions. Wired between SourcePicker confirm and `onAction` dispatch
  in `ActionLauncher`, and as an in-card gate inside
  `ArtifactDraftCard` whenever `pickedSources` includes file selections.
- **Per-channel retrieval index** — backend `models/retrieval.go`
  (`RetrievalChunk`, `RetrievalSourceKind`, `RetrievalResult`),
  `services.RetrievalService` with `IndexChannel` (chunks all channel +
  thread messages and connector file excerpts) and `Search`
  (whitespace tokenize + stopword filter + term-overlap score), plus
  `POST /api/channels/{channelId}/index` and
  `GET /api/channels/{channelId}/search?q=&topK=` endpoints. Frontend
  `connectorApi.indexChannel` / `searchChannel` and
  `api/retrievalContext.ts` `gatherRetrievalContext` helper that
  coalesces channel + thread picks, indexes once per channel, and
  returns merged top-K results sorted by score — ready to feed AI
  prompt assembly.
- **Citation rendering in AI outputs** —
  `features/knowledge/CitationChip.tsx` (`[N]`-style chip with hover
  tooltip and click-through to `#message-{id}` or the connector URL)
  and `CitationRenderer.tsx` (parses `[source:id]` markers in
  streamed text, renders chips numbered in citation order, repeats
  reuse the same index, emits a "Sources (N)" footer with full
  attribution). Wired into `ThreadSummaryCard`, `ArtifactDraftCard`,
  `ApprovalPrefillCard`, and `RecipeOutputGate` so any AI body
  containing markers renders inline chips + a footer attribution
  list while marker-free bodies fall back to the existing rendering.
- **Workspace knowledge graph** — backend `models/knowledge.go`
  (`KnowledgeEntity`, `KnowledgeEntityKind`, `KnowledgeEntityStatus`),
  `services.KnowledgeService` with `ExtractEntities` (heuristic
  keyword extraction over channel messages), `List`, and `Get`. Five
  entity kinds — `decision`, `owner`, `risk`, `requirement`,
  `deadline` — each linked back to its `sourceMessageId` for thread
  attribution. Endpoints
  `POST /api/channels/{channelId}/knowledge/extract`,
  `GET /api/channels/{channelId}/knowledge?kind=`, and
  `GET /api/knowledge/{id}` are wired in `api/router.go`. Frontend
  `knowledgeApi.ts` mirrors the three endpoints; the new
  `features/knowledge/KnowledgeGraphPanel.tsx` mounts in the B2B
  right-rail "Knowledge" tab and renders five collapsible sections
  with extract action, source-message links, confidence badges,
  actor pills (for owners), and due-date chips (for deadlines).
- **TOCTOU fix in `ConnectorService.AttachToChannel`** — the
  idempotency check now runs *inside* the `UpdateConnector` callback
  under the store's write lock, so two concurrent attaches with the
  same channelId can no longer pass a stale snapshot and
  double-append (regression covered by
  `TestAttachIsIdempotentForRepeatedChannel` in
  `backend/internal/api/handlers/connectors_test.go`).
- **OneDrive connector (mock)** — second seeded connector
  `conn_onedrive_acme` (`kind: 'onedrive'`, name "Acme OneDrive")
  attached to `ch_engineering` with three mock files (engineering
  kickoff notes, quarterly engineering report, OKR summary). Reuses
  the same `ConnectorService` / handlers / `ConnectorPanel` plumbing
  as the Drive connector, so both kinds appear automatically in the
  workspace connector list.
- **Connector ACL sync** — `ConnectorFile.ACL []string` carries a
  machine-readable list of user IDs allowed to read each file (the
  existing `Permissions` field stays as the human-readable label).
  New `ConnectorService.SyncACL(connectorID)` rewrites every file's
  ACL based on its `Permissions` (Phase 5 mock; OAuth-driven sync
  is Phase 6+) and `ConnectorService.CheckFileAccess(fileID, userID)`
  is the single gate consulted by retrieval.
  `RetrievalService.IndexChannel(channelID, userID)` and
  `Search(channelID, query, userID)` filter chunks against the
  requesting user's ACL so a connector file with no entry for that
  user produces zero retrieval hits. Endpoint:
  `POST /api/connectors/{id}/sync-acl`. Frontend
  `connectorApi.syncConnectorACL(connectorId)` and per-file ACL
  rendering in `PermissionPreview.tsx`.

## Phase 4 — complete

- **Budget controls (token / compute limits)** —
  `AIEmployeeService.UpdateBudget(id, maxTokensPerDay)`,
  `IncrementUsage(id, tokensUsed)` (atomic — returns
  `ErrBudgetExceeded` when a run would exceed `MaxTokensPerDay`),
  and `ResetDailyUsage()` live in
  `backend/internal/services/ai_employees.go`.
  `PATCH /api/ai-employees/{id}/budget` and
  `POST /api/ai-employees/{id}/budget/increment` (returns
  **429 Too Many Requests** with the employee payload on overrun)
  are wired in `api/router.go`. Frontend ships
  `updateAIEmployeeBudget` / `incrementAIEmployeeBudgetUsage` (with a
  typed `BudgetExceededError`) in `src/api/aiEmployeeApi.ts`, an
  inline "Edit budget" editor in `AIEmployeePanel` with optimistic
  update + rollback, and a pre-execution budget charge in the
  Electron `runRecipe` handler (`electron/ipc-handlers.ts`) that
  calls `POST …/budget/increment` *before* executing and refuses
  with `{ status: 'refused', reason: 'budget exceeded' }` when the
  backend returns 429. Falls open on transport errors so a broken
  proxy can't hard-block a demo.
- **Human approval before publish gate** — new
  `features/ai-employees/RecipeOutputGate.tsx` wraps the existing
  `OutputReview` review surface and stands between a recipe run and
  any KApp persistence. The gate pretty-prints recipe-specific
  output shapes (PRD prompts verbatim, `extract_tasks` as a numbered
  list, `prefill_approval` as labelled fields), exposes
  Accept / Edit / Discard with `allowEdit=false` for status
  transitions (`prefill_approval`), and renders a non-interactive
  refusal banner when `RecipeResult.status === 'refused'`.
  `QueueView` now exposes an `onReviewRun` callback and
  `AIEmployeePanel` tracks `pendingReview` state so clicking a
  completed run opens the gate in the right rail before anything is
  written.
- **Auto mode badge + Inline mode badge** — new
  `features/ai/AIEmployeeModeBadge.tsx` renders a small pill
  (`⚡ Auto · {name}` or `👤 Inline · {name}`) with
  `data-testid="ai-employee-mode-badge"` + one of
  `ai-employee-mode-badge-auto` / `ai-employee-mode-badge-inline`
  and a descriptive `aria-label`. Wired into `MessageBubble`
  (renders below a message when `message.aiEmployeeId` is set and
  the parent passes the employee), `KAppCardRenderer` (wraps
  AI-generated cards with a header that shows the badge), and
  `AIEmployeeList` (shows the badge next to each employee name in
  the sidebar).

## Phase 4 — earlier deliverables

- **AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI)** —
  backend defines `models/ai_employee.go` (`AIEmployee` struct with
  role / avatar color / description / allowed channel ids / recipes /
  budget / mode), an RWMutex-guarded store
  (`PutAIEmployee` / `GetAIEmployee` / `ListAIEmployees` /
  `UpdateAIEmployee`), `seedAIEmployees`, and an
  `AIEmployeeService` exposed through `GET /api/ai-employees` and
  `GET /api/ai-employees/{id}`. The renderer fetches employees via
  `src/api/aiEmployeeApi.ts`; `AIEmployeeList` renders the three
  compact cards under the B2B sidebar and `AIEmployeePanel` renders
  the full profile in a new "AI Employees" right-rail tab with role
  / mode badges, allowed-channel chips, assigned recipes, and a
  budget-usage bar.
- **Allowed channels configuration per AI Employee** —
  `PATCH /api/ai-employees/{id}/channels` validates every channel id
  against the workspace store and rejects unknown channels with
  HTTP 400. The `AIEmployeePanel` "Configure channels" button opens
  an inline multi-select; Save pushes through `updateAIEmployeeChannels`
  and the React tree refreshes optimistically through the TanStack
  Query cache so the chips update before the network round trip
  settles. `PATCH /api/ai-employees/{id}/recipes` ships the same
  pattern for the recipe list.
- **Recipe registry** — `frontend/electron/inference/recipes/registry.ts`
  defines `RecipeDefinition` (`id`, `name`, `description`, `taskType`,
  `preferredTier`, `execute(router, context)`), `RecipeContext`
  (`channelId`, `threadId?`, `messages`, `aiEmployeeId`), `RecipeResult`
  (`status: ok | refused`, `output`, `model`, `tier`, `reason`), a
  module-level `RECIPE_REGISTRY` Map, and `registerRecipe` /
  `getRecipe` / `listRecipes` helpers. The registry is intentionally
  separate from the AI Skills Framework in `skill-framework.ts`:
  skills are low-level inference contracts (prompts, guardrails,
  parsers); recipes are higher-level AI-Employee-scoped wrappers that
  compose existing task helpers.
- **Recipes: summarize + extract_tasks** — `recipes/summarize.ts`
  wraps `buildThreadSummary` and exposes a short-thread heuristic
  (advertises `preferredTier: 'local'`).
  `recipes/extract-tasks.ts` wraps `runKAppsExtractTasks`, preserves
  per-task source provenance through the `sourceMessageId` field, and
  returns a `refused` envelope (not an exception) for empty threads.
  Both self-register into `RECIPE_REGISTRY` via the
  `recipes/index.ts` barrel.
- **`ai:recipe:run` IPC channel** — a generic recipe runner in
  `electron/ipc-handlers.ts` accepts
  `{ recipeId, aiEmployeeId, channelId, threadId?, messages, allowedRecipes? }`,
  looks the recipe up in `RECIPE_REGISTRY`, refuses recipes the
  calling AI Employee is not authorised for (returning a uniform
  `RecipeResult` with `status: 'refused'` rather than throwing), and
  delegates to `recipe.execute`. Exported as `runRecipe` for direct
  unit-testing without spinning up the Electron main process.
- **Recipes: draft_prd / draft_proposal / create_qbr / prefill_approval** —
  four new recipes in `electron/inference/recipes/` compose existing
  `buildDraftArtifact` (PRD / Proposal / QBR) and `runPrefillApproval`
  task helpers. All advertise `preferredTier: 'local'`, return a uniform
  `RecipeResult` envelope (drafting recipes surface `{ prompt, sources,
  threadId, channelId }` so the renderer streams the body through
  `ai:stream`; the approval recipe flattens `{ vendor, amount, risk,
  justification, sourceMessageIds }`), and refuse empty threads with
  `status: 'refused'` instead of throwing. With these the registry now
  ships all six canonical Phase-4 recipes through `recipes/index.ts`.
- **Queue view (pending AI tasks)** — new `models/recipe_run.go`
  (`RecipeRun` with `id` / `aiEmployeeId` / `recipeId` / `channelId` /
  `threadId` / `status` / `createdAt` / `completedAt` / `resultSummary`),
  append-only `RecipeRuns` slice in `store/memory.go`
  (`AppendRecipeRun` / `ListRecipeRuns(aiEmployeeId?)` /
  `UpdateRecipeRun`), `services/recipe_runs.go`
  (`RecipeRunService.List` / `Record` / `Complete`), and handlers at
  `GET /api/ai-employees/{id}/queue` + `POST /api/ai-employees/{id}/queue`.
  Frontend ships `src/api/recipeRunApi.ts` (`fetchQueue` / `recordRun`)
  and `features/ai-employees/QueueView.tsx` — a compact KApp-style card
  list showing recipe name, status badge, channel, timestamp, and
  result summary, with a "No pending tasks" empty state. Mounted
  inside `AIEmployeePanel` beneath the budget section.

## Phase 3 — complete

- **Audit log (immutable event log)** — `models/audit.go`
  (`AuditEntry` + 9 event types: `task.created`, `task.updated`,
  `task.closed`, `approval.submitted`, `approval.decisioned`,
  `artifact.created`, `artifact.version_added`,
  `artifact.status_changed`, `form.submitted`),
  `Memory.AppendAuditEntry` / `ListAuditEntries`, an
  `AuditService.Record` writer wired into every `KApps` mutation
  via `WithAudit`, and `GET /api/audit` supporting `?objectId=` /
  `?objectKind=` / `?channelId=` filters. The renderer's
  `AuditLogPanel` (`features/kapps/AuditLogPanel.tsx`) renders the
  per-object timeline.
- **Human review gates (review before publish)** — `OutputReview`
  (ARCHITECTURE.md module #12) is the formal human-confirmation
  gate from PROPOSAL.md §4.3. It renders the AI-generated content
  with source attribution, a privacy strip, and Accept / Edit /
  Discard. `ArtifactWorkspace` now opens it before every
  `draft → in_review` and `in_review → published` status PATCH so
  no transition lands without explicit confirmation.
- **Action Launcher integration** — every B2B path is wired
  end-to-end via `frontend/src/features/chat/launcherDispatch.ts`:
  Create > PRD/RFC/Proposal/Task, Analyze > Thread/Risks/Decisions
  (reuses the thread summarizer with a focus hint), Plan >
  Milestones/Sprint/Rollout (reuses the artifact draft pipeline
  with a section hint), Approve > Vendor/Budget/Access (reuses
  approval prefill). `ChatSurface.handleAIAction` returns true for
  every wired path so the launcher suppresses its placeholder
  toast.
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
  `runPrefillForm` task helper (on-device).
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
  `smart_reply`) route to the on-device tier; reasoning-heavy tasks (`draft_artifact`,
  `prefill_approval`) also route on-device (a single 8B model handles both when no server
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
  on-device routing, on-device / 0-byte egress privacy strip on every output.
- **B2B thread summarization + task extraction** — the renderer pulls
  thread messages from `GET /api/threads/{threadId}/messages` and
  forwards them to `window.electronAI.summarizeThread` /
  `window.electronAI.extractKAppTasks`.
- **B2B Approval prefill** — `window.electronAI.prefillApproval` runs a
  single on-device inference over the thread, parses the result into
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
  shows on-device routing and 0 B egress.
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
