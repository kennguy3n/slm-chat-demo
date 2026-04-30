# CPU performance tuning — Ternary-Bonsai-8B and friends

This guide captures the diagnostic and tuning checklist used when the
on-device SLM is running too slowly on a CPU-only host. The current
baseline is the Ternary-Bonsai-8B GGUF pulled via
`./scripts/setup-models.sh` from `hf.co/prism-ml/Ternary-Bonsai-8B-gguf`.

**The canonical artifact.** `Ternary-Bonsai-8B-Q2_0.gguf` is **~2 GB**
on disk (2.03 GiB / 2 081 MB). That is the CPU-friendly target this
guide and the demo are written against. The Q2_0 ternary tensors are
**not** loadable by mainline `llama.cpp` and stock Ollama 0.22.x
cannot load them either (verified — the bundled runner SIGSEGVs
during load); you must use the PrismML fork — see
[Use the PrismML fork](#2-use-the-prismml-fork). All numbers in
[Expected token rates](#9-expected-token-rates) and the live
benchmarks below assume Q2_0 served through that fork.

## Benchmarks on the reference VM

Live `llama-bench` measurements, 2026-04-30, against the PrismML
`llama.cpp` fork (`prism` branch) on AMD EPYC 7763, 8 vCPU, 31 GiB
RAM, AVX2 + FMA, CPU-only:

| Test (`-t 4 -ngl 0`)                         | tok/s    |
| -------------------------------------------- | -------- |
| `pp64`  (prompt processing, 64 input tokens) | **0.51** |
| `tg32`  (token generation, 32 output tokens) | **0.45** |

Resident RAM is **~2.1 GB** at startup before KV-cache growth, in
line with the 2 GB on-disk size. If the file your Ollama install
resolves the HF tag to is much larger than 2 GB, you have pulled the
wrong build — fall back to the explicit Q2_0 download path in
[`models/README.md`](../models/README.md#fallback-local-gguf-file).

**Calibration note.** Earlier passes of this guide anchored on
"~0.3 tok/s on an 8 GB shared 8-core VM running the Q2_0 quant". The
2026-04-30 numbers above (~0.45 tok/s on a dedicated EPYC 7763 8 vCPU
box) are the same order of magnitude, which confirms the
long-standing diagnosis: the PrismML Q2_0 ternary kernels are **not
yet x86-optimised** — the published throughput targets for this
quant are against ARM / Apple-Silicon SIMD paths. Until those
kernels land for x86, treat 0.3 – 1 tok/s as the realistic Q2_0 band
on commodity x86 CPU.

Use this guide to either:

1. Tune the existing 8B Q2_0 pipeline up toward the per-surface token
   budgets listed in [Minimum usable thresholds](#minimum-usable-thresholds), or
2. Decide — based on the benchmark numbers — that the host is the
   wrong class for an 8B model and switch to a smaller one (see
   [Model alternatives for CPU-only](#model-alternatives-for-cpu-only)).

See also:

- `demo/README.md` — where the launch command and flag notes live.
- `models/Modelfile.bonsai8b` — the Ollama Modelfile (ships with
  `num_ctx 2048` as the CPU-friendly default).
- `models/README.md` — CPU-performance section and model matrix.

---

## 1. Verify CPU features

Before anything else, confirm the box actually has the instruction
sets `llama.cpp` expects. Without AVX2 + FMA you will not hit the
published token rates for any 8B model and no amount of flag tuning
will rescue it — change the VM class.

```bash
lscpu | egrep "Model name|avx|avx2|avx512|sse4|fma"
```

If AVX2 is missing: stop here, pick a different host.

## 2. Use the PrismML fork

`Ternary-Bonsai-8B-Q2_0` is a ternary quant that mainline `llama.cpp`
does not support. You need the PrismML fork:

- Repo: https://github.com/PrismML-Eng/llama.cpp
- Branch: `prism`

`ollama` 0.22.x cannot load Q2_0 either; the demo shims it by running
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

## 4. Benchmark thread counts

Thread count is the single biggest knob on shared / NUMA VMs. More
threads is NOT always faster — cache contention and cross-socket
latency often peak somewhere in the middle. Run the full sweep:

```bash
for t in 1 2 4 6 8; do
  ./llama-bench -m Ternary-Bonsai-8B-Q2_0.gguf -p 128 -n 128 -c 1024 -t $t
done
```

Pick the `t` value that wins on generation (`tg128`), not just prompt
processing. Plug that back into `llama-server` as both `-t` (compute)
and `-tb` (batch compute) unless the bench shows they should differ.

## 5. Context reduction

Attention cost scales with `-c`. For task prompts of 256–1024 input
tokens, most surfaces fit cleanly into `-c 1024`:

```bash
./llama-bench -m Ternary-Bonsai-8B-Q2_0.gguf -p 128 -n 128 -c 512 -t 4
./llama-bench -m Ternary-Bonsai-8B-Q2_0.gguf -p 128 -n 128 -c 1024 -t 4
./llama-bench -m Ternary-Bonsai-8B-Q2_0.gguf -p 128 -n 128 -c 2048 -t 4
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

Ballpark figures under the recommended flags for the
Ternary-Bonsai-8B-Q2_0 GGUF (~2 GB) served through the PrismML
`llama.cpp` fork. Numbers depend on kernel version, NUMA topology,
thermal envelope, and neighbour noise on shared hosts.

| Class                                  | Q2_0 tok/s (PrismML fork) |
| -------------------------------------- | ------------------------- |
| Weak shared 2 vCPU x86                 | 0.2 – 0.6                 |
| Decent 4 dedicated vCPU x86 (AVX2+FMA) | 0.4 – 0.8                 |
| Good 8 dedicated vCPU x86 (AVX2+FMA)   | **~0.45 (measured)**      |
| Apple M-series (Metal)                 | much higher               |
| ARM server CPU with optimised kernels  | much higher               |
| Discrete GPU (CUDA / ROCm)             | much higher               |

The **~0.45 tok/s measured** row is the 2026-04-30 `llama-bench`
result (`tg32`, `-t 4`, warm). All x86 rows are dominated by the
fact that the Q2_0 ternary kernels in the PrismML fork are not yet
SIMD-vectorised on x86; expect numbers in the **0.3 – 1 tok/s band**
until they are. If you are on Apple Silicon or an ARM server with
the ternary kernels enabled, re-measure — those paths are tuned and
should land much higher.

## 10. Model alternatives for CPU-only

If your benchmarks land in the "Weak shared" row and you cannot move
to a better host, the 8B model is the wrong tool. Swap in a smaller
model and keep 8B on GPU / Metal / NPU paths only. Good CPU-only
candidates, in rough order of capability / cost:

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

**0.3 – 1 tok/s Q2_0 on commodity x86 CPU is below the CPU-fallback
floor** — which is why neither the "Weak shared 2 vCPU" row nor the
2026-04-30 reference VM (8 vCPU EPYC 7763 → ~0.45 tok/s) is a
shippable baseline for any streaming surface. That is why streaming
demo surfaces like `02 morning-catchup` and `b2c/07 smart-reply` are
flagged **(pending)** in `demo/README.md` — they need GPU / Metal /
NPU, ARM with optimised ternary kernels, or a smaller CPU-only model
to hit their per-surface budgets. Use this guide to either tune up,
switch hosts, or switch models.
