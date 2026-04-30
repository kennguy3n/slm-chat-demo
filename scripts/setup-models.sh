#!/usr/bin/env bash
# KChat SLM Demo — model setup.
#
# Downloads the Bonsai-1.7B GGUF (~1.0 GB) from HuggingFace and
# creates a local Ollama alias that matches the app's default
# (`bonsai-1.7b`). Honours `MODEL_NAME` so the alias can be renamed
# if you want the bootstrap to pick a different name.
#
# This script targets the Ollama fallback path. The demo's primary
# on-device runtime is `llama-server` from the PrismML llama.cpp
# fork (kennguy3n/llama.cpp branch `prism`); see README.md for the
# llama-server build/run instructions. The bootstrap probes
# `LLAMACPP_BASE_URL` first and falls back to Ollama only when
# llama-server is unreachable.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# The Ollama alias the bootstrap defaults to. Override via MODEL_NAME.
MODEL_ALIAS="${MODEL_NAME:-bonsai-1.7b}"

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

MODELFILE="$REPO_ROOT/models/Modelfile.bonsai1_7b"
MODELS_DIR="$REPO_ROOT/models"

# Single GGUF artifact — Bonsai-1.7B (~1.0 GB on disk).
GGUF_FILENAME="Bonsai-1.7B.gguf"
GGUF_URL="https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/${GGUF_FILENAME}"

# Extract the FROM tag from the Modelfile so this script stays in sync
# automatically when the Modelfile is updated.
base="$(grep -E '^FROM[[:space:]]+' "$MODELFILE" | awk '{print $2}')"

if [[ -z "$base" ]]; then
  echo "ERROR: could not parse FROM line from $MODELFILE" >&2
  exit 1
fi

# The Modelfile points at a local GGUF file by design; download it
# from HuggingFace if it isn't already present.
if [[ "$base" == .* || "$base" == /* ]]; then
  if [[ "$base" == /* ]]; then
    local_path="$base"
  else
    local_path="$MODELS_DIR/${base#./}"
  fi

  base_filename="$(basename "$local_path")"

  if [[ -f "$local_path" ]]; then
    echo "1/2  Base GGUF already present: $local_path (skipping download)"
  elif [[ "$base_filename" == "$GGUF_FILENAME" ]]; then
    echo "1/2  Downloading base GGUF: $GGUF_FILENAME (~1.0 GB) from HuggingFace"
    mkdir -p "$(dirname "$local_path")"
    # Download to a temp file and atomically rename on success so an
    # interrupted run never leaves a partial GGUF that the next
    # invocation would mistake for a complete download.
    tmp_path="${local_path}.download.tmp"
    cleanup_tmp() { rm -f "$tmp_path"; }
    trap cleanup_tmp EXIT INT TERM
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 --retry-delay 2 -o "$tmp_path" "$GGUF_URL"
    elif command -v wget >/dev/null 2>&1; then
      wget --tries=3 -O "$tmp_path" "$GGUF_URL"
    else
      echo "ERROR: neither 'curl' nor 'wget' is installed; cannot download $GGUF_FILENAME" >&2
      echo "Install one of them, or download manually:" >&2
      echo "  $GGUF_URL -> $local_path" >&2
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
echo "You should see '$MODEL_ALIAS' at ~1.0 GB."
echo ""
echo "TIP: the demo prefers llama-server from the PrismML llama.cpp"
echo "      fork (kennguy3n/llama.cpp branch 'prism'). Run it with"
echo "      './build/bin/llama-server -m models/Bonsai-1.7B.gguf -c 1024 --port 8080'"
echo "      and the bootstrap will use it before falling back to Ollama."
echo ""
echo "Start the app:"
echo "  cd frontend && npm run electron:dev"
