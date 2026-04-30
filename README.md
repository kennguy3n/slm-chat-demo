# KChat SLM Demo

KChat SLM Demo is an Electron desktop app that proves the AI features
inside KChat — summaries, drafts, translation, task extraction, approval
prefill, knowledge graph — can run on-device using a quantized local
small language model. Inference is owned by the Electron main process
and served by one of two on-device runtimes (`llama-server` from the
PrismML llama.cpp fork *or* an Ollama daemon) with `MockAdapter` as
the offline fallback. A single `InferenceRouter` picks between an
on-device `local` tier and a policy-gated `server` tier for
confidential-server tasks. A small Go data API supplies chats,
threads, workspaces, and seeded KApp cards. No AI traffic leaves the
device.

Every B2B AI surface (thread summary, task extraction, approval
prefill, artifact drafting, knowledge extraction) routes through the
real on-device Bonsai-1.7B model when llama-server or Ollama is
reachable; the `MockAdapter` is for tests only and now emits
clearly-labelled `[MOCK]` placeholders so it's obvious in the UI
when the real model isn't running. Prompt construction and parsing
for these flows live in the dedicated
[`frontend/electron/inference/prompts/`](./frontend/electron/inference/prompts/)
library so prompts can be tuned for the 1.7B model class without
chasing parsers through `tasks.ts`.

The same product surface ships in two contexts:

