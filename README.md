# SLM Chat Demo — KChat AI Web & Mobile Demo

An interactive web and mobile-first demo of **KChat**'s local-first AI messaging
and productivity platform. This project replaces the static click-through
prototypes (the B2C and B2B "vision boards") with a working **React + Go**
application powered by **Gemma 4 E2B / E4B** small language models running
on-device via `llama.cpp` / Ollama / Unsloth Studio.

The goal is to let stakeholders, partners, and pilot users *actually use* the
core KChat AI workflows end-to-end against real local models, instead of
clicking through scripted screens.

## What is this?

**KChat** is a local-first AI messaging and productivity platform. It runs in
two modes off the same product surface:

- **B2C — Individuals, families, communities.** A personal "second brain"
  inside chat: morning digests, inline translation, task and reminder
  extraction, RSVP and event coordination, shopping nudges, family logistics,
  and AI memory that stays on-device.
- **B2B — SMEs and regulated teams.** A Slack-like collaboration surface plus
  **KApps** (lightweight embedded business apps) plus **AI employees** that
  turn threads into tasks, approvals, documents, and auditable artifacts —
  with every step reviewable by a human and pinned to the conversation that
  produced it.

The core thesis driving the demo:

> **AI-native messaging where the first answer is local, the workflow is
> human-reviewable, and every output stays anchored to the conversation that
> created it.**

This repository is the *executable* expression of that thesis — a thin, real
product slice you can run on a laptop or phone.

## Key AI functionalities demonstrated

The demo covers the AI capabilities from both KChat product modes. Every
feature shows a **compute transparency** indicator (on-device vs. confidential
server) and an audit trail back to the chat thread that produced it.

### B2C — Personal second brain

- **Morning catch-up.** A digest of overnight messages, mentions, and tasks
  across personal and community chats.
- **Smart reply.** Tone-aware response drafts grounded in the local AI memory
  (who the recipient is, prior context, your preferences).
- **Inline translation.** Per-message translation rendered in place, with the
  original always one tap away.
- **Task extraction.** Detects commitments and action items in messages and
  offers them as tasks with due dates and owners.
- **Family coordination.** Shared chores, school pickups, calendar nudges, and
  household logistics.
- **Shopping nudge.** Detects low-stock or recurring items in chat and offers
  to add them to a shared list.
- **Community event card.** Generates an RSVP-able structured card from a
  free-form "let's get together" message.
- **Guardrails.** Local moderation against community rules before a message is
  sent or surfaced.
- **AI Memory & insights.** Encrypted, local store of facts learned across
  scopes, with explicit per-fact attribution in every AI output.

### B2B — Workspace AI employees

- **Core intents.** A unified action taxonomy — **Create**, **Analyze**,
  **Plan**, **Approve** — exposed across the workspace.
- **AI Employees.** Named, governed agents with budgets and queues:
  - **Kara — Ops AI** (incidents, runbooks, SOPs)
  - **Nina — PM AI** (PRDs, RFCs, roadmaps)
  - **Mika — Sales AI** (proposals, QBR decks, pipeline analysis)
- **Task extraction.** Threads become tracked tasks with owners, due dates,
  and links back to the source messages.
- **Artifact drafting.** First-pass **PRD, RFC, proposal, SOP, QBR** drafts
  generated from the conversation, editable in a collaborative document
  surface.
- **Approval prefill.** Pre-populates approval requests (amount, vendor,
  policy, justification) from the chat context.
- **Forms.** Generates structured intake forms from free-form requests.
- **Compute transparency.** Every AI step is labeled on-device, confidential
  server, or refused — with the routing reason visible to the user.

## Local LLM models

The demo runs Google's **Gemma 4** family via **Unsloth's GGUF** builds. Both
tiers support **text, image, and audio** input with **128K-token** context
windows.

