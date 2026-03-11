"""Tests for buffer_stream_events() — Story 142-4.

Tests the pure function that buffers stream-json events from claude -p
to a JSONL file on disk, optionally calling a verbose callback per event.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pf.benchmark.pipeline_replay import buffer_stream_events


# ---------------------------------------------------------------------------
# Fixtures — The Mushroom provides different states
# ---------------------------------------------------------------------------

SYSTEM_EVENT = json.dumps({
    "type": "system",
    "subtype": "init",
    "session_id": "sess-abc123",
    "tools": [],
    "mcp_servers": [],
})

ASSISTANT_EVENT = json.dumps({
    "type": "assistant",
    "message": {
        "role": "assistant",
        "content": [{"type": "text", "text": "I'll review the code now."}],
    },
})

CONTENT_BLOCK_START = json.dumps({
    "type": "content_block_start",
    "index": 0,
    "content_block": {"type": "text", "text": ""},
})

CONTENT_BLOCK_DELTA = json.dumps({
    "type": "content_block_delta",
    "index": 0,
    "delta": {"type": "text_delta", "text": "Looking at the implementation..."},
})

CONTENT_BLOCK_STOP = json.dumps({
    "type": "content_block_stop",
    "index": 0,
})

TOOL_USE_EVENT = json.dumps({
    "type": "tool_use",
    "tool": "Read",
    "input": {"file_path": "/src/main.py"},
})

TOOL_RESULT_EVENT = json.dumps({
    "type": "tool_result",
    "tool": "Read",
    "output": "def main(): pass",
})

RESULT_EVENT = json.dumps({
    "type": "result",
    "subtype": "success",
    "result": "VERDICT: APPROVE\n\nThe code looks good.",
    "session_id": "sess-abc123",
    "cost_usd": 0.042,
    "total_cost_usd": 0.042,
    "duration_ms": 15000,
    "duration_api_ms": 12000,
    "usage": {
        "input_tokens": 5000,
        "output_tokens": 1200,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 3000,
    },
    "is_error": False,
    "num_turns": 3,
})


def _make_stream(events: list[str]) -> list[str]:
    """Build a list of lines simulating an Iterator[str] from stdout."""
    return events


def _minimal_stream() -> list[str]:
    """Minimal valid stream: system + assistant + result."""
    return [SYSTEM_EVENT, ASSISTANT_EVENT, RESULT_EVENT]


def _full_stream() -> list[str]:
    """Full stream with all event types."""
    return [
        SYSTEM_EVENT,
        ASSISTANT_EVENT,
        CONTENT_BLOCK_START,
        CONTENT_BLOCK_DELTA,
        CONTENT_BLOCK_STOP,
        TOOL_USE_EVENT,
        TOOL_RESULT_EVENT,
        RESULT_EVENT,
    ]


# ---------------------------------------------------------------------------
# AC: buffer_stream_events() testable — takes Iterator[str], writes JSONL
# ---------------------------------------------------------------------------


class TestBufferStreamEventsBasic:
    """Core functionality: read stream, write JSONL, return result."""

    def test_writes_all_events_to_jsonl(self, tmp_path: Path):
        """Each input event becomes one line in the output JSONL file."""
        output = tmp_path / "events.jsonl"
        stream = _full_stream()
        buffer_stream_events(iter(stream), output)

        lines = output.read_text().strip().split("\n")
        assert len(lines) == len(stream)

    def test_each_line_is_valid_json(self, tmp_path: Path):
        """Every line written must be parseable JSON."""
        output = tmp_path / "events.jsonl"
        buffer_stream_events(iter(_full_stream()), output)

        for line in output.read_text().strip().split("\n"):
            parsed = json.loads(line)
            assert "type" in parsed

    def test_preserves_event_order(self, tmp_path: Path):
        """Events must appear in the same order as the input stream."""
        output = tmp_path / "events.jsonl"
        buffer_stream_events(iter(_full_stream()), output)

        lines = output.read_text().strip().split("\n")
        types = [json.loads(line)["type"] for line in lines]
        assert types == [
            "system",
            "assistant",
            "content_block_start",
            "content_block_delta",
            "content_block_stop",
            "tool_use",
            "tool_result",
            "result",
        ]

    def test_creates_parent_directories(self, tmp_path: Path):
        """Output path with non-existent parent dirs should be created."""
        output = tmp_path / "nested" / "deep" / "events.jsonl"
        buffer_stream_events(iter(_minimal_stream()), output)

        assert output.exists()
        assert len(output.read_text().strip().split("\n")) == 3


# ---------------------------------------------------------------------------
# AC: buffer_stream_events() returns parsed result
# ---------------------------------------------------------------------------


class TestBufferStreamEventsReturnValue:
    """Return value: parsed result dict from the 'result' event, or None."""

    def test_returns_result_dict_on_success(self, tmp_path: Path):
        """When stream contains a result event, return it as a dict."""
        output = tmp_path / "events.jsonl"
        result = buffer_stream_events(iter(_minimal_stream()), output)

        assert result is not None
        assert result["type"] == "result"
        assert result["result"] == "VERDICT: APPROVE\n\nThe code looks good."
        assert result["cost_usd"] == 0.042

    def test_returns_none_without_result_event(self, tmp_path: Path):
        """When no result event exists (crash, timeout), return None."""
        output = tmp_path / "events.jsonl"
        stream = [SYSTEM_EVENT, ASSISTANT_EVENT]  # No result
        result = buffer_stream_events(iter(stream), output)

        assert result is None

    def test_returns_last_result_if_multiple(self, tmp_path: Path):
        """If somehow multiple result events appear, return the last one."""
        output = tmp_path / "events.jsonl"
        early_result = json.dumps({
            "type": "result",
            "subtype": "success",
            "result": "early",
            "cost_usd": 0.01,
        })
        late_result = json.dumps({
            "type": "result",
            "subtype": "success",
            "result": "late",
            "cost_usd": 0.05,
        })
        result = buffer_stream_events(
            iter([SYSTEM_EVENT, early_result, ASSISTANT_EVENT, late_result]),
            output,
        )
        assert result is not None
        assert result["result"] == "late"

    def test_result_contains_usage_fields(self, tmp_path: Path):
        """Result should include usage/token data for PhaseResult construction."""
        output = tmp_path / "events.jsonl"
        result = buffer_stream_events(iter(_minimal_stream()), output)

        assert result is not None
        assert "usage" in result
        assert result["usage"]["input_tokens"] == 5000
        assert result["usage"]["output_tokens"] == 1200
        assert result["session_id"] == "sess-abc123"


# ---------------------------------------------------------------------------
# AC: Verbose still prints — callback invoked when provided
# ---------------------------------------------------------------------------


class TestBufferStreamEventsVerboseCallback:
    """Verbose callback: called per event when provided, skipped when None."""

    def test_calls_callback_for_each_event(self, tmp_path: Path):
        """Every event should be passed to the verbose callback."""
        output = tmp_path / "events.jsonl"
        received: list[dict] = []
        buffer_stream_events(
            iter(_full_stream()),
            output,
            verbose_callback=lambda evt: received.append(evt),
        )

        assert len(received) == len(_full_stream())
        assert received[0]["type"] == "system"
        assert received[-1]["type"] == "result"

    def test_no_callback_no_error(self, tmp_path: Path):
        """When verbose_callback is None, no error and events still written."""
        output = tmp_path / "events.jsonl"
        result = buffer_stream_events(iter(_minimal_stream()), output, verbose_callback=None)

        assert result is not None
        assert output.exists()

    def test_callback_receives_parsed_dict(self, tmp_path: Path):
        """Callback receives parsed dict, not raw string."""
        output = tmp_path / "events.jsonl"
        received: list = []
        buffer_stream_events(
            iter([SYSTEM_EVENT]),
            output,
            verbose_callback=lambda evt: received.append(evt),
        )

        assert isinstance(received[0], dict)
        assert received[0]["type"] == "system"


# ---------------------------------------------------------------------------
# AC: Flushed per write — real-time tail -f works
# ---------------------------------------------------------------------------


class TestBufferStreamEventsFlushing:
    """Each event is flushed to disk immediately after writing."""

    def test_file_grows_incrementally(self, tmp_path: Path):
        """File should have content after each event, not just at end."""
        output = tmp_path / "events.jsonl"
        sizes: list[int] = []

        def track_size(evt: dict) -> None:
            # After callback, the event should already be flushed to disk
            sizes.append(output.stat().st_size)

        buffer_stream_events(
            iter(_full_stream()),
            output,
            verbose_callback=track_size,
        )

        # Each successive event should increase file size
        assert len(sizes) == len(_full_stream())
        for i in range(1, len(sizes)):
            assert sizes[i] > sizes[i - 1], (
                f"File did not grow between event {i - 1} and {i}: "
                f"{sizes[i - 1]} -> {sizes[i]}"
            )


# ---------------------------------------------------------------------------
# Edge cases — what happens when things go wrong?
# ---------------------------------------------------------------------------


class TestBufferStreamEventsEdgeCases:
    """Edge cases: empty streams, malformed JSON, large events."""

    def test_empty_stream(self, tmp_path: Path):
        """Empty iterator should create the file but return None."""
        output = tmp_path / "events.jsonl"
        result = buffer_stream_events(iter([]), output)

        assert result is None
        assert output.exists()
        assert output.read_text() == ""

    def test_malformed_json_lines_written_as_is(self, tmp_path: Path):
        """Non-JSON lines should still be written to JSONL (don't lose data)."""
        output = tmp_path / "events.jsonl"
        stream = [SYSTEM_EVENT, "this is not json", RESULT_EVENT]
        result = buffer_stream_events(iter(stream), output)

        lines = output.read_text().strip().split("\n")
        assert len(lines) == 3
        # The non-JSON line is preserved
        assert lines[1] == "this is not json"
        # Result should still be extracted from valid result event
        assert result is not None

    def test_blank_lines_skipped(self, tmp_path: Path):
        """Blank/whitespace-only lines should be skipped (not written)."""
        output = tmp_path / "events.jsonl"
        stream = [SYSTEM_EVENT, "", "  ", RESULT_EVENT]
        result = buffer_stream_events(iter(stream), output)

        lines = output.read_text().strip().split("\n")
        # Only non-blank lines written
        assert len(lines) == 2
        assert result is not None

    def test_result_event_with_error(self, tmp_path: Path):
        """Error result events should still be returned."""
        output = tmp_path / "events.jsonl"
        error_result = json.dumps({
            "type": "result",
            "subtype": "error_max_turns",
            "result": "",
            "is_error": True,
            "cost_usd": 0.10,
            "session_id": "sess-err",
        })
        result = buffer_stream_events(iter([SYSTEM_EVENT, error_result]), output)

        assert result is not None
        assert result["is_error"] is True
        assert result["subtype"] == "error_max_turns"


# ---------------------------------------------------------------------------
# AC: Old runs still work — compare on runs without events.jsonl succeeds
# (This AC is about backward compatibility in compare, not buffer_stream_events
# itself. But we verify the function doesn't error when the file already exists.)
# ---------------------------------------------------------------------------


class TestBufferStreamEventsFileHandling:
    """File handling: overwrite, permissions, paths."""

    def test_overwrites_existing_file(self, tmp_path: Path):
        """If the JSONL file already exists, it should be overwritten."""
        output = tmp_path / "events.jsonl"
        output.write_text("old data\n")

        buffer_stream_events(iter(_minimal_stream()), output)

        lines = output.read_text().strip().split("\n")
        assert len(lines) == 3
        assert "old data" not in output.read_text()
