# KChat SLM Demo

KChat SLM Demo is an Electron desktop app that proves the AI features
inside KChat — summaries, drafts, translation, task extraction, approval
prefill, knowledge graph — can run on-device using a quantized local
small language model. Inference is owned by the Electron main process,
served through a local Ollama daemon (or `MockAdapter` when Ollama is
not running) and routed by a single `InferenceRouter` with two
destinations: an on-device `local` tier and a policy-gated `server`
tier for confidential-server tasks. A small Go data API supplies
chats, threads, workspaces, and seeded KApp cards. No AI traffic
leaves the device.

Every B2B AI surface (thread summary, task extraction, approval
prefill, artifact drafting, knowledge extraction) routes through the
real on-device Bonsai-8B-Q1_0 model when Ollama is reachable; the
`MockAdapter` is for tests only and now emits clearly-labelled
`[MOCK]` placeholders so it's obvious in the UI when the real model
isn't running. Prompt construction and parsing for these flows live
in the dedicated [`frontend/electron/inference/prompts/`](./frontend/electron/inference/prompts/)
library so prompts can be tuned for the 8B model class without
chasing parsers through `tasks.ts`.

The same product surface ships in two contexts:

- **B2C** — personal chats, family and community groups, on-device
  AI memory, smart reply, inline translation, task extraction, RSVP
  cards.
- **B2B** — workspace / domain / channel collaboration with KApps,
  AI Employees, approvals, artifacts (PRD / RFC / SOP / QBR), and
  human-reviewable AI output anchored to the originating thread.

For the full product thesis, system design, phasing, and progress see
[PROPOSAL.md](./PROPOSAL.md), [ARCHITECTURE.md](./ARCHITECTURE.md),
[PHASES.md](./PHASES.md), and [PROGRESS.md](./PROGRESS.md).

## Tech stack

| Layer        | Stack |
| ------------ | ----- |
| Shell        | Electron 31 (main + preload + renderer), TypeScript |
| Renderer     | React + TypeScript + Vite, TanStack Router / Query, Zustand, Vitest + RTL |
| Inference    | Electron main process (`frontend/electron/inference/`) — `MockAdapter`, `OllamaAdapter`, `ConfidentialServerAdapter`, and an `InferenceRouter` that picks `local` vs. `server` per task |
| IPC          | `contextBridge.exposeInMainWorld('electronAI', …)` exposes `run`, `stream`, `route`, the per-skill helpers (`smartReply`, `translate`, `summarizeThread`, `prefillApproval`, `draftArtifact`, …), and the `model:*` and `egress:*` channels |
| Local memory | `features/memory/memoryStore.ts` — IndexedDB (`kchat-slm-memory` / `facts`) with an in-memory fallback. Users add / edit / remove facts; the AI never auto-writes. 0 B egress |
| Data API     | Go 1.25 + chi router + chi/cors, in-memory store |
| Persistence  | In-memory (Phase 0); PostgreSQL + NATS JetStream + MinIO/S3 land in later phases |

## Quick start

```bash
# 1) Data API (Go on :8080, optional in dev — only needed for chat / thread data)
cd backend
go run ./cmd/server

# 2) Electron app (spawns Vite + Electron, talks IPC for AI, HTTP for data)
cd frontend
npm install
npm run electron:dev
```

`npm run electron:dev` starts the Vite renderer on
`http://localhost:5173` and launches Electron with `ELECTRON_DEV=1`.
The main process boots the inference router
(`frontend/electron/inference/bootstrap.ts`) and registers all IPC
handlers. Use the **B2C / B2B** button in the top bar to switch
shells.

For a plain browser dev loop (no Electron, no IPC) `npm run dev`
still works — every API helper falls back to legacy HTTP endpoints
when `window.electronAI` is undefined, which is also how the Vitest
suite runs.

## Run with a real local model (required for the B2B demo)

