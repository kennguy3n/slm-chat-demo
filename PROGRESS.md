# KChat SLM Demo — Progress Tracker

Last updated: 2026-04-28 (Phase 1 status row)

---

## Overall status summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Consolidated prototype foundation | Complete | 100% |
| Phase 1: Local LLM MVP | In progress | ~75% |
| Phase 2: B2C second-brain demo | Not started | 0% |
| Phase 3: B2B KApps MVP | Not started | 0% |
| Phase 4: AI Employees and recipe engine | Not started | 0% |
| Phase 5: Connectors and knowledge graph | Not started | 0% |
| Phase 6: Confidential server mode | Not started | 0% |

---

## Phase 0 — Consolidated prototype foundation

- [x] React app shell with B2C/B2B mode switching
- [x] Go backend skeleton with mock auth
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
- [x] Go inference proxy (adapter interface)
- [x] Ollama adapter
- [ ] llama.cpp / llama-server adapter
- [x] E2B routing (short/private/latency-sensitive tasks)
- [ ] E4B routing (reasoning-heavy tasks) — partial: router prefers E4B for `draft_artifact`/`prefill_approval`, but real E4B adapter wiring lands with the second Ollama tier
- [x] SSE streaming responses
- [ ] WebSocket streaming responses
- [x] Privacy strip with real compute location and model name (now driven by `/api/ai/route` decision)
- [x] B2C: Summarize unread chats
- [x] B2C: Smart reply generation
- [x] B2C: Inline translation
- [x] B2C: Task extraction from messages
- [x] B2B: Thread summarization
- [x] B2B: Task extraction from threads
- [ ] B2B: Approval prefill
- [ ] B2B: Draft short artifact section

---

## Phase 2 — B2C second-brain demo

- [ ] Inline translation under message bubbles
- [ ] AI task-created pills (inline badges)
- [ ] "Why suggested" explanations
- [ ] AI Memory page (learned facts, preferences, routines)
- [ ] Family checklist generation
- [ ] Shopping list with nudges ("Add sunscreen because field trip is tomorrow")
- [ ] Community event / RSVP card generation
- [ ] Guardrail rewrite card (risky post detection)
- [ ] Morning digest (multi-chat summary)
- [ ] Local-only memory index (IndexedDB)
- [ ] Metrics dashboard ("I handled 6 items this morning")

---

## Phase 3 — B2B KApps MVP

- [ ] Workspace → Domain → Channel navigation
- [ ] Thread view with linked objects
- [ ] KApp card renderer
- [ ] Tasks KApp (create, assign, track, close)
- [ ] Approvals KApp (submit, review, approve/reject, decision log)
- [ ] Docs/Artifacts KApp (PRD, RFC, Proposal, SOP, QBR)
- [ ] Forms intake (AI-prefilled from thread context)
- [ ] Artifact versioning (v1, v2, ... with diffs)
- [ ] Source pins (link artifact sections to source messages)
- [ ] Audit log (immutable event log)
- [ ] Human review gates (review before publish)
- [ ] Action Launcher integration (Create/Analyze/Plan/Approve)

---

## Phase 4 — AI Employees and recipe engine

- [ ] AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI)
- [ ] Allowed channels configuration per AI Employee
- [ ] Recipe registry
- [ ] Recipe: summarize
- [ ] Recipe: extract_tasks
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
| 2026-04-28 | Phase 1: B2B thread summarization (`POST /api/ai/summarize-thread`, `ThreadSummaryCard`) — same no-double-inference pattern as the digest; tier hint (E2B for short threads, E4B for long) included in the response so the privacy strip can show real routing. |
| 2026-04-28 | Phase 1: B2B task extraction from threads (`POST /api/kapps/tasks/extract`, `ThreadPanel` + reusable `TaskExtractionCard`) — replaces the Phase-3 stub with a real handler that returns owner / due-date / status / source-message provenance. |
| 2026-04-28 | Phase 1 status row bumped to ~75% (5 new B2C + B2B AI features end-to-end). New frontend types in `types/ai.ts`, new API clients in `api/aiApi.ts` and `api/kappsApi.ts`. |
