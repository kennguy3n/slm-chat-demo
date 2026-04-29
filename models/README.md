# Model definitions

Ollama Modelfile that creates the local alias the app looks for by
default (`ternary-bonsai-8b` — the value
`frontend/electron/inference/bootstrap.ts` uses when `E2B_MODEL` /
`E4B_MODEL` env vars are unset). Both the E2B and E4B tier slots in the
router point at the same alias; the two-tier logic is retained for
future flexibility but a single 8B model currently serves both roles.

| Alias               | Modelfile             | Base model                                          | Tier       | Use case                            |
|---------------------|-----------------------|-----------------------------------------------------|------------|-------------------------------------|
| `ternary-bonsai-8b` | `Modelfile.bonsai8b`  | `hf.co/prism-ml/Ternary-Bonsai-8B-gguf`             | Both tiers | Summaries, drafts, reasoning, tasks |

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

If you want a different *alias name*, override at runtime — the
bootstrap respects `E2B_MODEL` / `E4B_MODEL` (both default to
`ternary-bonsai-8b`):

```bash
export E2B_MODEL=my-custom-bonsai
export E4B_MODEL=my-custom-bonsai
cd frontend && npm run electron:dev
```

The setup script also honours `MODEL_NAME` (and `E2B_MODEL` /
`E4B_MODEL` for backward compatibility), so you can create the alias
under whatever name the app expects:

```bash
MODEL_NAME=my-custom-bonsai ./scripts/setup-models.sh
```
