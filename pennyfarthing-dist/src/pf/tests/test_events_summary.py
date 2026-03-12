"""Tests for events-first storage model (Story 142-8).

Covers three ACs:
1. Summary auto-generated: generate_events_summary() produces correct output,
   save_result() writes events-summary.yaml per phase.
2. Old runs work: Missing OTEL files -> has_events: false with zero counts.
3. Compare can use it: events-summary data is available for comparison display.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from pf.benchmark.events import generate_events_summary

# ---------------------------------------------------------------------------
# Fixtures: synthetic OTEL JSONL data
# ---------------------------------------------------------------------------

def _make_tool_decision_record(tool_name: str, sequence: int = 1) -> dict:
    """Create a minimal OTEL log record for a tool_decision event."""
    return {
        "signal": "logs",
        "timestamp": "2026-03-12T00:00:00+00:00",
        "data": {
            "resourceLogs": [{
                "resource": {"attributes": []},
                "scopeLogs": [{
                    "scope": {"name": "com.anthropic.claude_code.events"},
                    "logRecords": [{
                        "timeUnixNano": "1000000000",
                        "body": {"stringValue": "claude_code.tool_decision"},
                        "attributes": [
                            {"key": "tool_name", "value": {"stringValue": tool_name}},
                            {"key": "event.sequence", "value": {"intValue": sequence}},
                            {"key": "decision", "value": {"stringValue": "accept"}},
                        ],
                    }],
                }],
            }],
        },
    }


def _make_tool_result_record(tool_name: str, file_path: str | None = None) -> dict:
    """Create a minimal OTEL log record for a tool_result event."""
    attrs = [
        {"key": "tool_name", "value": {"stringValue": tool_name}},
    ]
    if file_path:
        attrs.append({"key": "file_path", "value": {"stringValue": file_path}})
    return {
        "signal": "logs",
        "timestamp": "2026-03-12T00:00:01+00:00",
        "data": {
            "resourceLogs": [{
                "resource": {"attributes": []},
                "scopeLogs": [{
                    "scope": {"name": "com.anthropic.claude_code.events"},
                    "logRecords": [{
                        "timeUnixNano": "2000000000",
                        "body": {"stringValue": "claude_code.tool_result"},
                        "attributes": attrs,
                    }],
                }],
            }],
        },
    }


def _write_otel_jsonl(path: Path, records: list[dict]) -> None:
    """Write OTEL records as JSONL."""
    with open(path, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")


@pytest.fixture
def run_dir(tmp_path: Path) -> Path:
    """Create a run directory with sample OTEL data for dev phase."""
    records = [
        _make_tool_decision_record("Read", 1),
        _make_tool_result_record("Read", "/src/main.py"),
        _make_tool_decision_record("Read", 2),
        _make_tool_result_record("Read", "/src/utils.py"),
        _make_tool_decision_record("Edit", 3),
        _make_tool_result_record("Edit", "/src/main.py"),
        _make_tool_decision_record("Bash", 4),
        _make_tool_result_record("Bash"),
        _make_tool_decision_record("Write", 5),
        _make_tool_result_record("Write", "/src/new_file.py"),
    ]
    _write_otel_jsonl(tmp_path / "dev-otel.jsonl", records)
    return tmp_path


@pytest.fixture
def empty_run_dir(tmp_path: Path) -> Path:
    """A run directory with no OTEL files (simulates old run)."""
    return tmp_path


@pytest.fixture
def multi_phase_run_dir(tmp_path: Path) -> Path:
    """Run directory with OTEL data for tea and dev, but not reviewer."""
    tea_records = [
        _make_tool_decision_record("Read", 1),
        _make_tool_result_record("Read", "/tests/test_main.py"),
        _make_tool_decision_record("Write", 2),
        _make_tool_result_record("Write", "/tests/test_main.py"),
    ]
    dev_records = [
        _make_tool_decision_record("Read", 1),
        _make_tool_result_record("Read", "/src/main.py"),
        _make_tool_decision_record("Edit", 2),
        _make_tool_result_record("Edit", "/src/main.py"),
        _make_tool_decision_record("Bash", 3),
        _make_tool_result_record("Bash"),
    ]
    _write_otel_jsonl(tmp_path / "tea-otel.jsonl", tea_records)
    _write_otel_jsonl(tmp_path / "dev-otel.jsonl", dev_records)
    # No reviewer-otel.jsonl — simulates partial data
    return tmp_path


# ===========================================================================
# AC1: Summary auto-generated — generate_events_summary() correctness
# ===========================================================================


class TestGenerateEventsSummary:
    """generate_events_summary() produces correct structured output."""

    def test_returns_dict(self, run_dir: Path):
        result = generate_events_summary(run_dir, ["dev"])
        assert isinstance(result, dict)

    def test_has_events_true_when_otel_exists(self, run_dir: Path):
        result = generate_events_summary(run_dir, ["dev"])
        assert result["has_events"] is True

    def test_per_phase_key_exists(self, run_dir: Path):
        result = generate_events_summary(run_dir, ["dev"])
        assert "dev" in result["phases"]

    def test_tool_counts_correct(self, run_dir: Path):
        """Tool counts should reflect the tool_decision events."""
        result = generate_events_summary(run_dir, ["dev"])
        phase = result["phases"]["dev"]
        assert phase["tool_counts"]["Read"] == 2
        assert phase["tool_counts"]["Edit"] == 1
        assert phase["tool_counts"]["Bash"] == 1
        assert phase["tool_counts"]["Write"] == 1

    def test_files_touched_correct(self, run_dir: Path):
        """Files touched should be unique file paths from tool_result events."""
        result = generate_events_summary(run_dir, ["dev"])
        phase = result["phases"]["dev"]
        files = sorted(phase["files_touched"])
        assert files == ["/src/main.py", "/src/new_file.py", "/src/utils.py"]

    def test_files_touched_deduplicated(self, run_dir: Path):
        """main.py appears in both Read and Edit — should only appear once."""
        result = generate_events_summary(run_dir, ["dev"])
        phase = result["phases"]["dev"]
        assert phase["files_touched"].count("/src/main.py") == 1

    def test_total_tool_uses(self, run_dir: Path):
        """Total tool uses should sum all tool_decision events."""
        result = generate_events_summary(run_dir, ["dev"])
        phase = result["phases"]["dev"]
        total = sum(phase["tool_counts"].values())
        assert total == 5


# ===========================================================================
# AC2: Old runs work — missing OTEL files produce fallback
# ===========================================================================


class TestOldRunsFallback:
    """Missing OTEL files should produce has_events: false with zero counts."""

    def test_has_events_false_when_no_otel(self, empty_run_dir: Path):
        result = generate_events_summary(empty_run_dir, ["dev"])
        assert result["has_events"] is False

    def test_phase_has_zero_tool_counts(self, empty_run_dir: Path):
        result = generate_events_summary(empty_run_dir, ["dev"])
        phase = result["phases"]["dev"]
        assert phase["tool_counts"] == {}

    def test_phase_has_empty_files_touched(self, empty_run_dir: Path):
        result = generate_events_summary(empty_run_dir, ["dev"])
        phase = result["phases"]["dev"]
        assert phase["files_touched"] == []

    def test_phase_has_events_false(self, empty_run_dir: Path):
        """Individual phase should also indicate no events."""
        result = generate_events_summary(empty_run_dir, ["dev"])
        phase = result["phases"]["dev"]
        assert phase["has_events"] is False

    def test_multiple_missing_phases(self, empty_run_dir: Path):
        """All phases should get fallback entries."""
        result = generate_events_summary(empty_run_dir, ["tea", "dev", "reviewer"])
        assert result["has_events"] is False
        for role in ["tea", "dev", "reviewer"]:
            assert role in result["phases"]
            assert result["phases"][role]["has_events"] is False


# ===========================================================================
# AC2 (extended): Partial OTEL — some phases have data, some don't
# ===========================================================================


class TestPartialOTELData:
    """When only some phases have OTEL files, mixed has_events correctly."""

    def test_top_level_has_events_true(self, multi_phase_run_dir: Path):
        """has_events is true if ANY phase has data."""
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        assert result["has_events"] is True

    def test_tea_has_events(self, multi_phase_run_dir: Path):
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        assert result["phases"]["tea"]["has_events"] is True

    def test_dev_has_events(self, multi_phase_run_dir: Path):
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        assert result["phases"]["dev"]["has_events"] is True

    def test_reviewer_no_events(self, multi_phase_run_dir: Path):
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        assert result["phases"]["reviewer"]["has_events"] is False
        assert result["phases"]["reviewer"]["tool_counts"] == {}

    def test_tea_tool_counts(self, multi_phase_run_dir: Path):
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        tea = result["phases"]["tea"]
        assert tea["tool_counts"]["Read"] == 1
        assert tea["tool_counts"]["Write"] == 1

    def test_dev_tool_counts(self, multi_phase_run_dir: Path):
        result = generate_events_summary(
            multi_phase_run_dir, ["tea", "dev", "reviewer"]
        )
        dev = result["phases"]["dev"]
        assert dev["tool_counts"]["Read"] == 1
        assert dev["tool_counts"]["Edit"] == 1
        assert dev["tool_counts"]["Bash"] == 1


# ===========================================================================
# AC1 (extended): save_result writes events-summary.yaml
# ===========================================================================


class TestSaveResultWritesEventsSummary:
    """save_result() should call generate_events_summary and write the file."""

    def test_events_summary_yaml_created(self, tmp_path: Path):
        """After save_result(), events-summary.yaml should exist in run_dir."""
        from pf.benchmark.pipeline_replay import PhaseResult, PipelineResult, save_result

        # Create minimal OTEL data
        otel_records = [
            _make_tool_decision_record("Read", 1),
            _make_tool_result_record("Read", "/src/foo.py"),
        ]

        # Build a PipelineResult
        pr = PipelineResult(
            scenario_id="test-scenario",
            theme="test-theme",
            run_id="run-1",
            worktree_path="",
            phases={
                "dev": PhaseResult(role="dev", output_text="dev output here"),
            },
            timestamp="2026-03-12T00:00:00Z",
        )

        # save_result will write to computed run_dir
        run_dir = save_result(pr, None, tmp_path)

        # Write OTEL data to where save_result placed the run
        _write_otel_jsonl(run_dir / "dev-otel.jsonl", otel_records)

        # Re-run save_result now that OTEL data exists
        run_dir = save_result(pr, None, tmp_path)

        summary_path = run_dir / "events-summary.yaml"
        assert summary_path.exists(), (
            f"events-summary.yaml not found in {run_dir}. "
            f"Contents: {list(run_dir.iterdir())}"
        )

    def test_events_summary_yaml_parseable(self, tmp_path: Path):
        """events-summary.yaml should be valid YAML."""
        from pf.benchmark.pipeline_replay import PhaseResult, PipelineResult, save_result

        otel_records = [
            _make_tool_decision_record("Bash", 1),
            _make_tool_result_record("Bash"),
        ]

        pr = PipelineResult(
            scenario_id="test-scenario",
            theme="test-theme",
            run_id="run-1",
            worktree_path="",
            phases={
                "dev": PhaseResult(role="dev", output_text="output"),
            },
            timestamp="2026-03-12T00:00:00Z",
        )

        run_dir = save_result(pr, None, tmp_path)
        _write_otel_jsonl(run_dir / "dev-otel.jsonl", otel_records)
        run_dir = save_result(pr, None, tmp_path)

        summary_path = run_dir / "events-summary.yaml"
        if summary_path.exists():
            data = yaml.safe_load(summary_path.read_text())
            assert isinstance(data, dict)

    def test_events_summary_not_required_for_reconstruct(self, tmp_path: Path):
        """reconstruct_pipeline_result must NOT depend on events-summary.yaml.

        This is a guardrail: removing events-summary.yaml should not break
        reconstruct_pipeline_result (preserves pre-142-8 re-scoring).
        """
        from pf.benchmark.pipeline_replay import (
            PhaseResult,
            PipelineResult,
            Scenario,
            reconstruct_pipeline_result,
            save_result,
        )

        pr = PipelineResult(
            scenario_id="test-scenario",
            theme="test-theme",
            run_id="run-1",
            worktree_path="",
            phases={
                "dev": PhaseResult(role="dev", output_text="dev output"),
            },
            timestamp="2026-03-12T00:00:00Z",
        )

        run_dir = save_result(pr, None, tmp_path)

        # Delete events-summary.yaml if it was created
        es = run_dir / "events-summary.yaml"
        if es.exists():
            es.unlink()

        # reconstruct must still work
        scenario = Scenario(
            id="test-scenario",
            title="Test",
            story_id="test-1",
            jira="TEST-1",
            repo_path="/tmp",
            base_commit="abc",
            branch="main",
            context_epic_path="",
            context_story_path="",
            session_archive_path=None,
            phases=["dev"],
            ground_truth=[],
            total_weight=0,
            phase_prompts={},
        )
        result = reconstruct_pipeline_result(run_dir, scenario)
        assert result is not None
        assert result.scenario_id == "test-scenario"


# ===========================================================================
# AC3: Compare can use events-summary when available
# ===========================================================================


class TestCompareUsesEventsSummary:
    """Events summary data should be loadable for comparison display."""

    def test_summary_has_tool_patterns(self, run_dir: Path):
        """Summary should contain tool usage patterns usable by compare."""
        result = generate_events_summary(run_dir, ["dev"])
        # Must have tool_counts that compare could display
        assert "tool_counts" in result["phases"]["dev"]
        assert len(result["phases"]["dev"]["tool_counts"]) > 0

    def test_summary_has_files_touched(self, run_dir: Path):
        """Summary should contain files touched for comparison."""
        result = generate_events_summary(run_dir, ["dev"])
        assert "files_touched" in result["phases"]["dev"]
        assert len(result["phases"]["dev"]["files_touched"]) > 0


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    """Edge cases for robustness."""

    def test_empty_otel_file(self, tmp_path: Path):
        """An empty OTEL JSONL file should be treated as no events."""
        (tmp_path / "dev-otel.jsonl").write_text("")
        result = generate_events_summary(tmp_path, ["dev"])
        assert result["phases"]["dev"]["has_events"] is False

    def test_malformed_json_line_skipped(self, tmp_path: Path):
        """Malformed JSON lines should be skipped, not crash."""
        content = "not valid json\n" + json.dumps(
            _make_tool_decision_record("Read", 1)
        ) + "\n"
        (tmp_path / "dev-otel.jsonl").write_text(content)
        result = generate_events_summary(tmp_path, ["dev"])
        # Should still parse the valid line
        assert result["phases"]["dev"]["has_events"] is True

    def test_empty_phases_list(self, tmp_path: Path):
        """Empty phases list should return has_events false."""
        result = generate_events_summary(tmp_path, [])
        assert result["has_events"] is False
        assert result["phases"] == {}

    def test_metrics_and_traces_signals_ignored(self, tmp_path: Path):
        """Only 'logs' signal should be parsed for tool events."""
        records = [
            {"signal": "metrics", "timestamp": "2026-03-12T00:00:00Z", "data": {}},
            {"signal": "traces", "timestamp": "2026-03-12T00:00:00Z", "data": {}},
            _make_tool_decision_record("Read", 1),
            _make_tool_result_record("Read", "/src/main.py"),
        ]
        _write_otel_jsonl(tmp_path / "dev-otel.jsonl", records)
        result = generate_events_summary(tmp_path, ["dev"])
        assert result["phases"]["dev"]["tool_counts"]["Read"] == 1
