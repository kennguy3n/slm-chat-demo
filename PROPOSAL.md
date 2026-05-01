# KChat SLM Demo — Product Proposal

KChat is a single AI-native messaging and collaboration product with two
contexts: a consumer (B2C) context and a business (B2B) context. The SLM
(small language model) demo proves that the AI features users see inside
KChat can run on-device using quantized local models, falling back to
server compute only when workspace policy explicitly allows it.

This proposal defines the product thesis, the local LLM strategy, the
feature set across both contexts, the UX, the demonstration flows, and the
MVP scope.

---

## 1. Product thesis — "One shell, two contexts"

KChat builds **one common shell**, not two separate products. The same
navigation, the same AI surfaces, the same privacy primitives, and the same
KApp extension model are used whether a user is coordinating a family
weekend or approving a six-figure vendor contract. The *context* (personal
vs. workspace) changes what lives inside the shell — not the shell itself.

### Shared shell structure

```
KChat Shell
├── Chats / Channels
├── Threads
├── AI Action Launcher
├── AI Memory / Knowledge
├── Tasks
├── Notifications
├── Settings / Privacy
└── More / KApps
```

Every surface above is present in both contexts. Users learn KChat once
and carry the mental model across their personal and professional lives.

### Context-specific content

| Shell surface          | B2C context (personal)                               | B2B context (workspace)                                          |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Chats / Channels       | Personal chats, family groups, community groups      | Workspace, domain, channel, threads                              |
| Threads                | Reply threads inside a family/community chat         | Work threads tied to approvals, artifacts, connectors            |
| AI Action Launcher     | Smart reply, translate, extract tasks, RSVP helper   | Core intents: Create, Analyze, Plan, Approve                     |
| AI Memory / Knowledge  | Personal AI Memory (people, preferences, recurrences) | Workspace knowledge graph, policy, artifact corpus               |
| Tasks                  | Personal tasks, reminders, shopping lists            | Workspace tasks, approvals, AI Employee queue                    |
| Notifications          | Catch-up digest, event reminders, RSVP nudges        | Thread mentions, approval requests, connector alerts             |
| Settings / Privacy     | Privacy strip, local-model controls, guardrails      | Compute governance, data egress policy, retention, audit         |
| More / KApps           | Lightweight personal tools (lists, notes, RSVP)      | KApps, AI Employees, connectors, artifacts, forms, base/tables   |

### B2C context — surfaces in detail

- **Personal chats** — 1:1 and small DMs.
- **Family groups** — shared calendars, shopping, kid logistics.
- **Community groups** — neighborhood, hobby, school groups with RSVPs.
- **Personal tasks / reminders** — captured from chat, surfaced inline.
- **AI Memory** — stores people, recurring events, preferences on-device.
- **Smart reply / translation** — inline, never a separate screen.
- **Event + RSVP cards** — generated from chat, accept/decline in place.
- **Privacy strip** — visible per AI output: on-device, model used, bytes out.

### B2B context — surfaces in detail

- **Workspace** — tenant-scoped top-level container.
- **Domain** — logical grouping of channels (e.g. *Engineering*, *Finance*).
- **Channel** — durable discussion space, policy-governed.
- **Threads** — focused sub-conversations; most AI work happens here.
- **KApps** — embedded business modules (Base, Sheets, Forms, Drive, Mail).
- **AI Employees** — autonomous, governed agents with budgets and queues.
- **Approvals** — structured cards with prefill, decision log, immutability.
- **Artifacts** — persistent AI-generated documents (PRD, RFC, brief, spec).
- **Connectors** — read-only bridges to CRM, drive, ticket systems, mail.
- **Compute governance** — per-workspace rules on on-device / server usage.

### Load-bearing principle

**AI lives inside the conversation.** It shows up as inline badges,
translation captions, task pills, approval cards, and "why suggested"
explanations attached directly to the message or thread that triggered it.
Users do **not** leave the chat to reach an "AI app." There is no separate
modal AI screen that owns the experience — the chat is the surface; AI is
a property of the chat.

---

## 2. Local LLM model strategy

