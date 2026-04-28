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
| Inference   | (Phase 1+) llama.cpp / Ollama / Unsloth Studio sidecar via Go inference proxy  |
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

## Project structure

```
slm-chat-demo/
├── backend/
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── api/
│   │   │   ├── router.go
│   │   │   ├── middleware.go
│   │   │   ├── handlers/        (chat, workspace, ai, kapps, artifacts*, model, privacy)
│   │   │   └── userctx/         (request-scoped user helpers)
│   │   ├── services/            (identity, workspace, chat, kapps)
│   │   ├── models/              (user, workspace, message, task, approval, artifact, event, card)
│   │   ├── inference/           (Adapter interface + MockAdapter)
│   │   └── store/               (memory store + Phase-0 seed)
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── app/                 (AppShell, B2CLayout, B2BLayout, TopBar, MobileTabBar, useMediaQuery)
│   │   ├── features/
│   │   │   ├── chat/            (ChatSurface, MessageList, MessageBubble, Composer)
│   │   │   ├── ai/              (PrivacyStrip, ActionLauncher)
│   │   │   ├── kapps/           (TaskCard, ApprovalCard, ArtifactCard, EventCard, KAppCardRenderer)
│   │   │   ├── artifacts/       (placeholder)
│   │   │   ├── ai-employees/    (placeholder)
│   │   │   └── knowledge/       (placeholder)
│   │   ├── stores/              (workspaceStore, chatStore*, aiStore*)
│   │   ├── api/                 (client, chatApi, aiApi, kappsApi*)
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
- 47 frontend tests, full backend test coverage of seed / store /
  middleware / chat / kapps / inference / ai handlers

## What's deferred to later phases

The architecture documents reference PostgreSQL, NATS JetStream, MinIO/S3,
Meilisearch, real local-model sidecars (Ollama / llama.cpp), SSE / WebSocket
streaming, the policy engine, AI Employees, connectors, and the knowledge
graph. Phase 0 is intentionally scoped to **the prototype shell, seeded
data, the shared card / privacy / launcher UI surfaces, and a mocked
inference adapter** — see [PHASES.md](./PHASES.md) for the full plan.
