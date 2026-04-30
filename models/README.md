# Model definitions

Ollama Modelfile that creates the local alias the app looks for by
default (`ternary-bonsai-8b` — the value
`frontend/electron/inference/bootstrap.ts` uses when `MODEL_NAME` is
unset). The demo ships a single on-device model; all non-server
inference routes through this alias.

| Alias               | Modelfile             | Base model                                          | Tier  | Use case                            |
|---------------------|-----------------------|-----------------------------------------------------|-------|-------------------------------------|
| `ternary-bonsai-8b` | `Modelfile.bonsai8b`  | `hf.co/prism-ml/Ternary-Bonsai-8B-gguf`             | local | Summaries, drafts, reasoning, tasks |

Source: [prism-ml/Ternary-Bonsai-8B-gguf](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf).

## Quick setup

```bash
./scripts/setup-models.sh
```

The script pulls the base model from HuggingFace (via Ollama's
`hf.co/<user>/<repo>` shorthand), creates the alias, and prints a
verification command. After it runs, `ollama list` should show:

```
ternary-bonsai-8b:latest                         ~5 GB
hf.co/prism-ml/Ternary-Bonsai-8B-gguf:latest     ~5 GB
```

(Exact size depends on the GGUF quantisation published in the
HuggingFace repo.)

### Fallback: local GGUF file

If your Ollama build does not support the `hf.co/<user>/<repo>`
shorthand, download the GGUF file directly and edit the `FROM` line:

```bash
# Example — pick the quant you want from the HuggingFace repo.
curl -L -o models/Ternary-Bonsai-8B.Q4_K_M.gguf \
  https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/Ternary-Bonsai-8B.Q4_K_M.gguf
# Then in models/Modelfile.bonsai8b:
#   FROM ./Ternary-Bonsai-8B.Q4_K_M.gguf
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

The ternary `Ternary-Bonsai-8B-Q2_0` quant used by the demo runs at
**~0.3 tok/s on shared 8-core CPU VMs** — below the product threshold
for every streaming AI surface (see
[`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
per-surface thresholds and the full tuning checklist). The Modelfile
in this directory now defaults to `num_ctx 2048` so that CPU-only
hosts don't pay the 8K-context attention cost per token.

For CPU-only deployments, prefer a smaller model. Good candidates
(see [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the
full list including small-QAT alternatives):

- **Qwen3 0.6B Q4_K_M** — router / classifier.
- **Qwen2.5 1.5B Q4_K_M** — default CPU chat / summarisation.

The `MODEL_NAME` and `MODEL_QUANT` env vars (consumed by
`frontend/electron/inference/bootstrap.ts`) let you switch models
without code changes:

```bash
MODEL_NAME=qwen2.5-1.5b MODEL_QUANT=q4_k_m npm run electron:dev
```

Reserve the 8B model for hosts with GPU, Apple Silicon (Metal), or an
NPU — it is not a reasonable default on CPU-only boxes. See
[`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md) for the full
diagnostic checklist (CPU feature probing, thread-count sweeps,
context reduction, `--mlock` / `--no-mmap`, swap monitoring, KV-cache
quantisation, expected token rates, and minimum usable thresholds).
