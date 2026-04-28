# KChat SLM Demo — Progress Tracker

Last updated: 2026-04-28

---

## Overall status summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Consolidated prototype foundation | In progress | ~50% |
| Phase 1: Local LLM MVP | Not started | 0% |
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
- [ ] Shared card system (TaskCard, ApprovalCard, ArtifactCard, EventCard)
- [ ] Privacy strip component
- [ ] AI action launcher (B2C: Catch me up, Translate, Remind; B2B: Create, Analyze, Plan, Approve)
- [ ] Local inference adapter interface (mocked responses)
- [ ] Mobile-responsive layout (bottom tabs: Message, Notification, Tasks, Settings, More)
- [x] Web layout (sidebar + main chat + right panel)

---

## Phase 1 — Local LLM MVP

- [ ] Local model status panel (model name, loaded/unloaded, memory usage)
- [ ] Go inference proxy (adapter interface)
- [ ] Ollama adapter
- [ ] llama.cpp / llama-server adapter
- [ ] E2B routing (short/private/latency-sensitive tasks)
- [ ] E4B routing (reasoning-heavy tasks)
- [ ] SSE streaming responses
- [ ] WebSocket streaming responses
- [ ] Privacy strip with real compute location and model name
- [ ] B2C: Summarize unread chats
- [ ] B2C: Smart reply generation
- [ ] B2C: Inline translation
- [ ] B2C: Task extraction from messages
- [ ] B2B: Thread summarization
- [ ] B2B: Task extraction from threads
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
| 2026-04-28 | Phase 0: Added React app shell with B2C/B2B switching, Go backend with mock auth, seeded demo data, and three-column web layout. |
