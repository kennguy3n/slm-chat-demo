#!/usr/bin/env bash
# KChat SLM Demo — model setup.
#
# Downloads the Bonsai-8B-Q1_0 GGUF (~1.16 GB) from HuggingFace and
# creates a local alias that matches the app's default (`bonsai-8b`).
# Honours `MODEL_NAME` so the alias can be renamed if you want the
# bootstrap to pick a different name.
#
# Q1_0 is PrismML's 1-bit quant — the PrismML llama.cpp fork ships a
# real x86 SIMD kernel for it (AVX2/FMA), so on commodity x86 hosts
# this is the fastest CPU artifact. The Ternary-Bonsai-8B-Q2_0 file
# is the ARM/Apple-Silicon path — see docs/cpu-perf-tuning.md for the
# kernel-coverage details and per-arch benchmarks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Quant-suffixed alias. Hosts that already have a bare `bonsai-8b`
# alias bound to an F16 or Q4 GGUF will NOT be silently reused; this
# alias is explicitly tied to `Bonsai-8B-Q1_0.gguf`. If you point
# MODEL_NAME at a different alias you're responsible for making sure
# it resolves to the Q1_0 GGUF (or the Q2_0 file on ARM hosts).
MODEL_ALIAS="${MODEL_NAME:-bonsai-8b-q1_0}"

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

# Canonical x86 CPU artifact — Bonsai-8B-Q1_0 GGUF (~1.16 GB on disk).
# This is a PrismML custom 1-bit quant; the fork has a real x86 SIMD
# kernel for Q1_0 (see ggml/src/ggml-cpu/arch/x86/quants.c), so on
# AMD/Intel CPUs with AVX2+FMA it lands at ~11 tok/s on 8 vCPU vs
# the ~0.45 tok/s scalar-fallback that Q2_0 produces on the same box.
# Ollama's `hf.co/<user>/<repo>:<quant>` shorthand doesn't recognise
# `Q1_0` either, so we download the file directly and reference it
# from the Modelfile via a local `FROM ./Bonsai-8B-Q1_0.gguf` path.
Q1_FILENAME="Bonsai-8B-Q1_0.gguf"
Q1_URL="https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/${Q1_FILENAME}"

# Extract the FROM tag from the Modelfile so this script stays in sync
# automatically when the Modelfile is updated.
base="$(grep -E '^FROM[[:space:]]+' "$MODELFILE" | awk '{print $2}')"

if [[ -z "$base" ]]; then
  echo "ERROR: could not parse FROM line from $MODELFILE" >&2
  exit 1
fi

# If the Modelfile points at a local GGUF file, ensure it exists in
# `$MODELS_DIR` before handing off to `ollama create`. For the
# canonical Q1_0 artifact we download it from HuggingFace if missing.
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
  elif [[ "$base_filename" == "$Q1_FILENAME" ]]; then
    echo "1/2  Downloading base GGUF: $Q1_FILENAME (~1.16 GB) from HuggingFace"
    mkdir -p "$(dirname "$local_path")"
    # Download to a temp file and atomically rename on success so an
    # interrupted run never leaves a partial GGUF that the next
    # invocation would mistake for a complete download.
    tmp_path="${local_path}.download.tmp"
    cleanup_tmp() { rm -f "$tmp_path"; }
    trap cleanup_tmp EXIT INT TERM
    if command -v curl >/dev/null 2>&1; then
      curl -fL --retry 3 --retry-delay 2 -o "$tmp_path" "$Q1_URL"
    elif command -v wget >/dev/null 2>&1; then
      wget --tries=3 -O "$tmp_path" "$Q1_URL"
    else
      echo "ERROR: neither 'curl' nor 'wget' is installed; cannot download $Q1_FILENAME" >&2
      echo "Install one of them, or download manually:" >&2
      echo "  $Q1_URL -> $local_path" >&2
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
echo "You should see '$MODEL_ALIAS' at ~1.16 GB."
echo "If the size looks like ~16 GB the alias has been bound to an F16"
echo "GGUF by mistake — re-run this script after 'ollama rm $MODEL_ALIAS'."
echo ""
echo "NOTE: stock Ollama 0.22.x can create the alias from a PrismML"
echo "      Q1_0 GGUF but cannot RUN inference against it (the bundled"
echo "      llama.cpp does not implement the Q1_0 tensor type). The"
echo "      CPU-only demo path uses the PrismML llama.cpp fork behind"
echo "      an Ollama-API shim — see demo/README.md step 4 and"
echo "      docs/cpu-perf-tuning.md."
echo ""
echo "Start the app:"
echo "  cd frontend && npm run electron:dev"
