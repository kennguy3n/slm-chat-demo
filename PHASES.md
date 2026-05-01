# Phased delivery plan

This document captures the phased delivery plan for the SLM chat demo, taking it from a static click-through prototype to a privacy-preserving, locally-inferred AI messaging product with B2C and B2B surfaces.

Each phase has a goal, a list of deliverables, and explicit exit criteria. The implementation priority timeline at the end of the document maps the first 90 days of work onto these phases.

---

## Phase 0 — Consolidated prototype foundation

**Goal:** Replace static click-throughs with one Electron desktop demo
(React renderer, Electron main-process inference, optional Go data API).

**Deliverables:**

- Electron shell hosting the React renderer (`frontend/electron/`)
- React app shell for B2C and B2B modes
- Go data-only backend with mock auth, mock users, mock workspaces
- Seeded demo data from current B2C/B2B prototypes
- Shared card system (task, approval, artifact, event cards)
- Privacy strip component
- Basic AI action launcher
- Local inference adapter interface in the Electron main process (first
  runs mocked)

**Exit criteria:** User can switch between B2C and B2B demo modes and trigger mocked AI flows with realistic cards.

---

## Phase 1 — Local LLM MVP

**Goal:** Prove efficient local AI with Bonsai-1.7B
(`prism-ml/Bonsai-1.7B-gguf`) as the single on-device model. Two
runtimes are supported with priority order: `llama-server` from the
PrismML `llama.cpp` fork (preferred) and an Ollama daemon (fallback).

**Deliverables:**

- Local model status panel (loaded/unloaded, model name, memory usage)
- Electron main-process inference adapters: `LlamaCppAdapter` (PrismML
  `llama-server`, primary) and `OllamaAdapter` (fallback). `MockAdapter`
  remains the offline fallback for tests.
- On-device routing for all non-server tasks (the router only distinguishes `local` vs. `server`)
- Streaming responses over IPC (`ai:stream` + chunk events)
- Privacy strip with real model name and compute location
- B2C AI: summarize unread, smart reply, translate, extract task
- B2B AI: summarize thread, extract tasks, prefill approval, draft short artifact section

**Exit criteria:** React UI streams real local model output through Go, with on-device routing and visible privacy state.

---

## Phase 2 — KChat B2C bilingual chat demo

**Goal:** Make B2C feel like native AI messaging, not a separate assistant.

**Deliverables:**

- Inline bilingual translation card under every message bubble
  (per-panel language flags, viewer-language emphasis)
- AI task-created pills
- "Why suggested" explanations
- AI Memory page (local IndexedDB; 0 B egress)
- Bilingual conversation summary panel (right-rail Summary tab)
- Smart-reply bar in the composer
- Guardrail rewrite card
- Local-only memory index

**Exit criteria:** A user can run the bilingual chat journey
(Alice 🇺🇸 ↔ Minh 🇻🇳) entirely on-device — every translation,
summary, and smart-reply call hits the local model.

---

## Phase 3 — KChat B2B KApps MVP

**Goal:** Implement the core B2B productivity loop.

**Deliverables:**

- Workspace → Domain → Channel navigation
- Threads
- KApp card renderer
- Tasks KApp
- Approvals KApp
- Docs/Artifacts KApp
- Forms intake
- Artifact versioning
- Source pins
- Audit log
- Human review gates

**Exit criteria:** A team can turn a channel thread into tasks, an approval, and a PRD artifact, all linked back to the source thread.

---

## Phase 4 — AI Employees and recipe engine

**Goal:** Move from assistant actions to scoped AI coworkers.

**Deliverables:**

- AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI)
- Allowed channels configuration
- Recipe registry: summarize, extract_tasks, draft_prd, draft_proposal, create_qbr, prefill_approval
- Queue view
- Budget controls
- Human approval before publish
- Auto vs Inline mode badges

**Exit criteria:** Kara Ops AI can receive a channel-scoped task, run locally when allowed, produce a cited output, and wait for human approval.

---

## Phase 5 — Connectors and knowledge graph

**Goal:** Ground AI in real sources without breaking privacy.

**Deliverables:**

- Google Drive or OneDrive connector
- Channel-scoped connector attachment
- Permission preview
- Source picker
- Per-channel retrieval index
- Knowledge graph: decisions, owners, risks, requirements, deadlines
- Citation rendering in AI outputs
- Connector ACL sync

