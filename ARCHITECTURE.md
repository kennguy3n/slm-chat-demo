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
│   ├── Inference Router (local / server decision)
│   ├── Ollama Adapter / Mock Adapter
│   ├── Model lifecycle (load / unload / status)
│   └── Privacy / policy engine
│       ↓ (HTTP to local sidecar)
├── llama-server (PrismML llama.cpp fork, default :8080) — preferred
└── Ollama daemon            (default :11434, fallback)
    └── Bonsai-1.7B GGUF (hf.co/prism-ml/Bonsai-1.7B-gguf)

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
| 6 | `ModelStatusBadge` | Active model (local / server), loaded state, battery. |
| 7 | `KAppCardRenderer` | Renders Task / Approval / Form / Artifact / Sheet / Base cards. |
| 8 | `ArtifactWorkspace` | PRD / RFC / proposal editor with citations and versions. |
| 9 | `AIEmployeePanel` | B2B AI Employee profile, queue, and channel assignments. |
| 10 | `DeviceCapabilityPanel` | RAM, WebGPU support, sidecar status, currently-loaded model. |
| 11 | `SourcePicker` | Three-tab picker (Channels / Threads / Files) that scopes which surfaces an AI Employee may read. |
| 12 | `OutputReview` | Human review gate that renders AI-generated content with Accept / Edit / Discard controls before any KApp write. |
| 13 | `ConnectorPanel` | B2B right-rail "Connectors" tab listing workspace connectors and per-channel attach status. |
| 14 | `PermissionPreview` | "AI will read from…" sheet rendered between `SourcePicker` confirm and dispatch with a `0 bytes will leave this device` badge. |
| 15 | `CitationChip` / `CitationRenderer` | Inline citation rendering: parses `[source:id]` markers and emits numbered chips plus a "Sources (N)" footer. |
| 16 | `KnowledgeGraphPanel` | B2B right-rail "Knowledge" tab with five collapsible sections (Decisions, Owners, Risks, Requirements, Deadlines). |
| 17 | `EgressSummaryPanel` | Total egress bytes, per-channel / per-model breakdowns, recent timeline, Reset. |
| 18 | `PolicyAdminPanel` | B2B right-rail "Policy" tab driving `GET / PATCH /api/workspaces/{id}/policy`. |

#### Module notes

- **`AIEmployeePanel`** hosts `QueueView` (pending recipe runs)
  beneath an inline budget editor that PATCHes
  `/api/ai-employees/{id}/budget` optimistically and rolls back on
  error. Completed recipe runs flow through `RecipeOutputGate` (a
  thin wrapper around `OutputReview`) so a human Accept / Edit /
  Discard always precedes any KApp write.
- **`SourcePicker`** surfaces selections as removable chips with
  Confirm / Cancel callbacks. The Files tab lists channel-attached
  connector files; it is wired into `ActionLauncher` for Create /
  Analyze / Plan intents and into `ArtifactDraftCard` via
  `pickedSources`.
- **`OutputReview`** supports an `allowEdit` flag so creation flows
  can edit before persisting and status transitions stay read-only.
- **`ConnectorPanel`** enforces the channel-scoped privacy boundary:
  only files from connectors attached to the active channel become
  pickable.
- **`KnowledgeGraphPanel`** renders each `KnowledgeEntity` with a
  title, description, source-message link
  (`#message-{sourceMessageId}`), confidence badge, optional actor
  pills (owners) and due-date chip (deadlines). `Extract` calls
  `POST /api/channels/{channelId}/knowledge/extract` and refreshes
  the list.
- **`EgressSummaryPanel`** reads from the `EgressTracker` singleton
  (`egress:summary` IPC); the TopBar "Egress" badge reads from the
  same `useEgressSummary` hook so both stay in sync.
- **`PolicyAdminPanel`** PATCHes only on dirty state and exposes
  toggles for `allowServerCompute`, `requireRedaction`,
  `maxEgressBytesPerDay`, and per-`TaskType` allow / deny lists.

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
│       ├── llamacpp.ts               (LlamaCppAdapter — talks to PrismML llama-server via SSE /completion)
│       ├── router.ts                 (PROPOSAL.md §2 scheduler — local / server)
│       ├── tasks.ts                  (smart-reply / translate / extract-tasks helpers)
│       ├── secondBrain.ts            (Phase 2: family checklist, shopping nudges, RSVP extraction)
│       ├── skill-framework.ts        (declarative SkillDefinition + runSkill executor + INSUFFICIENT refusal contract)
│       ├── search-service.ts         (SearchService interface + MockSearchService for trip planner)
│       ├── confidential-server.ts    (Phase 6 — ConfidentialServerAdapter)
│       ├── redaction.ts              (Phase 6 — RedactionEngine)
│       ├── egress-tracker.ts         (Phase 6 — EgressTracker singleton)
│       ├── skills/                   (Phase 2 — trip-planner, guardrail-rewrite)
│       ├── recipes/                  (Phase 4 — AI-Employee-scoped task wrappers)
│       │   ├── registry.ts
│       │   ├── summarize.ts
│       │   ├── extract-tasks.ts
│       │   ├── draft-prd.ts
│       │   ├── draft-proposal.ts
│       │   ├── create-qbr.ts
│       │   ├── prefill-approval.ts
│       │   └── index.ts              (barrel — registers all 6 canonical recipes)
│       └── bootstrap.ts              (pings Ollama; wires real vs. mock adapter set)
└── src/
    ├── app/                          (AppShell, B2CLayout, B2BLayout, TopBar, MobileTabBar)
    ├── features/
    │   ├── chat/                     (ChatSurface, ThreadPanel, MessageBubble, MessageList, Composer, launcherDispatch, translate-utils)
    │   ├── ai/                       (ActionLauncher, PrivacyStrip, DeviceCapabilityPanel, DigestCard, SmartReplyBar, TranslationCaption, TaskExtractionCard, ThreadSummaryCard, ApprovalPrefillCard, ArtifactDraftCard, TaskCreatedPill, MorningDigestPanel, GuardrailRewriteCard, MetricsDashboard, EgressSummaryPanel, AIEmployeeModeBadge, activityLog, useEgressSummary, formatEgressBytes; FamilyChecklistCard / ShoppingNudgesPanel / EventRSVPCard / TripPlannerCard files retained but no longer mounted by the bilingual B2C layout)
    │   ├── memory/                   (AIMemoryPage, memoryStore — Phase 2)
    │   ├── kapps/                    (KAppCardRenderer, TaskCard, ApprovalCard, ArtifactCard, EventCard, FormCard, TasksKApp, CreateTaskForm, CreateApprovalForm, AuditLogPanel, OutputReview)
    │   ├── artifacts/                (ArtifactWorkspace, ArtifactDiffView, SourcePin, lineDiff, sections — Phase 3)
    │   ├── ai-employees/             (AIEmployeeList, AIEmployeePanel, QueueView, RecipeOutputGate, recipeCatalog — Phase 4)
    │   └── knowledge/                (SourcePicker, ConnectorPanel, PermissionPreview, CitationChip, CitationRenderer, KnowledgeGraphPanel — Phase 5)
    ├── stores/                       (chatStore, aiStore, workspaceStore, kappsStore)
    ├── api/                          (client, aiApi, chatApi, kappsApi, workspaceApi, streamAI, aiEmployeeApi, recipeRunApi, electronBridge)
    ├── types/                        (chat, ai, kapps, workspace, aiEmployee, knowledge, electron.d.ts)
    ├── router.tsx
    ├── styles.css
    └── main.tsx
