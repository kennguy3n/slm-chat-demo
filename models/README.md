# Model definitions

Ollama Modelfile that creates the local alias the app looks for by
default (`bonsai-1.7b` — the value
`frontend/electron/inference/bootstrap.ts` uses when `MODEL_NAME` is
unset). The demo ships a single on-device model; all non-server
inference routes through this alias when running against Ollama.

> **Primary path is llama-server, not Ollama.** As of the Phase 7
> redesign the demo prefers the PrismML `llama-server` from
> [`kennguy3n/llama.cpp`](https://github.com/kennguy3n/llama.cpp)
> (branch `prism`). The bootstrap probes `LLAMACPP_BASE_URL`
> (default `http://localhost:8080`) first and falls back to Ollama
> only when llama-server is not reachable. The Modelfile in this
> directory is the Ollama-fallback path.

| Alias        | Modelfile                | Base GGUF           | Size on disk | Tier  | Use case                              |
|--------------|--------------------------|---------------------|--------------|-------|---------------------------------------|
| `bonsai-1.7b`| `Modelfile.bonsai1_7b`   | `Bonsai-1.7B.gguf`  | ~1.0 GB      | local | Summaries, drafts, smart replies, tasks |

Source: [prism-ml/Bonsai-1.7B-gguf](https://huggingface.co/prism-ml/Bonsai-1.7B-gguf)
→ [`Bonsai-1.7B.gguf`](https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/blob/main/Bonsai-1.7B.gguf).

## Quick setup

```bash
./scripts/setup-models.sh
```

The script downloads `Bonsai-1.7B.gguf` (~1.0 GB) from HuggingFace
into `models/` if it isn't already present, then creates the
`bonsai-1.7b` Ollama alias from the Modelfile in this directory.
After it runs, `ollama list` should show a row for `bonsai-1.7b:latest`
at ~1.0 GB.

The Modelfile references the GGUF by local path so the canonical
artifact is what lands in `ollama list` (Ollama's
`hf.co/<repo>:<quant>` shorthand is not used here; one path means
one file).

## Custom alias names

If you want a different *alias name*, override at runtime with
`MODEL_NAME` — the bootstrap and the setup script both honour it:

```bash
export MODEL_NAME=my-custom-bonsai
MODEL_NAME=my-custom-bonsai ./scripts/setup-models.sh
cd frontend && npm run electron:dev
```

## CPU performance

`Bonsai-1.7B.gguf` is roughly 1.0 GB on disk and ~1.1 GB resident at
startup before KV-cache growth. Because the model is much smaller
than the previous Bonsai-8B target, both the x86 and ARM CPU paths
clear the demo's interactive-latency tier comfortably; per-arch
quant selection is no longer the dominant performance lever.

The Modelfile in this directory defaults to `num_ctx 1024` so
CPU-only hosts don't pay an unnecessary attention cost — every
demo prompt fits well inside that window after the Phase 7 prompt
redesign tightened input truncation and message caps.

For tuning guidance (thread count, mmap, mlock, GPU/Metal offload),
see [`docs/cpu-perf-tuning.md`](../docs/cpu-perf-tuning.md).

## Running with llama-server (recommended)

The PrismML llama.cpp fork's `llama-server` is the recommended
on-device runtime:

```bash
# In kennguy3n/llama.cpp (branch: prism):
cmake -B build && cmake --build build --config Release -t llama-server
./build/bin/llama-server -m /path/to/Bonsai-1.7B.gguf -c 1024 --port 8080

# Then in slm-chat-demo:
cd frontend && npm run electron:dev
```

The demo's `LlamaCppAdapter` talks to `llama-server` over its HTTP
API (`POST /completion` with `stream: true`, `GET /health`). When
the server is reachable the bootstrap wires it as the primary
on-device adapter; Ollama is the secondary fallback.