**Exit criteria:** AI can answer and draft from connected docs only when the channel is allowed to access those docs, with citations.

---

## Phase 6 — Confidential server mode and enterprise hardening

**Goal:** Support high-complexity workloads without abandoning the privacy promise.

**Deliverables:**

- Confidential server mode (`ConfidentialServerAdapter`, three-tier router, NDJSON streaming, bootstrap probe gated on `CONFIDENTIAL_SERVER_POLICY=allow`)
- Redaction / tokenization before egress (`RedactionEngine` with reversible `tokenize` / `detokenize` + non-reversible `redact`; PII categories: emails, phones, SSNs, two-word names, custom patterns)
- Data egress summary (`EgressTracker` singleton + `egress:summary` / `egress:reset` IPC + `EgressSummaryPanel` + live TopBar badge)
- No-content logging (`StructuralLogger` middleware + `SanitizeLogFields` on the Go side; `sanitizeForLog` / `logInference` on the Electron main side)
- Policy admin controls (`WorkspacePolicy` model, `PolicyService`, `GET / PATCH /api/workspaces/{id}/policy`, `PolicyAdminPanel` mounted in the B2B right-rail "Policy" tab)
- Audit exports (`GET /api/audit/export?format=json|csv` with Content-Disposition headers; `AuditLogPanel` "Export JSON" / "Export CSV" buttons)
- SSO / SCIM (stub `SSOAuth` middleware decoding base64 `Authorization: Bearer` payloads with email-domain validation; SCIM v2 user provisioning at `/api/scim/v2/Users` — List / Get / Create / Patch / Delete)
- Per-tenant encryption keys (`TenantEncryptionKey` + `EncryptionKeyService` with `GenerateKey` / `GetActiveKey` / `RotateKey` / `ListKeys`; AES-256-GCM 32-byte material; HTTP surface under `/api/workspaces/{id}/encryption-keys`)
- Optional dedicated DB / storage / region (`TenantStorageConfig` + `TenantStorageService`; `GET / PATCH /api/workspaces/{id}/storage`; physical isolation deferred to the PostgreSQL phase)
- Android native local inference path (`AICoreBridge` interface + `StubAICoreBridge` in `frontend/electron/inference/aicore-bridge.ts`; the contract the React Native / native Android port will implement against Google AICore / ML Kit GenAI)

**Exit criteria:** Workspace admins can define which AI tasks run on-device, which may use confidential server compute, and which are refused.

---

## Phase 8 — B2C ground-zero LLM redesign

**Goal:** Strip every mock-coupled B2C surface so the demo can only
showcase real on-device LLM behaviour, then re-anchor the right
rail around a new LLM-driven Insights tab.

**Deliverables:**

- Deletion of the mock-only B2C second-brain components
  (`FamilyChecklistCard`, `ShoppingNudgesPanel`, `EventRSVPCard`,
  `TripPlannerCard`) and their inference helpers
  (`secondBrain.ts`, `secondBrain.test.ts`,
  `skills/trip-planner.ts`, `search-service.ts`)
- Removal of the `ai:family-checklist`, `ai:shopping-nudges`,
  `ai:event-rsvp`, and `ai:trip-plan` IPC handlers and their
  preload / API surface
- Removal of the `SEEDED_TRANSLATIONS` table, `mockTranslate`, and
  `mockIsBilingualSummary` helpers from `MockAdapter` so every
  translation / summary now requires a real LLM (or returns an
  obvious `[MOCK]` placeholder)
- Reduction of `seed.go` B2C content to a single channel
  (`ch_dm_alice_minh`, the bilingual DM) with no seeded events or
  tasks
- New `frontend/electron/inference/prompts/conversation-insights.ts`
  prompt module (≤200-token system span, pipe-delimited
  TOPICS / ACTIONS / DECISIONS / SENTIMENT output, INSUFFICIENT
  refusal contract) and a tolerant
  `parseConversationInsightsOutput` parser that recovers from
  reordered or partial sections
- New `runConversationInsights` task helper in `tasks.ts` (with
  fuzzy ≥4-character-token source-message back-linking),
  `ai:conversation-insights` IPC handler, and
  `electronAI.conversationInsights` preload binding
- New `frontend/src/features/ai/ConversationInsightsPanel.tsx`
  component that auto-runs on first mount, caches per-channel via
  react-query, and renders topics / actions / decisions /
  sentiment + privacy strip
- Right-rail tab re-shuffle: `Summary / Memory / Stats` →
  `Summary / Insights / Stats`