| Tier      | Model                              | RAM (Q4 quant) | Used for                                                                                              |
| --------- | ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| Mid-tier  | `unsloth/gemma-4-E2B-it-GGUF`      | ~3.2 GB        | Summaries, inline translation, task extraction, smart replies, fast on-device responses               |
| High-tier | `unsloth/gemma-4-E4B-it-GGUF`      | ~5.0 GB        | Artifact drafts (PRD / RFC / proposal / SOP / QBR), AI employee recipes, source-grounded synthesis    |

### Routing rule

The app picks a tier per request using a single, deterministic policy:

1. **Short, private, latency-sensitive** request → **E2B** (on-device).
2. Needs **better reasoning, longer synthesis, or grounded artifact drafting**
   → **E4B** (on-device if it fits, otherwise the next step).
3. Workspace **policy permits a confidential server** for this request →
   confidential server (E4B-class) with explicit "confidential server" label.
4. Otherwise → **refuse**, surface why, and offer a local-only fallback.

This routing is exposed in the UI: every AI response shows which tier ran and
why.

## Tech stack

### Frontend (web + mobile)

- **React + TypeScript**, built with **Vite**
- **TanStack Router** for routing, **TanStack Query** for server state
- **Zustand** for local UI state
- **Tiptap / ProseMirror** for the artifact editor
- **TanStack Table** for tabular surfaces (tasks, approvals, pipeline)
- **WebSocket / SSE** for live chat and streaming model output
- **IndexedDB** for the local-first message and AI-memory store
- **Service Worker** for offline support and mobile install

### Backend

- **Go** API gateway (chat, presence, artifacts, model routing)
- **PostgreSQL** for durable metadata
- **NATS JetStream** for the event/work bus (task extraction, AI jobs)
- **MinIO / S3** for artifact and attachment storage
- **Meilisearch** (dev) / **Bleve** (embedded) for search
- **llama.cpp / Ollama / Unsloth Studio** as the local model runtime (Gemma 4
  E2B / E4B GGUF)

## Quick start

### Prerequisites

- **Node.js 20+**
- **Go 1.22+**
- **Ollama** (recommended) or **llama-server** (`llama.cpp`)
- A **Gemma 4 E2B GGUF** model pulled locally (E4B optional but recommended)

### 1. Clone the repo

```bash
git clone https://github.com/kennguy3n/slm-chat-demo.git
cd slm-chat-demo
```

### 2. Start a local model

Using Ollama (simplest):

```bash
# Mid-tier (required)
ollama pull unsloth/gemma-4-E2B-it-GGUF
ollama run  unsloth/gemma-4-E2B-it-GGUF

# High-tier (optional, for artifact drafting / AI employees)
ollama pull unsloth/gemma-4-E4B-it-GGUF
```

Or using `llama-server` from `llama.cpp`:

```bash
llama-server -m ./models/gemma-4-E2B-it-Q4_K_M.gguf --port 8080 -c 131072
```

### 3. Start the Go backend

```bash
cd backend
go run ./cmd/server
```

The API gateway will listen on `:8081` by default and connect to the local
model runtime on `:11434` (Ollama) or `:8080` (`llama-server`).

### 4. Start the React frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app

Open <http://localhost:5173> in your browser. The mobile-first layout works on
both desktop and phone — install it as a PWA from the browser menu to get the
full mobile demo.

## Project documents

| Document                            | Purpose                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| [`PROPOSAL.md`](./PROPOSAL.md)      | Product thesis, target users, demo scope, and the B2C / B2B narrative this demo proves. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System architecture, model routing, on-device vs. server boundaries, data model.    |
| [`PHASES.md`](./PHASES.md)          | Phased build plan: which features land in which milestone and why.                   |
| [`PROGRESS.md`](./PROGRESS.md)      | Running implementation log: what's shipped, what's in flight, known gaps.            |

## Related repositories

These two static prototypes are the design baseline this demo replaces with a
working app:

- **B2C static prototype** — <https://github.com/kennguy3n/kchat-b2c-ai-vision-board>
- **B2B static prototype** — <https://github.com/kennguy3n/kchat-b2b-ai-vision-board>

## License

[MIT](./LICENSE)
