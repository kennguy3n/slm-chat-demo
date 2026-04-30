# Progress Tracker

Last updated: 2026-04-30

This tracker captures per-phase deliverable status and a chronological
changelog. The phase scope itself is defined in
[PHASES.md](./PHASES.md); architectural detail lives in
[ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Overall status summary

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Consolidated prototype foundation | Complete | 100% |
| Phase 1: Local LLM MVP | Complete | 100% |
| Phase 2: B2C second-brain demo | Complete | 100% |
| Phase 3: B2B KApps MVP | Complete | 100% |
| Phase 4: AI Employees and recipe engine | Complete | 100% |
| Phase 5: Connectors and knowledge graph | Complete | 100% |
| Phase 6: Confidential server mode | In progress | ~85% |

---

## Phase 0 — Consolidated prototype foundation

- [x] React app shell with B2C/B2B mode switching
- [x] Electron shell hosting the React renderer (`frontend/electron/main.ts`, `preload.ts`, IPC bridge)
- [x] Go data-only backend skeleton with mock auth
- [x] Mock users and workspaces
- [x] Seeded demo data (B2C personal/family/community; B2B workspace/domain/channel)
- [x] Shared card system (`TaskCard`, `ApprovalCard`, `ArtifactCard`, `EventCard`)
- [x] Privacy strip component
- [x] AI action launcher (B2C: Catch up / Translate / Remind; B2B: Create / Analyze / Plan / Approve)
- [x] Local inference adapter interface (mocked responses)
- [x] Mobile-responsive layout (bottom tabs)
- [x] Web layout (sidebar + main chat + right panel)

---

## Phase 1 — Local LLM MVP

- [x] Local model status panel — `DeviceCapabilityPanel` shows model name, loaded state, RAM usage
- [x] Inference adapter contract (`frontend/electron/inference/adapter.ts`)
- [x] Ollama adapter (`frontend/electron/inference/ollama.ts`) — TypeScript, in the Electron main process
- [x] `LlamaCppAdapter` stub (`llamacpp.ts`) — `Adapter` contract; `run`/`stream` throw until the GGUF runtime lands
- [x] On-device routing — bootstrap wires a single `OllamaAdapter` bound to `MODEL_NAME` (default `bonsai-8b`); router exposes one `local` tier
- [x] IPC streaming responses (`ai:stream` channel + `ai:stream:chunk` events)
- [x] WebSocket / native streaming — covered by Phase 6's NDJSON-over-HTTP `ConfidentialServerAdapter`; true WebSocket upgrade deferred
- [x] Privacy strip with real compute location and model name (`window.electronAI.route` decision)
- [x] B2C: summarize unread, smart reply, inline translation, task extraction
- [x] B2B: thread summary, task extraction, approval prefill (`prefillApproval`, `ApprovalPrefillCard`), draft artifact section (`draftArtifact`, `ArtifactDraftCard`; PRD / RFC / Proposal / SOP / QBR)

---

## Phase 2 — B2C second-brain demo

- [x] Inline translation caption (`TranslationCaption`)
- [x] AI task-created pill (`TaskCreatedPill` after `TaskExtractionCard` accept)
- [x] "Why suggested" explanations — `PrivacyStrip` expandable `whyDetails[]`
- [x] AI Memory page — `AIMemoryPage` + IndexedDB-backed `memoryStore.ts` (local-only, 0 B egress)
- [x] Family checklist (`ai:family-checklist`, `FamilyChecklistCard`)
- [x] Shopping nudges (`ai:shopping-nudges`, `ShoppingNudgesPanel`)
- [x] Community event / RSVP card (`ai:event-rsvp`, `EventRSVPCard`)
- [x] Guardrail rewrite (`ai:guardrail-check`, `runGuardrailRewrite` skill, `GuardrailRewriteCard`)
- [x] Morning digest (`MorningDigestPanel` reusing the unread-summary IPC)
- [x] Local-only memory index — IndexedDB `kchat-slm-memory` / `facts` with in-memory fallback
- [x] AI Skills Framework (`skill-framework.ts`) — `SkillDefinition`, `runSkill`, `INSUFFICIENT_RULE`, pre/post-inference guardrails
- [x] Trip planner skill (`skills/trip-planner.ts`, `MockSearchService`, `TripPlannerCard`)
- [x] Metrics dashboard — `MetricsDashboard` reading from `features/ai/activityLog.ts`

---

## Phase 3 — B2B KApps MVP

- [x] Workspace → Domain → Channel navigation (`/api/workspaces/{id}/domains`, `/api/domains/{id}/channels`, collapsible `B2BLayout` sidebar)
- [x] Thread linked-objects (`/api/threads/{id}/linked-objects`, `ThreadPanel` "Linked objects" section)
- [x] `KAppCardRenderer` `onAction` + `mode` API; status transitions, decision log, version history
- [x] Tasks KApp — task CRUD endpoints + `TasksKApp` + `CreateTaskForm` + `useKAppsStore`
- [x] Approvals KApp — `POST /api/kapps/approvals`, `CreateApprovalForm`, prefill → submit flow
- [x] Artifacts KApp — full CRUD on `/api/kapps/artifacts*`, `ArtifactWorkspace`, `ArtifactDraftCard` accept
- [x] Forms intake — `Form` model, vendor / expense / access templates, `FormCard`, `ai:prefill-form`
- [x] Artifact versioning — `POST /api/kapps/artifacts/{id}/versions`, `ArtifactDiffView` LCS line diff, `Publish`
- [x] Source pins — `ArtifactSourcePin` end-to-end (model → endpoint → inline footnote chip)
- [x] Audit log — `AuditService` append-only log + `GET /api/audit` + `AuditTimeline`
- [x] Human review gate — `OutputReview` mounted before artifact publish and approval submit
- [x] Action Launcher submenus wired end-to-end to KApp endpoints + AI IPCs

---

## Phase 4 — AI Employees and recipe engine

- [x] AI Employee profiles (Kara Ops AI, Nina PM AI, Mika Sales AI) — `AIEmployee` model, service, `GET /api/ai-employees`, sidebar + right-rail panel
- [x] Allowed-channels editor — `PATCH /api/ai-employees/{id}/channels`, inline multi-select
- [x] Recipe registry (`recipes/registry.ts`, `RECIPE_REGISTRY`, `ai:recipe:run` IPC)
- [x] Recipe `summarize` (`recipes/summarize.ts`, wraps `buildThreadSummary`, `local`)
- [x] Recipe `extract_tasks` (`recipes/extract-tasks.ts`, source provenance, refuses empty threads)
- [x] Recipe `draft_prd` (`recipes/draft-prd.ts`, `buildDraftArtifact({ artifactType: 'PRD' })`)
- [x] Recipe `draft_proposal` (`recipes/draft-proposal.ts`)
- [x] Recipe `create_qbr` (`recipes/create-qbr.ts`)
- [x] Recipe `prefill_approval` (`recipes/prefill-approval.ts`); all six self-register through `recipes/index.ts`
- [x] Queue view — recipe-run model + endpoints + `QueueView` mounted in `AIEmployeePanel`
- [x] Budget controls — `PATCH /budget`, `POST /budget/increment` (429 on overrun), pre-execution gate in `runRecipe`
- [x] Human approval gate before publish — `RecipeOutputGate` wraps `OutputReview`, opens from completed runs
- [x] AI Employee mode badges — `AIEmployeeModeBadge` (`Auto`, `Inline`) wired into `MessageBubble`, `KAppCardRenderer`, `AIEmployeeList`

---

## Phase 5 — Connectors and knowledge graph

- [x] Google Drive connector — `Connector` model, `ConnectorService`, six endpoints; seed `conn_gdrive_acme` attached to `ch_vendor_management`
- [x] OneDrive connector — seed `conn_onedrive_acme` attached to `ch_engineering`; reuses Drive plumbing
- [x] Channel-scoped attachment — `ConnectorPanel` (right-rail), `SourcePicker` Files tab consumes `fetchChannelConnectorFiles`
- [x] Permission preview — `PermissionPreview` "AI will read from…" sheet between `SourcePicker` confirm and dispatch
- [x] Source picker — `SourcePicker` three tabs (Channels / Threads / Files) + chip list + Confirm/Cancel
- [x] Per-channel retrieval index — `RetrievalService` (`IndexChannel`, `Search`), `POST/GET /api/channels/{id}/{index,search}`
- [x] Knowledge graph: decisions, owners, risks, requirements, deadlines — `KnowledgeService.ExtractEntities`, `KnowledgeGraphPanel` (five collapsible sections)
- [x] Citation rendering — `CitationChip` + `CitationRenderer` parse `[source:id]` markers; wired into summary / draft / prefill / output-gate cards
- [x] Connector ACL sync — `ConnectorFile.ACL`, `ConnectorService.SyncACL` / `CheckFileAccess`, `RetrievalService` user-scoped filtering, `POST /api/connectors/{id}/sync-acl`

---

## Phase 6 — Confidential server mode and enterprise hardening

- [x] Confidential server adapter (`confidential-server.ts`) — NDJSON streaming to `CONFIDENTIAL_SERVER_URL`, refuses on unreachable, no silent fallback
- [x] Router server tier — `attachServer()`, `hasServer()`, policy-gated `decide()`, `model:status` reports `serverModel` / `serverAvailable`
- [x] Bootstrap probe — `/v1/health` ping gated on `CONFIDENTIAL_SERVER_POLICY=allow`; injectable `pingServer` for tests
- [x] Redaction engine (`redaction.ts`) — reversible `tokenize`/`detokenize` (emails, phones, SSNs, names) and non-reversible `redact`, longest-first replacement, UTF-8 byte counting
- [x] Router redaction + egress integration — every server-routed `run`/`stream` tokenizes prompt and detokenizes response; egress recorded
- [x] Egress tracker (`egress-tracker.ts`) — singleton, `record` / `summary` (totals + by channel/model + recent) / `reset`
- [x] `EgressSummaryPanel` + `useEgressSummary` + `formatEgressBytes` — zero-state, breakdowns, timeline, Reset
- [x] TopBar live egress badge — reads from the tracker via `useEgressSummary`
- [x] PrivacyStrip "Redaction" row for confidential-server outputs
- [x] Phase 6 inference test suite — 28+ cases across `confidential-server`, `redaction`, `egress-tracker`, `EgressSummaryPanel`, plus `router` / `bootstrap` / panel extensions
- [x] Model swap to Bonsai-8B — `models/Modelfile.bonsai8b`, single `bonsai-8b` alias, `prism-ml/Bonsai-8B-gguf` source
- [x] Tier collapse — `Tier` reduced to `'local' | 'server'`; single `OllamaAdapter` wired in bootstrap
- [x] Router model-name threading — `RouterOptions.defaultModel` propagates `MODEL_NAME` overrides into `decide()` reasons and `model:status`
- [x] `DeviceCapabilityPanel` single-tier UI; `setup-models.sh` reads only `MODEL_NAME`
- [ ] Confidential server periodic health check (`router.ts` recurring probe, real-time `hasServer()` updates)
- [ ] Redaction audit-trail integration (wire `RedactionEngine` events into `AuditService`)
- [ ] Server-tier recipe routing (recipes with `preferredTier: 'server'` honour the server tier)
- [ ] Egress budget enforcement (per-workspace daily ceiling; refusal surfaced in privacy strip)
- [ ] `ConfidentialServerAdapter` retry with backoff (exponential, max 3 attempts on 5xx / timeout)
- [x] No-content structural logging — Go `StructuralLogger` middleware + `SanitizeLogFields`; renderer `sanitizeForLog` / `logInference`
- [x] Policy admin (`WorkspacePolicy`, `PolicyService`, `GET / PATCH /api/workspaces/{id}/policy`, `PolicyAdminPanel`)
- [x] Audit export — `GET /api/audit/export?format=json|csv`, "Export JSON" / "Export CSV" buttons in `AuditLogPanel`
- [x] SSO middleware — `SSOAuth` (Bearer + email-domain check); falls back to `MockAuth` when disabled
- [x] SCIM v2 user provisioning — `/api/scim/v2/Users` GET/POST/PATCH/DELETE outside the `MockAuth` pipeline
- [x] Per-tenant encryption keys — `TenantEncryptionKey` + `EncryptionKeyService` (generate, get-active, rotate, list); 32-byte AES-256-GCM
- [x] Tenant storage config — `TenantStorageConfig` + `TenantStorageService`, `GET / PATCH /api/workspaces/{id}/storage`
- [x] Android AICore bridge — `AICoreBridge` interface + `StubAICoreBridge` (throws on every method in Electron)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-30 | Demo screenshot capture pass: refreshed all 27 screenshots (12 B2C, 12 B2B, 3 standalone) via Playwright over Electron CDP against the live Vite + Go stack. `demo/README.md` pending markers reset to captured. |
| 2026-04-30 | Post-PR-#44 documentation audit: confirmed `scripts/setup-models.sh`, `models/Modelfile.bonsai8b`, `frontend/electron/inference/mock.ts`, and `docs/cpu-perf-tuning.md` already match the canonical-quant rename. README and ARCHITECTURE re-verified; both test suites green. |
| 2026-04-30 | Real-LLM demo capture pass against `Ternary-Bonsai-8B-Q2_0`. Built the PrismML `llama.cpp` fork and ran an Ollama-API shim so the existing `OllamaAdapter` could talk to `llama-server`; re-captured eight non-streaming surfaces under the live model. Streaming surfaces remain pending because Q2_0 on x86 CPU runs ~0.3 tok/s. |
| 2026-04-30 | Post-development B2B documentation audit: walked Phase 3/4/5 B2B claims against the running stack and fixed two doc drifts (`ARCHITECTURE.md` recipe list, `demo/README.md` knowledge-graph row); captured the previously-pending `b2b/03-action-launcher.png`. Two B2B shots remain pending until the Electron shell can fake a live AI stream from the Vite-only harness. |
| 2026-04-30 | Post-development documentation audit: verified PR #35 (perf — batch translation, auto-run morning digest, smart-reply IPC guard) merged cleanly. Corrected Phase 6 from `Complete \| 100%` to `In progress \| ~85%` to reflect five still-open items. |
| 2026-04-29 | Post-development demo polish: enriched `seed.go` with realistic multi-day B2C activity and richer B2B source material; updated `mock.ts` so canonical recipes reference the seeded entities; created `demo/` with the B2C and B2B README tables and 15 captured screenshots. |
