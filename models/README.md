# Model definitions

Ollama Modelfiles that create local aliases matching the app's default
model names (`gemma-4-e2b` / `gemma-4-e4b` — the values
`frontend/electron/inference/bootstrap.ts` uses when `E2B_MODEL` /
`E4B_MODEL` env vars are unset).

| Alias         | Modelfile       | Base model   | Tier      | Use case                                |
|---------------|-----------------|--------------|-----------|-----------------------------------------|
| `gemma-4-e2b` | `Modelfile.e2b` | `gemma4:e2b` | Mid-tier  | Summaries, translation, task extraction |
| `gemma-4-e4b` | `Modelfile.e4b` | `gemma4:e4b` | High-tier | Artifact drafts, approvals, synthesis   |

Base tags verified against [the Ollama Gemma 4 library
page](https://ollama.com/library/gemma4/tags) on 2026-04-29.

## Quick setup

```bash
./scripts/setup-models.sh
```

The script pulls both base models, creates the aliases, and prints a
verification command. After it runs, `ollama list` should show:

```
gemma-4-e2b:latest    ...   2.0 GB
gemma-4-e4b:latest    ...   3.4 GB
gemma4:e2b            ...   7.2 GB
gemma4:e4b            ...   9.6 GB
```

(Sizes vary by quantisation — see `gemma4:e2b-it-q8_0`,
`gemma4:e4b-it-bf16`, etc. on the library page if you want a different
quant.)

## Custom base models

If you want a different base model under the same alias (e.g. a
quantised build like `gemma4:e2b-it-q4_K_M` or `gemma4:e4b-it-q8_0`),
edit the `FROM` line in the relevant Modelfile and re-run
`./scripts/setup-models.sh`. The script always re-creates the aliases.

If you want different *alias names*, override at runtime — the bootstrap
respects `E2B_MODEL` / `E4B_MODEL`:

```bash
export E2B_MODEL=my-custom-e2b
export E4B_MODEL=my-custom-e4b
cd frontend && npm run electron:dev
```

The setup script also honours `E2B_MODEL` / `E4B_MODEL`, so you can
create the aliases under whatever names the app expects:

```bash
E2B_MODEL=my-custom-e2b E4B_MODEL=my-custom-e4b ./scripts/setup-models.sh
```
