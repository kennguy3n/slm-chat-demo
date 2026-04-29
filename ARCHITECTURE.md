# Architecture

This document describes the technical architecture of the SLM Chat demo: a
chat-first B2C/B2B Electron desktop app with on-device and (later) confidential-
server small-language-model (SLM) inference, AI-driven KApps (tasks, approvals,
forms, artifacts), and a small Go data plane.

The demo is structured as an **Electron app** with a React renderer and a
TypeScript main process. The main process owns AI inference, talks directly to a
local Ollama daemon (or `MockAdapter` when Ollama isn't running), and exposes
all AI work to the renderer through a `contextBridge` IPC bridge. A small Go
data API (chat, KApps, workspace, identity) is co-launched on `:8080` for chat
and thread data only; later phases add artifact, retrieval, connector, event
and audit services. WebGPU and Android AICore remain future inference paths.

---

## 1. System overview

```
Electron App
├── Renderer Process (React + Vite)
│   ├── Chat UI, Thread UI, AI Action Launcher, KApp Cards
│   ├── Artifact Workspace, Privacy Strip
│   └── Device Capability Inspector, Local Model Control Panel
│       ↓ (IPC: window.electronAI.*)
├── Main Process (Node.js / TypeScript)
│   ├── Inference Router (E2B / E4B decision tree)
│   ├── Ollama Adapter / Mock Adapter
│   ├── Model lifecycle (load / unload / status)
│   └── Privacy / policy engine
│       ↓ (HTTP to local daemon)
└── Ollama / llama.cpp (local sidecar)
    └── Gemma 4 E2B / E4B GGUF

Go Data API (optional, localhost:8080)
├── Chat / thread / message data
├── Workspace / channel / user metadata
├── KApp cards (seeded)
└── In-memory store (Phase 0); PostgreSQL / NATS / MinIO land Phase 6+
```

The frontend is a single React app that can render two layouts (B2C and B2B) on
top of a shared `AppShell`, hosted inside an Electron `BrowserWindow`. The
Electron **main process** is the single entry point for AI traffic: every
`window.electronAI.*` call lands on an `ipcMain.handle(...)` that routes
through the inference router, the policy engine, and the Ollama / mock adapter.
Streaming uses an `ai:stream` request channel plus per-chunk
`ai:stream:chunk` events forwarded back to the renderer.

Chat / thread / workspace data is fetched from the Go API over plain HTTP
(`fetch`) just like before, but the Go server no longer hosts any AI
endpoint and the legacy `internal/inference/` package has been
removed — the canonical inference code lives entirely in
`frontend/electron/inference/`. Persistent state still lives in the
in-memory store for Phase 0; PostgreSQL, NATS JetStream, MinIO/S3 and
Meilisearch land in later phases.

---

## 2. React frontend modules

### 2.1 Modules

| # | Module | Responsibility |
| -- | -- | -- |
| 1 | `AppShell` | Shared B2C/B2B navigation, layout, theming, session state. |
| 2 | `ChatSurface` | Chat view: message list, bubbles, inline AI badges, KApp cards. |
| 3 | `ThreadPanel` | Thread detail view, linked objects (tasks, approvals, artifacts). |
| 4 | `ActionLauncher` | B2C quick actions; B2B Create / Analyze / Plan / Approve menu. |
| 5 | `PrivacyStrip` | Compute mode, source count, and outbound egress preview. |
| 6 | `ModelStatusBadge` | Active model (E2B / E4B / server), loaded state, battery. |
| 7 | `KAppCardRenderer` | Renders Task / Approval / Form / Artifact / Sheet / Base cards. |
| 8 | `ArtifactWorkspace` | PRD / RFC / proposal editor with citations and versions. |
| 9 | `AIEmployeePanel` | B2B AI employee profile, queue, and channel assignments. |
| 10 | `DeviceCapabilityPanel` | RAM, WebGPU support, sidecar status, currently-loaded model. |
| 11 | `SourcePicker` | Pick channels, threads, files, and connectors as AI sources. |
| 12 | `OutputReview` | Human review gate: renders AI-generated content with Accept / Edit / Discard controls before any KApp write. Supports `allowEdit` for creation flows vs. read-only confirmation for status transitions. |

### 2.2 Frontend stack

- Electron (main + preload + renderer; main and preload compile to
  CommonJS via `tsconfig.electron.json`)
- React + TypeScript (renderer)
- Vite (dev server + build)
- TanStack Router
- TanStack Query
- Zustand or Jotai (local state)
- Tiptap / ProseMirror (artifact editor)
- TanStack Table (Base / Sheet KApps)
- IPC (`contextBridge.exposeInMainWorld('electronAI', …)`) for all AI
  traffic; WebSocket / native streaming reserved for confidential
  server mode in Phase 6+
- IndexedDB for local cache (chat, artifacts, model metadata)
- Service Worker for offline demo mode

### 2.3 Component tree

The frontend lives under a top-level `frontend/` directory. The renderer
is a Vite + React TypeScript app under `src/`; the Electron main process,
preload bridge and inference port live in a sibling `electron/` tree
that compiles to CommonJS:

```
frontend/
├── index.html
├── package.json                      (main: "dist-electron/main.js")
├── tsconfig.json                     (renderer)
├── tsconfig.electron.json            (main + preload, CommonJS)
├── vite.config.ts
├── scripts/
│   └── finalize-electron-build.mjs   (copies dist/ into the main-process layout)
├── electron/
│   ├── main.ts                       (BrowserWindow lifecycle; ELECTRON_DEV switch)
│   ├── preload.ts                    (contextBridge → window.electronAI)
│   ├── ipc-handlers.ts               (ai:* and model:* IPC handlers; stream pump)
│   └── inference/
│       ├── adapter.ts                (Adapter / Loader / StatusProvider interfaces)
│       ├── mock.ts                   (MockAdapter; canned outputs per TaskType)
│       ├── ollama.ts                 (HTTP client for the local daemon, NDJSON streaming)
│       ├── llamacpp.ts               (LlamaCppAdapter stub; throws "not yet implemented")
│       ├── router.ts                 (PROPOSAL.md §2 scheduler — E2B / E4B / fallback)
│       ├── tasks.ts                  (smart-reply / translate / extract-tasks helpers)
│       ├── secondBrain.ts            (Phase 2: family checklist, shopping nudges, RSVP extraction)
│       ├── skill-framework.ts        (declarative SkillDefinition + runSkill executor + INSUFFICIENT refusal contract)
│       ├── search-service.ts         (SearchService interface + MockSearchService for trip planner)
│       ├── skills/
│       │   ├── trip-planner.ts       (Phase 2: B2C trip / event planning skill)
│       │   └── guardrail-rewrite.ts  (Phase 2: PII / tone / unverified-claim review + rewrite)
│       └── bootstrap.ts              (pings Ollama; chooses real vs. mock adapter set; instantiates SearchService)
└── src/
    ├── app/ (AppShell.tsx, B2CLayout.tsx, B2BLayout.tsx, TopBar.tsx, MobileTabBar.tsx, useMediaQuery.ts) — Phase 0
    ├── features/
    │   ├── chat/ (ChatSurface, ThreadPanel, MessageBubble, MessageList, Composer, launcherDispatch) — Phase 0 + Phase 1 (ThreadPanel hosts the B2B thread summary + B2B task extraction surfaces); Phase 3 adds `launcherDispatch.ts`, the pure helper that maps every B2B Action Launcher path to a `kapps:launcher` CustomEvent the right-rail ThreadPanel listens for
    │   ├── ai/ (ActionLauncher, PrivacyStrip, DeviceCapabilityPanel, DigestCard, SmartReplyBar, TranslationCaption, TaskExtractionCard, ThreadSummaryCard, ApprovalPrefillCard, ArtifactDraftCard, TaskCreatedPill, MorningDigestPanel, FamilyChecklistCard, ShoppingNudgesPanel, EventRSVPCard, TripPlannerCard, GuardrailRewriteCard, MetricsDashboard, activityLog) — Phase 0 ships ActionLauncher + PrivacyStrip; Phase 1 adds DeviceCapabilityPanel (module #10), DigestCard for the unread-summary flow, SmartReplyBar (B2C reply chips), TranslationCaption (per-message translation toggle), TaskExtractionCard (reused for B2C + B2B), ThreadSummaryCard for the B2B thread summary, ApprovalPrefillCard for B2B approval prefill, and ArtifactDraftCard for the B2B PRD / RFC / Proposal / SOP / QBR drafting flow; Phase 2 adds TaskCreatedPill (inline AI badges below messages), MorningDigestPanel (B2C right-rail catch-up), FamilyChecklistCard, ShoppingNudgesPanel, EventRSVPCard, TripPlannerCard (B2C trip / event planning skill), GuardrailRewriteCard (pre-send PII / tone / unverified-claim review), and MetricsDashboard backed by the new `activityLog` module which records every AI run; PrivacyStrip itself gained an expandable `whyDetails[]` list in Phase 2
    │   ├── memory/ (AIMemoryPage, memoryStore) — Phase 2: local-only IndexedDB-backed second brain (DB `kchat-slm-memory`, store `facts`) with an in-memory fallback for jsdom / SSR; the AI never auto-writes — every fact passes through the AIMemoryPage UI
    │   ├── kapps/ (KAppCardRenderer, TaskCard, ApprovalCard, ArtifactCard, EventCard, FormCard, TasksKApp, CreateTaskForm, CreateApprovalForm, AuditLogPanel, OutputReview)  — Phase 0 ships the read-only renderers; Phase 3 adds an `onAction`/`mode` API on `KAppCardRenderer`, status transitions + inline edit on `TaskCard`, approve/reject/comment with confirmation pane and decision-log timeline on `ApprovalCard`, `View` + version history on `ArtifactCard`, the `TasksKApp` (filter / sort / counts) + `CreateTaskForm` for the Tasks lifecycle, the `CreateApprovalForm` submit flow, the `FormCard` AI-prefilled intake surface, the `AuditLogPanel` per-object timeline (Phase 3), and the `OutputReview` human-confirmation gate (module #12) gating artifact publish + AI-generated KApp creation. — Phase 0 ships the read-only renderers; Phase 3 adds an `onAction`/`mode` API on `KAppCardRenderer`, status transitions + inline edit on `TaskCard`, approve/reject/comment with confirmation pane and decision-log timeline on `ApprovalCard`, `View` + version history on `ArtifactCard`, the `TasksKApp` (filter / sort / counts) + `CreateTaskForm` for the Tasks lifecycle, the `CreateApprovalForm` submit flow, the `FormCard` AI-prefilled intake surface, the `AuditLogPanel` per-object timeline (Phase 3), and the `OutputReview` human-confirmation gate (module #12) gating artifact publish + AI-generated KApp creation.
    │   ├── artifacts/ (ArtifactWorkspace, ArtifactDiffView, SourcePin, lineDiff, sections) — Phase 3 right-rail viewer for full artifacts: section split, inline source pins, version history, line-by-line diff, status transitions.
    │   ├── ai-employees/ (AIEmployeePanel)                                   — Phase 4
    │   └── knowledge/ (SourcePicker)                                         — Phase 5
    ├── stores/ (chatStore, aiStore, workspaceStore, kappsStore — Phase 3 task/approval CRUD with optimistic merge)
    ├── api/ (client, aiApi, chatApi, kappsApi, workspaceApi — Phase 3 navigation, streamAI, electronBridge)
    ├── types/ (chat, ai, kapps, workspace, electron.d.ts)
    ├── router.tsx
    ├── styles.css
    └── main.tsx
```

Phase 0 ships the `electron/` shell (main + preload + IPC + TS
inference port), the `app/` shell (with the mobile tab bar), the
`features/chat/` chat surface, the `features/ai/` Privacy Strip +
Action Launcher, and the `features/kapps/` card system. Feature
directories tagged Phase 1+/3+/4/5 contain placeholder modules that
get fleshed out in the phases noted above.

Every API helper under `src/api/` checks for `window.electronAI` first
(via the `electronBridge.ts` helper); when absent (e.g. `npm run dev`,
Vitest, a static web build) it falls back to the legacy HTTP path so
the same code keeps working in a plain browser.

### 2.4 AI Skills Framework

The Electron main process exposes a declarative skills layer at
`frontend/electron/inference/skill-framework.ts`. A `SkillDefinition`
captures everything a skill needs to run safely on a small language
model:

- `metaPrompt` and an optional `userContextSlot` (filled at runtime
  from AI Memory) describing the persona and the per-user context.
- An ordered `steps[]` list (`read_memory`, `build_prompt`,
  `run_inference`, `parse_output`, `validate`) that documents what
  the skill does — the executor itself is generic.
- A `tools[]` list flagging which IPC / external tools the skill is
  allowed to call (e.g. `local:memory-read`,
  `remote:weather-search`).
- A `guardrails` policy: `requireFields`, `requireMinMessages`,
  `confidenceThreshold`, `requireSourceAttribution`,
  `prohibitedPatterns`, plus a `refusalTemplate` used when the
  skill refuses.
- A `responseTemplate` (`format`, `requiredFields`, `maxItems`)
  that the parser must satisfy.
- A `preferredTier` (`e2b` | `e4b`) and a `taskType` so the
  router can pick the right adapter.

`runSkill(router, def, ctx)` is the executor. It:

1. Runs `runPreInferenceGuardrails` (missing required fields, empty
   message arrays).
2. Assembles the prompt from `metaPrompt` + injected user context +
   `INSUFFICIENT_RULE` (`If you do not have enough information or
   are not confident in your answer, respond ONLY with
   'INSUFFICIENT: <reason>' and do not attempt to guess or
   fabricate information.`).
3. Calls the router with the skill's `taskType` and `preferredTier`.
4. Detects `INSUFFICIENT: <reason>` in the model output and converts
   it to a structured `SkillRefusalResult`.
5. Runs the skill's `parser`, then `runPostInferenceGuardrails`
   (parse-failed / missing sources / confidence below threshold /
   prohibited patterns).
6. Returns a discriminated `SkillResult<O>` with privacy metadata
   (`computeLocation`, `modelName`, `tier`, `dataEgressBytes`,
   `sources`).

Phase 2 ships two skills on top of the framework:
`skills/trip-planner.ts` (memory + `MockSearchService` →
day-by-day itinerary, E4B preferred) and `skills/guardrail-rewrite.ts`
(deterministic PII regex + SLM tone / unverified-claim review →
optional rewrite, E2B). The existing `tasks.ts` and `secondBrain.ts`
helpers honour the same `INSUFFICIENT` contract so the renderer can
treat refusals uniformly.

A session-scoped `frontend/src/features/ai/activityLog.ts` records
`{ id, timestamp, skillId, model, tier, itemsProduced, egressBytes,
latencyMs }` for every successful AI call. `MetricsDashboard`
subscribes to it and surfaces the per-day summary on the B2C
right-rail "Stats" tab.

---

## 3. Go backend services

The Go backend is a **data plane only**. AI inference, model lifecycle and
the policy engine moved to the Electron main process — `ai-policy-service`
and `ai-runtime-service` are now TypeScript modules under
`frontend/electron/inference/`. The remaining services in the table below
are the data services that persist Phase-0+ state and stream events.

### 3.1 Services

| # | Service | Responsibility |
| -- | -- | -- |
| 1 | `api-gateway` | REST routing, auth, rate limits, request fan-out (no AI proxying). |
| 2 | `identity-service` | Users, sessions, tenants, workspace membership. |
| 3 | `workspace-service` | Workspace, domain, channel, role metadata. |
| 4 | `chat-service` | Messages, threads, reactions, attachments. |
| 5 | `kapps-service` | Tasks, approvals, forms, base rows, sheet metadata. |
| 6 | `artifact-service` | Docs / PRDs / RFCs / proposals, versions, citations. |
| 7 | `retrieval-service` | Local + source retrieval, citations, chunking. |
| 8 | `connector-service` | Drive / OneDrive / Jira, with permission preview. |
| 9 | `event-service` | NATS JetStream event publication and subscriptions. |
| 10 | `audit-service` | Immutable append-only event log for all KApp mutations (task, approval, artifact, form lifecycle events). In-memory store (Phase 0); persisted in later phases. |

### 3.2 Directory structure

```
backend/
├── cmd/server/main.go            (boots the data API on :8080; no inference)
├── internal/
│   ├── api/
│   │   ├── router.go             (data routes only)
│   │   ├── middleware.go
│   │   ├── handlers/             (chat.go, workspace.go, kapps.go, privacy.go,
│   │   │                          artifacts.go, audit.go [Phase 3])
│   │   └── userctx/              (request-scoped user helpers)
│   ├── services/                 (identity.go, workspace.go, chat.go, kapps.go,
│   │                              audit.go [Phase 3])
│   ├── models/                   (user.go, workspace.go, message.go, task.go,
│   │                              approval.go, artifact.go, event.go, card.go,
│   │                              audit.go [Phase 3])
│   └── store/                    (memory.go + seed.go; Phase 6+ adds postgres.go)
└── go.mod
```

> **Phase 0 status.** The Go backend uses an **in-memory store**
> (`internal/store/memory.go`) seeded at startup by `internal/store/seed.go`,
> including four sample KApp cards (task, approval, artifact, event)
> exposed via `GET /api/kapps/cards`. AI inference, model lifecycle and
> the policy engine all moved to the Electron main process; the legacy
> `internal/inference/` package was deleted in the follow-up — the
> canonical inference code now lives only in
> `frontend/electron/inference/`.
>
> **Phase 1 progress.** The `OllamaAdapter` and `InferenceRouter` now
> live in `frontend/electron/inference/ollama.ts` and
> `frontend/electron/inference/router.ts`. The Electron main process
> auto-detects an Ollama daemon on `OLLAMA_BASE_URL` (default
> `http://localhost:11434`) on startup (`bootstrap.ts`); when it's
> reachable the router wires Ollama as the E2B and E4B adapter,
> otherwise it falls back to the mock. The IPC `ai:route` channel
> reflects the router's real decision (model, tier, reason); the
> `ai:stream` channel emits real chunk events; `model:status`,
> `model:load` and `model:unload` proxy to Ollama. **PostgreSQL is
> not yet integrated**, and **NATS JetStream**, **MinIO/S3**, and
> **Meilisearch** are referenced in this document but do not yet
> exist in the codebase. They land in later phases per
> [PHASES.md](./PHASES.md).

### 3.3 Surface area: HTTP (data) and IPC (AI)

The data API runs over HTTP on `:8080`; AI calls run over Electron IPC.

#### 3.3a Go data API (HTTP)

```
GET    /healthz
GET    /api/users/me, /api/users
GET    /api/workspaces, /api/workspaces/{id}/channels
GET    /api/workspaces/{id}/domains                       (Phase 3)
GET    /api/domains/{id}/channels                         (Phase 3)
GET    /api/chats, /api/chats/{chatId}/messages
GET    /api/threads/{threadId}/messages
GET    /api/threads/{threadId}/linked-objects             (Phase 3)
GET    /api/kapps/cards (?channelId=…)
GET    /api/kapps/tasks (?channelId=…)                    (Phase 3)
POST   /api/kapps/tasks                                   (Phase 3)
PATCH  /api/kapps/tasks/{id}                              (Phase 3)
PATCH  /api/kapps/tasks/{id}/status                       (Phase 3)
DELETE /api/kapps/tasks/{id}                              (Phase 3)
POST   /api/kapps/approvals                               (Phase 3)
POST   /api/kapps/approvals/{id}/decide                   (Phase 3)
GET    /api/kapps/artifacts (?channelId=…)                (Phase 3)
POST   /api/kapps/artifacts                               (Phase 3)
GET    /api/kapps/artifacts/{id}                          (Phase 3)
PATCH  /api/kapps/artifacts/{id}                          (Phase 3)
GET    /api/kapps/artifacts/{id}/versions/{version}       (Phase 3)
POST   /api/kapps/artifacts/{id}/versions                 (Phase 3)
GET    /api/kapps/form-templates                          (Phase 3)
GET    /api/kapps/forms (?channelId=…)                    (Phase 3)
POST   /api/kapps/forms                                   (Phase 3)
GET    /api/audit (?objectId=…&objectKind=…&channelId=…)  (Phase 3)
GET    /api/privacy/egress-preview
```

All endpoints honour the `MockAuth` middleware (Phase 0) which extracts
`X-User-ID` from the request. There are **no AI endpoints on the Go
server**: the renderer either calls IPC (in Electron) or — when running
under `npm run dev` / Vitest — reaches the same data endpoints over
plain HTTP and the AI helpers no-op or fall back to `MockAdapter` shapes
for tests.

#### 3.3b Electron IPC channels (AI)

The preload script exposes `window.electronAI` to the renderer via
`contextBridge.exposeInMainWorld`. Each method maps to an
`ipcMain.handle(...)` registered in `electron/ipc-handlers.ts`.

| Channel                | Method on `window.electronAI`            | Routes via                |
| ---------------------- | ----------------------------------------- | ------------------------- |
| `ai:run`               | `run(req)`                                | `InferenceRouter.run()`   |
| `ai:stream`            | `stream(req, onChunk, onDone)`            | `InferenceRouter.stream()`; per-chunk `ai:stream:chunk:{id}` events |
| `ai:route`             | `route(req)`                              | `InferenceRouter.decide()` (no inference) |
| `ai:smart-reply`       | `smartReply(req)`                         | `runSmartReply` in `tasks.ts` (`taskType: smart_reply`, E2B) |
| `ai:translate`         | `translate(req)`                          | `runTranslate` (`taskType: translate`, E2B) |
| `ai:extract-tasks`     | `extractTasks(req)`                       | `runExtractTasks` (`taskType: extract_tasks`, E2B) |
| `ai:summarize-thread`  | `summarizeThread(req)`                    | `buildThreadSummary` (E2B for short threads, E4B for long) |
| `ai:unread-summary`    | `unreadSummary(req)`                      | `buildUnreadSummary` (`taskType: summarize`, E2B) |
| `ai:kapps-extract`     | `extractKAppTasks(req)`                   | `runKAppsExtractTasks` (B2B thread → tasks with provenance) |
| `ai:prefill-approval`  | `prefillApproval(req)`                    | `runPrefillApproval` (B2B thread → vendor / amount / risk / justification fields, prefers E4B) |
| `ai:prefill-form`      | `prefillForm(req)`                        | `runPrefillForm` (B2B thread → arbitrary intake form fields per template, prefers E4B) |
| `ai:draft-artifact`    | `draftArtifact(req)`                      | `buildDraftArtifact` (B2B thread → prompt + sources for streaming a PRD / RFC / Proposal / SOP / QBR section, prefers E4B) |
| `ai:family-checklist`  | `familyChecklist(req)`                    | `runFamilyChecklist` in `secondBrain.ts` (B2C family chat → titled checklist with optional event focus, E2B) |
| `ai:shopping-nudges`   | `shoppingNudges(req)`                     | `runShoppingNudges` (B2C family chat + local shopping list → grounded item / reason pairs that dedupe against the existing list, E2B) |
| `ai:event-rsvp`        | `eventRSVP(req)`                          | `runEventRSVP` (B2C community chat → up to 4 events with title / when / location / RSVP-by, E2B) |
| `ai:trip-plan`         | `tripPlan(req)`                           | `runTripPlanner` in `skills/trip-planner.ts` — pulls weather / events / attractions from `MockSearchService`, reads `location` / `member` / `community-detail` AI Memory facts, and returns a structured day-by-day itinerary with per-item source attribution (E4B preferred). |
| `ai:guardrail-check`   | `guardrailCheck(req)`                     | `runGuardrailRewrite` in `skills/guardrail-rewrite.ts` — combines a deterministic PII regex pre-pass with an SLM tone / unverified-claim review and returns `{ safe, findings, rewrite?, rationale }` (E2B). |
| `model:status`         | `modelStatus()`                           | `OllamaAdapter.status()` (or stub when Ollama is offline) |
| `model:load`           | `loadModel(name)`                         | `OllamaAdapter.load()` |
| `model:unload`         | `unloadModel(name)`                       | `OllamaAdapter.unload()` |

- `ai:route` runs the policy / scheduler and returns the chosen model,
  tier, and human-readable reason without executing inference.
- `ai:run` runs inference synchronously and returns the full output.
- `ai:stream` runs inference and streams chunks back to the renderer.
  The handler allocates a unique stream id, sends `ai:stream:chunk:{id}`
  events for each delta, and a final `done` event so
  `frontend/src/api/streamAI.ts` can fan them out into the same
  `onDelta` / `onDone` callbacks the legacy SSE client used. An
  `AbortController` cancels the stream by sending an `ai:stream:abort`
  message.
- `ai:smart-reply` returns 2–3 short contextual reply suggestions.
  Request: `{ channelId, messageId?, context }`. Response:
  `{ replies, channelId, sourceMessageId?, model, computeLocation,
  dataEgressBytes }`.
- `ai:translate` returns both the original and the translated message.
  Request: `{ messageId, channelId, targetLanguage?, original }`.
  Response: `{ messageId, channelId, original, translated,
  targetLanguage, model, computeLocation, dataEgressBytes }`.
- `ai:extract-tasks` extracts actionable items (task / reminder /
  shopping) from a B2C message + its surrounding context.
- `ai:summarize-thread` builds the summarize prompt + source list for a
  thread (no double inference; the renderer can then call `ai:stream`
  with the prompt). Tier hint included.
- `ai:kapps-extract` extracts task candidates from a B2B thread with
  owner / due-date / status / source-message provenance.
- `ai:prefill-approval` runs inference end-to-end against a thread and
  returns the parsed `{ vendor, amount, risk, justification, extra? }`
  fields plus the source-message ids the parser found supporting
  evidence in. The Electron main process owns this single inference;
  the renderer only renders the result.
- `ai:draft-artifact` follows the same prompt-then-stream pattern as
  `ai:summarize-thread`: it returns a deterministic prompt plus
  `sources[]` so the renderer can stream the body via `ai:stream`
  exactly once. Supports artifact types `PRD | RFC | Proposal | SOP |
  QBR` and an optional `section: 'goal' | 'requirements' | 'risks' |
  'all'`.
- `model:status` / `model:load` / `model:unload` mirror the Phase-1
  Ollama lifecycle (`/api/ps`, warm-up generate, `keep_alive=0`
  eviction).

---

## 4. Local inference design

### 4.1 Electron desktop path (primary)

```
Electron Renderer (React)
   ↓  IPC (window.electronAI.*)
Electron Main Process (Node.js / TypeScript)
   ├── InferenceRouter   (frontend/electron/inference/router.ts)
   ├── OllamaAdapter     (frontend/electron/inference/ollama.ts)
   └── MockAdapter       (frontend/electron/inference/mock.ts)
   ↓  HTTP (localhost:11434)
Ollama / llama.cpp (local sidecar)
   └── Gemma 4 E2B / E4B GGUF
```

Phase 1 implements this diagram with `OllamaAdapter` (TypeScript)
talking to a local Ollama daemon at `OLLAMA_BASE_URL` (default
`http://localhost:11434`). The Electron main process boots the
`InferenceRouter` in `bootstrap.ts`, which pings Ollama with a 500 ms
timeout; if reachable it instantiates **two distinct `OllamaAdapter`
instances** — one bound to `E2B_MODEL` (default `gemma-4-e2b`) and one
bound to `E4B_MODEL` (default `gemma-4-e4b`). The default names are
*aliases*: the repo ships `models/Modelfile.e2b` and `models/Modelfile.e4b`
that wrap the upstream Gemma 4 base models published by Google to the
Ollama library (`gemma4:e2b` / `gemma4:e4b`, verified against
[ollama.com/library/gemma4/tags](https://ollama.com/library/gemma4/tags)
on 2026-04-29) with the demo's preferred temperature / top_p / context
length / system prompt. `scripts/setup-models.sh` automates the pull +
alias creation. Bootstrap pings each model independently; if the larger
E4B model has not been pulled it aliases the E4B slot to the E2B
adapter and the router's `hasE4B()` returns `false`, so reasoning-heavy
tasks gracefully fall back to E2B without ever hitting an unloaded
model. When the daemon itself is unreachable both adapters fall back
to `MockAdapter`. The
`model:status` IPC channel reports both tiers (`e2bModel`, `e2bLoaded`,
`e4bModel`, `e4bLoaded`, `hasE4B`) so the renderer's
`DeviceCapabilityPanel` can display them side-by-side.

The router applies the PROPOSAL.md §2 scheduler rule: short / private /
latency-sensitive tasks (`summarize`, `translate`, `extract_tasks`,
`smart_reply`) route to E2B; reasoning-heavy tasks (`draft_artifact`,
`prefill_approval`) prefer E4B with a documented fallback to E2B. The
router records its decision (model, tier, reason) and exposes it via
`window.electronAI.route()` so the privacy strip can show *why* a
model was chosen.

This is the most reliable path and the one the demo defaults to. The
model runs locally via a sidecar process; the renderer never touches
the daemon directly — every AI call goes through the main process,
which is the single integration point for swapping in `llama.cpp`,
Unsloth Studio, or a confidential server runtime in later phases.
Works on any laptop with enough RAM for E2B/E4B and does not depend
on browser GPU support.

### 4.2 Browser-local path (future)

WebGPU inference where supported. Gemma 4 is designed for browser deployment, so
running E2B directly in the page is a capability target. It is not a main demo
dependency — the sidecar path stays primary because availability and performance
are too uneven across browsers and devices today.

### 4.3 Android mobile path (future)

- **Phase 1** — mobile web (PWA) talking to the same Go backend, with sidecar
  inference on a paired host or server runtime.
- **Phase 2** — React Native or native Android app, still talking to the Go
  backend; on-device inference via a bundled llama.cpp build.
- **Phase 3** — Android AICore / ML Kit GenAI Prompt API for direct on-device
  E2B / E4B with no sidecar, using the system-managed model.

---

## 5. AI policy engine

The AI policy engine runs on every AI call and decides which model to use, where
to run it, what to redact, and which sources are allowed. It is invoked by
`POST /api/ai/route` and inlined ahead of `/api/ai/run` and `/api/ai/stream`.

### 5.1 Input schema

```json
{
  "task_type": "draft_artifact | extract_tasks | prefill_approval | summarize | classify",
  "user_id": "u_123",
  "workspace_id": "w_456",
  "domain_id": "d_789",
  "channel_id": "c_abc",
  "device": {
    "ram_gb": 16,
    "gpu": "apple_m2 | nvidia_rtx | intel_iris | none",
    "battery": 0.74,
    "webgpu": true
  },
  "source_sensitivity": "public | internal | confidential | restricted",
  "allowed_compute": ["on_device", "confidential_server", "shared_server"],
  "preferred_model": "gemma-4-e2b | gemma-4-e4b | server-large"
}
```

### 5.2 Output schema

```json
{
  "decision": "allow | deny | downgrade",
  "model": "gemma-4-e2b | gemma-4-e4b | server-large",
  "quant": "q4_k_m | q5_k_m | q8_0 | fp16",
  "redaction_required": true,
  "data_egress_bytes": 0,
  "sources_allowed": ["channel:c_abc", "thread:t_def", "file:f_ghi"]
}
```

`decision = downgrade` means the request can run, but with a smaller model, a
stricter compute location, or a reduced source set. `data_egress_bytes` is `0`
when the call is fully on-device and is shown to the user via `PrivacyStrip`
before they run the action.

---

## 6. KApps object model

KApps are the structured objects produced and operated on by AI actions. They
are first-class records that show up as cards in chat, items in inboxes, and
rows in Base / Sheet views.

### 6.1 Core objects

**Task**

```
id, channel_id, source_thread_id, title, owner, due_date,
status, ai_generated, history[]
```

**Approval**

```
id, channel_id, template_id, requester, approvers[],
fields{}, status, decision_log[], source_thread_id
```

**Artifact**

```
id, channel_id, type (PRD | RFC | Proposal | SOP | QBR),
template_id, title, body, source_refs[],
versions[ { version, summary, body, source_pins[ { section_id,
source_message_id, source_thread_id, excerpt, sender } ] } ],
status (draft | in_review | published), source_thread_id, ai_generated,
published_card_id
```

**Form** (Phase 3)

```
id, channel_id, template_id, title,
fields { <name>: <value> }, source_thread_id,
status (draft | submitted), ai_generated
```

`FormTemplate` (seeded; not user-editable in Phase 3): `id, title,
fields[ { name, label, required } ]`. Phase 3 ships
`vendor_onboarding_v1`, `expense_report_v1`, and `access_request_v1`.

### 6.2 Events

KApps emit the following events via NATS JetStream:

- `task.created`, `task.updated`, `task.closed`
- `approval.submitted`, `approval.decisioned`
- `artifact.created`, `artifact.version_added`, `artifact.status_changed`
- `form.submitted`
- `base.row.updated`
- `sheet.summary.generated`

> **Phase 3 status.** Every event in this list (except `base.row.updated`
> and `sheet.summary.generated`, which belong to KApp surfaces that land
> in later phases) is recorded by `services/AuditService.Record` into
> the in-memory audit log and exposed via `GET /api/audit`. Phase 6+
> swaps the in-memory log for NATS JetStream durable streams; the
> renderer's `AuditLogPanel` reads from `GET /api/audit` either way.

### 6.3 Event consumers

Events feed into:

- **Chat cards** — KApp cards rendered inline in the originating thread.
- **Notifications** — per-user notification center and push.
- **Audit log** — immutable record in `audit-service`.
- **Knowledge graph** — links between tasks, approvals, artifacts, and threads.
- **AI suggestions** — context for future AI runs in the same channel.
- **Mobile task / approval inbox** — unified inbox surface on mobile.

---

## 7. Data and privacy architecture

The demo enforces eight core privacy rules across the frontend, gateway, and
inference path. They are not optional — every AI call and every KApp write must
satisfy all eight.

1. **Decrypt only on client where possible.** End-to-end-encrypted content is
   decrypted in the browser; the server stores ciphertext.
2. **Keep AI context channel-scoped.** AI calls only see sources from the
   current channel (and explicitly picked sources) — no cross-channel leakage.
3. **Show compute mode before running AI.** `PrivacyStrip` displays on-device
   vs. confidential server vs. shared server before the user confirms.
4. **Show sources before generation.** The user sees the exact list of channels,
   threads, files, and connectors that will be read.
5. **Show what data leaves the device.** `data_egress_bytes` from the policy
   engine is shown in the UI; on-device runs show `0`.
6. **Require human confirmation before writing tasks / approvals / artifacts.**
   AI never writes a KApp object directly — it proposes, the user confirms via
   `OutputReview`.
7. **Store immutable versions for approvals and published artifacts.** Every
   approval decision and published artifact version is written to the audit
   log and cannot be edited in place.
8. **Keep server plaintext out of logs.** Logs redact message bodies, artifact
   contents, and AI prompts/outputs; only structural metadata (IDs, sizes,
   model names, decisions) is logged.