```

**Cross-tree responsibilities.** Phase 0 ships the `electron/` shell
(main + preload + IPC + TS inference port), the `app/` shell,
`features/chat/`, `features/ai/` (Privacy Strip + Action Launcher),
and `features/kapps/`. Feature directories tagged for later phases
contain placeholders that get fleshed out per the phase notes below.

`features/chat/translate-utils.ts` carries the shared
`shouldTranslate` predicate, the `translateQueryKey(messageId,
targetLanguage)` react-query key builder, and `pickTargetLanguage` —
used by both `MessageBubble` (per-message hook) and `MessageList`
(batch prefetch). `features/chat/launcherDispatch.ts` maps every B2B
Action Launcher path to a `kapps:launcher` CustomEvent the right-rail
`ThreadPanel` listens for.

`features/ai/PrivacyStrip` gained an expandable `whyDetails[]` list
in Phase 2 and a "Redaction" row in Phase 6 (rendered only for
confidential-server outputs). `features/ai/activityLog` records
`{ skillId, model, tier, itemsProduced, egressBytes, latencyMs }`
for every successful AI call; `MetricsDashboard` subscribes to it.

`features/memory/memoryStore.ts` opens IndexedDB
(`kchat-slm-memory` / `facts`) with an in-memory fallback for jsdom
/ SSR. The AI never auto-writes — every fact passes through the
`AIMemoryPage` UI.

`features/kapps/KAppCardRenderer` exposes an `onAction` callback
union and a `mode` prop; Phase 3 adds status transitions + inline
edit on `TaskCard`, approve / reject / comment with a confirmation
pane and decision-log timeline on `ApprovalCard`, `View` + version
history on `ArtifactCard`, and the `OutputReview` human-confirmation
gate (module #12).

`features/ai-employees/AIEmployeePanel` hosts an inline channel
picker, an inline budget editor, the recipe list, the `QueueView`
pending-AI-tasks panel, and the `RecipeOutputGate` human-approval
surface. `recipeCatalog.ts` is the renderer-side display map for
recipe ids; the executor lives in the Electron main process and the
renderer never imports the registry directly.

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
- A `preferredTier` (`local` | `server`) and a `taskType` so the
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
day-by-day itinerary, on-device) and `skills/guardrail-rewrite.ts`
(deterministic PII regex + SLM tone / unverified-claim review →
optional rewrite, on-device). The existing `tasks.ts` and `secondBrain.ts`
helpers honour the same `INSUFFICIENT` contract so the renderer can
treat refusals uniformly.

A session-scoped `frontend/src/features/ai/activityLog.ts` records
`{ id, timestamp, skillId, model, tier, itemsProduced, egressBytes,
latencyMs }` for every successful AI call. `MetricsDashboard`
subscribes to it and surfaces the per-day summary on the B2C
right-rail "Stats" tab.

### 2.5 Recipe Registry (Phase 4)

The Recipe Registry at
`frontend/electron/inference/recipes/registry.ts` is a second
registry that sits *above* the Skills Framework. It exists so the
Phase 4 AI Employees (Kara Ops, Nina PM, Mika Sales) can be bound
to a small, auditable set of named actions (`summarize`,
`extract_tasks`, `prefill_approval`, `draft_prd`,
`draft_proposal`, …) without duplicating the prompt / guardrail /
parser contracts already owned by skills or task helpers.

The split is deliberate:

- **Skills** (§2.4) are low-level inference contracts. They own
  prompt construction, `INSUFFICIENT` handling, pre- and
  post-inference guardrails, and output parsing. They know nothing
  about AI Employees, channels, or budgets.
- **Recipes** are higher-level, AI-Employee-scoped wrappers. Each
  one picks an existing task helper (`buildThreadSummary`,
  `runKAppsExtractTasks`, `buildDraftArtifact`, …), binds it to
  the caller's `{ channelId, threadId?, messages, aiEmployeeId }`
  context, and returns a uniform `RecipeResult`
  (`status: 'ok' | 'refused'`, `output`, `model`, `tier`,
  `reason`). They are the natural unit that the
  `AIEmployee.recipes[]` array references.

A `RecipeDefinition` declares `id`, `name`, `description`,
`taskType`, `preferredTier`, and an `execute(router, context)`
function. Recipes self-register into `RECIPE_REGISTRY` at module
load via `registerRecipe`; `getRecipe(id)` and `listRecipes()`
expose the registry to the dispatcher. The canonical dispatcher is
the `ai:recipe:run` IPC channel (see §3.3b): it looks the recipe
up by id, refuses recipes the caller's AI Employee is not
authorised for, **charges the AI Employee's daily token budget
before executing** by calling `POST /api/ai-employees/{id}/budget/increment`
with an estimate derived from the messages + recipe output shape
(refuses with `reason: 'budget exceeded'` on 429), and only then
delegates to `recipe.execute`. Authorisation is currently enforced
by passing the AI Employee's `allowedRecipes[]` through the request
payload (loaded from the Go backend in the renderer). The budget
gate falls open on transport errors so a broken proxy can't
hard-block a demo, but any 429 refusal is surfaced as a uniform
`RecipeResult` and never persists a KApp. The `RecipeOutputGate`
surface (§2.1 module #9) sits between a successful run and any
KApp write, giving the user a final Accept / Edit / Discard
before the output graduates from "recipe output" to a persisted
object.

Phase 4 ships six canonical recipes, all self-registered through
`recipes/index.ts`:

- `summarize` — wraps `buildThreadSummary`; advertises
  `preferredTier: 'local'`.
- `extract_tasks` — wraps `runKAppsExtractTasks`, preserves per-task
  source provenance through `sourceMessageId`, and returns a
  `refused` envelope for empty threads rather than throwing.
- `draft_prd` — wraps `buildDraftArtifact({ artifactType: 'PRD' })`
  with `preferredTier: 'local'`; returns `{ prompt, sources,
  threadId, channelId }` so the renderer streams the body via
  `ai:stream`.
- `draft_proposal` — same shape as `draft_prd` with
  `artifactType: 'Proposal'`.
- `create_qbr` — same shape as `draft_prd` with
  `artifactType: 'QBR'`; surfaces the wins / gaps / asks /
  next-quarter prompt.
- `prefill_approval` — wraps `runPrefillApproval`, advertises
  `preferredTier: 'local'`, and flattens the parsed
  `{ vendor, amount, risk, justification, sourceMessageIds }` fields
  into `RecipeResult.output` so the renderer can pin every field to
  the messages that justified it before a human confirms.

All six recipes refuse empty threads with `status: 'refused'`
instead of throwing, so the registry stays crash-safe under
partial data.

The renderer also ships a display-only catalogue in
`src/features/ai-employees/recipeCatalog.ts` — it maps recipe ids
to human-readable name + description strings so the
`AIEmployeePanel` can render assigned recipes consistently with
the Electron registry. The executor lives in the main
process; the renderer never imports the registry directly.

### 2.6 Performance optimizations

Three renderer-side optimizations cut redundant inference traffic on
the IPC bridge and keep AI surfaces responsive on slow CPU hosts.

- **Batched translation prefetch.** `MessageList` collects every
  visible message that needs translation (`shouldTranslate`) and
  fires a single `ai:translate-batch` IPC call. The handler runs N
  translations through one prompt and returns one `TranslateResponse`
  per item. While the batch is in flight the list seeds a `null`
  sentinel under `translateQueryKey(messageId, targetLanguage)` so
  per-message hooks in `MessageBubble` do not also fire their own
  `ai:translate` requests; on success the list writes each
  `TranslateResponse` into the cache.
- **Auto-run morning digest.** `MorningDigestPanel` runs the digest
  once on mount (via a `startedRef`-guarded `useEffect`) and caches
  the completed result under `DIGEST_CACHE_KEY` in react-query, so
  re-mounting the panel never restarts inference. In the redesigned
  bilingual B2C surface the same panel detects a partner-language
  channel (`channel.partnerLanguage`), switches its title to
  "Conversation summary", and uses a per-channel cache key so
  switching back to the bilingual chat doesn't refetch.
- **Bilingual B2C right rail.** `B2CLayout` collapsed its right-rail
  tabs to **Summary / Memory / Stats** in the redesign; the older
  family / shopping / event / trip components remain in
  `features/ai/` but are no longer mounted. The bilingual DM
  `ch_dm_alice_minh` is auto-selected on first mount of the layout
  so the demo opens directly into the translation flow.
- **Smart-reply IPC guard.** `frontend/src/api/aiApi.ts` exposes
  `waitForElectronAI(timeoutMs = 400)`; `fetchSmartReply` awaits it
  rather than calling `getElectronAI()` synchronously, closing the
  preload-race window where the first smart-reply call could fire
  before `window.electronAI` was attached.

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
| 7 | `retrieval-service` | Per-channel keyword indexing and term-overlap search; channel-scoped so no cross-channel leakage. |
| 8 | `connector-service` | Drive / OneDrive / GitHub mock connectors with channel-scoped attachment. |
| 8a | `knowledge-service` | Workspace knowledge graph (decision / owner / risk / requirement / deadline) extracted from channel messages. |
| 9 | `event-service` | NATS JetStream event publication and subscriptions. |
| 10 | `audit-service` | Immutable append-only event log for all KApp mutations; Phase 6 adds JSON / CSV export. |
| 11 | `policy-service` | Per-workspace AI compute policy backing the renderer's `PolicyAdminPanel`. |
| 12 | `encryption-service` | Per-tenant AES-256-GCM key management; physical encryption integration deferred to PostgreSQL phase. |
| 13 | `tenant-storage-service` | Per-tenant storage configuration (region, bucket, dedicated flag, encryption-key id). |

#### Service notes

- **`retrieval-service`** ships `services.RetrievalService` with
  `IndexChannel` (chunks every channel + thread message and
  connector file excerpt) and `Search` (whitespace tokenize +
  stopword filter + term-overlap score). User-scoped ACL filtering
  runs through `ConnectorService.CheckFileAccess` so a connector
  file with no entry for the requesting user produces zero hits.
- **`connector-service`** seeds `conn_gdrive_acme` on
  `ch_vendor_management` and `conn_onedrive_acme` on
  `ch_engineering`. `AttachToChannel`'s idempotency check runs
  inside the `UpdateConnector` callback under the store write lock
  so concurrent attaches with the same `channelId` cannot
  double-append.
- **`knowledge-service`**'s `ExtractEntities` scans a channel via
  `store.ListAllChannelMessages` and emits `KnowledgeEntity`
  records with `sourceMessageId` for thread attribution. Re-runs
  are idempotent — `ClearKnowledgeEntitiesForChannel` drops prior
  entities before re-emission.
- **`policy-service`** wraps the in-memory `WorkspacePolicy`
  (`AllowServerCompute`, `ServerAllowedTasks`, `ServerDeniedTasks`,
  `MaxEgressBytesPerDay`, `RequireRedaction`); `Update` stamps
  `UpdatedAt` / `UpdatedBy`. Default for `ws_acme`:
  `AllowServerCompute: false`, `RequireRedaction: true`.
- **`encryption-service`** exposes `GenerateKey`, `GetActiveKey`,
  `RotateKey` (demotes current to inactive and generates a
  successor), `ListKeys`. Keys are 32-byte random AES-256-GCM
  material kept in-memory; `EncryptStub` logs `would encrypt with
  key X` until real envelope encryption lands.
- **`tenant-storage-service`**'s `Get` / `Update` wrap
  `TenantStorageConfig { DatabaseRegion, StorageBucket, Dedicated,
  EncryptionKeyID }`; physical isolation is deferred to the
  PostgreSQL / S3 phase.

### 3.2 Directory structure

```
backend/
├── cmd/server/main.go            (boots the data API on :8080; no inference)
├── internal/
│   ├── api/
│   │   ├── router.go             (data routes only)
│   │   ├── middleware.go
│   │   ├── handlers/             (chat.go, workspace.go, kapps.go, privacy.go,
│   │   │                          artifacts.go, audit.go [Phase 3 + Phase 6 export],
│   │   │                          ai_employees.go [Phase 4],
│   │   │                          recipe_runs.go [Phase 4],
│   │   │                          connectors.go [Phase 5],
│   │   │                          retrieval.go [Phase 5],
│   │   │                          knowledge.go [Phase 5],
│   │   │                          policy.go [Phase 6],
│   │   │                          scim.go [Phase 6],
│   │   │                          encryption.go [Phase 6],
│   │   │                          tenant_storage.go [Phase 6])
│   │   ├── middleware_logging.go  [Phase 6 — StructuralLogger + SanitizeLogFields]
│   │   ├── middleware_sso.go      [Phase 6 — Authorization: Bearer SSO middleware]
│   │   └── userctx/              (request-scoped user helpers)
│   ├── services/                 (identity.go, workspace.go, chat.go, kapps.go,
│   │                              audit.go [Phase 3],
│   │                              ai_employees.go [Phase 4],
│   │                              recipe_runs.go [Phase 4],
│   │                              connectors.go [Phase 5],
│   │                              retrieval.go [Phase 5],
│   │                              knowledge.go [Phase 5],
│   │                              policy.go [Phase 6],
│   │                              encryption.go [Phase 6],
│   │                              tenant_storage.go [Phase 6])
│   ├── models/                   (user.go, workspace.go, message.go, task.go,
│   │                              approval.go, artifact.go, event.go, card.go,
│   │                              audit.go [Phase 3],
│   │                              ai_employee.go [Phase 4],
│   │                              recipe_run.go [Phase 4],
│   │                              connector.go [Phase 5],
│   │                              retrieval.go [Phase 5],
│   │                              knowledge.go [Phase 5],
│   │                              policy.go [Phase 6],
│   │                              sso.go [Phase 6],
│   │                              encryption.go [Phase 6],
│   │                              tenant_storage.go [Phase 6])
│   └── store/                    (memory.go + seed.go + seedAIEmployees;
│                                   Phase 6+ adds postgres.go)
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
> reachable the router wires a single Ollama adapter as the on-device tier,
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
GET    /api/ai-employees                                  (Phase 4)
GET    /api/ai-employees/{id}                             (Phase 4)
PATCH  /api/ai-employees/{id}/channels                    (Phase 4)
PATCH  /api/ai-employees/{id}/recipes                     (Phase 4)
GET    /api/ai-employees/{id}/queue                       (Phase 4)
POST   /api/ai-employees/{id}/queue                       (Phase 4)
PATCH  /api/ai-employees/{id}/budget                      (Phase 4 — { maxTokensPerDay })
POST   /api/ai-employees/{id}/budget/increment            (Phase 4 — { tokensUsed }; 429 on overrun)
GET    /api/connectors (?workspaceId=)                    (Phase 5)
GET    /api/connectors/{id}                               (Phase 5)
GET    /api/connectors/{id}/files                         (Phase 5)
POST   /api/connectors/{id}/channels                      (Phase 5 — { channelId })
DELETE /api/connectors/{id}/channels/{channelId}          (Phase 5)
GET    /api/channels/{channelId}/connector-files          (Phase 5)
POST   /api/channels/{channelId}/index                    (Phase 5 — chunks channel + thread messages + connector files)
GET    /api/channels/{channelId}/search?q=&topK=          (Phase 5 — keyword retrieval; channel-scoped, default topK=5)
POST   /api/channels/{channelId}/knowledge/extract        (Phase 5 — extract knowledge entities from channel messages)
GET    /api/channels/{channelId}/knowledge?kind=          (Phase 5 — list entities, optional kind filter: decision/owner/risk/requirement/deadline)
GET    /api/knowledge/{id}                                (Phase 5 — fetch a single KnowledgeEntity)
GET    /api/privacy/egress-preview
GET    /api/audit/export?format=json|csv                  (Phase 6 — same filters as /api/audit; emits Content-Disposition)
GET    /api/workspaces/{id}/policy                        (Phase 6 — WorkspacePolicy)
PATCH  /api/workspaces/{id}/policy                        (Phase 6)
GET    /api/workspaces/{id}/encryption-keys               (Phase 6)
POST   /api/workspaces/{id}/encryption-keys               (Phase 6 — generate)
POST   /api/workspaces/{id}/encryption-keys/rotate        (Phase 6)
GET    /api/workspaces/{id}/storage                       (Phase 6 — TenantStorageConfig)
PATCH  /api/workspaces/{id}/storage                       (Phase 6)
GET    /api/scim/v2/Users                                 (Phase 6 — SCIM v2; mounted outside MockAuth)
GET    /api/scim/v2/Users/{id}                            (Phase 6)
POST   /api/scim/v2/Users                                 (Phase 6)
PATCH  /api/scim/v2/Users/{id}                            (Phase 6)
DELETE /api/scim/v2/Users/{id}                            (Phase 6 — soft-deactivates: sets Active=false)
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
| `ai:smart-reply`       | `smartReply(req)`                         | `runSmartReply` in `tasks.ts` (`taskType: smart_reply`) |
| `ai:translate`         | `translate(req)`                          | `runTranslate` (`taskType: translate`) |
| `ai:translate-batch`   | `translateBatch(req)`                     | `runTranslateBatch` in `tasks.ts` — batch-translates N messages in a single prompt; returns one `TranslateResponse` per input item. Used by `MessageList` to prefetch all visible bubbles in one IPC round-trip instead of fanning out N per-bubble calls. |
| `ai:extract-tasks`     | `extractTasks(req)`                       | `runExtractTasks` (`taskType: extract_tasks`) |
| `ai:summarize-thread`  | `summarizeThread(req)`                    | `buildThreadSummary` (on-device Bonsai-1.7B) |
| `ai:unread-summary`    | `unreadSummary(req)`                      | `buildUnreadSummary` (`taskType: summarize`) |
| `ai:kapps-extract`     | `extractKAppTasks(req)`                   | `runKAppsExtractTasks` (B2B thread → tasks with provenance) |
| `ai:prefill-approval`  | `prefillApproval(req)`                    | `runPrefillApproval` (B2B thread → vendor / amount / risk / justification fields) |
| `ai:prefill-form`      | `prefillForm(req)`                        | `runPrefillForm` (B2B thread → arbitrary intake form fields per template) |
| `ai:draft-artifact`    | `draftArtifact(req)`                      | `buildDraftArtifact` (B2B thread → prompt + sources for streaming a PRD / RFC / Proposal / SOP / QBR section) |
| `ai:family-checklist`  | `familyChecklist(req)`                    | `runFamilyChecklist` in `secondBrain.ts` (B2C family chat → titled checklist with optional event focus) |
| `ai:shopping-nudges`   | `shoppingNudges(req)`                     | `runShoppingNudges` (B2C family chat + local shopping list → grounded item / reason pairs that dedupe against the existing list) |
| `ai:event-rsvp`        | `eventRSVP(req)`                          | `runEventRSVP` (B2C community chat → up to 4 events with title / when / location / RSVP-by) |
| `ai:trip-plan`         | `tripPlan(req)`                           | `runTripPlanner` in `skills/trip-planner.ts` — pulls weather / events / attractions from `MockSearchService`, reads `location` / `member` / `community-detail` AI Memory facts, and returns a structured day-by-day itinerary with per-item source attribution (on-device). |
| `ai:guardrail-check`   | `guardrailCheck(req)`                     | `runGuardrailRewrite` in `skills/guardrail-rewrite.ts` — combines a deterministic PII regex pre-pass with an SLM tone / unverified-claim review and returns `{ safe, findings, rewrite?, rationale }` (on-device). |
| `ai:recipe:run`        | `recipeRun(req)` (Phase 4)                | `runRecipe` in `electron/ipc-handlers.ts` — generic AI-Employee recipe dispatcher. Takes `{ recipeId, aiEmployeeId, channelId, threadId?, messages, allowedRecipes? }`, looks the recipe up in `RECIPE_REGISTRY` (`electron/inference/recipes/`), refuses when the AI Employee is not authorised for the recipe, and returns a uniform `RecipeResult` (`status: 'ok' | 'refused'`, `output`, `model`, `tier`, `reason`). Canonical recipes registered today (six, self-registered through `recipes/index.ts`): `summarize`, `extract_tasks`, `draft_prd`, `draft_proposal`, `create_qbr`, `prefill_approval`. |
| `ai:extract-knowledge` | `extractKnowledge(req)` (Phase 7)         | `runExtractKnowledge` in `skills/extract-knowledge.ts` — calls the router with `taskType: extract_tasks`, parses Bonsai-1.7B output (`<kind> \| <description> \| <actor> \| <due>` rows), and projects each row onto the existing `KnowledgeEntity` shape (`decision` / `owner` / `risk` / `requirement` / `deadline`). Refusal contract: `INSUFFICIENT: <reason>` returns an empty entity list. The renderer's `frontend/src/api/knowledgeApi.ts` prefers this IPC bridge and falls back to the regex extractor at `POST /api/channels/{id}/knowledge/extract` when `window.electronAI` is unavailable or the LLM call fails. |
| `model:status`         | `modelStatus()`                           | `OllamaAdapter.status()` (or stub when Ollama is offline) |
| `model:load`           | `loadModel(name)`                         | `OllamaAdapter.load()` |
| `model:unload`         | `unloadModel(name)`                       | `OllamaAdapter.unload()` |
| `egress:summary`       | `egressSummary()`                         | `globalEgressTracker.summary()` — returns totals, byChannel, byModel, recent entries |
| `egress:reset`         | `egressReset()`                           | `globalEgressTracker.reset()` — clears all recorded egress entries |

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
  Request (`TranslateRequest`): `{ messageId, channelId,
  targetLanguage?, original }`. Response (`TranslateResponse`):
  `{ messageId, channelId, original, translated, targetLanguage,
  model, computeLocation, dataEgressBytes }`.