The demo proves KChat can meet its privacy promise ("AI runs where your
data lives") by routing most workloads to on-device models and only
falling back to a confidential server when both the workload and the
workspace policy allow it.

### Device-tier model mapping

| Tier             | Model                                            | Devices                                | Workloads |
| ---------------- | ------------------------------------------------ | -------------------------------------- | --------- |
| On-device        | `Bonsai-1.7B` from `prism-ml/Bonsai-1.7B-gguf`   | x86 / ARM laptops, desktops, and high-end phones | Every non-server workload — a single 1.7B model handles summaries, drafts, smart replies, translation, and task extraction. |
| Server           | Confidential server runtime (Phase 6)            | Explicit workspace policy only         | Corpora larger than local context or workspace-approved heavy runs. |

The demo assumes every KChat user has enough local compute to run
the Bonsai-1.7B GGUF through one of two on-device runtimes:
`llama-server` from the PrismML `llama.cpp` fork (the recommended
runtime) or an Ollama daemon. The inference router exposes a
single on-device tier (`local`) and a policy-gated `server` tier;
the alias the on-device adapter binds to is controlled by the
`MODEL_NAME` env var (default `bonsai-1.7b`).

### Workload routing table

| Workload                              | On-device (Bonsai-1.7B) | Server (confidential, policy-gated) |
| ------------------------------------- | :---------------------------: | :---------------------------------: |
| Smart reply                           | ✓ primary                     | —                                    |
| Inline translation                    | ✓ primary                     | —                                    |
| Morning digest / catch-up             | ✓ primary                     | —                                    |
| Extract tasks from a message          | ✓ primary                     | —                                    |
| Shopping / checklist extraction       | ✓ primary                     | —                                    |
| Event / RSVP card generation          | ✓ primary                     | —                                    |
| B2B thread summary                    | ✓ primary                     | ✓ if thread > local context          |
| PRD / RFC draft                       | ✓ primary                     | ✓ if corpus > local context          |
| Approval prefill                      | ✓ primary                     | ✓ if cross-connector synthesis       |
| Forms / structured intake autofill    | ✓ primary                     | —                                    |
| Connector summarization (mail, drive) | ✓ primary                     | ✓ large multi-doc rollups            |
| Knowledge-graph Q&A                   | ✓ primary                     | ✓ if policy allows workspace corpus  |
| Compute transparency explanations     | ✓ primary                     | —                                    |
| Multimodal analysis (image, file)     | ✓ primary                     | ✓ large / high-resolution assets     |
| AI Employee queue (background recipes)| ✓ primary                     | ✓ scheduled heavy runs               |

### Scheduler rule

The local scheduler follows a strict, auditable decision tree:

1. If the workload fits on-device → dispatch to the **Bonsai-1.7B local adapter**.
2. Else, if the **workspace policy permits** server compute → **tokenize
   and redact** the inputs, then dispatch to the **confidential server**.
3. Else → **refuse** and surface the reason in the privacy strip.

Every decision is recorded in the privacy strip attached to the output.

---

## 3. Feature set

Features are organized into shared surfaces (same in B2C and B2B, with
different *use*), then B2C-specific AI, then B2B-specific AI.

### 3.1 Shared features (B2C + B2B)

| Feature              | B2C use                                                    | B2B use                                                             |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Chat + threads       | Personal / family / community chats with reply threads     | Workspace / domain / channel with work threads                      |
| AI Action Launcher   | Smart reply, translate, extract, RSVP                      | Core intents: Create, Analyze, Plan, Approve                        |
| Inline AI badges     | "3 items extracted", "Translated", "Catch up"              | "Thread summary", "Sources used", "Confidence 0.82"                  |
| AI Memory            | Personal people, preferences, recurrences                   | Workspace policy, prior artifacts, decisions, entities              |
| Privacy strip        | On-device badge, bytes egress = 0, local model name         | Compute location, model, egress bytes, redaction notice             |
| Task cards           | Personal tasks and reminders                                | Workspace tasks tied to threads and approvals                       |
| Event / approval card| Event + RSVP card                                           | Approval card with prefill, decision, immutable log                 |
| Knowledge search     | Search across own chats and memories                        | Search across workspace corpus and connectors                       |
| Local model selector | On-device (default) / Off                                    | On-device / Confidential server (policy-gated)                      |
| Human confirmation   | Accept / edit / discard before any action is taken          | Accept / edit / discard; approvals require an explicit human decision |

### 3.2 B2C AI functionalities

The B2C surface is rebuilt as an LLM-first **bilingual chat demo**:
Alice (English) and Minh (Vietnamese) chat in their native language
and every bubble is translated on-device. The right rail collapses
to three tabs that all exercise either the on-device LLM or
on-device storage; the prior second-brain surfaces (family
checklist / shopping nudge / community event / trip planner) are
preserved as components but no longer mounted.

| Feature                  | Description                                                                                           | Local model role                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Inline bilingual translation | Two-panel translation card on every chat bubble — original on top, translation below, with per-language flag labels (🇺🇸 / 🇻🇳). The panel in the viewer's preferred language is the primary one; the partner-language panel is muted. | On-device per-message `translate` call, batched into a single IPC round-trip per visible bubble. |
| Bilingual conversation summary | Right-rail "Summary" tab. Summarises the active bilingual chat in the viewer's language, calling out topics, action items, and decisions, and noting that the conversation spans two languages. | On-device (Bonsai-1.7B) summarises the visible message tail with a bilingual-aware prompt. |
| Smart reply              | 2–3 contextual reply suggestions inline in the composer.                                              | On-device generates candidates.                            |
| Task extraction          | Detects actionable items in incoming messages ("submit form", "bring X") and offers task cards.      | On-device parses; user confirms before any task is created. |
| Guardrails               | Blocks risky auto-send; every suggested reply, task, or translation requires human confirmation.    | On-device classifier; no server call.                      |
| AI Memory / insights     | Remembers personal preferences and patterns locally. Right-rail "Memory" tab. The model never auto-writes — users add / edit / remove facts. | Stored on-device (IndexedDB); on-device retrieval when composing. |
| Metrics dashboard        | Right-rail "Stats" tab — user-facing view of translation runs, tokens, latency, bytes egressed, models used. | On-device summary of the user's own local activity log.   |

### 3.3 B2B AI functionalities

| Feature                    | Description                                                                                           | Local model role                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Core intents               | Unified taxonomy for all AI actions: Create, Analyze, Plan, Approve.                                  | Routed; intent classifier runs on-device.                       |
| AI Employees               | Named, governed agents (e.g. *Nina PM*, *Ravi Ops*) with task queues, budgets, and scoped permissions.| On-device for recipe steps; server only if policy allows.       |
| Task extraction            | Pulls tasks, owners, and due dates from a thread into a task card with provenance.                    | On-device extraction, including disambiguation across threads.  |
| Artifact drafting          | Generates PRDs, RFCs, briefs from a thread + picked sources; produces a versioned Artifact.          | On-device primary; server fallback only if corpus exceeds local context.|
| Approval prefill           | Fills vendor / amount / justification / risk fields from a thread and linked connectors.             | On-device prefill for all fields.                               |
| Forms                      | Autofills structured intake forms (vendor onboarding, expense, access request) from a source thread. | On-device for both simple and narrative fields.                 |
| Base / tables              | Proposes schema columns and row inserts from a thread; user confirms.                                | On-device schema synthesis and row-level extraction.            |
| Sheets                     | Generates calculations, pivots, and chart suggestions against a selected range.                       | On-device formula synthesis; no server call by default.         |
| Connector summarization    | Rolls up mail / drive / ticket items into a thread-scoped summary with citations.                     | On-device for single-item and multi-doc; server for very large. |
| Knowledge graph            | Workspace-scoped entity + decision graph with source links; answers "why / who decided X".           | On-device retrieval and synthesis; policy-gated server for heavy Q&A. |
| Compute transparency       | Every AI output renders where it ran, which model, which sources, and how many bytes left the device.| Rendered on-device with no extra inference call.                |

---

## 4. UX design

The UX has three rules: (1) AI is attached to messages, not to its own
screen; (2) every AI output carries an explain-and-audit strip; (3) the
web, desktop, and mobile layouts are the same mental model in different
form factors.

### 4.1 Web / desktop layout

A three-column shell with a persistent top bar.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Top bar: Workspace ▾ │ Search │ AI mode: On-device ▾ │ E2EE │ Egress 0B  │
├────────────┬────────────────────────────────┬────────────────────────────┤
│ Sidebar    │ Main chat                      │ Right panel                │
│            │                                │                            │
│ Workspace  │ Messages                       │ Thread                     │
│ Domains    │   └ Inline AI badges           │ KApps (Base, Forms, Sheets)│
│ Channels   │   └ Cards (task, event,        │ Artifact editor            │
│ DMs        │      approval)                 │ Sources used               │
│ AI         │ Composer                       │ AI assistant (scoped)      │
│ Employees  │ Action Launcher trigger        │                            │
└────────────┴────────────────────────────────┴────────────────────────────┘
```

- **Sidebar** — Workspace switcher, domains, channels, DMs, AI Employees.
- **Main chat** — messages, inline AI badges, cards, composer, and the
  Action Launcher entry point.
- **Right panel** — thread view, KApps, artifact editor, sources, a
  thread-scoped AI assistant.
- **Top bar** — workspace, search, current AI mode (on-device / server),
  E2EE indicator, running data-egress counter.

### 4.2 Mobile layout

Messaging-first with five bottom tabs:

```
┌────────────────────────────┐
│                            │
│        Main surface        │
│    (Message / Notif /      │
│     Tasks / Settings)      │
│                            │
├────────────────────────────┤
│  Message │ Notif │ Tasks │  │
│           Settings │ More │ │
└────────────────────────────┘
```

- **Tabs**: Message | Notification | Tasks | Settings | More.
- **B2C mapping** — tabs reach personal and community chats; Tasks shows
  family checklists and reminders; Notifications shows catch-up + RSVP.
- **B2B mapping** — tabs reach workspace and channel navigation; Tasks
  shows thread-linked work; Notifications shows approvals and mentions;
  More hosts KApps and AI Employees.

### 4.3 Required AI UI elements

Every AI output — inline badge, card, artifact draft, task pill, digest —
must render these eight elements. If any are missing the output is not
allowed to surface.

| Element                  | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| Compute location         | On-device / confidential server.                                        |
| Model name               | `bonsai-1.7b` (on-device default) or a named confidential server. |
| Sources used             | Messages, files, connector items, memories referenced.                  |
| Data egress              | Bytes that left the device (0 for on-device).                           |
| Confidence / missing info| Model-reported confidence and any gaps ("owner unknown", "date ambiguous"). |
| Why suggested            | Short, human-readable reason tied to the originating message.           |
| Accept / edit / discard  | No action is taken without an explicit user choice.                     |
| Linked origin            | Back-link to the originating message or thread for auditability.        |

---

## 5. Demonstration flows

Four end-to-end flows are shipped in the demo to prove the thesis.

### 5.1 B2C "Bilingual conversation summary"

1. User opens the B2C context. The bilingual DM
   `ch_dm_alice_minh` (Alice 🇺🇸 ↔ Minh 🇻🇳) is auto-selected on
   first mount.
2. The right rail's **Summary** tab is already loading. While the
   stream completes, the privacy strip on the panel shows
   **on-device**, **bonsai-1.7b**, **0 B egress**.
3. The summary renders in the viewer's preferred language
   (English): plan + lunch reservation, restaurant order,
   per-side action items (Minh books the table; Alice brings an
   umbrella), and a brief note that the chat ran across two
   languages.
4. Each line links back to the originating message in the chat.
5. The same panel re-uses its cached result on subsequent
   right-rail tab switches — no re-inference until the user
   refreshes.

### 5.2 B2C "Cross-language chat with real-time translation"

1. Minh sends a Vietnamese message: *"Chào Alice! Thứ Bảy này
   mình rảnh. Nhà hàng nào vậy? Mình nghe nói có một quán phở mới
   mở ở trung tâm."*
2. Alice's bubble auto-renders a two-panel translation card:
   original Vietnamese on top, English translation below
   (*"Hi Alice! I'm free this Saturday. Which restaurant?
   I heard a new phở place opened downtown."*). The English
   panel is the primary surface; the Vietnamese panel is muted
   and labeled 🇻🇳 Vietnamese; English is labeled 🇺🇸 English.
3. The privacy strip on the card shows **on-device**,
   **bonsai-1.7b**, **0 B egress** with the source-message pin.
4. Alice replies in English (*"Yes! That's the one. I heard
   their pho is amazing. Want to meet around noon?"*); the
   bubble renders the same two-panel card, but with the
   emphasis flipped — English (her own language) is now the
   primary panel and Vietnamese (the partner language) is
   secondary, so Minh sees the translation prominently from
   his side.
5. `MessageList` batches every visible bubble into a single
   `ai:translate-batch` IPC call, so the whole conversation
   renders translation cards in one round-trip.

### 5.3 B2B "Vendor approval"

1. User opens `#vendor-management` in the workspace. The seeded
   thread contains 12 messages with explicit pricing, SOC 2
   compliance notes, single-region risk, and a final decision —
   enough natural-language context for an 8B model to ground each
   approval field.
2. User opens the Action Launcher and picks **Request Approval**.
3. The **on-device Bonsai-1.7B** model receives a Phase 7
   prompt-library prompt (`prefill-approval.ts`) asking for
   `vendor: …`, `amount: …`, `justification: …`, `risk: …` lines.
   The parser tolerates extra whitespace, alternative bullet
   markers, optional `cost` / `price` aliases for amount, and
   captures unknown keys (e.g. `contract length`, `termination`)
   into an `extra` map.
4. The approval card prefills with the parsed fields plus the
   source-message ids the parser identified.
5. User reviews, edits one field, and submits.
6. An approval card appears in the thread with status **Pending**.
7. The named approver opens the card and clicks **Approve**.
8. An **immutable decision log** entry is written (who, when, model,
   sources, egress). The card flips to **Approved** with a permalink.

### 5.4 B2B "Draft PRD with Nina PM AI"

1. User opens the Action Launcher and picks **Create → PRD**.
2. The **Brief Builder** opens: user selects the source thread (e.g.
   the seeded `engineering` inline-translation discussion or the
   new `product-launch` cross-functional thread), a linked Drive
   folder, a PRD template, and a tone.
3. The scheduler picks **on-device Bonsai-1.7B** (policy allows
   server, but local is sufficient for this corpus).
4. Nina PM streams the draft using the Phase 7 `draft-artifact.ts`
   prompt template (artifact-type-aware: PRD / RFC / Proposal /
   SOP / QBR; section-aware: requirements / risks / scope etc.).
   Output is 5 sections of Markdown with inline citations to thread
   messages and Drive files, a confidence score per section, and a
   list of missing information.
5. User edits two sections and clicks **Publish**.
6. Publishing creates **Artifact v1** and posts a card back in the
   channel with a link to the artifact and the full source list.

> All four B2B flows above route through the real on-device LLM
> via `OllamaAdapter` when Ollama is reachable. The `MockAdapter`
> still satisfies the contract for unit tests but emits clearly
> `[MOCK]`-labelled placeholders so the demo path is unambiguous.
> The Phase 7 prompt library
> ([`frontend/electron/inference/prompts/`](./frontend/electron/inference/prompts/))
> centralises every B2B prompt template and parser.

---

## 6. MVP scope

The MVP is an **Electron desktop app** that runs on a laptop and shows
the four flows above end-to-end with real local models. The Electron
**main process** owns inference (TypeScript port of the original Go
adapter contract; talks to a local Ollama daemon directly), the
**renderer** is the same React UI, and a small Go data API provides
chats, threads, workspaces and seeded KApp cards. No AI traffic ever
leaves the device.

### Build first

- **B2C**
  - Morning catch-up digest.
  - Inline translation.
  - Smart reply.
  - Task extraction from chat.
  - Family shared checklist.
  - Community event + RSVP card.
- **B2B**
  - Workspace / domain / channel navigation.
  - Thread view with inline AI badges.
  - Action Launcher (Create / Analyze / Plan / Approve).
  - Task extraction in a workspace thread.
  - Approval prefill + approval card with immutable decision log.
  - PRD draft workspace (Brief Builder + Artifact v1).
  - AI Employee queue (mocked execution, real UI and governance).
- **Local AI**
  - On-device route backed by `prism-ml/Bonsai-1.7B-gguf` (alias
    `bonsai-1.7b`, single GGUF that runs on x86, ARM, and Apple
    Silicon). The Electron bootstrap probes `llama-server` from the
    PrismML `llama.cpp` fork first (default `http://localhost:11400`,
    override via `LLAMACPP_BASE_URL`) and falls back to an Ollama
    daemon when llama-server is unreachable. Operators can override
    `MODEL_NAME` to point at a different pulled alias without
    touching any code.
  - Streaming output in the chat surface.
  - Privacy strip on every AI output (compute location, model, sources,
    egress, confidence, why, linked origin).
  - Model status panel (which model is loaded, device tier, load state).

### Avoid in MVP

- Generic plugin marketplace.
- Full CRM.
- Full spreadsheet engine.
- Full project management suite.
- Multi-tenant enterprise billing.
- Complex connector matrix (keep to one mocked mail and one mocked drive
  source).
- Unbounded long-context generation (cap at local context window; server
  fallback is out of MVP scope).
- Auto-publish AI actions (every action requires human confirmation).