The Electron main process auto-detects an Ollama daemon on
`http://localhost:11434` (or `OLLAMA_BASE_URL`). When reachable, the
router wires a single Ollama adapter bound to `MODEL_NAME` (default
`bonsai-8b`); otherwise it falls back to `MockAdapter`. The fallback
is fine for B2C smoke-testing and tests, but every B2B demo flow
(thread summary, task extraction, approval prefill, artifact draft,
knowledge graph) is designed to run against the real on-device LLM
— without Ollama the panels show `[MOCK]` placeholder text.

The default `bonsai-8b` is an *alias*, not an upstream Ollama tag —
[`models/Modelfile.bonsai8b`](./models/Modelfile.bonsai8b) wraps the
Q1_0 GGUF file from
[`prism-ml/Bonsai-8B-gguf`](https://huggingface.co/prism-ml/Bonsai-8B-gguf)
(`Bonsai-8B-Q1_0.gguf`, ~1.16 GB on disk). The bundled script handles
the download and alias creation:

```bash
./scripts/setup-models.sh
ollama serve &
export OLLAMA_BASE_URL=http://localhost:11434
cd frontend && npm run electron:dev
```

To set the alias up by hand:

```bash
curl -L -o models/Bonsai-8B-Q1_0.gguf \
  https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/Bonsai-8B-Q1_0.gguf
ollama create bonsai-8b -f models/Modelfile.bonsai8b
```

Stock Ollama 0.22.x can `create` the alias but cannot run inference
against the Q1_0 GGUF; the CPU-only demo path uses the PrismML
`llama.cpp` fork behind an Ollama-API shim. ARM / Apple Silicon
hosts get the fastest path from the Q2_0 GGUF in
[`prism-ml/Ternary-Bonsai-8B-gguf`](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf);
set `MODEL_QUANT=q2_0` and update the Modelfile. Full per-arch
quant choice, kernel attribution, and tuning matrix in
[`docs/cpu-perf-tuning.md`](./docs/cpu-perf-tuning.md). Modelfile
knobs and local-GGUF fallback instructions live in
[`models/README.md`](./models/README.md). Override the alias at
runtime with `MODEL_NAME=some-other-alias`; if it resolves to a
model the daemon hasn't pulled, the bootstrap falls back to
`MockAdapter` and `DeviceCapabilityPanel` surfaces the fallback.

## Project structure

```
slm-chat-demo/
├── backend/             Go data API (no AI inference)
│   ├── cmd/server/
│   └── internal/        api, services, models, store
├── frontend/
│   ├── electron/
│   │   ├── inference/
│   │   │   ├── prompts/    Bonsai-8B prompt library (one module per
│   │   │   │               B2B task type — buildPrompt + parseOutput)
│   │   │   ├── recipes/    AI Employee recipes
│   │   │   ├── skills/     Composable skills (trip planner, guardrail,
│   │   │   │               LLM knowledge extractor)
│   │   │   ├── adapter.ts, ollama.ts, mock.ts, router.ts, …
│   │   │   └── tasks.ts    B2B/B2C task helpers (delegates to prompts/)
│   │   └── main.ts, preload.ts, ipc-handlers.ts
│   └── src/             app, features, stores, api, types
├── demo/                Annotated screenshots (see demo/README.md)
├── docs/                cpu-perf-tuning and other deep dives
├── models/              Modelfile + setup script
├── PROPOSAL.md
├── ARCHITECTURE.md
├── PHASES.md
└── PROGRESS.md
```

All AI inference lives under `frontend/electron/inference/`
(`OllamaAdapter`, `MockAdapter`, `ConfidentialServerAdapter`,
`InferenceRouter`, skills, recipes, redaction engine, egress
tracker).

## Running the tests

```bash
cd frontend && npm test         # Vitest + RTL; renderer + Electron inference
cd backend  && go test ./...    # Go's standard testing + httptest
```

Optional: opt-in live-LLM integration tests against a running Ollama
daemon (otherwise skipped). Loads Bonsai-8B and runs the prompt
library through `OllamaAdapter`:

```bash
OLLAMA_INTEGRATION=1 npm test -- ollama-integration
```

Lint and typecheck:

```bash
cd frontend && npm run lint
cd frontend && npm run typecheck
```

## Production build

```bash
cd frontend
npm run electron:build
```

`npm run electron:build` runs three stages:

1. `npm run build` — Vite builds the renderer into `dist/`.
2. `npm run electron:tsc` — `tsconfig.electron.json` compiles
   `electron/` to CommonJS in `dist-electron/`, then
   `scripts/finalize-electron-build.mjs` writes a
   `dist-electron/package.json` with `"type": "commonjs"`.
3. `electron-builder` packages the result under `frontend/release/`:
   Linux `AppImage` (x64), macOS `dmg` (x64 + arm64, unsigned by
   default), Windows `nsis` (x64).

Build a single target with `npx electron-builder --linux AppImage`,
`--mac dmg`, or `--win nsis`. Code-signing certificates are not
configured; set `CSC_LINK` / `CSC_KEY_PASSWORD` (macOS) or
`WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (Windows) in CI when shipping
signed builds.

## Demo screenshots

Annotated captures of every PROPOSAL.md §5 demo flow live in
[`demo/`](./demo/README.md). Each screenshot maps to one of the four
flows (Morning Catch-up, Task Extraction, Approval Prefill, PRD
Draft) and shows the on-device privacy strip
(`compute: on-device`, `model: bonsai-8b`, `egress: 0 B`) where
applicable.

## Current status

| Phase | Status      | Progress | Summary |
| ----- | ----------- | -------- | ------- |
| Phase 0 — Consolidated prototype foundation | Complete    | 100% | Electron shell, B2C/B2B layouts, KApp card system, Privacy Strip, AI Action Launcher, Go data API. |
| Phase 1 — Local LLM MVP                     | Complete    | 100% | Ollama adapter, single-tier on-device router, IPC streaming, real privacy strip, B2C/B2B inference helpers. |
| Phase 2 — B2C second-brain demo             | Complete    | 100% | AI Memory, family checklist, shopping nudges, RSVP, trip planner, guardrails, metrics dashboard, skills framework. |
| Phase 3 — B2B KApps MVP                     | Complete    | 100% | Workspace navigation, Tasks/Approvals/Artifacts/Forms KApps, audit log, human review gates, source pins. |
| Phase 4 — AI Employees and recipe engine    | Complete    | 100% | Three seeded employees, recipe registry, queue, budget controls, output gate, mode badges. |
| Phase 5 — Connectors and knowledge graph    | Complete    | 100% | Drive + OneDrive mock connectors, channel-scoped retrieval, source picker, knowledge graph, citations, ACL sync. |
| Phase 6 — Confidential server mode          | In progress | ~85% | ConfidentialServerAdapter, RedactionEngine, EgressTracker, policy admin, audit export, SSO/SCIM, encryption-key + tenant-storage models. |

See [PROGRESS.md](./PROGRESS.md) for the per-task tracker and
changelog.

## What's deferred

The following components are referenced by the architecture docs but
have not yet shipped:

- **PostgreSQL** — production persistence layer.
- **NATS JetStream** — durable async messaging fabric.
- **MinIO / S3** — object storage for artifacts and binary blobs.
- **Meilisearch** — full-text search index.
- **`LlamaCppAdapter`** — second on-device runtime (currently a stub
  that throws `not yet implemented`).
- **Unsloth Studio** — fine-tuning workflow.

## Links

- [PROPOSAL.md](./PROPOSAL.md) — product thesis and "one shell, two
  contexts" design.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Electron renderer, main-
  process inference, Go data API, AI policy engine, KApps object
  model.
- [PHASES.md](./PHASES.md) — seven-phase delivery plan.
- [PROGRESS.md](./PROGRESS.md) — per-phase tracker and changelog.
- [docs/cpu-perf-tuning.md](./docs/cpu-perf-tuning.md) — CPU-only
  tuning guide and per-arch quant choice.
