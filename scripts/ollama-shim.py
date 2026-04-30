#!/usr/bin/env python3
"""
KChat SLM demo — Ollama-compatible shim in front of PrismML `llama-server`.

Why this exists
---------------
The demo targets the Bonsai-8B-Q1_0 GGUF — PrismML's custom 1-bit
tensor type — for CPU-only hosts. Stock Ollama 0.22.x (and as far as
we know current mainline too) cannot load Q1_0 weights: the bundled
`llama.cpp` does not implement the tensor type, and `ollama run
bonsai-8b-q1_0` crashes the runner on load. See
`docs/cpu-perf-tuning.md` §2 for the full story.

The runtime path the demo actually uses is:

    Electron ── /api/generate  ─▶  this shim  ─▶  /completion  ─▶  llama-server
    (OllamaAdapter)                (port 11434)                    (PrismML fork,
                                                                    port 11400)

The shim translates the Ollama HTTP API (`/api/generate`, `/api/ps`,
`/api/tags`) into llama-server's `/completion` and `/health`, so the
unmodified `OllamaAdapter` in `frontend/electron/inference/ollama.ts`
continues to work unchanged.

Only the subset of the Ollama API the Electron shell actually calls
is implemented:

- `POST /api/generate`  — streaming NDJSON of `{response, done}` frames
- `GET  /api/ps`        — reports the one model we serve + resident size
- `GET  /api/tags`      — same model list, in `/api/tags` shape
- `POST /api/show`      — minimal echo so health checks pass

`think=false` is honoured by stripping any `<think>…</think>` blocks
from the streamed output before forwarding to the client. The PrismML
Q1_0 weights were fine-tuned from Qwen3, so without this the entire
response can be consumed by the thinking preamble on CPU-only hosts.

Usage
-----
    # 1. Build the PrismML llama.cpp fork (see docs/cpu-perf-tuning.md §3)
    # 2. Launch llama-server on port 11400 with the Q1_0 GGUF:
    #    ./llama-server -m models/Bonsai-8B-Q1_0.gguf --port 11400 -t 6 -c 2048
    # 3. Run this shim on port 11434 (the default Ollama port):
    #    python3 scripts/ollama-shim.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError


def _fmt_ndjson(obj) -> bytes:
    return (json.dumps(obj) + "\n").encode("utf-8")


class ShimHandler(BaseHTTPRequestHandler):
    # Injected by make_server.
    upstream: str = "http://127.0.0.1:11400"
    gguf_path: str = ""
    alias: str = "bonsai-8b-q1_0"

    # Silence BaseHTTPServer's per-request stderr log.
    def log_message(self, fmt, *args):  # noqa: N802 - stdlib signature
        pass

    # --- helpers -------------------------------------------------------

    def _send_json(self, code: int, body) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_stream_header(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _write_chunk(self, b: bytes) -> None:
        # Transfer-Encoding: chunked framing.
        self.wfile.write(f"{len(b):x}\r\n".encode("ascii"))
        self.wfile.write(b)
        self.wfile.write(b"\r\n")
        self.wfile.flush()

    def _write_last_chunk(self) -> None:
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def _model_size_bytes(self) -> int:
        try:
            return os.path.getsize(self.gguf_path) if self.gguf_path else 0
        except OSError:
            return 0

    def _model_entry(self) -> dict:
        size = self._model_size_bytes()
        return {
            "name": self.alias,
            "model": self.alias,
            "size": size,
            "size_vram": 0,
            "digest": "sha256:bonsai-8b-q1_0",
            "details": {
                "format": "gguf",
                "family": "qwen3",
                "quantization_level": "Q1_0",
                "parameter_size": "8B",
            },
        }

    # --- routes --------------------------------------------------------

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/api/ps") or self.path.startswith("/api/tags"):
            self._send_json(200, {"models": [self._model_entry()]})
            return
        if self.path.startswith("/health") or self.path == "/":
            try:
                with urlrequest.urlopen(f"{self.upstream}/health", timeout=2) as r:
                    ok = r.status == 200
            except (URLError, HTTPError, TimeoutError):
                ok = False
            self._send_json(200 if ok else 503, {"status": "ok" if ok else "down"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            body = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid JSON body"})
            return

        if self.path.startswith("/api/show"):
            self._send_json(200, {"modelfile": "", "parameters": "", "template": "",
                                  "details": self._model_entry()["details"]})
            return

        if not self.path.startswith("/api/generate"):
            self._send_json(404, {"error": f"route {self.path} not implemented"})
            return

        prompt: str = body.get("prompt") or ""
        stream: bool = bool(body.get("stream", True))
        think: bool = bool(body.get("think", False))
        opts = body.get("options") or {}
        num_predict = int(opts.get("num_predict", 256))

        # Forward to llama-server /completion. llama-server's own
        # streaming protocol uses SSE-style `data: {json}\n\n` lines
        # when stream=true; we translate each frame into an Ollama-
        # shaped NDJSON frame.
        upstream_body = {
            "prompt": prompt,
            "stream": stream,
            "n_predict": num_predict,
            "temperature": opts.get("temperature", 0.7),
            "top_p": opts.get("top_p", 0.9),
            # llama-server treats this as stop tokens; the Electron
            # shell provides its own stop list when needed.
            "stop": opts.get("stop", []),
        }
        # When the client asks for no thinking (the demo default, see
        # bootstrap.ts), strip the `<think>…</think>` preamble the
        # Qwen3-lineage model otherwise emits. llama-server doesn't
        # have a native knob for this; the shim filters on the wire.
        if not think:
            upstream_body["stop"] = list(upstream_body.get("stop", [])) + ["<think>"]

        req = urlrequest.Request(
            f"{self.upstream}/completion",
            data=json.dumps(upstream_body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        t0_ns = time.monotonic_ns()
        eval_count = 0
        try:
            resp = urlrequest.urlopen(req, timeout=600)
        except (URLError, HTTPError) as e:
            self._send_json(502, {"error": f"upstream llama-server unreachable: {e}"})
            return

        if not stream:
            raw = resp.read()
            try:
                j = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                self._send_json(502, {"error": "upstream returned non-JSON"})
                return
            text = _strip_think_tags(j.get("content", ""), drop=not think)
            out = {
                "model": self.alias,
                "response": text,
                "done": True,
                "eval_count": j.get("tokens_predicted", 0),
                "total_duration": time.monotonic_ns() - t0_ns,
            }
            self._send_json(200, out)
            return

        # Streaming path — llama-server emits SSE frames like:
        #   data: {"content":"hello","stop":false,...}\n\n
        # followed by a final `{"stop":true,...}` frame. We translate
        # each chunk into an Ollama-flavoured NDJSON line.
        self._send_stream_header()
        buf = b""
        in_think = False
        try:
            while True:
                chunk = resp.read1(4096) if hasattr(resp, "read1") else resp.read(4096)
                if not chunk:
                    break
                buf += chunk
                while b"\n\n" in buf:
                    frame, buf = buf.split(b"\n\n", 1)
                    line = frame.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    try:
                        data = json.loads(line[len("data:"):].strip())
                    except json.JSONDecodeError:
                        continue
                    piece = data.get("content", "")
                    stop = bool(data.get("stop", False))
                    if not think:
                        piece, in_think = _stream_strip_think(piece, in_think)
                    if piece:
                        eval_count += 1
                        self._write_chunk(_fmt_ndjson({
                            "model": self.alias,
                            "response": piece,
                            "done": False,
                        }))
                    if stop:
                        self._write_chunk(_fmt_ndjson({
                            "model": self.alias,
                            "response": "",
                            "done": True,
                            "eval_count": eval_count,
                            "total_duration": time.monotonic_ns() - t0_ns,
                        }))
                        self._write_last_chunk()
                        return
        except (BrokenPipeError, ConnectionResetError):
            # Client went away — llama-server will eventually time out
            # its own side. Nothing to do here.
            return
        # If we got here, the upstream closed without a stop frame.
        # Emit a synthetic done so the adapter unblocks.
        self._write_chunk(_fmt_ndjson({
            "model": self.alias,
            "response": "",
            "done": True,
            "eval_count": eval_count,
            "total_duration": time.monotonic_ns() - t0_ns,
        }))
        self._write_last_chunk()


def _strip_think_tags(text: str, *, drop: bool) -> str:
    if not drop or "<think>" not in text:
        return text
    out = []
    i = 0
    while i < len(text):
        j = text.find("<think>", i)
        if j < 0:
            out.append(text[i:])
            break
        out.append(text[i:j])
        k = text.find("</think>", j)
        if k < 0:
            break
        i = k + len("</think>")
    return "".join(out)


def _stream_strip_think(piece: str, in_think: bool) -> tuple[str, bool]:
    """Incremental version of the think-tag stripper for streamed frames."""
    out = []
    i = 0
    while i < len(piece):
        if in_think:
            k = piece.find("</think>", i)
            if k < 0:
                return ("".join(out), True)
            i = k + len("</think>")
            in_think = False
        else:
            j = piece.find("<think>", i)
            if j < 0:
                out.append(piece[i:])
                break
            out.append(piece[i:j])
            i = j + len("<think>")
            in_think = True
    return ("".join(out), in_think)


def make_server(port: int, upstream: str, gguf_path: str, alias: str) -> ThreadingHTTPServer:
    class BoundHandler(ShimHandler):
        pass

    BoundHandler.upstream = upstream
    BoundHandler.gguf_path = gguf_path
    BoundHandler.alias = alias
    server = ThreadingHTTPServer(("127.0.0.1", port), BoundHandler)
    return server


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=int(os.environ.get("OLLAMA_SHIM_PORT", "11434")))
    p.add_argument("--upstream", default=os.environ.get("LLAMA_SERVER_URL", "http://127.0.0.1:11400"))
    p.add_argument("--gguf", default=os.environ.get(
        "BONSAI_GGUF", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                    "models", "Bonsai-8B-Q1_0.gguf")))
    p.add_argument("--alias", default=os.environ.get("MODEL_NAME", "bonsai-8b-q1_0"))
    args = p.parse_args()
    srv = make_server(args.port, args.upstream, args.gguf, args.alias)
    print(f"[ollama-shim] listening on http://127.0.0.1:{args.port}")
    print(f"[ollama-shim] upstream      = {args.upstream}")
    print(f"[ollama-shim] alias         = {args.alias}")
    print(f"[ollama-shim] gguf size     = {os.path.getsize(args.gguf) if os.path.exists(args.gguf) else 0} bytes")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