- `ai:translate-batch` runs N translations in a single prompt and
  returns one `TranslateResponse` per input item. Request
  (`TranslateBatchRequest`): `{ items: TranslateRequest[] }`. Response
  (`TranslateBatchResponse`): `{ items: TranslateResponse[] }`. The
  renderer (`MessageList`) seeds the per-message react-query cache
  with a `null` sentinel under `translateQueryKey(messageId,
  targetLanguage)` while the batch is in flight so the per-bubble
  hook does not also fire its own `ai:translate` call, then writes
  each `TranslateResponse` into the cache on success.
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
   ├── LlamaCppAdapter   (frontend/electron/inference/llamacpp.ts)
   ├── OllamaAdapter     (frontend/electron/inference/ollama.ts)
   └── MockAdapter       (frontend/electron/inference/mock.ts)
   ↓  HTTP
   ├── llama-server (PrismML llama.cpp, default :8080)  — preferred
   └── Ollama       (default :11434)                    — fallback
        └── Bonsai-1.7B GGUF (hf.co/prism-ml/Bonsai-1.7B-gguf)
```

The `InferenceRouter` boots in `bootstrap.ts`, which probes the two
on-device runtimes in priority order:

1. **`LlamaCppAdapter`** — issues a 1.5 s `GET /health` to
   `LLAMACPP_BASE_URL` (default `http://localhost:8080`). The
   PrismML `llama.cpp` fork's `llama-server` speaks the Bonsai
   GGUF format natively, supports SSE streaming through
   `POST /completion`, and exposes `/props` for live model-path
   reporting. When this probe succeeds the adapter becomes the
   `local` destination and `model:status` reports `sidecar:
   running` with the resolved GGUF basename.
