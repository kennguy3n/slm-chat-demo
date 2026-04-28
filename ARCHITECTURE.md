# Architecture

This document describes the technical architecture of the SLM Chat demo: a chat-first
B2C/B2B surface with on-device and confidential-server small-language-model (SLM)
inference, AI-driven KApps (tasks, approvals, forms, artifacts), and a Go control
plane.

The demo is structured as a React frontend talking to a Go API gateway, which fans
out to chat, KApps, artifact, AI policy, AI runtime, retrieval, connector, event,
and audit services. Inference happens locally via a llama.cpp / Ollama / Unsloth
sidecar by default, with WebGPU and Android AICore as future paths.

---

## 1. System overview

```
React Web / Mobile Web
├── Chat UI, Thread UI, AI Action Launcher, KApp Cards
├── Artifact Workspace, Privacy Strip
├── Device Capability Inspector, Local Model Control Panel
    ↓
Go API Gateway
├── Auth/Session, Workspace/Tenant, Chat/Thread
├── KApps, Artifact, Approval Workflow
├── AI Scheduler/Policy Engine, Local Inference Proxy
├── Connector, Knowledge/Retrieval, Event Bus Publisher
    ↓
├── PostgreSQL, NATS JetStream, MinIO/S3
├── Meilisearch/Bleve, Local vector/keyword index
└── llama.cpp / Ollama / Unsloth Studio
```

The frontend is a single React app that can render two layouts (B2C and B2B) on
top of a shared `AppShell`. The Go gateway is the single entry point for REST,
WebSocket, and SSE traffic; it owns auth/session, applies the AI policy engine
on every AI call, and proxies inference to the local sidecar (or a confidential
server runtime) based on policy. Persistent state lives in PostgreSQL; events
flow through NATS JetStream; binary artifacts go to MinIO/S3; retrieval uses
Meilisearch or Bleve plus a local vector/keyword index. SLMs run via
llama.cpp / Ollama / Unsloth Studio.

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
| 12 | `OutputReview` | Human review of AI output before publishing or writing. |

### 2.2 Frontend stack

- React + TypeScript
- Vite
- TanStack Router
- TanStack Query
- Zustand or Jotai (local state)
- Tiptap / ProseMirror (artifact editor)
- TanStack Table (Base / Sheet KApps)
- WebSocket / SSE for streaming AI output
- IndexedDB for local cache (chat, artifacts, model metadata)
- Service Worker for offline demo mode

### 2.3 Component tree

The frontend lives under a top-level `frontend/` directory (Vite + TypeScript)
so it can be built and tested independently of the Go backend:

```
frontend/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── app/ (AppShell.tsx, B2CLayout.tsx, B2BLayout.tsx, TopBar.tsx)
    ├── features/
    │   ├── chat/ (ChatSurface, MessageBubble, MessageList, Composer)        — Phase 0
    │   ├── ai/ (ActionLauncher, PrivacyStrip, ModelStatusBadge, OutputReview, DeviceCapabilityPanel) — Phase 1+
    │   ├── kapps/ (KAppCardRenderer, TaskCard, ApprovalCard, ArtifactCard, FormCard) — Phase 3
    │   ├── artifacts/ (ArtifactWorkspace)                                    — Phase 3
    │   ├── ai-employees/ (AIEmployeePanel)                                   — Phase 4
    │   └── knowledge/ (SourcePicker)                                         — Phase 5
    ├── stores/ (chatStore, aiStore, workspaceStore)
    ├── api/ (client, aiApi, chatApi, kappsApi)
    ├── types/ (chat, ai, kapps, workspace)
    ├── router.tsx
    ├── styles.css
    └── main.tsx
```

Phase 0 ships the `app/` shell and the `features/chat/` chat surface; the
remaining feature directories contain placeholder modules that get fleshed
out in the phases noted above.

---

## 3. Go backend services

### 3.1 Services

