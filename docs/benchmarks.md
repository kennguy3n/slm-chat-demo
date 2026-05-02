# Benchmark results — Bonsai-1.7B CPU-only inference

Last updated: 2026-05-02

This page captures a fresh end-to-end benchmark pass against the
canonical on-device artifact (`Bonsai-1.7B.gguf`, ~237 MB) running on
`llama-server` from the [PrismML `llama.cpp` fork][llama-prism]
(`prism` branch). All numbers are CPU-only — no GPU, no Metal, no
NPU, no AVX-512.

The methodology and tuning checklist live in
[`docs/cpu-perf-tuning.md`](./cpu-perf-tuning.md); this page is the
companion data table that §9 of that doc points at. The raw JSON
(llama-bench output + per-surface latency frames) lives in
[`docs/benchmarks-raw.json`](./benchmarks-raw.json).

## System info

| | |
| --- | --- |
| Host | Devin VM (AMD EPYC 7763 64-Core Processor, 8 vCPU pinned, single NUMA node) |
| ISA flags | `avx`, `avx2`, `f16c`, `fma`, `bmi2` (no AVX-512) |
| Memory | 31 GiB total, swap disabled |
| Kernel | Linux 5.15.200 x86_64 |
| llama.cpp branch | `prism` ([kennguy3n/llama.cpp](https://github.com/kennguy3n/llama.cpp)) |
| llama.cpp commit | `d6cea6ec1b8c7b10d5ed528a74b65dc6b8f02dee` (build 8245) |
| Build flags | `GGML_NATIVE=ON GGML_OPENMP=ON GGML_CUDA=OFF GGML_METAL=OFF GGML_VULKAN=OFF LLAMA_CURL=OFF CMAKE_BUILD_TYPE=Release` |
| Model | `Bonsai-1.7B.gguf` from `hf.co/prism-ml/Bonsai-1.7B-gguf` |
| Model arch / quant | `qwen3 1.7B` / `Q1_0` (q1_0_g128 4×4 AVX2 repack), 231.13 MiB on disk, 1.72 B params |
| Runtime flags | `llama-server -c 4096 --parallel 1 -t 8 --host 127.0.0.1 --port 11400` |

```text
$ uname -a
Linux devin-box 5.15.200 #5 SMP Sun Mar 29 07:25:21 UTC 2026 x86_64 x86_64 x86_64 GNU/Linux

$ lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"
Model name:  AMD EPYC 7763 64-Core Processor
Flags:       … sse4_1 sse4_2 … fma … avx avx2 … bmi2 …
             (no avx512* — repack path is REPACK=1 / Q1_0_g128 4×4)

$ free -h
               total        used        free      shared  buff/cache   available
Mem:            31Gi       465Mi        29Gi        41Mi       1.5Gi        30Gi
Swap:             0B          0B          0B
```

## llama-bench results

### Thread count sweep (`-p 64 -n 32 -r 3`, `-ngl 0`)

The single biggest knob on CPU-only hosts is `-t`. On this 8 vCPU
EPYC 7763 box the sweet spot for token generation (`tg32`) is **`-t
8`**; `-t 6` is a hair faster on prompt processing but loses ~1.7
tok/s on generation. We pin `-t 8` for everything below.

| Threads | pp64 (tok/s) | tg32 (tok/s) |
| ------: | -----------: | -----------: |
| 1       | 17.19 ± 0.08 | 10.40 ± 0.03 |
| 2       | 32.02 ± 0.04 | 19.60 ± 0.01 |
| 4       | 31.54 ± 0.02 | 20.65 ± 0.00 |
| 6       | **57.08 ± 0.03** | 37.07 ± 0.10 |
| 8       | 55.57 ± 0.22 | **38.72 ± 0.06** |

Notes:
- Going from 2 → 4 threads stalls (`tg32` only climbs from 19.60 →
  20.65) because 4 threads still fit on a single NUMA node but the
  per-thread cache slice halves; the win shows up again at 6/8 once
  the AVX2 repack kernel saturates.
- `-t 8` is the OpenMP-default on this host and matches the
  `nproc` output, so callers can omit `-t` from `llama-server` and
  get the same pinning.

### Context-depth sweep (`-p 128 -n 128 -r 3`, `-t 8`, `-ngl 0`)

`llama-bench` (build 8245) replaces the old `-c <n_ctx>` argument
with `-d <n-depth>`, which prefills `n-depth` tokens of context
before measuring `pp` / `tg`. This is the better signal anyway —
it captures the actual KV-cache cost the demo surfaces pay when
they include a thread of prior messages — so we sweep `d ∈ {0, 512,
1024, 2048, 4096}`:

| n-depth | pp128 (tok/s) | tg128 (tok/s) |
| ------: | ------------: | ------------: |
|       0 | 55.71 ± 0.09  | 38.83 ± 0.07  |
|     512 | 52.56 ± 0.07  | 35.13 ± 1.14  |
|    1024 | 49.89 ± 0.04  | 33.25 ± 0.01  |
|    2048 | 45.05 ± 0.05  | 29.10 ± 0.04  |
|    4096 | 38.02 ± 0.02  | 23.43 ± 0.00  |

`tg128` falls off ~40 % from depth 0 to depth 4096 — small enough
that even the deepest B2B / B2C surfaces (typically 300–500 tokens
of input + 200–400 tokens of output, i.e. depth ≲ 1k) clear the 30
tok/s mark.

## End-to-end demo surface latency

Each surface below was driven against the same `llama-server` instance
by replaying the exact prompt the Electron main process would build
(via `frontend/electron/inference/prompts/*.ts`) wrapped in the Qwen3
chat template (`LlamaCppAdapter.formatQwen3Chat`). The driver is
[`scripts/bench-demo-surfaces.py`](../scripts/bench-demo-surfaces.py).

`prompt_tok` and `gen_tok` are the actual prompt-processed and
predicted token counts that llama-server reports in its final SSE
frame's `timings` object — not estimates. `tok/s` is the
generation-side rate (`predicted_per_second`), which is the number
the streaming UI feels.

### B2C surfaces (Alice ↔ Minh bilingual VI ↔ EN demo)

| Surface | Messages | Prompt tok | Gen tok | Total (s) | Gen (s) | tok/s | TTFT (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Translate (single)        |  1 | 260 |  10 |  4.91 | 0.25 | 39.87 | 4658 |
| Translate batch           | 16 | 489 | 278 | 16.83 | 8.07 | 34.43 | 8757 |
| Smart reply               |  6 | 163 |  82 |  5.23 | 2.28 | 35.97 | 2947 |
| Conversation summary      | 16 | 340 |  53 |  7.52 | 1.46 | 36.33 | 6064 |
| Conversation insights     | 16 | 422 | 320 | 16.91 | 9.34 | 34.27 | 7573 |

### B2B surfaces (#vendor-management thread, 12 messages)

| Surface | Messages | Prompt tok | Gen tok | Total (s) | Gen (s) | tok/s | TTFT (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Thread summary            | 12 | 390 | 192 | 12.47 |  5.44 | 35.30 | 7034 |
| Task extraction           | 12 | 416 | 192 | 12.92 |  5.47 | 35.09 | 7452 |
| Approval prefill          | 12 | 411 |  35 |  8.35 |  0.95 | 36.70 | 7392 |
| PRD draft                 | 12 | 376 | 404 | 18.17 | 11.64 | 34.71 | 6530 |
| Knowledge extraction      | 12 | 449 | 159 | 12.25 |  4.50 | 35.33 | 7748 |

### Headline numbers

- **Generation throughput** for every surface lands in the 34–40
  tok/s band, well above the 20 tok/s classifier floor and ~7×
  above the 5 tok/s short-assistant floor in
  [`cpu-perf-tuning.md` §11](./cpu-perf-tuning.md#11-minimum-usable-thresholds).
- **TTFT** is dominated by prompt processing at ~56 tok/s. Single-
  message translation lands the first token in ~4.7 s; B2B thread
  surfaces (390–449 prompt tokens) need 6–8 s before the first
  byte arrives at the renderer. This is what the streaming UI is
  designed for — once the first chunk arrives the visible rate is
  the gen-side 34–40 tok/s.
- **Approval prefill** is the snappiest end-to-end (8.4 s wall
  clock, 35 generated tokens) and is the natural surface to demo
  first when latency perception matters.
- **PRD draft** is the heaviest streamed surface (404 generated
  tokens, 18.2 s wall clock). Even at this size the gen-side rate
  (34.7 tok/s) is unchanged from the lighter surfaces, so the
  streaming UX feels identical — only the total time grows.

## Notes / methodology

- All benchmarks run CPU-only — no GPU, Metal, NPU, or AVX-512.
- Model: `Bonsai-1.7B.gguf` (231.13 MiB on disk, ~300 MB resident
  before KV-cache growth) from `hf.co/prism-ml/Bonsai-1.7B-gguf`.
- Runtime: `llama-server` from the PrismML `llama.cpp` fork
  (`prism` branch, commit `d6cea6ec`). Build flags listed in
  System info above.
- `llama-server` flags: `-c 4096 --parallel 1 -t 8`. The single-
  slot pinning is intentional — `--parallel 4` (the default) would
  divide the 4096 context across slots and strand the longer
  surface prompts (see `cpu-perf-tuning.md` §6).
- `cache_prompt: false` on every demo-surface call so cross-surface
  measurements don't poison each other's prompt-cache hit rate.
- Sampling: `temperature=0`, `top_p=0.9` for the demo-surface bench
  (greedy decoding) — matches the demo's translation / summary /
  prefill paths after PR #61.
- `tok/s` reported is `predicted_per_second` from llama-server's
  final SSE frame `timings` object (server-side measurement,
  excludes network and SSE framing overhead).

## See also

- [`docs/cpu-perf-tuning.md`](./cpu-perf-tuning.md) — diagnostic /
  tuning checklist; §9 references this page for the actual
  numbers.
- [`docs/benchmarks-raw.json`](./benchmarks-raw.json) — raw
  `llama-bench` JSON + per-surface timings for archival.
- [`models/README.md`](../models/README.md) — model matrix and
  download instructions.
- [`models/Modelfile.bonsai1_7b`](../models/Modelfile.bonsai1_7b)
  — Ollama Modelfile (used only by the fallback runtime; the
  numbers above are from `llama-server`).

[llama-prism]: https://github.com/kennguy3n/llama.cpp/tree/prism
