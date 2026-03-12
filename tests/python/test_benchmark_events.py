"""
Tests for pf.benchmark.events — event parsing and trace correlation (Story 142-6).

Covers all ACs:
  AC1: Correct parse output — Known JSONL → correct text_blocks, tool_calls,
       files_read, files_written, subagents
  AC2: Path normalization — Strips worktree prefix from absolute paths
  AC3: trace readable — [ROLE] Turn N blocks with tools + reasoning
       (trace CLI command tested via Click runner)
  AC4: explain correlates — Shows which phase read finding files,
       engagement confidence
  AC5: Graceful degradation — Pre-142-4 runs: empty structure, exit 0

Run with: python -m pytest tests/python/test_benchmark_events.py -v
"""

import json
import tempfile
from pathlib import Path

import pytest

from pf.benchmark.events import (
    FindingCorrelation,
    PhaseEvents,
    ToolCall,
    correlate_finding,
    normalize_path,
    parse_phase_events,
)


# ---------------------------------------------------------------------------
# Fixtures — The Mushroom sets up different states
# ---------------------------------------------------------------------------

def _make_otel_record(
    event_name: str,
    sequence: int,
    *,
    tool_name: str | None = None,
    success: bool = True,
    duration_ms: int = 50,
    tool_parameters: dict | None = None,
    extra_attrs: dict | None = None,
) -> dict:
    """Build a minimal OTEL log record matching Claude Code's format."""
    attrs = [
        {"key": "event.name", "value": {"stringValue": event_name}},
        {"key": "event.sequence", "value": {"intValue": sequence}},
        {"key": "event.timestamp", "value": {"stringValue": "2026-03-11T10:00:00Z"}},
    ]
    if tool_name:
        attrs.append({"key": "tool_name", "value": {"stringValue": tool_name}})
    attrs.append({"key": "success", "value": {"stringValue": str(success).lower()}})
    attrs.append({"key": "duration_ms", "value": {"intValue": duration_ms}})
    if tool_parameters:
        attrs.append({
            "key": "tool_parameters",
            "value": {"stringValue": json.dumps(tool_parameters)},
        })
    if extra_attrs:
        for k, v in extra_attrs.items():
            if isinstance(v, int):
                attrs.append({"key": k, "value": {"intValue": v}})
            else:
                attrs.append({"key": k, "value": {"stringValue": str(v)}})
    return {
        "timeUnixNano": str(1773152032887000000 + sequence * 1000000),
        "observedTimeUnixNano": str(1773152032887000000 + sequence * 1000000),
        "body": {"stringValue": event_name},
        "attributes": attrs,
    }


def _make_jsonl_line(
    log_records: list[dict],
    enrichments: list[dict] | None = None,
) -> str:
    """Build a single JSONL line wrapping log records in OTLP structure."""
    record = {
        "signal": "logs",
        "timestamp": "2026-03-11T10:00:00+00:00",
        "data": {
            "resourceLogs": [{
                "resource": {"attributes": []},
                "scopeLogs": [{
                    "scope": {"name": "com.anthropic.claude_code.events", "version": "2.1.72"},
                    "logRecords": log_records,
                }],
            }],
        },
    }
    if enrichments:
        record["enrichments"] = enrichments
    return json.dumps(record)


def _make_metrics_line() -> str:
    """Build a metrics JSONL line (should be skipped by parser)."""
    return json.dumps({
        "signal": "metrics",
        "timestamp": "2026-03-11T10:00:00+00:00",
        "data": {"resourceMetrics": []},
    })


def _write_jsonl(tmp_path: Path, lines: list[str], filename: str = "dev-otel.jsonl") -> Path:
    """Write lines to a JSONL file and return the path."""
    p = tmp_path / filename
    p.write_text("\n".join(lines) + "\n")
    return p


WORKTREE_PREFIX = "/tmp/pf-replay/dpgd-116-firefly-run-1"


