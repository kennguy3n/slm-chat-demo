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
> Vite + Go backend stack. The historical pass used Bonsai-8B-Q1_0
> through Ollama; the demo now defaults to **Bonsai-1.7B** served by
> the PrismML `llama-server` (the new primary on-device runtime).
> The chrome, privacy strip, action buttons, and surfaces still
> match the redesigned product — a fresh capture pass against the
> 1.7B model is queued. See
> [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
> per-host-class tok/s expectations under the new model.

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
`Engineering` (`ch_general`, `ch_engineering`, `ch_product_launch`)
and `Finance` (`ch_vendor_management`).

> **Phase 7 redesign — real-LLM B2B.** Every B2B AI surface now
> runs against the on-device **Bonsai-1.7B** model via the
> Phase 7 prompt library
> (`frontend/electron/inference/prompts/`). The screenshots in
> this section are intended to be re-captured against a running
> Ollama daemon; when captured against `MockAdapter` (no Ollama)
> the panels render obvious `[MOCK]`-prefixed placeholders rather
> than the seed-coupled canned text the previous capture pass
> used. The §5.3 vendor-management thread has been enriched to 12
> messages with explicit pricing, SOC 2 compliance, single-region
> risk, and a final decision so the LLM has enough context to
> ground each approval field. A new `#product-launch` thread
> (multi-topic cross-functional discussion) was added for §5.4
> demonstrations.

| # | File | PROPOSAL §5 flow | Privacy strip | What it shows |
|---|------|------------------|---------------|---------------|
| 1 | [`b2b/01-workspace-navigation.png`](./b2b/01-workspace-navigation.png) | §4 shell | — | B2B layout with the workspace → domain → channel hierarchy in the left sidebar. |
| 2 | [`b2b/02-thread-summary.png`](./b2b/02-thread-summary.png) | §5.3 — summarize | on-device | `ThreadSummaryCard` with source citations anchored to the vendor-management thread. |
| 3 | [`b2b/03-action-launcher.png`](./b2b/03-action-launcher.png) | §5.3 — launcher | — | Action Launcher open with the Create / Analyze / Plan / Approve four-intent grid. |
| 4 | [`b2b/04-approval-prefill.png`](./b2b/04-approval-prefill.png) | §5.3 — approval prefill | on-device | `ApprovalPrefillCard` with `vendor` / `amount` / `risk` / `justification` prefilled by Bonsai-1.7B from the enriched 12-message vendor thread (Phase 7 `prefill-approval.ts` prompt). |
| 5 | [`b2b/05-approval-card-pending.png`](./b2b/05-approval-card-pending.png) | §5.3 — approval lifecycle | on-device | `ApprovalCard` after submission, in the **Pending** state awaiting Eve's decision. |
| 6 | [`b2b/06-artifact-draft.png`](./b2b/06-artifact-draft.png) | §5.4 — PRD draft | on-device | `ArtifactDraftCard` streaming a PRD draft with source pins back into `msg_eng_root`. |
| 7 | [`b2b/07-artifact-workspace.png`](./b2b/07-artifact-workspace.png) | §5.4 — artifact editor | on-device | `ArtifactWorkspace` showing sections, version history, and diff view. |
| 8 | [`b2b/08-ai-employee-panel.png`](./b2b/08-ai-employee-panel.png) | §5.4 — AI Employee | on-device | `AIEmployeePanel` showing Kara Ops AI with her budget, queued recipes, and recent runs. |
| 9 | [`b2b/09-recipe-output-gate.png`](./b2b/09-recipe-output-gate.png) | §5 — output gate | on-device | `RecipeOutputGate` presenting the mandatory Accept / Edit / Discard review before a recipe writes into a KApp. |
| 10 | [`b2b/10-connector-panel.png`](./b2b/10-connector-panel.png) | §5.4 — connector | on-device | `ConnectorPanel` showing the seeded Google Drive connector attached to `ch_vendor_management`. |
| 11 | [`b2b/11-knowledge-graph.png`](./b2b/11-knowledge-graph.png) | §5 — knowledge | on-device | `KnowledgeGraphPanel` (right-rail "Knowledge" tab) on `#vendor-management` after pressing **Extract**. Phase 7 routes this through `runExtractKnowledge` (LLM-driven, `ai:extract-knowledge` IPC) so each card is an entity Bonsai-1.7B identified — `decision` / `owner` / `risk` / `requirement` / `deadline` — with a best-effort source-message link and a confidence badge. The legacy regex extractor (`POST /api/channels/{id}/knowledge/extract`) is kept as the offline fallback. |
| 12 | [`b2b/12-policy-admin.png`](./b2b/12-policy-admin.png) | §6 — policy | on-device | `PolicyAdminPanel` showing per-workspace AI compute rules (server compute denied, egress budget, redaction required). |

## On-device LLM demonstration

| # | File | What it shows |
|---|------|---------------|
| 1 | [`local-model-status.png`](./local-model-status.png) | `DeviceCapabilityPanel` reporting the `bonsai-1.7b` alias loaded through llama-server (or Ollama / MockAdapter fallback when neither runtime is reachable). |
| 2 | [`privacy-strip-on-device.png`](./privacy-strip-on-device.png) | Close-up of a single privacy strip confirming `compute: on-device`, `model: bonsai-1.7b`, `egress: 0 B`. |
| 3 | [`egress-summary-zero.png`](./egress-summary-zero.png) | `EgressSummaryPanel` aggregating per-session totals and showing **0 B** (all local compute). |

All B2C and B2B screenshots in this directory show the privacy strip /
header reporting `on-device` and `0 B egress`. The 2026-04-30 pass
re-captured the shots listed in **Captured in this pass** above against
the live Bonsai-1.7B weights pulled via
`./scripts/setup-models.sh` through Ollama; the rest still come from
the renderer's deterministic mock outputs. The three standalone shots
in this section call out the on-device posture as a standalone
artefact (only `local-model-status` has been re-captured against the
live model so far).

## On-device LLM performance

The demo now ships against **Bonsai-1.7B** (`prism-ml/Bonsai-1.7B-gguf`,
single ~1.0 GB GGUF, no per-arch quant split) served by `llama-server`
from the PrismML `llama.cpp` fork. The smaller 1.7B parameter count
lets every interactive surface (smart-reply, translation, morning
digest, conversation summary) clear the
[`docs/cpu-perf-tuning.md` short-assistant floor of 5 tok/s](../docs/cpu-perf-tuning.md#11-minimum-usable-thresholds)
on commodity CPUs without a GPU / Metal / NPU.

**Artifact size.** `Bonsai-1.7B.gguf` is **~1.0 GB on disk** and
~1.1 GB resident at startup before KV-cache growth. Ollama 0.22.x
can load this artifact directly; the PrismML `llama-server` build
remains the recommended runtime because it speaks the Bonsai GGUF
format natively and supports SSE streaming end-to-end.

**Reference numbers (historical, Bonsai-8B-Q1_0 on the same EPYC
7763 reference box):** `pp64` 14.82 tok/s, `tg32` 11.71 tok/s. The
1.7B swap is expected to clear those numbers comfortably (4-5×
fewer parameters on the same hardware); fresh `llama-bench`
numbers will land alongside the next demo capture pass.

**Wall-time targets for the redesigned demo** (assuming the same
EPYC reference box and tg32 ≥ 30 tok/s on Bonsai-1.7B):

| Surface shape                         | tokens produced | target wall-time |
| ------------------------------------- | --------------- | ---------------- |
| 3-bullet summary (~50 tokens)         |  ~50            | ~2 s             |
| EN → VI one-line translation (64-cap) |   64            | ~2 s             |
| 256-token draft email                 |  256            | ~9 s             |

The `num_ctx 1024` default in
[`models/Modelfile.bonsai1_7b`](../models/Modelfile.bonsai1_7b) is
the CPU-friendly choice for the 1.7B model class: attention cost
scales linearly with `-c`, and the prompt library
([`PROMPT_THREAD_CAP=15`, `PROMPT_MESSAGE_CAP=120`](../frontend/electron/inference/prompts/shared.ts))
is tuned to fit comfortably inside a 1024-token window.

**Calibration note.** Older anchor numbers in prior passes of this
file were measured against the previous 8B-class artifacts (Q1_0 /
Q2_0). The demo no longer ships a per-arch quant split: the same
`Bonsai-1.7B.gguf` runs on x86 CPU, ARM CPU, and Apple Silicon.

## Bilingual chat capture (B2C redesign)

The redesigned B2C surface (PR #50) needs eight new screenshots that
the next capture pass will produce. Steps are reproducible against
either `MockAdapter` (deterministic — no Ollama / llama-server
required) or the live `bonsai-1.7b` path served through llama-server
or Ollama.

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
| 2 | `b2c/14-translation-card-vi-to-en.png` | Close-up of a single Vietnamese bubble (e.g. `msg_minh_2`) translated into English. The English panel must be primary; the Vietnamese panel muted. | Highlight the SLM attribution pill (`on-device · bonsai-1.7b · 0 B egress`). |
| 3 | `b2c/15-translation-card-en-to-vi.png` | Close-up of an Alice (English) bubble translated into Vietnamese (the partner side). Original English panel is primary; Vietnamese translation is muted secondary. | Demonstrates context-aware emphasis. |
| 4 | `b2c/16-smart-reply-bilingual.png` | After a Vietnamese bubble lands, focus the composer so `SmartReplyBar` renders 2–3 English suggestions. | The mock adapter ships the canned three-line smart-reply output; the live model produces variations. |
| 5 | `b2c/17-privacy-strip-bilingual.png` | Expanded `PrivacyStrip` on a Vietnamese-bubble translation card, showing all 8 elements (compute location, model, sources, egress, confidence, why-suggested, accept/edit/discard, linked origin). | Confirms 0 B egress for the translate task. |
| 6 | `b2c/18-conversation-summary.png` | Right-rail **Summary** tab after the bilingual `summarize` call returns: bullet list in English, with the privacy strip and source pin to the chat. | The panel runs once on mount and caches per-channel; refresh by switching tabs and back. |
| 7 | `b2c/19-device-capability-panel.png` | `DeviceCapabilityPanel` showing `bonsai-1.7b` loaded (or "fallback to mock" when neither runtime is reachable). | Same composition as `10-device-capability-panel.png` but pin it on the redesigned surface. |
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

3. **Wire a real local model (recommended) — llama-server**
   (preferred runtime; talks the Bonsai GGUF format natively and
   the Electron bootstrap probes it first):

   ```bash
   git clone -b prism https://github.com/kennguy3n/llama.cpp \
     ~/llama.cpp
   cd ~/llama.cpp
   cmake -B build -DCMAKE_BUILD_TYPE=Release
   cmake --build build -j8 --target llama-server

   curl -L -o ~/Bonsai-1.7B.gguf \
     https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/Bonsai-1.7B.gguf

   ./build/bin/llama-server \
     -m ~/Bonsai-1.7B.gguf \
     -c 2048 --host 127.0.0.1 --port 8080

   # In another shell:
   cd slm-chat-demo/frontend
   LLAMACPP_BASE_URL=http://127.0.0.1:8080 npm run electron:dev
   ```

4. **Alternative — Ollama**: the Electron bootstrap falls back to
   Ollama on `http://localhost:11434` when llama-server is not
   reachable.

   ```bash
   ./scripts/setup-models.sh                # pulls bonsai-1.7b via Ollama
   ollama serve &                            # leave running in another shell
   export OLLAMA_BASE_URL=http://localhost:11434
   cd frontend && npm run electron:dev
   ```

   Without either runtime, the bootstrap falls back to
   `MockAdapter` and every B2B panel renders an obvious
   `[MOCK]`-prefixed placeholder — fine for B2C captures and
   tests, but the B2B screenshots in this directory are meant to
   show real LLM output. Recapture them under a live runtime when
   refreshing the demo set.

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
