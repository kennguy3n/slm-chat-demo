# CPU performance tuning — Bonsai-1.7B and friends

This guide captures the diagnostic and tuning checklist used when the
on-device SLM is running too slowly on a CPU-only host. The current
baseline is `Bonsai-1.7B.gguf` pulled via
`./scripts/setup-models.sh` from
[`hf.co/prism-ml/Bonsai-1.7B-gguf`](https://huggingface.co/prism-ml/Bonsai-1.7B-gguf).

**The canonical on-device artifact.** `Bonsai-1.7B.gguf` is **~237 MB**
on disk (~300 MB resident at startup before KV-cache growth). It is
a single GGUF that runs on x86 CPU, ARM CPU, and Apple Silicon — no
per-arch quant split is required. The PrismML `llama.cpp` fork's
`llama-server` loads it directly; Ollama 0.22.x can also load it.

## Two supported runtimes

The Electron bootstrap (`frontend/electron/inference/bootstrap.ts`)
probes two on-device runtimes in priority order:

1. **PrismML `llama-server`** (preferred). Default base URL
   `http://localhost:11400` (chosen to avoid a collision with the
   Go data API on :8080), override via `LLAMACPP_BASE_URL`. Talks
   the Bonsai GGUF format natively, exposes SSE streaming through
   `POST /completion`, and reports the loaded model path through
   `GET /props`.
2. **Ollama daemon** (fallback). Default base URL
   `http://localhost:11434`, override via `OLLAMA_BASE_URL`. The
   `bonsai-1.7b` alias is created from
   [`models/Modelfile.bonsai1_7b`](../models/Modelfile.bonsai1_7b)
   by `./scripts/setup-models.sh`.

When neither runtime is reachable, the bootstrap falls back to
`MockAdapter` — useful for offline tests, but every B2B / B2C panel
will render `[MOCK]`-prefixed placeholders instead of real LLM
output.

## Why Bonsai-1.7B is the on-device default

The demo ships a single on-device artifact — `Bonsai-1.7B.gguf` —
because it gives three properties that simplify the operator story:

- **One artifact, every host.** The same GGUF is fastest on x86,
  ARM, and Apple Silicon, so there is nothing to switch when the
  user moves between hosts.
- **No kernel-coverage gaps.** The PrismML `llama.cpp` fork has SIMD
  kernels for every tensor type the file uses on every supported
  arch, so commodity AMD / Intel / ARM CPUs do not fall through to
  a scalar generic path.
- **Headroom for streaming surfaces.** Smart-reply, translation, and
  morning-digest streaming all clear the 5 tok/s short-assistant
  floor on commodity CPUs without a GPU / Metal / NPU.

## Use this guide to either

1. Tune the on-device 1.7B pipeline up toward the per-surface token
   budgets listed in
   [Minimum usable thresholds](#11-minimum-usable-thresholds), or
2. Decide — based on the benchmark numbers — that the host is the
   wrong class for any local model and switch to a hosted server
   tier (gated by `WorkspacePolicy.AllowServerCompute`).

See also:

- [`docs/benchmarks.md`](./benchmarks.md) — fresh `llama-bench` and
  end-to-end demo-surface latency numbers against
  `Bonsai-1.7B.gguf` on the EPYC 7763 reference VM. §9 of this
  document references those numbers directly.
- `demo/README.md` — where the launch command and flag notes live.
- `models/Modelfile.bonsai1_7b` — the Ollama Modelfile (ships with
  `num_ctx 1024`, `temperature 0.7`, `top_p 0.9`).
- `models/README.md` — model matrix and download instructions.

---

## 1. Verify CPU features

Before anything else, confirm the box actually has the instruction
sets `llama.cpp` expects. Without AVX2 + FMA on x86 (or NEON on ARM)
you will not hit the published Bonsai-1.7B token rates and no amount
of flag tuning will rescue it — change the VM class.

```bash
lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"
```

If AVX2 is missing on x86: stop here, pick a different host. (Or, on
an ARM box without NEON, ditto.)

## 2. Use the PrismML fork (recommended)

The Bonsai GGUFs use PrismML's custom tensor types that mainline
`llama.cpp` does not always implement. The PrismML fork is the
recommended runtime end-to-end:

- Repo: https://github.com/kennguy3n/llama.cpp
- Branch: `prism`

Build the fork and run `llama-server`:

```bash
git clone -b prism https://github.com/kennguy3n/llama.cpp ~/llama.cpp
cd ~/llama.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc) --target llama-server llama-bench

curl -L -o ~/Bonsai-1.7B.gguf \
  https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/Bonsai-1.7B.gguf

./build/bin/llama-server \
  -m ~/Bonsai-1.7B.gguf \
  -c 4096 --parallel 1 --host 127.0.0.1 --port 11400
```

> **Why `--parallel 1`?** `llama-server` defaults to 4 parallel
> slots and divides `-c` evenly across them, so `-c 2048` would give
> each request a 512-token slot — too small for the summarize prompt
> (header + few-shot + 15 thread messages). Pinning the server to a
> single slot dedicates the full `n_ctx` to each request. See §6 for
> details.

Point the Electron shell at it via `LLAMACPP_BASE_URL`:

```bash
LLAMACPP_BASE_URL=http://127.0.0.1:11400 npm run electron:dev
```

`llama-server` exposes:

- `POST /completion` — SSE streaming completion (the
  `LlamaCppAdapter` consumes this).
- `GET /health` — health probe (used by the bootstrap; 1.5 s
  timeout).
- `GET /props` — live model metadata, used by `model:status` to
  display the loaded GGUF basename.

## 3. Compile native

Build with native optimisations and OpenMP enabled. Release mode is
load-bearing — a `Debug` build will trend toward ~0.05 tok/s even on
a good CPU.

```bash
cmake -B build \
  -DGGML_NATIVE=ON \
  -DGGML_OPENMP=ON \
  -DCMAKE_BUILD_TYPE=Release
cmake --build build -j$(nproc) --target llama-server llama-bench
```

`GGML_NATIVE=ON` triggers compile-time CPU feature detection; the
resulting binary will use whatever AVX2 / AVX-512 / FMA / F16C the
build host exposes. Verify with `objdump -d build/bin/libggml-cpu.so |
grep -c vfmadd` (non-zero means AVX/FMA is active).

## 4. Benchmark thread counts

Thread count is the single biggest knob on shared / NUMA VMs. More
threads is NOT always faster — cache contention and cross-socket
latency often peak somewhere in the middle. Run the full sweep:

```bash
for t in 1 2 4 6 8; do
  ./llama-bench -m Bonsai-1.7B.gguf -p 64 -n 32 -t $t -r 2
done
```

Pick the `t` value that wins on generation (`tg32`), not just prompt
processing. Plug that back into `llama-server` as both `-t` (compute)
and `-tb` (batch compute) unless the bench shows they should differ.

For reference, on the EPYC 7763, 8 vCPU box used as the canonical
benchmark host the optimum is **`-t 8`** for token generation
(38.72 tok/s on `tg32`); `-t 6` is a hair faster on prompt
processing (57.08 tok/s on `pp64`) but loses ~1.7 tok/s on
generation. On a 4 vCPU laptop class host the optimum tends to be
`-t 3` or `-t 4`. Always re-run the sweep on your target host
before pinning `-t`. See [`docs/benchmarks.md`](./benchmarks.md)
for the full sweep table.

## 5. Context reduction

Attention cost scales with KV-cache size, which scales with the
depth of the conversation already in the context. The demo's prompt
library (`frontend/electron/inference/prompts/shared.ts`) already
trims to `PROMPT_THREAD_CAP = 15` messages and
`PROMPT_MESSAGE_CAP = 120` runes per message, so most surfaces fit
cleanly under `-c 1024`. Sweep depth with `-d` (n-depth) — the
modern `llama-bench` argument that prefills `n` tokens of context
before measuring throughput:

```bash
./llama-bench -m Bonsai-1.7B.gguf -p 128 -n 128 -d 0    -t 8
./llama-bench -m Bonsai-1.7B.gguf -p 128 -n 128 -d 1024 -t 8
./llama-bench -m Bonsai-1.7B.gguf -p 128 -n 128 -d 2048 -t 8
```

Measured fall-off on the EPYC 7763 reference VM (full table in
[`docs/benchmarks.md`](./benchmarks.md#context-depth-sweep--p-128--n-128--r-3--t-8--ngl-0)):
depth 0 → 4096 drops `tg128` from 38.83 → 23.43 tok/s, i.e. about
40 %. Most B2C / B2B surfaces sit at ≤ 1024 prompt tokens, where
the drop is only ~14 %.

- depth ≤ 512: classifier / router.
- depth ≤ 1024: default for KChat AI surfaces — matches
  `num_ctx 1024` in `models/Modelfile.bonsai1_7b`.
- depth ≤ 2048: headroom for longer summaries; only when the box
  can afford it.

## 6. Runtime flags

Three flags routinely move the needle on weak VMs:

- `--parallel 1`: the demo only needs one in-flight request. Higher
  parallelism fragments the KV cache and makes every token slower.
- `--mlock`: pins weights in physical memory so the kernel never
  pages them to swap mid-generation. On a box with swap enabled and
  4 GB RAM this is the difference between "slow" and "catastrophic".
- `--no-mmap`: avoids slow page faults when the virtual disk is slow
  (some shared-volume hosts and hypervisors). Always benchmark both
  with and without — on fast NVMe hosts mmap wins, on shared disks
  `--no-mmap` + `--mlock` usually wins.

## 7. Monitor swap

If the machine is paging to swap, no amount of flag tuning will help.
Watch:

```bash
vmstat 1           # si/so columns should stay at 0
free -h            # Swap used should stay at 0 during generation
htop               # sort by RES; llama-server should not grow past physical RAM
iostat -xz 1       # %util on the swap device should stay near 0
```

For a clean benchmark run, disable swap:

```bash
sudo swapoff -a
```

Re-enable (`sudo swapon -a`) when you are done — production hosts
should keep a small swap partition as an emergency valve.

## 8. KV cache quantisation

If you are memory-bound (not compute-bound), try quantising the KV
cache. Test in this order — each step trades quality for footprint
and you stop when generation is no longer memory-bound:

1. `--cache-type-k f16 --cache-type-v f16` (default).
2. `--cache-type-k q8_0 --cache-type-v q8_0`.
3. `--cache-type-k q4_0 --cache-type-v q4_0`.

Only move to `q4_0` KV when the quality loss is acceptable for the
surface in question (e.g. router / classifier tolerates it; long
summary generation often does not). Bonsai-1.7B's KV cache is
already small enough that most CPU-only hosts can stay at `f16`.

## 9. Expected token rates

Bonsai-1.7B is sized so that streaming on commodity CPUs lands
comfortably above the interactive-latency floor on every demo
surface. Fresh `llama-bench` results against `Bonsai-1.7B.gguf` on
the EPYC 7763 reference VM (8 vCPU, AVX2+FMA, no AVX-512) follow.
Full tables and methodology in
[`docs/benchmarks.md`](./benchmarks.md).

### Measured (EPYC 7763, 8 vCPU, AVX2+FMA, `-t 8`, `-ngl 0`)

| Workload                          | Throughput (tok/s) |
| --------------------------------- | -----------------: |
| Prompt processing (`pp64`)        | 55.6 – 57.1        |
| Token generation (`tg32`, depth 0)| 38.7               |
| Token generation, depth 1024      | 33.3               |
| Token generation, depth 2048      | 29.1               |
| Token generation, depth 4096      | 23.4               |

Measured end-to-end on the same host across the demo surfaces
(B2C bilingual DM + B2B vendor-management thread, full table in
[`docs/benchmarks.md`](./benchmarks.md#end-to-end-demo-surface-latency)):
every surface lands between **34.3 and 39.9 tok/s** generation,
with TTFT in the 2.9 – 8.8 s range gated by prompt processing.

### Expectation matrix (other host classes)

The table below is rough guidance for hosts that haven't been
benchmarked yet — the EPYC 7763 row is anchored to the measured
numbers above.

| Class                                    | Expected tok/s |
| ---------------------------------------- | -------------- |
| Weak shared 2 vCPU x86                   | 5 – 12         |
| Decent 4 dedicated vCPU x86 (AVX2+FMA)   | 25 – 40        |
| Good 8 dedicated vCPU x86 (AVX2+FMA)     | 35 – 40 (measured here) |
| Apple M-series (Metal)                   | much higher    |
| ARM server with NEON                     | much higher    |
| Discrete GPU (CUDA / ROCm)               | much higher    |

Bonsai-1.7B comfortably clears every threshold
in [Minimum usable thresholds](#11-minimum-usable-thresholds) on the
EPYC 7763 reference VM, and is expected to do the same on hosts in
the "Decent" row and above.

## 10. Model alternatives for CPU-only

If your benchmarks land below the "Weak shared" row even on the 1.7B
model and you cannot move to a better host, swap in a smaller
candidate. Good CPU-only candidates, in rough order of capability /
cost:

- **Qwen3 0.6B Q4_K_M** — router, classifier, short completions.
- **Gemma 3 1B QAT Q4_0** — compact assistant tasks, translation.
- **Qwen2.5 1.5B Q4_K_M** — default CPU-only chat / summarisation.

The demo's `MODEL_NAME` env var
(`frontend/electron/inference/bootstrap.ts`) lets you point the
Electron shell at any of these without code changes:

```bash
MODEL_NAME=qwen2.5-1.5b npm run electron:dev
```

## 11. Minimum usable thresholds

Product-level floor per surface. If, after tuning, a surface cannot
hit its minimum, switch models — do not ship the slower config.

| Surface class                     | Minimum   | Notes                                        |
| --------------------------------- | --------- | -------------------------------------------- |
| Classifier / router               | 20+ tok/s | Runs per message; user-invisible latency.    |
| Short assistant (smart reply)     |  5+ tok/s | Inline composer suggestions, streamed.       |
| CPU fallback minimum (any tier)   |  2+ tok/s | Below this, UX perception breaks.            |

Bonsai-1.7B on a commodity x86 CPU with AVX2 + FMA is expected to
clear every row in this table, including the classifier 20 tok/s
bar. Streaming demo surfaces (`02 morning-catchup`, `b2c/07
smart-reply`) feel interactive on commodity x86 CPU under
Bonsai-1.7B without requiring a GPU / Metal / NPU.
