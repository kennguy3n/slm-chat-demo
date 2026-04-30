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

**Goal:** Prove efficient local AI with Bonsai-8B (prism-ml/Ternary-Bonsai-8B-gguf) as the single on-device model.

**Deliverables:**

- Local model status panel (loaded/unloaded, model name, memory usage)
- Electron main-process inference adapter to Ollama (TypeScript;
  llama.cpp and Unsloth follow as additional adapters)
- On-device routing for all non-server tasks (the router only distinguishes `local` vs. `server`)
- Streaming responses over IPC (`ai:stream` + chunk events)
- Privacy strip with real model name and compute location
- B2C AI: summarize unread, smart reply, translate, extract task
- B2B AI: summarize thread, extract tasks, prefill approval, draft short artifact section

**Exit criteria:** React UI streams real local model output through Go, with on-device routing and visible privacy state.

---

## Phase 2 — KChat B2C second-brain demo

**Goal:** Make B2C feel like native AI messaging, not a separate assistant.

**Deliverables:**

- Inline translation under message bubbles
- AI task-created pills
- "Why suggested" explanations
- AI Memory page
- Family checklist and shopping list
- Community event / RSVP card
- Guardrail rewrite card
- Morning digest
- Local-only memory index

**Exit criteria:** A user can run the full Personal → Family → Community journey with on-device AI and no modal-heavy context switching.

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
