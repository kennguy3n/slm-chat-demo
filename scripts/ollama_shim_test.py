"""Unit tests for `scripts/ollama-shim.py`.

Focus on the bits Devin Review asked to be scrutinised: the
`_stream_strip_think` state machine, and the tag-split-across-frames
case in particular.

Run with: `python3 -m unittest scripts/ollama_shim_test.py`
"""

from __future__ import annotations

import importlib.util
import os
import unittest


_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ollama_shim", os.path.join(_here, "ollama-shim.py"))
assert _spec and _spec.loader
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)  # type: ignore[union-attr]

_strip_think_tags = _mod._strip_think_tags
_stream_strip_think = _mod._stream_strip_think
_tail_for_partial = _mod._tail_for_partial


def feed(frames: list[str], *, start_in_think: bool = False) -> str:
    """Drive `_stream_strip_think` with a list of frames, returning the
    concatenated emitted text. Mirrors what the shim does on the wire."""
    in_think = start_in_think
    pending = ""
    out: list[str] = []
    for frame in frames:
        emit, in_think, pending = _stream_strip_think(frame, in_think, pending)
        out.append(emit)
    # Flush pending on stream close — the shim emits it as the final
    # non-thinking chunk because it turned out not to be the start of
    # a real `<think>` tag.
    if pending and not in_think:
        out.append(pending)
    return "".join(out)


class StripThinkTagsTests(unittest.TestCase):
    """`_strip_think_tags` is the non-streaming variant used on buffered
    single-shot /api/generate responses."""

    def test_noop_when_drop_false(self):
        self.assertEqual(_strip_think_tags("<think>hi</think>ok", drop=False), "<think>hi</think>ok")

    def test_strips_single_block(self):
        self.assertEqual(_strip_think_tags("<think>reasoning</think>answer", drop=True), "answer")

    def test_strips_multiple_blocks(self):
        text = "a<think>r1</think>b<think>r2</think>c"
        self.assertEqual(_strip_think_tags(text, drop=True), "abc")

    def test_no_tags_unchanged(self):
        self.assertEqual(_strip_think_tags("plain answer", drop=True), "plain answer")

    def test_unclosed_block_drops_tail(self):
        # The preamble opens but never closes — everything from the
        # opening tag onwards is reasoning, so drop it.
        self.assertEqual(_strip_think_tags("start<think>never closes", drop=True), "start")


class StreamStripThinkTests(unittest.TestCase):
    """`_stream_strip_think` runs incrementally across SSE frames."""

    def test_single_frame_with_block(self):
        self.assertEqual(feed(["<think>a</think>b"]), "b")

    def test_no_tags_all_frames(self):
        self.assertEqual(feed(["hello ", "world", "!"]), "hello world!")

    def test_open_tag_split_across_frames(self):
        # `<think>` chopped up across three frames. The old code would
        # pass `<thi` through and then strip `nk>` on the next frame,
        # leaking the fragment. The fix buffers partial-prefix bytes
        # and only emits them once it's certain they're NOT the start
        # of a tag.
        self.assertEqual(feed(["hi <thi", "nk>reasoning</think>", "!"]), "hi !")

    def test_close_tag_split_across_frames(self):
        self.assertEqual(feed(["pre<think>reasoning</thi", "nk>post"]), "prepost")

    def test_both_tags_split(self):
        self.assertEqual(
            feed(["A<thi", "nk>r", "easoning</think", ">B"]),
            "AB",
        )

    def test_partial_prefix_that_turns_out_to_be_literal_text(self):
        # `<th` looks like the start of `<think>` but actually the next
        # frame is `at>`. The buffered prefix must be flushed once we
        # know it was a false alarm.
        self.assertEqual(feed(["<th", "at>real"]), "<that>real")

    def test_stream_ends_with_partial_prefix_is_flushed(self):
        # Stream closes with `<thi` buffered. Caller should flush the
        # pending bytes because they never turned into a real tag.
        self.assertEqual(feed(["hello <thi"]), "hello <thi")

    def test_stream_ends_mid_thinking_block_drops_remainder(self):
        # Upstream closed while still inside a thinking block. The
        # pending state is empty (we're in_think and actively
        # discarding), so nothing is emitted — correct.
        self.assertEqual(feed(["<think>still thinking when upstream died"]), "")

    def test_idempotent_when_already_inside_think(self):
        # Caller tells us we're already mid-block (in_think=True) and
        # hands us a frame containing the closing tag.
        self.assertEqual(feed(["reasoning</think>answer"], start_in_think=True), "answer")


class TailForPartialTests(unittest.TestCase):
    def test_exact_match(self):
        self.assertEqual(_tail_for_partial("<think>", "<think>"), "<think>")

    def test_longest_suffix_that_is_prefix(self):
        self.assertEqual(_tail_for_partial("abc<thi", "<think>"), "<thi")

    def test_no_match_returns_empty(self):
        self.assertEqual(_tail_for_partial("hello world", "<think>"), "")

    def test_empty_tail(self):
        self.assertEqual(_tail_for_partial("", "<think>"), "")


if __name__ == "__main__":
    unittest.main()
