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

# Extract the FROM tag from the Modelfile so this script stays in sync
# automatically when the Modelfile is updated.
base="$(grep -E '^FROM[[:space:]]+' "$MODELFILE" | awk '{print $2}')"

if [[ -z "$base" ]]; then
  echo "ERROR: could not parse FROM line from $MODELFILE" >&2
  exit 1
fi

# If the Modelfile points at a local GGUF file we skip the `ollama pull`
# step — `ollama create` will package the file directly.
if [[ "$base" == .* || "$base" == /* ]]; then
  echo "1/2  Base model is a local GGUF path: $base (skipping pull)"
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
echo "You should see '$MODEL_ALIAS'."
echo ""
echo "Start the app:"
echo "  cd frontend && npm run electron:dev"
