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
