#!/usr/bin/env bash
# KChat SLM Demo — model setup.
#
# Pulls the Gemma 4 E2B / E4B base models from the Ollama library and
# creates local aliases that match the app's defaults
# (`gemma-4-e2b` / `gemma-4-e4b`). Honours `E2B_MODEL` / `E4B_MODEL`
# overrides so the aliases can be renamed if you want the bootstrap to
# pick a different name.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

E2B_ALIAS="${E2B_MODEL:-gemma-4-e2b}"
E4B_ALIAS="${E4B_MODEL:-gemma-4-e4b}"

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

# Extract the FROM tag from each Modelfile so this script stays in sync
# automatically when the Modelfile is updated.
e2b_base="$(grep -E '^FROM[[:space:]]+' "$REPO_ROOT/models/Modelfile.e2b" | awk '{print $2}')"
e4b_base="$(grep -E '^FROM[[:space:]]+' "$REPO_ROOT/models/Modelfile.e4b" | awk '{print $2}')"

if [[ -z "$e2b_base" || -z "$e4b_base" ]]; then
  echo "ERROR: could not parse FROM line from Modelfile(s)" >&2
  exit 1
fi

echo "1/4  Pulling E2B base model: $e2b_base"
# `ollama create` will pull the base on demand, but pulling explicitly
# first gives the user a real progress bar.
ollama pull "$e2b_base"

echo "2/4  Pulling E4B base model: $e4b_base"
ollama pull "$e4b_base"

echo "3/4  Creating E2B alias: $E2B_ALIAS"
ollama create "$E2B_ALIAS" -f "$REPO_ROOT/models/Modelfile.e2b"

echo "4/4  Creating E4B alias: $E4B_ALIAS"
ollama create "$E4B_ALIAS" -f "$REPO_ROOT/models/Modelfile.e4b"

echo ""
echo "Done! Verify with: ollama list"
echo "You should see both '$E2B_ALIAS' and '$E4B_ALIAS'."
echo ""
echo "Start the app:"
echo "  cd frontend && npm run electron:dev"