- Documentation refresh across PROGRESS.md, README.md,
  ARCHITECTURE.md, PROPOSAL.md, demo/README.md, PHASES.md

**Exit criteria:** With the on-device runtime running, every
visible B2C affordance — translation, summary, smart-reply,
insights, task extraction, metrics — renders real LLM output
under a `compute: on-device`, `egress: 0 B` privacy strip; with
the runtime offline, every surface visibly degrades to
`[MOCK]`-prefixed placeholders so the operator can immediately
tell the LLM is not connected.

---

## Phase 9 — B2B ground-zero LLM redesign

**Goal:** Apply the Phase 8 ground-zero treatment to the B2B
surface so every visible affordance — thread summary, task
extraction, approval prefill, artifact draft, knowledge
extraction — is generated by the on-device Bonsai-1.7B model at
runtime instead of being seeded as a static demo card.

**Deliverables:**

- Strip seeded `Approval` and `Artifact` cards from
  `backend/internal/store/seed.go::seedCards` (now a no-op).
  Existing handler tests continue to assert against fixtures
  injected by `seedTestKAppFixtures` in
  `backend/internal/api/handlers/chat_test.go`
- Redesign B2B right-rail tabs in
  `frontend/src/app/B2BLayout.tsx` from
  `Tasks / AI Employees / Connectors / Knowledge / Policy` to
  **Summary | Tasks | Knowledge | AI Employees**, default tab
  Summary, with `ConnectorPanel` and `PolicyAdminPanel`
  demoted off the primary rail
- New `frontend/src/features/ai/ThreadSummaryPanel.tsx` (B2B
  counterpart of `MorningDigestPanel`): resolves the channel's
  primary thread, auto-runs `ai:summarize-thread`, streams via
  `streamAITask`, caches per-channel via `useQueryClient`, and
  renders `ThreadSummaryCard` + `PrivacyStrip`. Manual
  re-run button. Cancels in-flight runs on channel switch
- New `frontend/src/features/ai/ThreadTasksPanel.tsx`:
  auto-runs `ai:kapps-extract-tasks`, surfaces owner / due /
  source provenance through the existing
  `TaskExtractionCard`, caches per-channel
- Reuse the Phase 5 `KnowledgeGraphPanel` for the Knowledge tab
  (still backed by `ai:extract-knowledge`)
- Verify `ai:prefill-approval` (Phase 7) and `ai:draft-artifact`
  (Phase 7) flows still execute on the on-device LLM and keep
  the `OutputReview` gate in front of any write
- Verify `MockAdapter` B2B outputs remain `[MOCK]`-prefixed
- Tests — update
  `frontend/src/app/__tests__/B2BLayout.test.tsx` for the new
  tab structure; new
  `frontend/src/features/ai/__tests__/ThreadSummaryPanel.test.tsx`
  and `ThreadTasksPanel.test.tsx`; backend `chat_test.go`
  reroutes through `seedTestKAppFixtures`
- Capture 10 B2B demo screenshots into `demo/b2b/` against a
  real `llama-server` running Bonsai-1.7B from the PrismML
  `llama.cpp` fork
- Documentation refresh across PROGRESS.md, README.md,
  ARCHITECTURE.md, PROPOSAL.md, demo/README.md, PHASES.md

**Exit criteria:** With the on-device runtime running, every
visible B2B affordance (thread summary, task extraction,
approval prefill, artifact draft, knowledge extraction) renders
real LLM output under a `compute: on-device`, `egress: 0 B`
privacy strip; with the runtime offline, every surface visibly
degrades to `[MOCK]`-prefixed placeholders so the operator can
immediately tell the LLM is not connected.

---

## Implementation priority timeline

### First 30 days

1. Convert static demos into React screens
2. Build Go API skeleton
3. Add seeded B2C/B2B data
4. Add KApp card renderer
5. Add privacy strip
6. Add local inference adapter
7. Run on-device inference locally for B2C digest and task extraction

### Days 31–60

1. Harden on-device inference for long-context tasks
2. Build B2B task extraction and approval prefill
3. Add PRD draft review
4. Add source pins and citations
5. Add AI Employee queue mock
6. Add policy engine v0

### Days 61–90

1. Add persistent PostgreSQL objects
2. Add NATS events
3. Add artifact versioning
4. Add audit log
5. Add connector mock, then Drive/OneDrive v1
6. Add mobile web responsive shell
