#!/usr/bin/env bash
# KChat SLM Demo — model setup.
#
# Pulls the Ternary-Bonsai-8B GGUF base model from HuggingFace (via
# Ollama's `hf.co/<user>/<repo>` shorthand) and creates a local alias
# that matches the app's default (`ternary-bonsai-8b`). Honours
# `MODEL_NAME` so the alias can be renamed if you want the bootstrap
# to pick a different name.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODEL_ALIAS="${MODEL_NAME:-ternary-bonsai-8b}"

echo "=== KChat SLM Demo — Model Setup ==="
echo ""

# Check Ollama is installed.
if ! command -v ollama >/dev/null 2>&1; then
  echo "ERROR: 'ollama' not found. Install from https://ollama.com/download"
  exit 1
fi

# Make sure the daemon is reachable. `ollama list` exits non-zero when
# the daemon is down.
if ! ollama list >/dev/null 2>&1; then
  echo "Starting Ollama daemon in the background..."
  ollama serve >/dev/null 2>&1 &
  sleep 3
fi

MODELFILE="$REPO_ROOT/models/Modelfile.bonsai8b"
MODELS_DIR="$REPO_ROOT/models"

# Canonical CPU artifact — Q2_0 ternary GGUF (~2 GB on disk).
# Ollama's `hf.co/<user>/<repo>:<quant>` shorthand rejects `Q2_0`
# (returns "not a valid quantization scheme"), so we download the
# file directly and reference it from the Modelfile via a local
# `FROM ./Ternary-Bonsai-8B-Q2_0.gguf` path.
Q2_FILENAME="Ternary-Bonsai-8B-Q2_0.gguf"
Q2_URL="https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/resolve/main/${Q2_FILENAME}"

# Extract the FROM tag from the Modelfile so this script stays in sync
# automatically when the Modelfile is updated.
base="$(grep -E '^FROM[[:space:]]+' "$MODELFILE" | awk '{print $2}')"

if [[ -z "$base" ]]; then
  echo "ERROR: could not parse FROM line from $MODELFILE" >&2
  exit 1
fi

# If the Modelfile points at a local GGUF file, ensure it exists in
# `$MODELS_DIR` before handing off to `ollama create`. For the
# canonical Q2_0 artifact we download it from HuggingFace if missing.
if [[ "$base" == .* || "$base" == /* ]]; then
  # Resolve the local path relative to the Modelfile directory (the
  # same way `ollama create` does).
  if [[ "$base" == /* ]]; then
    local_path="$base"
  else
    local_path="$MODELS_DIR/${base#./}"
  fi

  base_filename="$(basename "$local_path")"

  if [[ -f "$local_path" ]]; then
    echo "1/2  Base GGUF already present: $local_path (skipping download)"
  elif [[ "$base_filename" == "$Q2_FILENAME" ]]; then
    echo "1/2  Downloading base GGUF: $Q2_FILENAME (~2 GB) from HuggingFace"
    mkdir -p "$(dirname "$local_path")"
    # Download to a temp file and atomically rename on success so an
    # interrupted run never leaves a partial GGUF that the next
    # invocation would mistake for a complete download.
    tmp_path="${local_path}.download.tmp"
    cleanup_tmp() { rm -f "$tmp_path"; }
    trap cleanup_tmp EXIT INT TERM
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 --retry-delay 2 -o "$tmp_path" "$Q2_URL"
    elif command -v wget >/dev/null 2>&1; then
      wget --tries=3 -O "$tmp_path" "$Q2_URL"
    else
      echo "ERROR: neither 'curl' nor 'wget' is installed; cannot download $Q2_FILENAME" >&2
      echo "Install one of them, or download manually:" >&2
      echo "  $Q2_URL -> $local_path" >&2
      exit 1
    fi
    mv "$tmp_path" "$local_path"
    trap - EXIT INT TERM
  else
    echo "ERROR: Modelfile references local GGUF $local_path which does not exist" >&2
    echo "Download the file manually and re-run this script." >&2
    exit 1
  fi
else
  echo "1/2  Pulling base model: $base"
  # `ollama create` will pull the base on demand, but pulling explicitly
  # first gives the user a real progress bar.
  ollama pull "$base"
fi

echo "2/2  Creating alias: $MODEL_ALIAS"
ollama create "$MODEL_ALIAS" -f "$MODELFILE"

echo ""
echo "Done! Verify with: ollama list"
echo "You should see '$MODEL_ALIAS' (~2 GB if the Q2_0 GGUF was used)."
echo ""
echo "NOTE: stock Ollama 0.22.x can create the alias from a Q2_0 GGUF"
echo "      but cannot RUN inference against it (the bundled llama.cpp"
echo "      SIGSEGVs while loading ternary tensors). The CPU-only demo"
echo "      path uses the PrismML llama.cpp fork behind an Ollama-API"
echo "      shim — see demo/README.md step 4 and docs/cpu-perf-tuning.md."
echo ""
echo "Start the app:"
echo "  cd frontend && npm run electron:dev"
