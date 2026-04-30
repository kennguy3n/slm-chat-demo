# CPU performance tuning — Bonsai-8B and friends

This guide captures the diagnostic and tuning checklist used when the
on-device SLM is running too slowly on a CPU-only host. The current
baseline is `Bonsai-8B-Q1_0.gguf` pulled via
`./scripts/setup-models.sh` from `hf.co/prism-ml/Bonsai-8B-gguf`.

**The canonical x86 CPU artifact.** `Bonsai-8B-Q1_0.gguf` is **~1.16 GB**
on disk (1 105 MiB / 1 159 MB). Q1_0 is PrismML's 1-bit quant; the
PrismML `llama.cpp` fork ships a real x86 SIMD kernel for it
(AVX2/FMA, see `ggml/src/ggml-cpu/arch/x86/quants.c`). Stock Ollama
0.22.x cannot run it (the bundled `llama.cpp` does not implement the
Q1_0 tensor type), so the demo path uses the PrismML fork — see
[Use the PrismML fork](#2-use-the-prismml-fork).

**Why Q1_0 instead of Q2_0?** See
[Why Q2_0 is slow on x86](#why-q2_0-is-slow-on-x86) below. Short
version: PrismML wrote an ARM-NEON SIMD kernel for Q2_0 but never
wrote an x86 SIMD kernel for it, so on x86 Q2_0 falls through to a
plain scalar C path and runs ~25× slower than Q1_0 despite using less
RAM. Q2_0 remains the recommended file on ARM / Apple Silicon, where
its NEON kernel is the fastest path.

## Benchmarks on the reference VM

Live `llama-bench` measurements, 2026-04-30, against the PrismML
`llama.cpp` fork (`prism` branch) on AMD EPYC 7763, 8 vCPU, 31 GiB
RAM, AVX2 + FMA, CPU-only:

| Model file                     | Size      | x86 SIMD? | Best `-t` | `pp64` (tok/s) | `tg32` (tok/s) |
| ------------------------------ | --------- | --------- | --------- | -------------- | -------------- |
| **Bonsai-8B-Q1_0**             | 1.16 GB   | yes       | `-t 6`    | 14.82          | **11.71**      |
| Bonsai-4B-Q1_0                 | 0.57 GB   | yes       | `-t 6`    | n/a            | **20.74**      |
| Ternary-Bonsai-8B-Q2_0         | 2.18 GB   | **no**    | `-t 4`    | 0.71           | **0.60**       |

`pp64` is prompt-processing throughput on 64 input tokens; `tg32` is
token-generation throughput on 32 output tokens. All runs were warm
(`-r 2`, second pass). Resident RAM at startup tracks the on-disk
size to within ~5%.

The Q1_0 row clears every threshold in
[Minimum usable thresholds](#11-minimum-usable-thresholds) below, with
headroom for the short-assistant tier on this 8 vCPU box.
Bonsai-4B-Q1_0 even clears the classifier / router 20 tok/s bar.

### Bonsai-8B-Q1_0 thread sweep on EPYC 7763 8 vCPU

| `-t` | `pp64` (tok/s) | `tg32` (tok/s) |
| ---: | -------------: | -------------: |
| 1    | 3.73           | 3.28           |
| 2    | 7.33           | 6.27           |
| 4    | 11.15          | 9.40           |
| 6    | **14.82**      | **11.71**      |
| 8    | 15.28          | 11.08          |
| 16   | 13.12          | 3.97           |

Throughput peaks at `-t 6` and collapses at `-t 16` (oversubscription:
generation drops to 4 tok/s when threads exceed physical vCPU). On
shared / NUMA hosts the optimum is usually 1–2 below physical-vCPU
count; always run the full sweep before pinning `-t`.

## Why Q2_0 is slow on x86

The Q2_0 file `Ternary-Bonsai-8B-Q2_0.gguf` uses tensor type ID 42 —
PrismML's custom 2-bit quant defined only in their `llama.cpp` fork.
PrismML wrote a NEON SIMD kernel for it
(`ggml/src/ggml-cpu/arch/arm/quants.c` — `vqtbl1q_u8`,
`ggml_vdotq_s32`, etc.) but **did not write an x86 SIMD kernel**. On
x86 every Q2_0 dot product falls through to
`ggml_vec_dot_q2_0_q8_0_generic` in `ggml/src/ggml-cpu/quants.c` —
plain scalar C, no AVX2, no FMA, no SSE.

That is the entire reason Q2_0 is 25× slower than Q1_0 on EPYC:
the x86 SIMD kernel for Q1_0 (`arch/x86/quants.c:555`) does exist
and runs at full AVX2/FMA throughput; for Q2_0 it does not exist and
the runtime falls back to scalar code.

Implications:

- **On x86 (AMD/Intel)**, use `Bonsai-8B-Q1_0.gguf`. This is what
  `./scripts/setup-models.sh` and `models/Modelfile.bonsai8b` default
  to.
- **On ARM / Apple Silicon**, prefer `Ternary-Bonsai-8B-Q2_0.gguf` —
  the NEON kernel is tuned and the smaller file uses less RAM. Set
  `MODEL_QUANT=q2_0` and download the file:
  ```bash
  curl -L -o models/Ternary-Bonsai-8B-Q2_0.gguf \
    https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B-Q2_0.gguf
  ```
  Update `FROM` in `models/Modelfile.bonsai8b` and re-run
  `./scripts/setup-models.sh`.
- **For RAM-constrained hosts** that still need x86 SIMD, the 4B
  variant `Bonsai-4B-Q1_0.gguf` is half the size and ~2× the throughput
  on the same box. Source:
  https://huggingface.co/prism-ml/Bonsai-4B-gguf

If the PrismML maintainers add an x86 SIMD kernel for Q2_0, this
guidance flips back to "Q2_0 everywhere". Until then, the kernel
coverage gap drives the per-arch quant choice.

## Use this guide to either

1. Tune the existing 8B Q1_0 pipeline up toward the per-surface token
   budgets listed in [Minimum usable thresholds](#11-minimum-usable-thresholds), or
2. Decide — based on the benchmark numbers — that the host is the
   wrong class for an 8B model and switch to a smaller one (see
   [Model alternatives for CPU-only](#10-model-alternatives-for-cpu-only)).

See also:

- `demo/README.md` — where the launch command and flag notes live.
- `models/Modelfile.bonsai8b` — the Ollama Modelfile (ships with
  `num_ctx 2048` as the CPU-friendly default).
- `models/README.md` — CPU-performance section and model matrix.

---

## 1. Verify CPU features

Before anything else, confirm the box actually has the instruction
sets `llama.cpp` expects. Without AVX2 + FMA you will not hit the
published Q1_0 token rates and no amount of flag tuning will rescue
it — change the VM class.

```bash
lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"
```

If AVX2 is missing: stop here, pick a different host. (Or, on an ARM
box without NEON, ditto.)

## 2. Use the PrismML fork

Both `Bonsai-8B-Q1_0` (Q1_0) and `Ternary-Bonsai-8B-Q2_0` (Q2_0) use
PrismML's custom tensor types that mainline `llama.cpp` does not
support. You need the PrismML fork:

- Repo: https://github.com/PrismML-Eng/llama.cpp
- Branch: `prism`

`ollama` 0.22.x cannot load either file; the demo shims it by running
`llama-server` from this fork behind an Ollama-API translator so the
Electron shell's `OllamaAdapter` still works.

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
  ./llama-bench -m Bonsai-8B-Q1_0.gguf -p 64 -n 32 -t $t -r 2
done
```

Pick the `t` value that wins on generation (`tg32`), not just prompt
processing. Plug that back into `llama-server` as both `-t` (compute)
and `-tb` (batch compute) unless the bench shows they should differ.
On the reference EPYC 7763 8 vCPU box the optimum is `-t 6` for
Bonsai-8B-Q1_0 (see thread sweep above).

## 5. Context reduction

Attention cost scales with `-c`. For task prompts of 256–1024 input
tokens, most surfaces fit cleanly into `-c 1024`:

```bash
./llama-bench -m Bonsai-8B-Q1_0.gguf -p 128 -n 128 -c 512 -t 6
./llama-bench -m Bonsai-8B-Q1_0.gguf -p 128 -n 128 -c 1024 -t 6
./llama-bench -m Bonsai-8B-Q1_0.gguf -p 128 -n 128 -c 2048 -t 6
```

- `-c 512`: classifier / router.
- `-c 1024`: default for most KChat AI surfaces.
- `-c 2048`: headroom for longer summaries; only when the box can
  afford it.

Corresponding Ollama-side setting: `PARAMETER num_ctx 2048` in
`models/Modelfile.bonsai8b`.

## 6. Runtime flags

Three flags routinely move the needle on weak VMs:

- `--parallel 1`: the demo only needs one in-flight request. Higher
  parallelism fragments the KV cache and makes every token slower.
- `--mlock`: pins weights in physical memory so the kernel never
  pages them to swap mid-generation. On a box with swap enabled and
  8GB RAM this is the difference between "slow" and "catastrophic".
- `--no-mmap`: avoids slow page faults when the virtual disk is slow
  (Linode shared volumes, some hypervisors). Always benchmark both
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
summary generation often does not).

## 9. Expected token rates

Ballpark figures under the recommended flags for `Bonsai-8B-Q1_0`
served through the PrismML `llama.cpp` fork. Numbers depend on
kernel version, NUMA topology, thermal envelope, and neighbour noise
on shared hosts.

| Class                                    | Q1_0 tok/s (PrismML fork)   |
| ---------------------------------------- | --------------------------- |
| Weak shared 2 vCPU x86                   | 1 – 3                       |
| Decent 4 dedicated vCPU x86 (AVX2+FMA)   | 5 – 9                       |
| Good 8 dedicated vCPU x86 (AVX2+FMA)     | **~11.7 (measured)**        |
| Apple M-series (Metal) — use Q2_0 file   | much higher                 |
| ARM server with NEON — use Q2_0 file     | much higher                 |
| Discrete GPU (CUDA / ROCm)               | much higher                 |

The **~11.7 tok/s measured** row is the 2026-04-30 `llama-bench`
result (`tg32`, `-t 6`, warm). On Apple Silicon and ARM-server
hosts, switch to `Ternary-Bonsai-8B-Q2_0.gguf` — the NEON kernel
beats the x86 Q1_0 path significantly there.

For comparison, the same VM on `Ternary-Bonsai-8B-Q2_0` (no x86 SIMD
kernel; scalar fallback) lands at **~0.45–0.60 tok/s** — see
[Why Q2_0 is slow on x86](#why-q2_0-is-slow-on-x86).

## 10. Model alternatives for CPU-only

If your benchmarks land in the "Weak shared" row and you cannot move
to a better host, the 8B model is the wrong tool. Swap in a smaller
model and keep 8B on GPU / Metal / NPU paths only. Good CPU-only
candidates, in rough order of capability / cost:

- **Bonsai-4B-Q1_0** — 0.57 GB on disk, ~20.7 tok/s on the reference
  VM. Same PrismML fork; same x86 SIMD kernel as the 8B Q1_0. Source:
  https://huggingface.co/prism-ml/Bonsai-4B-gguf
- **Qwen3 0.6B Q4_K_M** — router, classifier, short completions.
- **Gemma 3 1B QAT Q4_0** — compact assistant tasks, translation.
- **Qwen2.5 1.5B Q4_K_M** — default CPU-only chat / summarisation.

The demo's `MODEL_NAME` / `MODEL_QUANT` env vars
(`frontend/electron/inference/bootstrap.ts`) let you point the
Electron shell at any of these without code changes:

```bash
MODEL_NAME=qwen2.5-1.5b MODEL_QUANT=q4_k_m npm run electron:dev
```

## 11. Minimum usable thresholds

Product-level floor per surface. If, after tuning, a surface cannot
hit its minimum, switch models — do not ship the slower config.

| Surface class                     | Minimum   | Notes                                        |
| --------------------------------- | --------- | -------------------------------------------- |
| Classifier / router               | 20+ tok/s | Runs per message; user-invisible latency.    |
| Short assistant (smart reply)     |  5+ tok/s | Inline composer suggestions, streamed.       |
| CPU fallback minimum (any tier)   |  2+ tok/s | Below this, UX perception breaks.            |

Bonsai-8B-Q1_0 on the reference 8 vCPU EPYC box clears the
short-assistant 5 tok/s tier (~11.7 tok/s sustained at `-t 6`) but
sits below the classifier 20 tok/s bar. Bonsai-4B-Q1_0 clears the
classifier bar (~20.7 tok/s). Q2_0 on the same x86 host (~0.45 tok/s)
sits below even the CPU-fallback minimum, which is why it is no
longer the x86 default — see
[Why Q2_0 is slow on x86](#why-q2_0-is-slow-on-x86) for the kernel
attribution.

Streaming demo surfaces like `02 morning-catchup` and
`b2c/07 smart-reply` previously required GPU / Metal / NPU because
the old Q2_0 default ran below the CPU-fallback floor. Under
Bonsai-8B-Q1_0 they should be re-evaluated against the 5 tok/s
short-assistant bar — the math finally works on commodity x86 CPU.
