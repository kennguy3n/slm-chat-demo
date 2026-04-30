# Model definitions

Ollama Modelfile that creates the local alias the app looks for by
default (`bonsai-8b` — the value
`frontend/electron/inference/bootstrap.ts` uses when `MODEL_NAME` is
unset). The demo ships a single on-device model; all non-server
inference routes through this alias.

| Alias       | Modelfile             | Base GGUF (x86 default)   | Size on disk | Tier  | Use case                            |
|-------------|-----------------------|---------------------------|--------------|-------|-------------------------------------|
| `bonsai-8b` | `Modelfile.bonsai8b`  | `Bonsai-8B-Q1_0.gguf`     | ~1.16 GB     | local | Summaries, drafts, reasoning, tasks |

Source: [prism-ml/Bonsai-8B-gguf](https://huggingface.co/prism-ml/Bonsai-8B-gguf)
→ [`Bonsai-8B-Q1_0.gguf`](https://huggingface.co/prism-ml/Bonsai-8B-gguf/blob/main/Bonsai-8B-Q1_0.gguf).

## Quick setup

```bash
./scripts/setup-models.sh
```

The script downloads `Bonsai-8B-Q1_0.gguf` (~1.16 GB) from
HuggingFace into `models/` if it isn't already present, then creates
the `bonsai-8b` Ollama alias from the Modelfile in this directory.
After it runs, `ollama list` should show a row for `bonsai-8b:latest`
at ~1.16 GB.

Why the explicit Q1_0 file (not Ollama's `hf.co/<repo>:<quant>`
shorthand)? Ollama's tag resolver does not recognise `Q1_0` as a
valid quantisation scheme. The script and Modelfile therefore
reference the file by local path so the canonical x86 CPU artifact
(~1.16 GB) is what lands in `ollama list`.

**Why Q1_0 instead of Q2_0?** PrismML's Q1_0 quant has a real x86
SIMD kernel (AVX2/FMA) in their `llama.cpp` fork; Q2_0 does not — on
x86 it falls back to scalar code and runs ~25× slower despite using
less RAM. On AMD EPYC 7763 8 vCPU we measured **~11.7 tok/s** for
Bonsai-8B-Q1_0 vs **~0.45–0.60 tok/s** for Ternary-Bonsai-8B-Q2_0.
Full kernel attribution and per-arch guidance in
[`docs/cpu-perf-tuning.md` → Why Q2_0 is slow on x86](../docs/cpu-perf-tuning.md#why-q2_0-is-slow-on-x86).

**Important runtime caveat.** Stock Ollama 0.22.x can `create` an
alias from the Q1_0 GGUF but **cannot run inference** against it
(the bundled `llama.cpp` does not implement the Q1_0 tensor type).
The CPU-only demo path uses the PrismML `llama.cpp` fork behind an
Ollama-API shim — see
[`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) and
[`demo/README.md` → step 4](../demo/README.md#how-to-reproduce).

### Using a different quant

The Bonsai HuggingFace repos ship a few alternatives that may suit
non-x86 hosts or RAM-constrained boxes better:

- **`Ternary-Bonsai-8B-Q2_0.gguf`** — ~2.18 GB; recommended on ARM /
  Apple Silicon, where the PrismML fork's NEON kernel makes it the
  fastest path. Source:
  https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf
- **`Bonsai-4B-Q1_0.gguf`** — ~0.57 GB; same x86 SIMD kernel as the
  8B Q1_0 but half the parameter count, ~20.7 tok/s on the reference
  EPYC box. Source: https://huggingface.co/prism-ml/Bonsai-4B-gguf
- **`Ternary-Bonsai-8B-F16.gguf`** — ~16 GB; mainline `llama.cpp` and
  stock Ollama can run this without the PrismML fork, useful for
  smoke-testing the Ollama path itself.

To switch, download the file and edit the `FROM` line in
`models/Modelfile.bonsai8b`:

```bash
# Example — switch to the Q2_0 file for an Apple Silicon dev box.
curl -L -o models/Ternary-Bonsai-8B-Q2_0.gguf \
  https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B-Q2_0.gguf
# Then in models/Modelfile.bonsai8b:
#   FROM ./Ternary-Bonsai-8B-Q2_0.gguf
./scripts/setup-models.sh
```

## Custom alias names

If you want a different *alias name*, override at runtime with
`MODEL_NAME` — the bootstrap and the setup script both honour it:

```bash
export MODEL_NAME=my-custom-bonsai
MODEL_NAME=my-custom-bonsai ./scripts/setup-models.sh
cd frontend && npm run electron:dev
```

## CPU performance

The canonical x86 CPU target is the **Q1_0 GGUF** —
`Bonsai-8B-Q1_0.gguf`, **~1.16 GB on disk**, ~1.2 GB resident at
startup before KV-cache growth. The Modelfile in this directory
defaults to `num_ctx 2048` so CPU-only hosts don't pay the 8K-context
attention cost per token.

**Measured rates (2026-04-30, AMD EPYC 7763 8 vCPU, 31 GiB RAM,
CPU-only, PrismML fork `llama-bench`, `-t 6`, warm):** prompt
processing `pp64` ~**14.8 tok/s**, token generation `tg32` ~**11.7
tok/s**. Full context and per-arch comparison in
[`demo/README.md` → On-device LLM performance](../demo/README.md#on-device-llm-performance)
and
[`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md).

That clears the tuning guide's short-assistant 5 tok/s tier with
headroom; classifier / router surfaces (20+ tok/s minimum) should
either drop to `Bonsai-4B-Q1_0` (~20.7 tok/s on the same box) or run
on GPU / Metal / NPU.

For comparison, `Ternary-Bonsai-8B-Q2_0` on the same x86 host runs
at ~0.45–0.60 tok/s — below the CPU-fallback floor — because its
kernel falls back to scalar code on x86. See
[`docs/cpu-perf-tuning.md` → Why Q2_0 is slow on x86](../docs/cpu-perf-tuning.md#why-q2_0-is-slow-on-x86)
for the full attribution.

The `MODEL_NAME` and `MODEL_QUANT` env vars (consumed by
`frontend/electron/inference/bootstrap.ts`) let you switch models
without code changes:

```bash
MODEL_NAME=bonsai-4b MODEL_QUANT=q1_0 npm run electron:dev
# or, for an Apple Silicon dev box:
MODEL_QUANT=q2_0 npm run electron:dev
```

See [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
full diagnostic checklist (CPU feature probing, thread-count sweeps,
context reduction, `--mlock` / `--no-mmap`, swap monitoring, KV-cache
quantisation, expected token rates, and minimum usable thresholds).