@pytest.fixture
def basic_jsonl(tmp_path):
    """A JSONL file with a mix of tool types: Read, Write, Edit, Grep, Glob, Bash, Agent."""
    records = [
        # Turn 1: Read a file
        _make_otel_record("claude_code.tool_result", 1,
                          tool_name="Read", success=True, duration_ms=10,
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/main.rs"}),
        # Turn 2: Glob search
        _make_otel_record("claude_code.tool_result", 2,
                          tool_name="Glob", success=True, duration_ms=20,
                          tool_parameters={"pattern": "**/*.rs"}),
        # Turn 3: Write a file
        _make_otel_record("claude_code.tool_result", 3,
                          tool_name="Write", success=True, duration_ms=30,
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/new.rs",
                                           "content": "fn main() {}"}),
        # Turn 4: Edit a file
        _make_otel_record("claude_code.tool_result", 4,
                          tool_name="Edit", success=True, duration_ms=40,
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/main.rs",
                                           "old_string": "old", "new_string": "new"}),
        # Turn 5: Grep search
        _make_otel_record("claude_code.tool_result", 5,
                          tool_name="Grep", success=True, duration_ms=15,
                          tool_parameters={"pattern": "TODO", "path": f"{WORKTREE_PREFIX}/src/"}),
        # Turn 6: Bash command
        _make_otel_record("claude_code.tool_result", 6,
                          tool_name="Bash", success=True, duration_ms=100,
                          tool_parameters={"command": "cargo test"}),
        # Turn 7: Agent (subagent spawn)
        _make_otel_record("claude_code.tool_result", 7,
                          tool_name="Agent", success=True, duration_ms=5000,
                          tool_parameters={"prompt": "Run tests", "description": "testing-runner"}),
    ]

    enrichments_line1 = [
        {"tool_name": "Read", "language": "rust", "file_size": 1234, "line_count": 50},
    ]

    lines = [
        _make_jsonl_line([records[0]], enrichments=enrichments_line1),
        _make_jsonl_line([records[1]]),
        _make_jsonl_line([records[2]], enrichments=[{"tool_name": "Write"}]),
        _make_jsonl_line([records[3]], enrichments=[{"tool_name": "Edit", "diff": {"added": 1, "removed": 1}}]),
        _make_jsonl_line([records[4]], enrichments=[{"tool_name": "Grep", "pattern": "TODO"}]),
        _make_metrics_line(),  # Should be skipped
        _make_jsonl_line([records[5]], enrichments=[{"tool_name": "Bash", "command_length": 10}]),
        _make_jsonl_line([records[6]]),
    ]

    return _write_jsonl(tmp_path, lines)