| # | Service | Responsibility |
| -- | -- | -- |
| 1 | `api-gateway` | REST / WebSocket / SSE, auth, rate limits, request fan-out. |
| 2 | `identity-service` | Users, sessions, tenants, workspace membership. |
| 3 | `workspace-service` | Workspace, domain, channel, role metadata. |
| 4 | `chat-service` | Messages, threads, reactions, attachments. |
| 5 | `kapps-service` | Tasks, approvals, forms, base rows, sheet metadata. |
| 6 | `artifact-service` | Docs / PRDs / RFCs / proposals, versions, citations. |
| 7 | `ai-policy-service` | Computes allowed model and compute location for each AI call. |
| 8 | `ai-runtime-service` | Talks to llama.cpp / Ollama / Unsloth or a server model. |
| 9 | `retrieval-service` | Local + source retrieval, citations, chunking. |
| 10 | `connector-service` | Drive / OneDrive / Jira, with permission preview. |
| 11 | `event-service` | NATS JetStream event publication and subscriptions. |
| 12 | `audit-service` | Immutable event log for approvals and artifacts. |

### 3.2 Directory structure

```
backend/
├── cmd/server/main.go
├── internal/
│   ├── api/
│   │   ├── router.go
│   │   ├── middleware.go
│   │   ├── handlers/   (chat.go, workspace.go, ai.go, kapps.go, artifacts.go, model.go, privacy.go)
│   │   └── userctx/    (request-scoped user helpers; avoids handlers ↔ api import cycle)
│   ├── services/       (identity.go, workspace.go, chat.go; Phase 1+ adds ai_policy.go, ai_runtime.go, kapps.go, artifacts.go)
│   ├── models/         (user.go, workspace.go, message.go; Phase 3 placeholders: task.go, approval.go, artifact.go)
│   ├── inference/      (adapter.go interface; Phase 1+ adds ollama.go, llamacpp.go, router.go)
│   └── store/          (memory.go + seed.go; Phase 6+ adds postgres.go and migrations/)
└── go.mod
```

> **Phase 0 status.** The Go backend currently uses an **in-memory store**
> (`internal/store/memory.go`) seeded at startup by `internal/store/seed.go`.
> **PostgreSQL is not yet integrated**, and **NATS JetStream**, **MinIO/S3**,
> and **Meilisearch** are referenced in this document but do not yet exist
> in the codebase. They land in later phases per [PHASES.md](./PHASES.md):
> persistent state in Phase 3+, NATS / artifact storage / search around
> Phases 3–5, confidential server compute in Phase 6.

### 3.3 HTTP API

```
POST /api/ai/route, /api/ai/run, /api/ai/stream
POST /api/kapps/tasks/extract, /api/kapps/approvals/prefill
POST /api/artifacts/draft, /api/artifacts/publish
GET  /api/model/status
POST /api/model/load, /api/model/unload
GET  /api/privacy/egress-preview
```

- `POST /api/ai/route` — runs the AI policy engine and returns the chosen model,
  compute location, and redaction requirements without executing inference.
- `POST /api/ai/run` — runs inference synchronously and returns the full output.
- `POST /api/ai/stream` — runs inference and streams tokens via SSE / WebSocket.
- `POST /api/kapps/tasks/extract` — extracts task candidates from a thread.
- `POST /api/kapps/approvals/prefill` — prefills an approval template from a thread.
- `POST /api/artifacts/draft` — drafts a PRD / RFC / proposal from sources.
- `POST /api/artifacts/publish` — publishes an artifact version and emits a card.
- `GET /api/model/status` — current loaded model, quant, RAM usage, sidecar state.
- `POST /api/model/load` / `unload` — load or unload a local model variant.
- `GET /api/privacy/egress-preview` — bytes that would leave the device for a
  proposed AI call, with source breakdown.

---

## 4. Local inference design

### 4.1 Web demo path (primary)

```
React (browser) ──SSE/WebSocket──▶ Go backend (localhost or hosted)
                                    └─▶ llama-server / Ollama / Unsloth Studio
                                          └─▶ Gemma 4 E2B / E4B GGUF
```

This is the most reliable path and the one the demo defaults to. The model runs
locally via a sidecar process; the UI is a normal browser app talking to the Go
gateway over SSE/WebSocket. Works on any laptop with enough RAM for E2B/E4B and
does not depend on browser GPU support.

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
template_id, source_refs[], versions[], status, published_card_id
```

### 6.2 Events

KApps emit the following events via NATS JetStream:

- `task.created`, `task.updated`
- `approval.submitted`, `approval.decisioned`
- `artifact.drafted`, `artifact.published`
- `form.submitted`
- `base.row.updated`
- `sheet.summary.generated`

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
