#!/usr/bin/env python3
"""End-to-end demo-surface latency benchmark for the slm-chat-demo
Bonsai-1.7B + llama-server (PrismML llama.cpp prism branch) stack.

Constructs the same prompts the Electron main process builds for each
B2C / B2B AI surface, wraps them in the Qwen3 chat template
(LlamaCppAdapter.formatQwen3Chat), and POSTs them to llama-server's
/completion endpoint with stream=true. Measures time-to-first-token
(TTFT), total generation wall-clock, total tokens generated, and
tokens/second.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from typing import Any

BASE_URL = "http://127.0.0.1:11400"
MAX_TOKENS_DEFAULT = 256
MAX_TOKENS_PRD = 512


# ---------------------------------------------------------------------------
# Qwen3 chat template (mirrors LlamaCppAdapter.formatQwen3Chat)
# ---------------------------------------------------------------------------

def format_qwen3_chat(user: str, system: str | None = None) -> str:
    out = ""
    if system and system.strip():
        out += f"<|im_start|>system\n{system.strip()}<|im_end|>\n"
    out += f"<|im_start|>user\n{user.strip()}<|im_end|>\n"
    out += "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    return out


# ---------------------------------------------------------------------------
# Shared helpers (mirror prompts/shared.ts)
# ---------------------------------------------------------------------------

PROMPT_MESSAGE_CAP = 120
PROMPT_THREAD_CAP = 15


def truncate_runes(s: str, n: int) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else s[:n] + "…"


def format_thread(messages: list[dict[str, Any]],
                  message_cap: int = PROMPT_MESSAGE_CAP,
                  thread_cap: int = PROMPT_THREAD_CAP) -> str:
    used = messages[:thread_cap]
    lines = [f"- {m['senderId']}: {truncate_runes(m['content'], message_cap)}"
             for m in used]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt builders (mirror prompts/*.ts)
# ---------------------------------------------------------------------------

TRANSLATE_SYSTEM = (
    "You are a translation engine. Translate the user message into the "
    "requested target language and output ONLY the translation. STRICT "
    "RULES: (1) Single line. (2) No quotation marks, no leading labels, "
    "no numbering, no language tags. (3) No commentary, no explanation, "
    "no rationale, no preamble. (4) Do NOT repeat the original text. "
    "(5) Preserve names, emoji, and informal tone. (6) If the source is "
    "already in the target language, output it unchanged. (7) Never "
    "translate English into English or a language into itself. (8) Use "
    "the conversation context (if provided in the system block) to "
    "disambiguate the user message, but translate ONLY that user "
    "message — never echo, repeat, or include the conversation context "
    "in the output."
)


def build_translate_prompt(text: str,
                           src: str = "vi",
                           dst: str = "en",
                           context: list[dict[str, str]] | None = None
                           ) -> tuple[str, str]:
    lang_names = {"en": "English", "vi": "Vietnamese", "es": "Spanish",
                  "fr": "French"}
    direction = (f"Translate from {lang_names.get(src, src)} to "
                 f"{lang_names.get(dst, dst)}.")
    system = TRANSLATE_SYSTEM
    if context:
        recent = context[-3:]
        lines = [f"{c['sender']}: {c['text'][:100]}" for c in recent]
        system += ("\n\nRecent conversation (background only — DO NOT "
                   "translate, DO NOT echo, DO NOT include in output; "
                   "use only to disambiguate the user message):\n"
                   + "\n".join(lines))
    user = f"{direction}\nText: {text}"
    return system, user


BATCH_TRANSLATE_SYSTEM = (
    "You are a translation engine. The user gives you a numbered list of "
    "chat messages, each annotated with its source and target language. "
    "For each item, output one line in the form `<N>. <translation>`. "
    "STRICT RULES: (1) Output exactly one line per item, in order. "
    "(2) The translation must be in the requested target language only. "
    "(3) Do NOT echo the source text, the language annotation, or the "
    "source language code. (4) No quotes, no commentary, no explanation, "
    "no extra blank lines. (5) Preserve names, emoji, and informal tone. "
    "(6) If the source is already in the target language, output it "
    "unchanged. (7) Never translate a language into itself."
)


def build_translate_batch_prompt(items: list[dict[str, str]]
                                 ) -> tuple[str, str]:
    lines: list[str] = []
    lang_names = {"en": "English", "vi": "Vietnamese"}
    for i, it in enumerate(items):
        src = lang_names.get(it["src"], it["src"])
        dst = lang_names.get(it["dst"], it["dst"])
        lines.append(f"{i + 1}. [{src} → {dst}] {it['text']}")
    user = (
        "Translate each of the following chat messages. Output one "
        "translation per line as `<N>. <translation>`, in the same "
        "order, with no other text.\n\n" + "\n".join(lines))
    return BATCH_TRANSLATE_SYSTEM, user


def build_summarize_prompt(messages: list[dict[str, Any]]) -> str:
    rendered = format_thread(messages)
    return "\n".join([
        "You are summarising a work-chat thread for a busy teammate.",
        "Output 3-5 short bullets covering, in this order: decisions, open",
        "questions, owners, and deadlines. Each bullet is one short",
        "sentence on its own line, prefixed with \"- \". No preamble, no",
        "closing remark, no headings.",
        "If the thread does not contain enough material to summarise,",
        "reply with the single line: INSUFFICIENT: <reason>.",
        "",
        "Example:",
        "- Decision: pick vendor A at $40k/yr.",
        "- Open question: confirm SOC 2 by Friday.",
        "- Owner: alice drives the contract.",
        "",
        "Thread:",
        rendered,
        "",
        "Summary:",
    ])


def build_extract_tasks_prompt(messages: list[dict[str, Any]]) -> str:
    rendered = format_thread(messages)
    return "\n".join([
        "You extract assignable action items from a work-chat thread.",
        "Output one task per line in the exact format:",
        "  <owner> | <title> | <due-date or blank>",
        "Owner is the person who agreed to do the work (a name or \"@\" handle).",
        "Title is one short imperative sentence (max 12 words).",
        "Due-date is \"YYYY-MM-DD\" or a short phrase (\"Friday\", \"EOD\",",
        "\"end of week\"); leave blank when the thread does not mention one.",
        "No numbers, no bullets, no commentary.",
        "If the thread has no assignable action items, reply with the",
        "single line: INSUFFICIENT: <reason>.",
        "",
        "Example:",
        "Alice | Lock vendor pricing | EOW",
        "Dave | Pull risk notes | ",
        "",
        "Thread:",
        rendered,
        "",
        "Tasks:",
    ])


def build_prefill_approval_prompt(messages: list[dict[str, Any]],
                                  template: str = "vendor") -> str:
    rendered = format_thread(messages)
    return "\n".join([
        f"You are prefilling a \"{template}\" approval request from a chat thread.",
        "Emit exactly four lines, in this order:",
        "  vendor: <name>",
        "  amount: <currency amount or budget>",
        "  justification: <one-sentence reason>",
        "  risk: <low | medium | high>",
        "Omit a line when the thread does not name a value.",
        "Do not invent values. Do not add commentary.",
        "If the thread does not mention any of the four fields, reply",
        "with the single line: INSUFFICIENT: <reason>.",
        "",
        "Example:",
        "vendor: Acme Logs",
        "amount: $42,000 / yr",
        "justification: Lowest-cost SOC 2-cleared bidder.",
        "risk: medium",
        "",
        "Thread:",
        rendered,
        "",
        "Fields:",
    ])


PRD_TYPE_HINT = (
    "a product requirements document with sections: Goal, Background, "
    "Requirements, Success Metrics, Risks, Open Questions"
)


def build_draft_prd_prompt(messages: list[dict[str, Any]]) -> str:
    rendered = format_thread(messages)
    return "\n".join([
        f"You are drafting a PRD — {PRD_TYPE_HINT}.",
        "Produce every section listed above.",
        "Use Markdown headings (## Section) for each section.",
        "Keep prose tight: short paragraphs or bulleted lists; no filler.",
        "Anchor every claim in the thread above — do not invent facts the",
        "thread does not state. Do not echo this prompt.",
        "Begin with the title line \"# PRD: <short topic>\".",
        "",
        "Thread:",
        rendered,
        "",
        "Draft:",
    ])


def build_extract_knowledge_prompt(messages: list[dict[str, Any]]) -> str:
    rendered = format_thread(messages)
    return "\n".join([
        "You extract structured workspace knowledge from a chat channel.",
        "For every distinct fact emit one line in the exact format:",
        "  <kind> | <description> | <actor-or-blank> | <due-or-blank>",
        "Allowed kinds: decision, owner, risk, requirement, deadline.",
        "Description is one short sentence (max 20 words) describing the",
        "fact in the thread, written in third person.",
        "Actor is the person responsible (name or \"@\" handle) or blank.",
        "Due is a date / short phrase or blank.",
        "Emit at most 12 rows total; pick the highest-signal facts.",
        "Do not number the lines. Do not echo this prompt.",
        "If the channel has no extractable facts, reply with the single",
        "line: INSUFFICIENT: <reason>.",
        "",
        "Channel messages:",
        rendered,
        "",
        "Knowledge:",
    ])


def build_conversation_insights_prompt(messages: list[dict[str, Any]],
                                       viewer_lang: str = "en") -> str:
    rendered = format_thread(messages)
    lang_line = (f"Write topic / action / decision text in language: "
                 f"{viewer_lang}.")
    return "\n".join([
        "You analyze a chat conversation and extract structured insights.",
        "Output exactly four sections in this order, one per line, in the format below.",
        "Use these section headers verbatim: TOPICS, ACTIONS, DECISIONS, SENTIMENT.",
        "TOPICS: each line \"TOPIC | <short label> | <one-sentence detail>\" (max 5).",
        "ACTIONS: each line \"ACTION | <owner-or-blank> | <imperative action>\" (max 5).",
        "DECISIONS: each line \"DECISION | <one-sentence decision>\" (max 5).",
        "SENTIMENT: a single line \"SENTIMENT | <positive|neutral|negative|mixed> | <one-sentence rationale>\".",
        "A section may be empty — emit only its header line in that case.",
        lang_line,
        "No bullets, no numbering, no commentary outside the four sections.",
        "If the conversation lacks usable content, reply with the single line:",
        "INSUFFICIENT: <reason>.",
        "",
        "Conversation:",
        rendered,
        "",
        "Insights:",
    ])


def build_smart_reply_prompt(messages: list[dict[str, Any]]) -> tuple[str, str]:
    """Smart-reply suggestion (B2C). Bonsai-1.7B is asked to draft a
    short reply for the next turn. The prompt mirrors what the
    SmartReplyPanel sends through the LlamaCppAdapter."""
    rendered = format_thread(messages, message_cap=160, thread_cap=8)
    system = (
        "You suggest a short, natural reply for the next turn in a "
        "casual chat. Output exactly three candidate replies, one per "
        "line, with no numbering, no quotes, and no commentary. Each "
        "reply is at most 12 words and matches the language of the "
        "most recent message."
    )
    user = (
        "Recent conversation:\n" + rendered + "\n\nDraft three replies "
        "for the next turn:"
    )
    return system, user


# ---------------------------------------------------------------------------
# Demo data — bilingual B2C DM (Alice ↔ Minh) and B2B vendor thread
# ---------------------------------------------------------------------------

B2C_DM_VI_EN = [
    {"senderId": "Minh", "content": "Tối nay đi ăn phở không?"},
    {"senderId": "Alice", "content": "Yes! That place near 7th and Broadway?"},
    {"senderId": "Minh", "content": "Đúng rồi. 7 giờ tối nha."},
    {"senderId": "Alice", "content": "Sounds good. Should I book a table?"},
    {"senderId": "Minh", "content": "Có thể, hôm nay thứ sáu, sẽ đông."},
    {"senderId": "Alice", "content": "Done — booked for two at 7."},
    {"senderId": "Minh", "content": "Cảm ơn Alice! Hẹn gặp tối nay."},
    {"senderId": "Alice", "content": "See you then!"},
    {"senderId": "Minh", "content": "Mình đem theo cuốn sách Alice mượn nhé."},
    {"senderId": "Alice", "content": "Oh thanks, totally forgot about that."},
    {"senderId": "Minh", "content": "Quán đó có wifi không nhỉ?"},
    {"senderId": "Alice", "content": "Yeah, I used it last week. Pretty fast."},
    {"senderId": "Minh", "content": "Good. Mình muốn show Alice cái app mới."},
    {"senderId": "Alice", "content": "Nice — what does it do?"},
    {"senderId": "Minh", "content": "Nó dịch tin nhắn ngay trên thiết bị, không cần cloud."},
    {"senderId": "Alice", "content": "That's wild. Definitely show me tonight."},
]

B2B_VENDOR_THREAD = [
    {"senderId": "alice", "content":
        "Vendor management standup — vendor selection for log analytics is due Friday."},
    {"senderId": "dave", "content":
        "I've narrowed it to Acme Logs at $42k/yr and Helix at $58k/yr."},
    {"senderId": "carol", "content":
        "Acme is SOC 2 Type II cleared but their on-call rotation is thin."},
    {"senderId": "bob", "content":
        "Helix has 24/7 on-call but the data residency story is weaker."},
    {"senderId": "alice", "content":
        "Decision: go with Acme Logs at $42k/yr — risk is medium, mitigated by an internal on-call rotation."},
    {"senderId": "dave", "content":
        "I'll lock vendor pricing by EOW and circulate the contract."},
    {"senderId": "carol", "content":
        "I'll pull risk notes and post in #vendor-risk."},
    {"senderId": "bob", "content":
        "Open question: is Acme's region-pinning compatible with our EU customers?"},
    {"senderId": "alice", "content":
        "Bob, can you confirm SOC 2 Type II report scope by Friday?"},
    {"senderId": "bob", "content":
        "Yes — will request the latest report from Acme today."},
    {"senderId": "dave", "content":
        "Requirement: vendor must support OIDC SSO from day one."},
    {"senderId": "alice", "content":
        "Deadline: contract signed by 2026-05-15 so we hit the May invoice cycle."},
]


# ---------------------------------------------------------------------------
# llama-server /completion driver
# ---------------------------------------------------------------------------

def stream_completion(prompt: str,
                      max_tokens: int = MAX_TOKENS_DEFAULT,
                      temperature: float = 0.0,
                      stop: list[str] | None = None
                      ) -> dict[str, Any]:
    body = {
        "prompt": prompt,
        "stream": True,
        "temperature": temperature,
        "top_p": 0.9,
        "n_predict": max_tokens,
        "cache_prompt": False,  # don't poison cross-surface measurements
        "stop": stop or ["<|im_end|>", "<|im_start|>"],
    }
    req = urllib.request.Request(
        f"{BASE_URL}/completion",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t_start = time.perf_counter()
    t_first: float | None = None
    n_tokens = 0
    out_parts: list[str] = []
    final_frame: dict[str, Any] = {}
    with urllib.request.urlopen(req, timeout=600) as resp:
        for raw in resp:
            line = raw.decode("utf-8").rstrip("\n")
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload:
                continue
            try:
                frame = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if "content" in frame and frame["content"]:
                if t_first is None:
                    t_first = time.perf_counter()
                n_tokens += 1
                out_parts.append(frame["content"])
            if frame.get("stop") is True:
                final_frame = frame
                break
    t_end = time.perf_counter()
    if t_first is None:
        t_first = t_end
    total = t_end - t_start
    gen = t_end - t_first
    server_n = (final_frame.get("tokens_predicted")
                or final_frame.get("timings", {}).get("predicted_n")
                or n_tokens)
    return {
        "ttft_ms": (t_first - t_start) * 1000.0,
        "total_s": total,
        "gen_s": gen,
        "tokens": server_n,
        "tok_per_s": (server_n / gen) if gen > 0 else 0.0,
        "output": "".join(out_parts).strip(),
        "timings": final_frame.get("timings", {}),
    }


# ---------------------------------------------------------------------------
# Surface table
# ---------------------------------------------------------------------------

def main() -> None:
    surfaces: list[tuple[str, str, int, str, dict[str, Any]]] = []

    # B2C surfaces ----------------------------------------------------------
    sys1, usr1 = build_translate_prompt(
        "Tối nay mình đem theo cuốn sách Alice mượn nhé.",
        src="vi", dst="en",
        context=[
            {"sender": "Minh", "text": "Tối nay đi ăn phở không?"},
            {"sender": "Alice", "text": "Yes! That place near 7th and Broadway?"},
        ])
    surfaces.append(("B2C", "Translate (single)", 1,
                     format_qwen3_chat(usr1, sys1),
                     {"max_tokens": 64}))

    sys2, usr2 = build_translate_batch_prompt([
        {"text": m["content"], "src": "vi" if i % 2 == 0 else "en",
         "dst": "en" if i % 2 == 0 else "vi"}
        for i, m in enumerate(B2C_DM_VI_EN)
    ])
    surfaces.append(("B2C", "Translate batch", len(B2C_DM_VI_EN),
                     format_qwen3_chat(usr2, sys2),
                     {"max_tokens": 384}))

    sys3, usr3 = build_smart_reply_prompt(B2C_DM_VI_EN[-6:])
    surfaces.append(("B2C", "Smart reply", 6,
                     format_qwen3_chat(usr3, sys3),
                     {"max_tokens": 96}))

    surfaces.append(("B2C", "Conversation summary",
                     len(B2C_DM_VI_EN),
                     format_qwen3_chat(build_summarize_prompt(B2C_DM_VI_EN)),
                     {"max_tokens": 192}))

    surfaces.append(("B2C", "Conversation insights",
                     len(B2C_DM_VI_EN),
                     format_qwen3_chat(
                         build_conversation_insights_prompt(
                             B2C_DM_VI_EN, viewer_lang="en")),
                     {"max_tokens": 320}))

    # B2B surfaces ----------------------------------------------------------
    surfaces.append(("B2B", "Thread summary",
                     len(B2B_VENDOR_THREAD),
                     format_qwen3_chat(build_summarize_prompt(B2B_VENDOR_THREAD)),
                     {"max_tokens": 192}))

    surfaces.append(("B2B", "Task extraction",
                     len(B2B_VENDOR_THREAD),
                     format_qwen3_chat(build_extract_tasks_prompt(B2B_VENDOR_THREAD)),
                     {"max_tokens": 192}))

    surfaces.append(("B2B", "Approval prefill",
                     len(B2B_VENDOR_THREAD),
                     format_qwen3_chat(build_prefill_approval_prompt(
                         B2B_VENDOR_THREAD, template="vendor")),
                     {"max_tokens": 128}))

    surfaces.append(("B2B", "PRD draft",
                     len(B2B_VENDOR_THREAD),
                     format_qwen3_chat(build_draft_prd_prompt(B2B_VENDOR_THREAD)),
                     {"max_tokens": MAX_TOKENS_PRD}))

    surfaces.append(("B2B", "Knowledge extraction",
                     len(B2B_VENDOR_THREAD),
                     format_qwen3_chat(
                         build_extract_knowledge_prompt(B2B_VENDOR_THREAD)),
                     {"max_tokens": 320}))

    # Run -------------------------------------------------------------------
    print("# Warmup")
    stream_completion(format_qwen3_chat("Hello", "You are concise."),
                      max_tokens=8)

    results: list[dict[str, Any]] = []
    for tier, name, n_msgs, prompt, opts in surfaces:
        print(f"\n# {tier}: {name} (msgs={n_msgs}, prompt-bytes={len(prompt)})")
        sys.stdout.flush()
        r = stream_completion(prompt, max_tokens=opts["max_tokens"])
        print(f"  ttft={r['ttft_ms']:.1f} ms  total={r['total_s']:.2f} s  "
              f"gen={r['gen_s']:.2f} s  tokens={r['tokens']}  "
              f"tok/s={r['tok_per_s']:.2f}")
        snippet = r["output"][:200].replace("\n", " ⏎ ")
        print(f"  out[:200]={snippet!r}")
        results.append({
            "tier": tier, "surface": name, "messages": n_msgs,
            "prompt_bytes": len(prompt),
            "max_tokens": opts["max_tokens"],
            **{k: v for k, v in r.items() if k not in ("output",)},
        })

    out_path = "/tmp/bench/demo_surfaces.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