@pytest.fixture
def multi_read_jsonl(tmp_path):
    """JSONL with multiple Reads of the same file (deduplication test)."""
    records = [
        _make_otel_record("claude_code.tool_result", 1,
                          tool_name="Read",
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/config.rs"}),
        _make_otel_record("claude_code.tool_result", 2,
                          tool_name="Read",
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/config.rs"}),
        _make_otel_record("claude_code.tool_result", 3,
                          tool_name="Read",
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/main.rs"}),
    ]
    lines = [_make_jsonl_line([r]) for r in records]
    return _write_jsonl(tmp_path, lines)


@pytest.fixture
def api_request_jsonl(tmp_path):
    """JSONL with api_request events for text block extraction."""
    records = [
        _make_otel_record("claude_code.api_request", 1,
                          extra_attrs={
                              "model": "claude-opus-4-6",
                              "input_tokens": 5000,
                              "output_tokens": 300,
                          }),
        _make_otel_record("claude_code.tool_result", 2,
                          tool_name="Read",
                          tool_parameters={"file_path": f"{WORKTREE_PREFIX}/src/lib.rs"}),
        _make_otel_record("claude_code.api_request", 3,
                          extra_attrs={
                              "model": "claude-opus-4-6",
                              "input_tokens": 6000,
                              "output_tokens": 500,
                          }),
    ]
    lines = [_make_jsonl_line(records)]
    return _write_jsonl(tmp_path, lines)


# ---------------------------------------------------------------------------
# AC1: Correct parse output
# ---------------------------------------------------------------------------


class TestParsePhaseEvents:
    """AC1: Known JSONL → correct text_blocks, tool_calls, files_read, etc."""

    def test_returns_phase_events_dataclass(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        assert isinstance(result, PhaseEvents)

    def test_extracts_tool_calls(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        assert len(result.tool_calls) == 7
        tool_names = [tc.tool_name for tc in result.tool_calls]
        assert "Read" in tool_names
        assert "Write" in tool_names
        assert "Edit" in tool_names
        assert "Grep" in tool_names
        assert "Glob" in tool_names
        assert "Bash" in tool_names
        assert "Agent" in tool_names

    def test_tool_call_has_correct_fields(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        read_call = next(tc for tc in result.tool_calls if tc.tool_name == "Read")
        assert isinstance(read_call, ToolCall)
        assert read_call.sequence == 1
        assert read_call.success is True
        assert read_call.duration_ms == 10

    def test_tool_calls_ordered_by_sequence(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        sequences = [tc.sequence for tc in result.tool_calls]
        assert sequences == sorted(sequences)

    def test_extracts_files_read(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        assert f"{WORKTREE_PREFIX}/src/main.rs" in result.files_read

    def test_extracts_files_written(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        # Write and Edit both produce files_written
        assert f"{WORKTREE_PREFIX}/src/new.rs" in result.files_written
        assert f"{WORKTREE_PREFIX}/src/main.rs" in result.files_written

    def test_extracts_subagents(self, basic_jsonl):
        result = parse_phase_events(basic_jsonl)
        assert len(result.subagents) >= 1

    def test_skips_metrics_lines(self, basic_jsonl):
        """Metrics lines should be silently ignored."""
        result = parse_phase_events(basic_jsonl)
        # If metrics were parsed as tool calls, we'd have extras
        assert len(result.tool_calls) == 7

    def test_deduplicates_files_read(self, multi_read_jsonl):
        """Same file read multiple times should appear once in files_read."""
        result = parse_phase_events(multi_read_jsonl)
        config_count = result.files_read.count(f"{WORKTREE_PREFIX}/src/config.rs")
        assert config_count == 1

    def test_multiple_reads_all_appear_in_tool_calls(self, multi_read_jsonl):
        """Each Read should still be in tool_calls even if file is deduplicated."""
        result = parse_phase_events(multi_read_jsonl)
        read_calls = [tc for tc in result.tool_calls if tc.tool_name == "Read"]
        assert len(read_calls) == 3

    def test_extracts_enrichments_into_tool_call(self, basic_jsonl):
        """Enrichment data from 142-4 should be accessible on ToolCall."""
        result = parse_phase_events(basic_jsonl)
        read_call = next(tc for tc in result.tool_calls if tc.tool_name == "Read")
        assert read_call.enrichments.get("language") == "rust"

    def test_api_request_events_counted_as_text_blocks(self, api_request_jsonl):
        """api_request events represent LLM turns — should be counted as text blocks."""
        result = parse_phase_events(api_request_jsonl)
        assert len(result.text_blocks) >= 2


class TestParsePhaseEventsMultipleRecordsPerLine:
    """OTEL batches multiple logRecords per JSONL line."""

    def test_multiple_tool_results_in_single_line(self, tmp_path):
        records = [
            _make_otel_record("claude_code.tool_result", 1,
                              tool_name="Read",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/a.rs"}),
            _make_otel_record("claude_code.tool_result", 2,
                              tool_name="Read",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/b.rs"}),
            _make_otel_record("claude_code.tool_result", 3,
                              tool_name="Write",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/c.rs",
                                               "content": "x"}),
        ]
        path = _write_jsonl(tmp_path, [_make_jsonl_line(records)])
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 3
        assert len(result.files_read) == 2
        assert len(result.files_written) == 1


# ---------------------------------------------------------------------------
# AC2: Path normalization
# ---------------------------------------------------------------------------


class TestNormalizePath:
    """AC2: Strips worktree prefix from absolute paths."""

    def test_strips_worktree_prefix(self):
        result = normalize_path(
            "/tmp/pf-replay/dpgd-116-firefly-run-1/src/main.rs",
            "/tmp/pf-replay/dpgd-116-firefly-run-1",
        )
        assert result == "src/main.rs"

    def test_handles_trailing_slash_on_prefix(self):
        result = normalize_path(
            "/tmp/pf-replay/dpgd-116-firefly-run-1/src/main.rs",
            "/tmp/pf-replay/dpgd-116-firefly-run-1/",
        )
        assert result == "src/main.rs"

    def test_returns_unchanged_if_no_match(self):
        """If the path doesn't start with the prefix, return it unchanged."""
        result = normalize_path(
            "/home/user/projects/src/main.rs",
            "/tmp/pf-replay/dpgd-116-firefly-run-1",
        )
        assert result == "/home/user/projects/src/main.rs"

    def test_empty_prefix(self):
        result = normalize_path("/some/path/file.rs", "")
        assert result == "/some/path/file.rs"

    def test_nested_path(self):
        result = normalize_path(
            "/tmp/pf-replay/dpgd-116-firefly-run-1/crates/client/src/config.rs",
            "/tmp/pf-replay/dpgd-116-firefly-run-1",
        )
        assert result == "crates/client/src/config.rs"

    def test_prefix_is_substring_but_not_directory_boundary(self):
        """Prefix /tmp/foo should NOT match /tmp/foobar/src/x.rs."""
        result = normalize_path(
            "/tmp/foobar/src/x.rs",
            "/tmp/foo",
        )
        assert result == "/tmp/foobar/src/x.rs"


# ---------------------------------------------------------------------------
# AC4: explain correlates — engagement confidence
# ---------------------------------------------------------------------------


class TestCorrellateFinding:
    """AC4: Correlate finding files with agent trace evidence."""

    def test_high_engagement_when_file_read(self, basic_jsonl):
        """Agent Read a finding's file → high engagement."""
        events = parse_phase_events(basic_jsonl)
        result = correlate_finding(
            events,
            finding_files=["src/main.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        assert isinstance(result, FindingCorrelation)
        assert "src/main.rs" in result.files_read_matching
        assert result.engagement in ("high", "low")  # At least low; high if reasoning present

    def test_low_engagement_when_file_grepped(self, basic_jsonl):
        """Agent Grep touched a directory containing finding file → low engagement."""
        events = parse_phase_events(basic_jsonl)
        result = correlate_finding(
            events,
            finding_files=["src/main.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        # Grep targeted src/ which contains main.rs
        assert result.engagement != "none"

    def test_none_engagement_when_file_not_seen(self, basic_jsonl):
        """Finding file never touched → none engagement."""
        events = parse_phase_events(basic_jsonl)
        result = correlate_finding(
            events,
            finding_files=["completely/unknown/file.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        assert result.engagement == "none"
        assert result.files_read_matching == []
        assert result.files_grepped_matching == []

    def test_multiple_finding_files(self, basic_jsonl):
        """Finding with multiple files — some seen, some not."""
        events = parse_phase_events(basic_jsonl)
        result = correlate_finding(
            events,
            finding_files=["src/main.rs", "src/unknown.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        assert "src/main.rs" in result.files_read_matching
        assert "src/unknown.rs" not in result.files_read_matching

    def test_finding_files_stored(self, basic_jsonl):
        events = parse_phase_events(basic_jsonl)
        result = correlate_finding(
            events,
            finding_files=["src/main.rs", "src/other.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        assert result.finding_files == ["src/main.rs", "src/other.rs"]


# ---------------------------------------------------------------------------
# AC5: Graceful degradation
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    """AC5: Pre-142-4 runs with no events → empty structure, not crash."""

    def test_missing_file_returns_empty_phase_events(self, tmp_path):
        """Non-existent JSONL path → empty PhaseEvents."""
        missing = tmp_path / "nonexistent-otel.jsonl"
        result = parse_phase_events(missing)
        assert isinstance(result, PhaseEvents)
        assert result.text_blocks == []
        assert result.tool_calls == []
        assert result.files_read == []
        assert result.files_written == []
        assert result.subagents == []

    def test_empty_file_returns_empty_phase_events(self, tmp_path):
        """Empty JSONL file → empty PhaseEvents."""
        empty = tmp_path / "empty-otel.jsonl"
        empty.write_text("")
        result = parse_phase_events(empty)
        assert isinstance(result, PhaseEvents)
        assert result.tool_calls == []

    def test_corrupt_jsonl_line_skipped(self, tmp_path):
        """Corrupt line should be skipped, not crash."""
        valid = _make_jsonl_line([
            _make_otel_record("claude_code.tool_result", 1,
                              tool_name="Read",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/ok.rs"}),
        ])
        lines = [
            "this is not valid json",
            valid,
            "{also broken",
        ]
        path = _write_jsonl(tmp_path, lines)
        result = parse_phase_events(path)
        # Should still parse the valid line
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].tool_name == "Read"

    def test_correlate_with_empty_events(self):
        """Correlating against empty events → none engagement."""
        result = correlate_finding(
            PhaseEvents(),
            finding_files=["src/main.rs"],
            worktree_prefix=WORKTREE_PREFIX,
        )
        assert result.engagement == "none"


# ---------------------------------------------------------------------------
# AC3: trace CLI command (tested via Click test runner)
# ---------------------------------------------------------------------------


class TestTraceCLICommand:
    """AC3: trace command exists under replay group."""

    def test_trace_command_registered(self):
        """pf benchmark replay trace should be a registered Click command."""
        from pf.benchmark.cli import replay
        commands = replay.list_commands(ctx=None)
        assert "trace" in commands

    def test_explain_command_registered(self):
        """pf benchmark replay explain should be a registered Click command."""
        from pf.benchmark.cli import replay
        commands = replay.list_commands(ctx=None)
        assert "explain" in commands


# ---------------------------------------------------------------------------
# Edge cases — The Caterpillar demands thoroughness
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases the Caterpillar insists on testing."""

    def test_tool_result_without_tool_parameters(self, tmp_path):
        """Some tool_result events lack tool_parameters (e.g., early Read events)."""
        records = [
            _make_otel_record("claude_code.tool_result", 1,
                              tool_name="Read", tool_parameters=None),
        ]
        path = _write_jsonl(tmp_path, [_make_jsonl_line(records)])
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].tool_name == "Read"
        # No file_path in parameters, so no files_read entry
        assert result.files_read == []

    def test_tool_result_with_failed_status(self, tmp_path):
        """Failed tool calls should still be recorded."""
        records = [
            _make_otel_record("claude_code.tool_result", 1,
                              tool_name="Bash", success=False, duration_ms=200,
                              tool_parameters={"command": "cargo test"}),
        ]
        path = _write_jsonl(tmp_path, [_make_jsonl_line(records)])
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].success is False

    def test_traces_signal_ignored(self, tmp_path):
        """OTEL traces signal lines should be ignored."""
        lines = [
            json.dumps({
                "signal": "traces",
                "timestamp": "2026-03-11T10:00:00+00:00",
                "data": {"resourceSpans": []},
            }),
            _make_jsonl_line([
                _make_otel_record("claude_code.tool_result", 1,
                                  tool_name="Read",
                                  tool_parameters={"file_path": f"{WORKTREE_PREFIX}/x.rs"}),
            ]),
        ]
        path = _write_jsonl(tmp_path, lines)
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 1

    def test_tool_decision_events_not_counted_as_tool_calls(self, tmp_path):
        """tool_decision events are planning, not execution — don't count as tool_calls."""
        records = [
            _make_otel_record("claude_code.tool_decision", 1, tool_name="Read"),
            _make_otel_record("claude_code.tool_result", 2,
                              tool_name="Read",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/x.rs"}),
        ]
        path = _write_jsonl(tmp_path, [_make_jsonl_line(records)])
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 1

    def test_user_prompt_events_ignored(self, tmp_path):
        """user_prompt events should not affect any output."""
        records = [
            _make_otel_record("claude_code.user_prompt", 0),
            _make_otel_record("claude_code.tool_result", 1,
                              tool_name="Read",
                              tool_parameters={"file_path": f"{WORKTREE_PREFIX}/x.rs"}),
        ]
        path = _write_jsonl(tmp_path, [_make_jsonl_line(records)])
        result = parse_phase_events(path)
        assert len(result.tool_calls) == 1

    def test_normalize_path_with_file_at_root(self):
        """File directly under worktree root."""
        result = normalize_path(
            "/tmp/pf-replay/run-1/Cargo.toml",
            "/tmp/pf-replay/run-1",
        )
        assert result == "Cargo.toml"