2. **`OllamaAdapter`** — fallback. Pings
   `OLLAMA_BASE_URL` (default `http://localhost:11434`) with a
   5 s timeout. The bootstrap binds the adapter to `MODEL_NAME`
   (default `bonsai-1.7b`); the alias is created by
   `scripts/setup-models.sh` from
   [`models/Modelfile.bonsai1_7b`](./models/Modelfile.bonsai1_7b),
   which wraps the upstream
   [`hf.co/prism-ml/Bonsai-1.7B-gguf`](https://huggingface.co/prism-ml/Bonsai-1.7B-gguf)
   GGUF with the demo's preferred temperature / top_p / context
   length / system prompt.
3. **`MockAdapter`** — final fallback. Returns `[MOCK]`-prefixed
   placeholder text so tests and offline demo work, but
   `DeviceCapabilityPanel` surfaces the degraded state.

`model:status` reports `model` / `loaded` / `ramUsageMB` so
`DeviceCapabilityPanel` can render the on-device status. Bonsai-1.7B
ships as a single GGUF, so there is no per-arch quant split to
manage — the same artifact runs on x86 CPU, ARM CPU, and Apple
Silicon. See [`docs/cpu-perf-tuning.md`](./docs/cpu-perf-tuning.md)
for CPU tuning details.

The router only distinguishes two destinations: `local` (the on-device
Bonsai-1.7B adapter — either `LlamaCppAdapter` or `OllamaAdapter`)
and `server` (the Phase 6 confidential server tier, gated on
explicit policy). Every non-server request goes to whichever local
adapter the bootstrap selected. The router records its decision
(model, tier, reason) and exposes it via `window.electronAI.route()`
so the privacy strip can show *why* a model was chosen.

This is the most reliable path and the one the demo defaults to. The
model runs locally via a sidecar process; the renderer never touches
the daemon directly — every AI call goes through the main process,
which is the single integration point for swapping in `llama.cpp`,
Unsloth Studio, or a confidential server runtime in later phases.
Works on any laptop with enough RAM for a ~1 GB GGUF model and does
not depend on browser GPU support.

### 4.1c Bonsai-1.7B prompt library (Phase 7)

Every B2B AI surface (thread summary, task extraction, approval
prefill, artifact drafting, knowledge extraction) used to inline its
own prompt-construction string and ad-hoc parser into `tasks.ts`,
which made it hard to tune the prompt for the 1.7B model class
without a parallel sweep through every parser. Phase 7 hoists prompt
construction and parsing into a dedicated module per task type under
[`frontend/electron/inference/prompts/`](./frontend/electron/inference/prompts/):

- `summarize.ts` — `buildSummarizePrompt(input) → string` and
  `parseSummarizeOutput(output) → { bullets }`.
- `extract-tasks.ts` — pipe-delimited `<owner> | <title> | <due>`
  rows.
- `prefill-approval.ts` — `<field>: <value>` lines for vendor /
  amount / risk / justification with extras captured in `extra`.
- `draft-artifact.ts` — section-aware Markdown prompt for PRD /
  RFC / Proposal / SOP / QBR.
- `extract-knowledge.ts` — `<kind> | <description> | <actor> |
  <due>` rows that map onto the existing `KnowledgeEntity` shape.

Every module follows the same conventions:

- System instructions stay under ~200 tokens to leave room for the
  rendered thread inside Bonsai-1.7B's 1024-token context window.
- Output is line-oriented, parser-friendly: pipe-delimited columns
  for tabular data, `key: value` lines for record data.
- Refusal is explicit: when the model has nothing useful to say it
  emits `INSUFFICIENT: <reason>`, which every parser interprets as
  an empty result (no hallucinated rows).
- Parsers are robust to extra whitespace, mixed bullet markers
  (`-`, `*`, `•`, `1.`), an optional `[MOCK]` prefix, and to a
  single missing trailing column.

`tasks.ts` now delegates to these helpers. The `MockAdapter` returns
`[MOCK]`-prefixed placeholder text so the same parsers still recover
field labels in test environments while making it obvious in
screenshots when the real LLM isn't running. Live-LLM tests are
gated behind `OLLAMA_INTEGRATION=1`.

### 4.1b Confidential server tier (Phase 6)

Phase 6 adds a third tier to the router. `ConfidentialServerAdapter`
(`frontend/electron/inference/confidential-server.ts`) implements the
same `Adapter` contract as `OllamaAdapter` but POSTs to a configurable
`CONFIDENTIAL_SERVER_URL` (default `http://localhost:8090`) instead of
the local Ollama daemon. Streams use NDJSON like the Ollama path; every
response carries `onDevice: false` so the renderer can flag the egress.

The router tracks server availability with a private `serverAdapter` slot
plus a `policyAllowsServer` flag. `decide()` selects the server tier when
the request explicitly asks for it (`req.tier === 'server'` or
`req.model` contains "confidential") AND `hasServer()` returns true
(both adapter wired AND policy allows). When either gate fails, the
router refuses with a clear reason — never a silent local fallback —
because PROPOSAL.md §4.3 requires the user to know whenever data is
about to leave the device.

`bootstrap.ts` pings `${url}/v1/health` on startup with a 500 ms timeout.
Probing is gated behind `CONFIDENTIAL_SERVER_POLICY=allow`; without that
env var the bootstrap skips the probe and the server tier stays
unavailable. The probe is wired through an injectable `pingServer`
override so unit tests can drive both reachable and unreachable
branches.

Before dispatching to the server, the router calls
`RedactionEngine.tokenize(prompt, policy)`. The wire prompt only ever
carries `[EMAIL_n]` / `[PHONE_n]` / `[SSN_n]` / `[NAME_n]` placeholders;
the original PII never leaves the device. The response is
`detokenize`d before being returned to the renderer, and stream deltas
are detokenized chunk-by-chunk. After every server-routed run / stream,
the router records an `EgressEntry` into `globalEgressTracker` with
`{ timestamp, taskType, egressBytes, redactionCount, model, channelId }`,
where `egressBytes` is the UTF-8 byte length of the tokenized prompt.

The `model:status` IPC reports `serverModel` / `serverAvailable` /
`serverUrl`; `DeviceCapabilityPanel` renders a "Confidential server"
sub-section behind that flag.

### 4.2 Browser-local path (future)

WebGPU inference where supported. Bonsai-1.7B's GGUF format is
already browser-shippable via llama.cpp's WebGPU backend, so running it
directly in the page is a capability target. It is not a main demo
dependency — the sidecar path stays primary because availability and performance
are too uneven across browsers and devices today.

### 4.3 Android mobile path (future)

- **Phase 1** — mobile web (PWA) talking to the same Go backend, with sidecar
  inference on a paired host or server runtime.
- **Phase 2** — React Native or native Android app, still talking to the Go
  backend; on-device inference via a bundled llama.cpp build.
- **Phase 3** — Android AICore / ML Kit GenAI Prompt API for direct on-device
  inference with no sidecar, using the system-managed model. The same
  two-tier routing contract carries over — Bonsai-1.7B stays the
  default model for both slots until a dedicated mobile-class model is
  available.

### 4.3b Android AICore bridge (Phase 6 — interface stub)

The future Android port targets Google AICore (ML Kit GenAI Prompt
API). To pin the contract before the port lands,
`frontend/electron/inference/aicore-bridge.ts` exports an
`AICoreBridge` interface that is a strict superset of the existing
`Adapter` (`name`, `run`, `stream`) plus three Android-specific
lifecycle hooks:

- `initialize(): Promise<void>` — installs / activates AICore (the
  Android shell calls this once on launch; on a real device it can
  trigger the AICore service install or the model download).
- `isAvailable(): Promise<AICoreCapabilities>` — returns
  `{ available, models, reason? }`. The Android settings screen polls
  this so users can see AICore status (installed, model-not-loaded,
  device-unsupported) just like the Electron build surfaces Ollama
  status today.
- `getSupportedModels(): Promise<string[]>` — the model list AICore
  currently has loaded. Empty array when AICore is not present.

The Electron build ships a `StubAICoreBridge` that throws
`"Android AICore not available in Electron"` from every method so
accidentally importing it in the desktop renderer fails loudly. The
React Native / native Android port replaces it with a real
implementation backed by an Expo / JSI module that calls the AICore
Java SDK.

---

## 5. AI policy engine

The AI policy engine runs on every AI call and decides which model to
use, where to run it, what to redact, and which sources are allowed.
It runs in the Electron main process — the renderer reaches it via
the `ai:route` IPC channel (returns the decision without executing
inference) and indirectly through `ai:run` / `ai:stream` (which
inline the policy decision before dispatch). The Go side does not
proxy AI traffic; it only persists the per-workspace `WorkspacePolicy`
behind `GET / PATCH /api/workspaces/{id}/policy`.

The policy is grounded in a **per-workspace `WorkspacePolicy`** persisted
on the Go side (`backend/internal/models/policy.go`,
`services.PolicyService`). The policy carries:

- `AllowServerCompute bool` — master switch for the confidential
  server tier.
- `ServerAllowedTasks []TaskType` — explicit allow-list of `TaskType`s
  that may dispatch to the server tier when the master switch is on.
- `ServerDeniedTasks []TaskType` — explicit deny-list (takes
  precedence over the allow-list).
- `MaxEgressBytesPerDay int64` — daily egress ceiling enforced against
  `EgressTracker.summary().totalBytes`.
- `RequireRedaction bool` — forces the `RedactionEngine` into the
  request path even if the workspace would otherwise opt out.
- `UpdatedAt` / `UpdatedBy` audit fields.

`PolicyService.Get(workspaceID)` and `PolicyService.Update(workspaceID,
patch)` back the `GET / PATCH /api/workspaces/{id}/policy` endpoints,
which the renderer's `PolicyAdminPanel` (B2B right-rail "Policy" tab)
calls. The default policy seeded for `ws_acme` has
`AllowServerCompute: false` and `RequireRedaction: true` — so the
on-device path remains the default, and admins must explicitly opt in
to the server tier per workspace.

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
  "preferred_model": "bonsai-1.7b | server-large"
}
```

### 5.2 Output schema

```json
{
  "decision": "allow | deny | downgrade",
  "model": "bonsai-1.7b | server-large",
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

### 5.3 Redaction engine (Phase 6)

`frontend/electron/inference/redaction.ts` implements the redaction
component of the policy engine. The `RedactionEngine` exposes three
operations: `tokenize` (reversible — replaces detected PII with
numbered placeholder tokens like `[EMAIL_1]` and stores a
`Record<token, original>` mapping), `redact` (non-reversible — replaces
detections with a flat `[REDACTED]` literal), and `detokenize`
(restores originals using the mapping). The engine ships built-in
patterns for emails, US phone numbers, SSN-shaped strings, and
two-word capitalized names; a `RedactionPolicy` lets callers turn each
category on or off independently and add `customPatterns` for tenant-
specific spans (e.g. account IDs).

The router (4.1b) is the only consumer: every server-routed run or
stream tokenizes the prompt before dispatch and detokenizes the
response on the way back. Because the response can shuffle token order
or interleave them with new text, `detokenize` walks the mapping in
descending token-length order so `[EMAIL_10]` is never accidentally
clobbered by a substring match against `[EMAIL_1]`. UTF-8 byte length
(`utf8ByteLength`) drives the egress-byte counter so reported bytes
match wire bytes — JS code units would over-count for multi-byte
content like Japanese.

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

**KnowledgeEntity** (Phase 5)

```
id, channel_id, thread_id, source_message_id,
kind (decision | owner | risk | requirement | deadline),
title, description, actors[], due_date,
status (open | resolved | accepted),
created_at, confidence
```

`KnowledgeEntity` is emitted by `services.KnowledgeService.ExtractEntities`
when the renderer (or an AI Employee recipe) hits
`POST /api/channels/{channelId}/knowledge/extract`. Each entity
references the `source_message_id` it was derived from so the
right-rail `KnowledgeGraphPanel` can link cards back to the
originating message via the `#message-{id}` anchor pattern. Re-running
extraction is idempotent — prior entities for the channel are dropped
before re-emission via `store.ClearKnowledgeEntitiesForChannel`.

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

### 7.1 Egress tracker (Phase 6)

`frontend/electron/inference/egress-tracker.ts` makes rule 5 auditable
in the UI. The `EgressTracker` is a process-wide singleton
(`globalEgressTracker`) that the router writes to on every server-
routed inference. Each `EgressEntry` carries
`{ timestamp, taskType, egressBytes, redactionCount, model, channelId }`,
where `egressBytes` is the UTF-8 byte length of the *tokenized* prompt
— i.e. the bytes that actually went on the wire, not the bytes the
user typed.

`summary()` returns a snapshot with running totals plus aggregated
breakdowns by channel and by model, and a newest-first `recent`
window (the last 100 entries). `reset()` clears the state, gated
behind an explicit user click in the panel. The tracker caps internal
storage at four times the recent window so a long-running session
doesn't grow unbounded.

The renderer reads via two new IPC channels — `egress:summary` and
`egress:reset` — exposed on the preload bridge as
`window.electronAI.egressSummary()` and `egressReset()`. The
`EgressSummaryPanel` component renders a prominent "0 B" zero-state
when the tracker is empty (the privacy-positive default), then totals
+ per-channel + per-model + a recent-activity timeline + a Reset
button when populated. The TopBar's existing "Egress" badge now reads
from the live tracker via `useEgressSummary` instead of the previous
hardcoded `0 B`.

### 7.2 No-content logging (Phase 6)

Rule 4 ("structural metadata only") is enforced by the new logging
shim that lands in Phase 6.

On the Go side, `backend/internal/api/middleware_logging.go` ships a
`StructuralLogger` middleware that runs after `MockAuth` /
`SSOAuth`. For every HTTP request it logs only `method`, `path`,
`status`, `bytes`, `latency`, `reqID`, `userID` — never the request
body, never the response body. The same file exports
`SanitizeLogFields(map[string]any) map[string]any`, a helper that
strips known sensitive keys (`body`, `content`, `prompt`, `output`,
`fields`, `text`, `messages`, `chunk`, …) before any structured
`log.Printf` call. Services that choose to log details about an
operation are expected to pipe their `details` map through
`SanitizeLogFields` first — `audit.Record` already does, and any
future service handler that wants to log structured context should
follow suit.

On the Electron side, `frontend/electron/inference/logging.ts`
exports a parallel pair: `sanitizeForLog(obj)` (same redaction set
plus `messages` / `chunk`) and `logInference(label, meta)` which
sanitises before printing through `console.log`. The IPC layer and
the inference router run every debug print through them so prompts
and outputs never appear in the main-process log, even when the
operator runs Electron with `--inspect` or attaches a debugger.

Together these guarantee that even if log shipping is misconfigured
or someone tails `kubectl logs` over a coffee, the surface area of
the leak is bounded to operational metadata.
