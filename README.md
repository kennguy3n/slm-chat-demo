# KChat SLM Demo

KChat SLM Demo is a **React + Go** chat demo that proves the AI features
inside KChat can run on-device using quantized local small language models
(Gemma 4 E2B / E4B), falling back to a confidential server only when
workspace policy explicitly allows it.

The demo runs the **same product surface in two contexts**:

- **B2C** — personal chats, family groups, community groups, on-device AI
  memory, smart reply, inline translation, task extraction, RSVP cards.
- **B2B** — workspace / domain / channel collaboration with KApps, AI
  employees, approvals, artifacts (PRD / RFC / SOP / QBR), and
  human-reviewable AI output anchored to the chat thread that produced it.

For the full product thesis, architecture, phasing, and progress, see:

- [PROPOSAL.md](./PROPOSAL.md) — product vision and "one shell, two contexts"
  design
- [ARCHITECTURE.md](./ARCHITECTURE.md) — React frontend, Go services, AI
  policy engine, KApps object model
- [PHASES.md](./PHASES.md) — seven-phase delivery plan (Phase 0 → Phase 6)
- [PROGRESS.md](./PROGRESS.md) — per-phase task tracker

## Tech stack

| Layer       | Stack                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Frontend    | React + TypeScript + Vite, TanStack Router / Query, Zustand, Vitest + RTL      |
| Backend     | Go 1.25 + chi router + chi/cors, in-memory store, standard `net/http/httptest` |
| Inference   | Go inference proxy with `MockAdapter` and `OllamaAdapter` (Phase 1); router selects E2B / E4B per task. llama.cpp / Unsloth Studio adapters land in later phases. |
| Persistence | (Phase 0) in-memory; (Phase 6+) PostgreSQL + NATS JetStream + MinIO/S3         |

## Quick start

```bash
# 1) Backend (Go API on :8080)
cd backend
go run ./cmd/server

# 2) Frontend (Vite dev server on :5173, proxies /api -> :8080)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Use the **B2C / B2B** button in the top bar to
switch between the consumer and business shells. The sidebar lists seeded
chats; click a chat to view its messages.

### Optional: run with a real local model (Ollama)

The backend auto-detects an Ollama daemon on `http://localhost:11434` (or
`OLLAMA_BASE_URL`). When it's reachable, the inference router wires Ollama
as the E2B and E4B adapter; otherwise it falls back to the bundled
`MockAdapter` so the demo always works.

```bash
# Pull the demo model and start the daemon.
ollama pull gemma-4-e2b
ollama serve &

# (Optional) point the backend at a non-default URL.
export OLLAMA_BASE_URL=http://localhost:11434

cd backend && go run ./cmd/server
```

The **Local model** panel in the right sidebar (`DeviceCapabilityPanel`)
polls `/api/model/status` (which queries Ollama's `/api/ps` for models
*currently resident in memory*, not `/api/tags`) and exposes Load /
Unload buttons. Load issues a small `/api/generate` request to warm the
model; Unload posts `/api/generate` with `keep_alive=0` to evict it
from memory without deleting the GGUF from disk.

## Project structure

