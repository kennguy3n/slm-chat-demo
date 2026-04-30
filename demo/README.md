# Demo screenshots

This directory collects screenshots of the KChat SLM Demo desktop app
running the four demonstration flows described in
[PROPOSAL.md](../PROPOSAL.md) §5. Each screenshot is captured against
the enriched seed data (`backend/internal/store/seed.go`).

- [B2C — personal memory & family / community flows](#b2c-flows)
- [B2B — workspace & AI-employee flows](#b2b-flows)
- [On-device LLM — privacy posture](#on-device-llm-demonstration)
- [On-device LLM — measured performance](#on-device-llm-performance)
- [How to reproduce each screenshot](#how-to-reproduce)

> **Note on coverage.** Captured 2026-04-30 via Playwright over the
> Electron CDP endpoint (`http://localhost:9222`) against the live
> Vite + Go backend stack with Bonsai-8B-Q1_0 served through Ollama.
> Some streaming surfaces (morning digest, smart-reply chips,
> shopping nudges) show the in-progress streaming marker because
> Q1_0 on a CPU-only VM runs well below interactive latency — the
> chrome, privacy strip, and action buttons are still accurate. See
> [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
> per-host-class quant matrix and tok/s expectations.

## B2C flows

> ⚠️ **Pending re-capture (2026-04-30 redesign).** The B2C surface
> was reground around the bilingual Alice ↔ Minh chat demo (PR #50).
> Several of the captures below — `07-shopping-nudges.png`,
> `08-event-rsvp.png`, the family-checklist shots, the trip-planner
> shot — show right-rail surfaces that no longer mount in the new
> layout, and the digest panel was renamed to "Conversation
> summary". The eight new bilingual captures (full chat overview;
> single VI→EN bubble close-up; outgoing EN→VI bubble; smart-reply
> after a Vietnamese message; expanded privacy strip;
> conversation-summary panel; device-capability panel; metrics
> dashboard with translation runs) are still pending — see the
> "Bilingual chat capture" subsection below for the manual flow,
> which the next capture pass will run end-to-end.

Source channels: the bilingual DM `ch_dm_alice_minh` (the new
default), plus `ch_dm_alice_bob`, `ch_family`, `ch_neighborhood` in
the **Personal** workspace.

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
| 1 | [`local-model-status.png`](./local-model-status.png) | `DeviceCapabilityPanel` reporting the `bonsai-8b` alias loaded through Ollama (or MockAdapter fallback when the daemon is absent). |
| 2 | [`privacy-strip-on-device.png`](./privacy-strip-on-device.png) | Close-up of a single privacy strip confirming `compute: on-device`, `model: bonsai-8b`, `egress: 0 B`. |
| 3 | [`egress-summary-zero.png`](./egress-summary-zero.png) | `EgressSummaryPanel` aggregating per-session totals and showing **0 B** (all local compute). |

All B2C and B2B screenshots in this directory show the privacy strip /
header reporting `on-device` and `0 B egress`. The 2026-04-30 pass
re-captured the shots listed in **Captured in this pass** above against
the live Bonsai-8B weights pulled via
`./scripts/setup-models.sh` through Ollama; the rest still come from
the renderer's deterministic mock outputs. The three standalone shots
in this section call out the on-device posture as a standalone
artefact (only `local-model-status` has been re-captured against the
live model so far).

## On-device LLM performance

Live numbers, 2026-04-30, against the **PrismML Bonsai-8B-Q1_0** GGUF
served through the PrismML `llama.cpp` fork. Host: AMD EPYC 7763,
8 vCPU (no NUMA split, AVX2 + FMA + BMI2), 31 GiB RAM, 0 swap,
CPU-only (no GPU / Metal / NPU).

**Artifact size.** Bonsai-8B-Q1_0 is **~1.16 GB on disk** (1 105 MiB
GGUF, ~1.2 GB resident at startup before KV-cache growth) — this is
the canonical x86 CPU-friendly target the demo documents. Stock
Ollama 0.22.x cannot load the Q1_0 tensors (the bundled `llama.cpp`
does not implement the Q1_0 tensor type); the demo runs `llama-server`
from [`PrismML-Eng/llama.cpp`](https://github.com/PrismML-Eng/llama.cpp)
(`prism` branch) behind a tiny Ollama-API translator so the Electron
shell's `OllamaAdapter` still works (full path in
[How to reproduce → step 4](#how-to-reproduce)).

**Sustained generation rate (warm):**

| PrismML `llama-bench`, `-t 6`, CPU-only      | tok/s     |
| -------------------------------------------- | --------- |
| `pp64`  (prompt processing, 64 input tokens) | **14.82** |
| `tg32`  (token generation, 32 output tokens) | **11.71** |

**Wall-time implications** (extrapolated from `tg32 = 11.71 tok/s`):

| Surface shape                         | tokens produced | wall-time |
| ------------------------------------- | --------------- | --------- |
| 3-bullet summary (~50 tokens)         |  ~50            | ~4 s      |
| EN → ES one-line translation (64-cap) |   64            | ~5 s      |
| 256-token draft email                 |  256            | ~22 s     |

Q1_0 has a real x86 SIMD kernel in the PrismML fork
(`ggml/src/ggml-cpu/arch/x86/quants.c:555`, AVX2 + FMA), so on
commodity AMD/Intel CPUs it lands comfortably above the
[`docs/cpu-perf-tuning.md` short-assistant floor of 5 tok/s](../docs/cpu-perf-tuning.md#11-minimum-usable-thresholds).
Classifier / router surfaces (20+ tok/s minimum) should drop to
the 4B variant `Bonsai-4B-Q1_0` (~20.7 tok/s on the same VM) or run
on GPU / Metal / NPU.

**For comparison — why not Q2_0 on x86?** Same VM, same `llama-bench`,
same PrismML fork: `Ternary-Bonsai-8B-Q2_0.gguf` lands at
**0.71 tok/s** prompt-eval and **0.60 tok/s** generation — ~25×
slower than Q1_0 — because PrismML wrote a NEON SIMD kernel for
Q2_0 but never wrote an x86 SIMD kernel; on x86 it falls through to
a scalar generic path. Full kernel attribution in
[`docs/cpu-perf-tuning.md` → Why Q2_0 is slow on x86](../docs/cpu-perf-tuning.md#why-q2_0-is-slow-on-x86).
On ARM / Apple Silicon, Q2_0 is the fastest path — set
`MODEL_QUANT=q2_0` and download the file from
https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf.

The `num_ctx 2048` default in `models/Modelfile.bonsai8b` is the
CPU-friendly choice: attention cost scales linearly with `-c`, so a
4× context window directly inflates per-token cost without buying
anything for the 256–1024-token KChat task prompts.

**Calibration note.** Older anchor numbers ("~0.3 tok/s on an 8 GB
shared 8-core VM") in prior passes of this file were measured
against the Q2_0 file, which falls through to a scalar generic path
on x86. After diagnosing the kernel-coverage gap (see the
`docs/cpu-perf-tuning.md` link above), the demo's canonical x86
default is now `Bonsai-8B-Q1_0.gguf`, which runs at ~11.7 tok/s on
the same EPYC reference box — a ~25× improvement at half the disk
footprint, with no host-class change.

## Bilingual chat capture (B2C redesign)

The redesigned B2C surface (PR #50) needs eight new screenshots that
the next capture pass will produce. Steps are reproducible against
either `MockAdapter` (deterministic — no Ollama required) or the
live `bonsai-8b` Ollama path.

Pre-conditions (one-time):

```bash
cd backend && go run ./cmd/server &        # data API
cd frontend && npm install && npm run electron:dev
```

The bilingual DM `ch_dm_alice_minh` is auto-selected on first mount
of `B2CLayout`, so the app opens directly into the chat.

| # | Filename (target) | What to capture | Notes |
|---|-------------------|-----------------|-------|
| 1 | `b2c/13-bilingual-chat-overview.png` | Full `ch_dm_alice_minh` chat with several visible bubbles, each rendering its two-panel translation card. | Scroll up so at least one EN bubble and one VI bubble are visible side-by-side. |
| 2 | `b2c/14-translation-card-vi-to-en.png` | Close-up of a single Vietnamese bubble (e.g. `msg_minh_2`) translated into English. The English panel must be primary; the Vietnamese panel muted. | Highlight the SLM attribution pill (`on-device · bonsai-8b · 0 B egress`). |
| 3 | `b2c/15-translation-card-en-to-vi.png` | Close-up of an Alice (English) bubble translated into Vietnamese (the partner side). Original English panel is primary; Vietnamese translation is muted secondary. | Demonstrates context-aware emphasis. |
| 4 | `b2c/16-smart-reply-bilingual.png` | After a Vietnamese bubble lands, focus the composer so `SmartReplyBar` renders 2–3 English suggestions. | The mock adapter ships the canned three-line smart-reply output; the live model produces variations. |
| 5 | `b2c/17-privacy-strip-bilingual.png` | Expanded `PrivacyStrip` on a Vietnamese-bubble translation card, showing all 8 elements (compute location, model, sources, egress, confidence, why-suggested, accept/edit/discard, linked origin). | Confirms 0 B egress for the translate task. |
| 6 | `b2c/18-conversation-summary.png` | Right-rail **Summary** tab after the bilingual `summarize` call returns: bullet list in English, with the privacy strip and source pin to the chat. | The panel runs once on mount and caches per-channel; refresh by switching tabs and back. |
| 7 | `b2c/19-device-capability-panel.png` | `DeviceCapabilityPanel` showing `bonsai-8b` loaded (or "fallback to mock" when Ollama is offline). | Same composition as `10-device-capability-panel.png` but pin it on the redesigned surface. |
| 8 | `b2c/20-metrics-dashboard-translate.png` | `MetricsDashboard` (Stats tab) after letting the chat translate every visible bubble — it should show a non-trivial `translate` run count and `0 B` egress. | Capture *after* the batch translate has finished so latency / token columns are populated. |

Once captured, append these eight rows to the B2C flows table above
and remove the "Pending re-capture" warning. A Playwright capture
script lives at [`demo/capture.ts`](./capture.ts) (for the existing
27 shots); a `capture-b2c-bilingual.ts` companion will be added in
the same follow-up.

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
   ./scripts/setup-models.sh                # pulls bonsai-8b via Ollama
   ```

   Without Ollama, the bootstrap falls back to `MockAdapter`; the
   pre-2026-04-30 screenshots below were produced against the mock so
   the outputs are deterministic.

4. **Optional — wire the live `Bonsai-8B-Q1_0.gguf` GGUF (Prism
   quant)**: the Q1_0 quant is **not** in mainline `llama.cpp` and
   Ollama 0.22.0 cannot load it; use the PrismML fork plus a tiny
   Ollama-API shim:

   ```bash
   # 1. Build the PrismML fork's llama-server (one-time):
   git clone -b prism https://github.com/PrismML-Eng/llama.cpp \
     ~/prismml-llama.cpp
   cd ~/prismml-llama.cpp
   cmake -B build -DGGML_NATIVE=ON -DLLAMA_CURL=OFF \
     -DCMAKE_BUILD_TYPE=Release
   cmake --build build -j8 --target llama-server

   # Verify CPU features (need at least avx2 + fma for the x86
   # SIMD Q1_0 kernel; without it generation falls back to scalar):
   lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"

   # 2. Start llama-server bound to the Q1_0 GGUF:
   ./build/bin/llama-server \
     -m /path/to/Bonsai-8B-Q1_0.gguf \
     -c 1024 -t 6 -tb 6 --host 127.0.0.1 --port 8800 --parallel 1 \
     --mlock --no-mmap

   # 3. Run an Ollama-API shim that translates /api/generate
   #    -> llama-server's /completion (sample lives outside this
   #    repo; see PR #38 description for the bridge sketch).

   # 4. Launch the Electron shell pointed at the shim:
   cd frontend
   OLLAMA_BASE_URL=http://127.0.0.1:11434 \
     MODEL_NAME=bonsai-8b \
     MODEL_QUANT=q1_0 \
     npm run electron:dev
   ```

   The `llama-server` flags above are the demo defaults; see
   [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
   full host-class matrix, the thread-count sweep methodology, the
   decision threshold for falling back to `Bonsai-4B-Q1_0` or a GPU
   path, and the per-arch quant choice (Q1_0 on x86, Q2_0 on ARM via
   `MODEL_QUANT=q2_0`).

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
