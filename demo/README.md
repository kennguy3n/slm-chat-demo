# Demo screenshots

This directory collects screenshots of the KChat SLM Demo desktop app
running the four demonstration flows described in
[PROPOSAL.md](../PROPOSAL.md) §5. Each screenshot is captured against
the enriched seed data (`backend/internal/store/seed.go`).

- [B2C — personal memory & family / community flows](#b2c-flows)
- [B2B — workspace & AI-employee flows](#b2b-flows)
- [On-device LLM — privacy posture](#on-device-llm-demonstration)
- [How to reproduce each screenshot](#how-to-reproduce)

> **Note on coverage.** Most screenshots are captured from the Vite
> renderer served at `http://localhost:5173/` (the same React app the
> Electron shell loads). The 2026-04-30 pass also re-captured a set of
> shots against the **real** `Ternary-Bonsai-8B-Q2_0.gguf` wired
> through the PrismML llama.cpp fork (`prism` branch) → an Ollama-API
> shim → the Electron shell's `OllamaAdapter` — those shots show the
> `ternary-bonsai-8b · idle` chip in the top-right header instead of
> the mock badge, and pending in-flight LLM calls render the
> `Translating on-device…` and `Drafting on-device replies…` markers
> visible in several frames. A subset of screens require a fully
> streamed AI result that the model cannot finish within a reasonable
> capture window on this 8-core CPU box (~0.3 tok/s on Q2_0 without
> Apple Silicon NEON / Metal kernels) — those entries remain marked
> **(pending)** below. The accompanying demo flow is still
> reproducible by hand using the **How to reproduce** instructions.
>
> Captured in this pass (real Q2_0 model loaded, 2026-04-30):
>
> - Standalone: `local-model-status`.
> - B2C (header chip shows `ternary-bonsai-8b · idle`,
>   `Translating on-device…` markers visible):
>   `08-event-rsvp`, `12-metrics-dashboard`.
> - B2B (header chip shows `ternary-bonsai-8b · idle`):
>   `01-workspace-navigation`, `08-ai-employee-panel`,
>   `10-connector-panel`, `11-knowledge-graph`, `12-policy-admin`.
>
> Captured in earlier passes (Vite renderer):
>
> - B2C: `01-morning-catchup-banner`, `03-family-task-extraction`,
>   `04-family-task-cards`, `06-translation-caption`,
>   `13-vi-en-translation-auto`.
> - B2B: `02-thread-summary`, `03-action-launcher`,
>   `04-approval-prefill`, `05-approval-card-pending`,
>   `06-artifact-draft`.
>
> Pending (need a manual capture pass — these surfaces require a fully
> completed live AI stream from the Electron shell, which is too slow
> on a CPU-only Q2_0 build to fit a single capture window): `b2c/02`,
> `b2c/05`, `b2c/07`, `b2c/09`, `b2c/10`, `b2c/11`, `b2b/07`, `b2b/09`,
> `privacy-strip-on-device.png`, `egress-summary-zero.png`.

## B2C flows

Source channels: `ch_dm_alice_bob`, `ch_family`, `ch_neighborhood` in
the **Personal** workspace. Each demo flow maps to one of the four
PROPOSAL.md §5 scenarios.

| # | File | PROPOSAL §5 flow | Privacy strip | What it shows |
|---|------|------------------|---------------|---------------|
| 1 | [`b2c/01-morning-catchup-banner.png`](./b2c/01-morning-catchup-banner.png) | §5.1 Morning Catch-up | — | B2C shell's "things need attention" banner before the user opts into a catch-up. |
| 2 | [`b2c/02-morning-catchup-digest.png`](./b2c/02-morning-catchup-digest.png) | §5.1 Morning Catch-up | on-device, 0 B egress | Streamed digest of 4 threads (field-trip form, piano recital, block-party, vendor decision) with the 8-element privacy strip below. |
| 3 | [`b2c/03-family-task-extraction.png`](./b2c/03-family-task-extraction.png) | §5.2 Extract tasks | on-device | Family group chat showing the `TaskCreatedPill` ("N items extracted") after the enriched seed's multi-day activity. |
| 4 | [`b2c/04-family-task-cards.png`](./b2c/04-family-task-cards.png) | §5.2 Extract tasks | on-device | Expanded `TaskExtractionCard` with Accept / Edit / Discard controls. |
| 5 | [`b2c/05-smart-reply.png`](./b2c/05-smart-reply.png) | §5.2 Smart reply | on-device | `SmartReplyBar` rendering 2-3 contextual suggestions (MockAdapter's multi-line output) inside the composer. |
| 6 | [`b2c/06-translation-caption.png`](./b2c/06-translation-caption.png) | §5.2 Translate | on-device | Inline translation caption below the Spanish line seeded as `msg_dm_8`. |
| 7 | [`b2c/07-shopping-nudges.png`](./b2c/07-shopping-nudges.png) | §5.2 Second-brain nudges | on-device | `ShoppingNudgesPanel` suggesting items pulled from the enriched family grocery thread. |
| 8 | [`b2c/08-event-rsvp.png`](./b2c/08-event-rsvp.png) | §5.2 RSVP card | on-device | `EventRSVPCard` from community chat — the enriched seed now carries *multiple* events (block party, garage sale, lost pet, volunteer setup). |
| 9 | [`b2c/09-privacy-strip-detail.png`](./b2c/09-privacy-strip-detail.png) | §5 — privacy | on-device | Close-up of the expanded privacy strip showing all 8 elements from PROPOSAL.md §4.3 (compute location, model, sources, egress, confidence, why-suggested, accept/edit/discard, linked origin). |
| 10 | [`b2c/10-device-capability-panel.png`](./b2c/10-device-capability-panel.png) | §5 — device | on-device | `DeviceCapabilityPanel` showing the on-device model status. |
| 11 | [`b2c/11-ai-memory-page.png`](./b2c/11-ai-memory-page.png) | §5.1 — memory | on-device | AI Memory page listing local-only facts (IndexedDB-backed; 0 B egress). |
| 12 | [`b2c/12-metrics-dashboard.png`](./b2c/12-metrics-dashboard.png) | §5 — metrics | on-device | `MetricsDashboard` aggregating per-task runs and confirming *"all AI ran on-device"*. |

## B2B flows

Source workspace: **Acme Corp** (`ws_acme`) with two domains —
`Engineering` (`ch_general`, `ch_engineering`) and `Finance`
(`ch_vendor_management`).

| # | File | PROPOSAL §5 flow | Privacy strip | What it shows |
|---|------|------------------|---------------|---------------|
| 1 | [`b2b/01-workspace-navigation.png`](./b2b/01-workspace-navigation.png) | §4 shell | — | B2B layout with the workspace → domain → channel hierarchy in the left sidebar. |
| 2 | [`b2b/02-thread-summary.png`](./b2b/02-thread-summary.png) | §5.3 — summarize | on-device | `ThreadSummaryCard` with source citations anchored to the vendor-management thread. |
| 3 | [`b2b/03-action-launcher.png`](./b2b/03-action-launcher.png) | §5.3 — launcher | — | Action Launcher open with the Create / Analyze / Plan / Approve four-intent grid. |
| 4 | [`b2b/04-approval-prefill.png`](./b2b/04-approval-prefill.png) | §5.3 — approval prefill | on-device | `ApprovalPrefillCard` with vendor / amount / risk / justification prefilled from the enriched thread (`msg_vend_r5`–`r7`). |
| 5 | [`b2b/05-approval-card-pending.png`](./b2b/05-approval-card-pending.png) | §5.3 — approval lifecycle | on-device | `ApprovalCard` after submission, in the **Pending** state awaiting Eve's decision. |
| 6 | [`b2b/06-artifact-draft.png`](./b2b/06-artifact-draft.png) | §5.4 — PRD draft | on-device | `ArtifactDraftCard` streaming a PRD draft with source pins back into `msg_eng_root`. |
| 7 | [`b2b/07-artifact-workspace.png`](./b2b/07-artifact-workspace.png) | §5.4 — artifact editor | on-device | `ArtifactWorkspace` showing sections, version history, and diff view. |
| 8 | [`b2b/08-ai-employee-panel.png`](./b2b/08-ai-employee-panel.png) | §5.4 — AI Employee | on-device | `AIEmployeePanel` showing Kara Ops AI with her budget, queued recipes, and recent runs. |
| 9 | [`b2b/09-recipe-output-gate.png`](./b2b/09-recipe-output-gate.png) | §5 — output gate | on-device | `RecipeOutputGate` presenting the mandatory Accept / Edit / Discard review before a recipe writes into a KApp. |
| 10 | [`b2b/10-connector-panel.png`](./b2b/10-connector-panel.png) | §5.4 — connector | on-device | `ConnectorPanel` showing the seeded Google Drive connector attached to `ch_vendor_management`. |
| 11 | [`b2b/11-knowledge-graph.png`](./b2b/11-knowledge-graph.png) | §5 — knowledge | on-device | `KnowledgeGraphPanel` (right-rail "Knowledge" tab) on `#vendor-management` after pressing **Extract**: 2 decisions ("pulling that now — pending decision…", "go with Acme Logs at $42,000/yr…"), 2 risks, 1 requirement, 0 owners — each with `source` link back to the originating message and a confidence badge. |
| 12 | [`b2b/12-policy-admin.png`](./b2b/12-policy-admin.png) | §6 — policy | on-device | `PolicyAdminPanel` showing per-workspace AI compute rules (server compute denied, egress budget, redaction required). |

## On-device LLM demonstration

| # | File | What it shows |
|---|------|---------------|
| 1 | [`local-model-status.png`](./local-model-status.png) | `DeviceCapabilityPanel` reporting the `ternary-bonsai-8b` alias loaded through Ollama (or MockAdapter fallback when the daemon is absent). |
| 2 | [`privacy-strip-on-device.png`](./privacy-strip-on-device.png) | Close-up of a single privacy strip confirming `compute: on-device`, `model: ternary-bonsai-8b`, `egress: 0 B`. |
| 3 | [`egress-summary-zero.png`](./egress-summary-zero.png) | `EgressSummaryPanel` aggregating per-session totals and showing **0 B** (all local compute). |

All B2C and B2B screenshots in this directory show the privacy strip /
header reporting `on-device` and `0 B egress`. The 2026-04-30 pass
re-captured the shots listed in **Captured in this pass** above against
the live `Ternary-Bonsai-8B-Q2_0.gguf` GGUF served from the PrismML
llama.cpp fork; the rest still come from the renderer's deterministic
mock outputs. The three standalone shots in this section call out the
on-device posture as a standalone artefact (only `local-model-status`
has been re-captured against the live model so far).

## How to reproduce

1. **Start the backend** (optional — only needed for chat / thread data):

   ```bash
   cd backend
   go run ./cmd/server
   ```

2. **Start the Electron dev loop**:

   ```bash
   cd frontend
   npm install
   npm run electron:dev
   ```

3. **Optional — wire a real local model**:

   ```bash
   ./scripts/setup-models.sh                # pulls ternary-bonsai-8b via Ollama
   ```

   Without Ollama, the bootstrap falls back to `MockAdapter`; the
   pre-2026-04-30 screenshots below were produced against the mock so
   the outputs are deterministic.

4. **Optional — wire the live `Ternary-Bonsai-8B-Q2_0.gguf` GGUF
   (Prism quant)**: the Q2_0 ternary quant is **not** in mainline
   `llama.cpp` and Ollama 0.22.0 cannot load it; use the PrismML fork
   plus a tiny Ollama-API shim:

   ```bash
   # 1. Build the PrismML fork's llama-server (one-time):
   git clone -b prism https://github.com/PrismML-Eng/llama.cpp \
     ~/prismml-llama.cpp
   cd ~/prismml-llama.cpp
   cmake -B build -DGGML_NATIVE=ON -DLLAMA_CURL=OFF \
     -DCMAKE_BUILD_TYPE=Release
   cmake --build build -j8 --target llama-server

   # Verify CPU features (need at least avx2 + fma for decent performance):
   lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"

   # 2. Start llama-server bound to the Q2_0 GGUF:
   ./build/bin/llama-server \
     -m /path/to/Ternary-Bonsai-8B-Q2_0.gguf \
     -c 1024 -t 4 -tb 4 --host 127.0.0.1 --port 8800 --parallel 1 \
     --mlock --no-mmap

   # 3. Run an Ollama-API shim that translates /api/generate
   #    -> llama-server's /completion (sample lives outside this
   #    repo; see PR #38 description for the bridge sketch).

   # 4. Launch the Electron shell pointed at the shim:
   cd frontend
   OLLAMA_BASE_URL=http://127.0.0.1:11434 \
     MODEL_NAME=ternary-bonsai-8b \
     MODEL_QUANT=q2_0 \
     npm run electron:dev
   ```

   llama-server flag notes (see [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md)
   for the full matrix):

   - `-c 1024`: limits attention cost per token; use `-c 512` for even
     faster classification / routing tasks.
   - `-t 4 -tb 4`: 4 threads is often faster than 8 on shared VMs due
     to cache contention; benchmark with
     `-t 1,2,4,6,8` (see the `llama-bench` matrix in the tuning guide).
   - `--mlock`: prevents the OS from paging model weights to swap.
   - `--no-mmap`: avoids slow page faults on VMs with slow virtual
     disk; test both with and without on your host.

   On a CPU-only host the Q2_0 quant runs around 0.3 tok/s, so
   surfaces that need a fully-streamed AI result (smart-reply,
   morning-digest streaming text, knowledge-graph extraction with
   long output) take 5–17 minutes per call. The shots flagged
   `(pending)` above could not be captured inside a reasonable window
   on this 8-core box; run on Apple Silicon (NEON / Metal) or a
   discrete GPU to capture them. Benchmark your box before blaming
   the model:

   ```bash
   ./build/bin/llama-bench \
     -m /path/to/Ternary-Bonsai-8B-Q2_0.gguf \
     -p 128 -n 128 -c 1024 -t 4
   ```

   See [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
   full tuning checklist (CPU feature probing, thread-count sweeps,
   KV-cache quant, swap monitoring, recommended fallback models).
   **Decision threshold**: if generation stays under 1 tok/s after
   tuning, the 8B model is the wrong choice for CPU-only deployment —
   switch to a smaller model (Qwen3 0.6B Q4_K_M, Gemma 3 1B QAT Q4_0,
   Qwen2.5 1.5B Q4_K_M) and reserve 8B for GPU / Metal / NPU paths.

### B2C flow (screenshots 1-12)

1. On first launch the top-bar reads **B2C**. The left sidebar lists
   **Bob Martinez**, **Family Group**, and **Neighborhood Community**.
2. Click **Family Group**. The "things need attention" banner at the top
   is screenshot **01**. Click **"Catch me up"** — the streamed digest
   (screenshot **02**) runs `summarize` against the four seeded
   channels, with the privacy strip visible below.
3. Still in **Family Group**, open the **AI Action Launcher** in the
   composer and pick **Extract tasks**. The `TaskCreatedPill`
   (screenshot **03**) renders, and clicking it expands the task cards
   (screenshot **04**).
4. Type a partial reply in the composer to trigger the
   `SmartReplyBar` (screenshot **05**).
5. Open **Bob Martinez** (DM). The Spanish line `¿nos vemos a las
   siete en el restaurante de siempre?` shows the inline translation
   caption (screenshot **06**).
6. Open the **Second Brain** right-rail panel. `ShoppingNudgesPanel`
   (screenshot **07**) offers to add items from the enriched grocery
   thread.
7. Open **Neighborhood Community**. The `EventRSVPCard` (screenshot
   **08**) surfaces the block party; the chat scroll shows the
   enriched events (garage sale, lost pet, volunteer request).
8. Click any privacy strip to expand it (screenshot **09**).
9. From the top bar, open **Device** — `DeviceCapabilityPanel`
   (screenshot **10**).
10. Open **AI Memory** from the B2C rail (screenshot **11**).
11. Open **Metrics** from the B2C rail (screenshot **12**).

### B2B flow (screenshots 1-12)

1. Toggle the top bar to **B2B**. The sidebar renders the
   workspace → domain → channel tree (screenshot **01**).
2. Open **vendor-management**, click into `msg_vend_root`. The
   right-rail `ThreadPanel` mounts `ThreadSummaryCard` (screenshot
   **02**).
3. From the composer, open the **Action Launcher** — screenshot
   **03**.
4. Pick **Approve → Vendor approval**. `ApprovalPrefillCard`
   (screenshot **04**) renders with fields filled from the enriched
   vendor thread. Submit it — the resulting `ApprovalCard`
   (screenshot **05**) is pending Eve's decision.
5. Open **engineering** → `msg_eng_root`. Pick **Create → Draft PRD**
   from the Action Launcher. `ArtifactDraftCard` (screenshot **06**)
   streams the PRD; open it in the full editor for `ArtifactWorkspace`
   (screenshot **07**).
6. From the right rail, open **AI Employees** — `AIEmployeePanel`
   (screenshot **08**).
7. Trigger any recipe run from an AI Employee and the
   `RecipeOutputGate` (screenshot **09**) mounts before any KApp write.
8. Open **ConnectorPanel** (screenshot **10**) from the same rail.
9. `KnowledgeGraphPanel` (screenshot **11**) renders from the Q2 OKR
   thread in `#general`.
10. Open **Policy** in the right rail — `PolicyAdminPanel`
    (screenshot **12**).

### On-device / privacy shots

- `local-model-status.png`: top-bar → **Device** → scroll to the model
  row.
- `privacy-strip-on-device.png`: any AI card's privacy strip, expanded.
- `egress-summary-zero.png`: top-bar → **Egress** (or **Metrics** →
  **Egress summary** tab).

## Relationship to PROPOSAL.md §5

| PROPOSAL §5 flow | Primary screenshots |
|---|---|
| §5.1 Morning Catch-up digest (B2C) | `b2c/01`, `b2c/02`, `b2c/11`, `b2c/12` |
| §5.2 Task extraction + Smart reply + Translate + RSVP (B2C) | `b2c/03`–`b2c/08` |
| §5.3 Thread summary + Approval prefill (B2B) | `b2b/02`–`b2b/05` |
| §5.4 PRD draft + AI Employee + Connectors (B2B) | `b2b/06`–`b2b/11` |
| Privacy invariants (on-device, 0 B egress) | `b2c/09`, `local-model-status.png`, `privacy-strip-on-device.png`, `egress-summary-zero.png` |