```
slm-chat-demo/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── router.go
│   │   │   ├── middleware.go
│   │   │   ├── handlers/        (chat, workspace, ai, ai_summary, kapps, artifacts*, model, privacy)
│   │   │   └── userctx/         (request-scoped user helpers)
│   │   ├── services/            (identity, workspace, chat, kapps)
│   │   ├── models/              (user, workspace, message, task, approval, artifact, event, card)
│   │   ├── inference/           (Adapter interface, MockAdapter, OllamaAdapter, InferenceRouter)
│   │   └── store/               (memory store + Phase-0 seed)
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── app/                 (AppShell, B2CLayout, B2BLayout, TopBar, MobileTabBar, useMediaQuery)
│   │   ├── features/
│   │   │   ├── chat/            (ChatSurface, MessageList, MessageBubble, Composer)
│   │   │   ├── ai/              (PrivacyStrip, ActionLauncher, DeviceCapabilityPanel, DigestCard)
│   │   │   ├── kapps/           (TaskCard, ApprovalCard, ArtifactCard, EventCard, KAppCardRenderer)
│   │   │   ├── artifacts/       (placeholder)
│   │   │   ├── ai-employees/    (placeholder)
│   │   │   └── knowledge/       (placeholder)
│   │   ├── stores/              (workspaceStore, chatStore*, aiStore*)
│   │   ├── api/                 (client, chatApi, aiApi, streamAI, kappsApi*)
│   │   ├── types/               (chat, ai, kapps, workspace)
│   │   ├── router.tsx
│   │   ├── styles.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
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
# Frontend (Vitest + React Testing Library + jsdom)
cd frontend
npm test

# Backend (Go's standard `testing` + `net/http/httptest`)
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
- **Local inference adapter interface** + `MockAdapter` returning canned
  responses for `summarize`, `translate`, `extract_tasks`, `smart_reply`,
  `prefill_approval`, `draft_artifact` — wired into `POST /api/ai/run`
  and `POST /api/ai/route` (the latter returns the hardcoded Phase-0
  policy: allow / E2B / on-device / 0 egress)
- Go HTTP API on `:8080` with chi router, chi/cors, JSON content-type, and
  a mock-auth middleware that injects a user from the `X-User-ID` header
- Five seeded users (Alice, Bob, Carol, Dave, Eve) and two workspaces
  (Personal, Acme Corp with Engineering / Finance domains)
- Realistic seed messages backing the demo flows in PROPOSAL.md section 5
  plus four seeded KApp cards (family task, neighborhood event, vendor
  approval, engineering PRD draft)
- 63 frontend tests, full backend test coverage of seed / store /
  middleware / chat / kapps / inference / ai handlers / SSE streaming /
  router decisions / unread-summary / model load / unload

## Phase 1 — what's in progress

- **Ollama HTTP adapter** (`backend/internal/inference/ollama.go`) talking
  to a local daemon at `http://localhost:11434` (configurable via
  `OLLAMA_BASE_URL`); falls back to the `MockAdapter` when the daemon is
  unreachable so `go run` always works.
- **Inference router** (`backend/internal/inference/router.go`)
  implementing PROPOSAL.md §2's scheduler rule: short / private /
  latency-sensitive tasks (`summarize`, `translate`, `extract_tasks`,
  `smart_reply`) route to E2B; reasoning-heavy tasks (`draft_artifact`,
  `prefill_approval`) prefer E4B with a fallback to E2B when no E4B
  adapter is available. The router exposes its decision (model, tier,
  reason) so the privacy strip can show *why* a model was chosen.
- **SSE streaming** on `POST /api/ai/stream` (`Content-Type:
  text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
  with a matching browser client (`frontend/src/api/streamAI.ts`) that
  reads `data: {...}` frames out of the `fetch` `ReadableStream` and
  exposes an `AbortController` for cancellation.
- **Live model status panel** (`DeviceCapabilityPanel`,
  ARCHITECTURE.md module #10): polls `/api/model/status` every 10 s and
  surfaces model name, loaded/unloaded badge, quant level, model RAM
  usage, sidecar state, plus device RAM and WebGPU support; Load /
  Unload buttons hit `/api/model/load` and `/api/model/unload`.
- **B2C "Catch me up" digest** end-to-end:
  `GET /api/chats/unread-summary` collects recent B2C messages, runs
  them through the inference router with `taskType: summarize`, and
  returns the AI digest plus source back-links. The frontend wires
  `ActionLauncher` → `streamAITask` → `DigestCard` → `PrivacyStrip` so
  the digest streams in token-by-token and renders source pins +
  privacy metadata once complete.

## What's deferred to later phases

The architecture documents reference PostgreSQL, NATS JetStream, MinIO/S3,
Meilisearch, additional local-model sidecars (llama.cpp / llama-server,
Unsloth Studio), WebSocket streaming, the full policy engine, AI
Employees, connectors, and the knowledge graph. See
[PHASES.md](./PHASES.md) for the full plan and
[PROGRESS.md](./PROGRESS.md) for the current per-task tracker.