- **B2C** — bilingual chat demo (Alice 🇺🇸 ↔ Minh 🇻🇳) where every
  bubble is translated on-device by the local SLM; right-rail
  Conversation Summary, AI Memory, and on-device Metrics surface the
  privacy + audit story. See the
  [bilingual chat demo flow](#bilingual-chat-demo-b2c) below.
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
| Inference    | Electron main process (`frontend/electron/inference/`) — `LlamaCppAdapter` (PrismML llama.cpp `llama-server`), `OllamaAdapter`, `MockAdapter`, `ConfidentialServerAdapter`, and an `InferenceRouter` that picks `local` vs. `server` per task. The bootstrap probes llama-server first, then Ollama, then falls back to the mock |
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

The Electron main process probes its on-device runtimes in priority
order when it boots:

1. **`llama-server`** from the PrismML `llama.cpp` fork on
   `http://localhost:8080` (override with `LLAMACPP_BASE_URL`). This
   is the recommended runtime — it speaks the Bonsai GGUF format
   natively and supports streaming via SSE.
2. **Ollama** on `http://localhost:11434` (override with
   `OLLAMA_BASE_URL`). The bootstrap creates an `OllamaAdapter`
   bound to `MODEL_NAME` (default `bonsai-1.7b`).
3. **`MockAdapter`** offline fallback — fine for B2C smoke testing
   and tests, but every B2B demo flow shows `[MOCK]` placeholders
   when no real runtime is reachable.

### Option A (recommended): llama-server

Build the PrismML `llama.cpp` fork once and point it at the
Bonsai-1.7B GGUF:

```bash
git clone https://github.com/kennguy3n/llama.cpp.git
cd llama.cpp && git checkout prism
cmake -B build && cmake --build build --config Release -t llama-server

curl -L -o Bonsai-1.7B.gguf \
  https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/Bonsai-1.7B.gguf
./build/bin/llama-server -m Bonsai-1.7B.gguf -c 2048 --port 8080

# in another terminal
cd slm-chat-demo/frontend && npm run electron:dev
```

### Option B: Ollama

The default `bonsai-1.7b` is an *alias*, not an upstream Ollama
tag — [`models/Modelfile.bonsai1_7b`](./models/Modelfile.bonsai1_7b)
wraps the GGUF file from
[`prism-ml/Bonsai-1.7B-gguf`](https://huggingface.co/prism-ml/Bonsai-1.7B-gguf)
(`Bonsai-1.7B.gguf`, ~1.0 GB on disk). The bundled script handles
the download and alias creation:

```bash
./scripts/setup-models.sh
ollama serve &
export OLLAMA_BASE_URL=http://localhost:11434
cd frontend && npm run electron:dev
```

To set the alias up by hand:

```bash
curl -L -o models/Bonsai-1.7B.gguf \
  https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/Bonsai-1.7B.gguf
ollama create bonsai-1.7b -f models/Modelfile.bonsai1_7b
```

Bonsai-1.7B ships as a single GGUF, so there is no per-arch quant
split to manage — the same artifact runs on x86 CPU, ARM CPU, and
Apple Silicon. Full performance numbers and CPU-tuning guidance
live in [`docs/cpu-perf-tuning.md`](./docs/cpu-perf-tuning.md).
Modelfile knobs and the local-GGUF fallback instructions live in
[`models/README.md`](./models/README.md). Override the alias at
runtime with `MODEL_NAME=some-other-alias`; if it resolves to a
model that neither runtime has loaded, the bootstrap falls back to
`MockAdapter` and the `DeviceCapabilityPanel` surfaces the fallback.

## Bilingual chat demo (B2C)

The B2C surface is built around a single, real-LLM scenario: Alice
(English) and Minh (Vietnamese) chatting in the seeded
`ch_dm_alice_minh` DM. The channel is auto-selected the moment B2C
mounts, so opening the app drops you straight into the conversation.

| Surface | What you see | What the SLM does |
| ------- | ------------ | ----------------- |
| Chat bubble | A two-panel translation card per message — original on top, translation below, with per-language flag labels (🇺🇸 English / 🇻🇳 Vietnamese). The panel in **your** preferred language is the primary one; the other panel is muted. | One `translate` call per visible bubble, batched into a single IPC round-trip on render. `MessageList` sets `partnerLanguage="vi"` on the channel so outgoing English bubbles also auto-translate to Vietnamese for context. |
| Privacy strip | Expandable strip on every translation showing `compute: on-device`, `model: bonsai-1.7b`, `egress: 0 B`, plus the source-message pin. | None — the strip just reflects the response metadata. |
| **Summary** tab (right rail) | A bilingual conversation summary, written in your preferred language, listing topics, action items, and decisions. | A `summarize` task with a bilingual-aware prompt (see `frontend/electron/inference/tasks.ts` → `buildUnreadSummary`). The mock adapter switches its canned digest when it detects a bilingual prompt. |
| **Memory** tab | Local-only IndexedDB-backed `AIMemoryPage`. Add/remove facts the model never auto-writes. | None (storage only — 0 B egress). |
| **Stats** tab | Per-task `MetricsDashboard` (translate runs, tokens, latency, egress). | Reads from the local `activityLog`. |

The demo runs end-to-end against `MockAdapter` (no Ollama needed —
hand-curated translations seeded in
[`frontend/electron/inference/mock.ts`](./frontend/electron/inference/mock.ts))
and against the real `LlamaCppAdapter` (PrismML `llama-server`) or
`OllamaAdapter` bound to `bonsai-1.7b`. Switching between the three
is automatic: the bootstrap pings llama-server first, then Ollama,
and finally falls back to the mock when neither runtime is
reachable.

## Project structure

```
slm-chat-demo/
├── backend/             Go data API (no AI inference)
│   ├── cmd/server/
│   └── internal/        api, services, models, store
├── frontend/
│   ├── electron/
│   │   ├── inference/
│   │   │   ├── prompts/    Bonsai-1.7B prompt library (one module per
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
daemon (otherwise skipped). Loads Bonsai-1.7B and runs the prompt
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
(`compute: on-device`, `model: bonsai-1.7b`, `egress: 0 B`) where
applicable.

## Current status

| Phase | Status      | Progress | Summary |
| ----- | ----------- | -------- | ------- |
| Phase 0 — Consolidated prototype foundation | Complete    | 100% | Electron shell, B2C/B2B layouts, KApp card system, Privacy Strip, AI Action Launcher, Go data API. |
| Phase 1 — Local LLM MVP                     | Complete    | 100% | Ollama adapter, single-tier on-device router, IPC streaming, real privacy strip, B2C/B2B inference helpers. |
| Phase 2 — B2C bilingual chat demo            | Complete    | 100% | Bilingual Alice ↔ Minh chat with on-device translation per bubble, conversation summary, AI Memory, metrics dashboard, skills framework. |
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
