"""Tests for LLM-narrated trace (Story 142-9).

Covers four ACs:
1. Generates narrative: `narrate <run-dir> --yes` produces `narrative.md`
2. Cost warning: Without `--yes`, prompts for confirmation
3. Cached reuse: Second call reuses unless `--force`
4. `--finding` filters: Focuses narrative on specific finding
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.benchmark.narrate import (
    build_narrate_prompt,
    generate_narrative,
    truncate_events_to_budget,
)

# ---------------------------------------------------------------------------
# Fixtures: reuse OTEL helpers from test_events_summary
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


def _make_assistant_record(text: str) -> dict:
    """Create a minimal OTEL log record for assistant reasoning."""
    return {
        "signal": "logs",
        "timestamp": "2026-03-12T00:00:02+00:00",
        "data": {
            "resourceLogs": [{
                "resource": {"attributes": []},
                "scopeLogs": [{
                    "scope": {"name": "com.anthropic.claude_code.events"},
                    "logRecords": [{
                        "timeUnixNano": "3000000000",
                        "body": {"stringValue": "claude_code.assistant_message"},
                        "attributes": [
                            {"key": "text", "value": {"stringValue": text}},
                        ],
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
def run_dir_with_events(tmp_path: Path) -> Path:
    """Run directory with OTEL data for tea and dev phases."""
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

    # Add a pipeline.yaml so it looks like a real run
    pipeline = {
        "scenario_id": "test-scenario",
        "theme": "test-theme",
        "run_id": 1,
        "phases": {"tea": {"output": "tea output"}, "dev": {"output": "dev output"}},
    }
    (tmp_path / "pipeline.yaml").write_text(
        __import__("yaml").dump(pipeline, default_flow_style=False)
    )
    return tmp_path


@pytest.fixture
def ground_truth() -> list[dict]:
    """Sample ground truth findings for testing."""
    return [
        {
            "id": "I1",
            "title": "Missing input validation",
            "severity": "important",
            "weight": 5,
            "files": ["/src/main.py", "/src/handler.py"],
        },
        {
            "id": "I3",
            "title": "Hardcoded trace_id",
            "severity": "important",
            "weight": 3,
            "files": ["/src/tracing.py"],
        },
    ]


# ===========================================================================
# AC1: Generates narrative — build_narrate_prompt
# ===========================================================================


class TestBuildNarratePrompt:
    """build_narrate_prompt() constructs a valid LLM prompt from events."""

    def test_returns_nonempty_string(self, run_dir_with_events: Path):
        prompt = build_narrate_prompt(
            run_dir_with_events, ["tea", "dev"], "Test Scenario"
        )
        assert isinstance(prompt, str)
        assert len(prompt) > 0

    def test_includes_scenario_title(self, run_dir_with_events: Path):
        prompt = build_narrate_prompt(
            run_dir_with_events, ["tea", "dev"], "Serde Bypass Detection"
        )
        assert "Serde Bypass Detection" in prompt

    def test_includes_phase_events(self, run_dir_with_events: Path):
        """Prompt should contain event data from OTEL files."""
        prompt = build_narrate_prompt(
            run_dir_with_events, ["tea", "dev"], "Test Scenario"
        )
        # Should reference the phases
        assert "tea" in prompt.lower() or "TEA" in prompt
        assert "dev" in prompt.lower() or "Dev" in prompt

    def test_includes_ground_truth_when_provided(
        self, run_dir_with_events: Path, ground_truth: list[dict]
    ):
        """When ground truth is provided, prompt should include finding context."""
        prompt = build_narrate_prompt(
            run_dir_with_events,
            ["tea", "dev"],
            "Test Scenario",
            ground_truth=ground_truth,
        )
        assert "I1" in prompt or "Missing input validation" in prompt

    def test_empty_run_dir_still_produces_prompt(self, tmp_path: Path):
        """Even with no OTEL files, should produce a prompt (with no-events note)."""
        prompt = build_narrate_prompt(tmp_path, ["dev"], "Test")
        assert isinstance(prompt, str)
        assert len(prompt) > 0


# ===========================================================================
# AC1 (extended): generate_narrative writes narrative.md
# ===========================================================================


class TestGenerateNarrative:
    """generate_narrative() calls LLM and writes narrative.md."""

    def test_writes_narrative_md(self, run_dir_with_events: Path):
        """After generation, narrative.md should exist in run_dir."""
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "# Narrative\n\nThe agent did things."
            result_path = generate_narrative(
                run_dir_with_events,
                "test-scenario",
                ["tea", "dev"],
                "Test Scenario",
                model="claude-sonnet-4-6",
            )

        assert result_path.name == "narrative.md"
        assert result_path.exists()
        content = result_path.read_text()
        assert "Narrative" in content

    def test_returns_path_to_narrative(self, run_dir_with_events: Path):
        """Return value should be the path to narrative.md."""
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "narrative content"
            result_path = generate_narrative(
                run_dir_with_events,
                "test-scenario",
                ["tea", "dev"],
                "Test Scenario",
            )
        assert result_path == run_dir_with_events / "narrative.md"

    def test_default_model_resolves_from_judge_map(self, run_dir_with_events: Path):
        """Default model should come from models.yaml judges.benchmark, not a pinned ID."""
        with (
            patch("pf.benchmark.narrate._invoke_llm") as mock_llm,
            patch("pf.benchmark.narrate.judge_alias", return_value="opus") as mock_alias,
        ):
            mock_llm.return_value = "content"
            generate_narrative(
                run_dir_with_events,
                "test-scenario",
                ["tea", "dev"],
                "Test Scenario",
            )
            mock_alias.assert_called_once_with("benchmark")
            # Check that _invoke_llm was called with the mapped alias
            call_kwargs = mock_llm.call_args
            assert call_kwargs is not None
            args, kwargs = call_kwargs
            model_arg = kwargs.get("model") or (args[1] if len(args) > 1 else None)
            assert model_arg == "opus"


# ===========================================================================
# AC2: Cost warning — stderr prompt without --yes
# ===========================================================================


class TestCostWarning:
    """Without --yes, the narrate command should warn about cost."""

    def test_cli_without_yes_prompts(self, run_dir_with_events: Path):
        """CLI should prompt for confirmation without --yes flag."""
        from pf.benchmark.cli import replay

        runner = CliRunner()
        result = runner.invoke(
            replay, ["narrate", str(run_dir_with_events)], input="n\n"
        )
        # Should ask for confirmation and respect "no"
        assert result.exit_code == 0 or result.exit_code == 1
        # Should not have created narrative.md when user says no
        assert not (run_dir_with_events / "narrative.md").exists()

    def test_cli_with_yes_skips_prompt(self, run_dir_with_events: Path):
        """CLI with --yes should skip confirmation."""
        from pf.benchmark.cli import replay

        runner = CliRunner()
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "# Narrative\n\ncontent"
            result = runner.invoke(
                replay, ["narrate", str(run_dir_with_events), "--yes"]
            )
        # Should succeed without prompting
        assert result.exit_code == 0

    def test_cost_warning_in_output(self, run_dir_with_events: Path):
        """Cost warning should appear in output."""
        from pf.benchmark.cli import replay

        runner = CliRunner()
        result = runner.invoke(
            replay, ["narrate", str(run_dir_with_events)], input="n\n"
        )
        # Cost info should be in output
        assert "cost" in result.output.lower() or "~$" in result.output


# ===========================================================================
# AC3: Cached reuse — second call reuses unless --force
# ===========================================================================


class TestCachedReuse:
    """Cached narrative.md should be reused unless --force is passed."""

    def test_skips_llm_when_cached(self, run_dir_with_events: Path):
        """If narrative.md already exists, should not call LLM."""
        # Pre-create narrative.md
        cached = run_dir_with_events / "narrative.md"
        cached.write_text("# Cached Narrative\n\nPrevious content.")

        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            result_path = generate_narrative(
                run_dir_with_events,
                "test-scenario",
                ["tea", "dev"],
                "Test Scenario",
            )
            mock_llm.assert_not_called()

        # Should return existing path
        assert result_path == cached
        assert cached.read_text() == "# Cached Narrative\n\nPrevious content."

    def test_force_regenerates(self, run_dir_with_events: Path):
        """With force=True, should call LLM even if cached."""
        cached = run_dir_with_events / "narrative.md"
        cached.write_text("# Old Narrative\n\nStale content.")

        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "# Fresh Narrative\n\nNew content."
            result_path = generate_narrative(
                run_dir_with_events,
                "test-scenario",
                ["tea", "dev"],
                "Test Scenario",
                force=True,
            )
            mock_llm.assert_called_once()

        assert result_path == cached
        assert "Fresh Narrative" in cached.read_text()

    def test_cli_force_flag(self, run_dir_with_events: Path):
        """CLI --force flag should regenerate cached narrative."""
        from pf.benchmark.cli import replay

        # Pre-create cached
        (run_dir_with_events / "narrative.md").write_text("old")

        runner = CliRunner()
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "new narrative"
            result = runner.invoke(
                replay,
                ["narrate", str(run_dir_with_events), "--yes", "--force"],
            )
        assert result.exit_code == 0


# ===========================================================================
# AC4: --finding filters narrative to specific finding
# ===========================================================================


class TestFindingFilter:
    """--finding flag should focus narrative on a specific finding."""

    def test_prompt_filtered_by_finding(
        self, run_dir_with_events: Path, ground_truth: list[dict]
    ):
        """When finding_id is provided, prompt should focus on that finding."""
        prompt = build_narrate_prompt(
            run_dir_with_events,
            ["tea", "dev"],
            "Test Scenario",
            finding_id="I3",
            ground_truth=ground_truth,
        )
        # Should mention the specific finding
        assert "I3" in prompt or "Hardcoded trace_id" in prompt

    def test_finding_filter_excludes_other_findings(
        self, run_dir_with_events: Path, ground_truth: list[dict]
    ):
        """Filtered prompt should not focus on other findings."""
        prompt_filtered = build_narrate_prompt(
            run_dir_with_events,
            ["tea", "dev"],
            "Test Scenario",
            finding_id="I3",
            ground_truth=ground_truth,
        )
        prompt_all = build_narrate_prompt(
            run_dir_with_events,
            ["tea", "dev"],
            "Test Scenario",
            ground_truth=ground_truth,
        )
        # Filtered prompt should be shorter or different from full prompt
        assert len(prompt_filtered) <= len(prompt_all)

    def test_cli_finding_option(self, run_dir_with_events: Path):
        """CLI --finding option should be accepted."""
        from pf.benchmark.cli import replay

        runner = CliRunner()
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "focused narrative"
            result = runner.invoke(
                replay,
                [
                    "narrate",
                    str(run_dir_with_events),
                    "--yes",
                    "--finding",
                    "I3",
                ],
            )
        assert result.exit_code == 0


# ===========================================================================
# Truncation
# ===========================================================================


class TestTruncateEventsToBudget:
    """truncate_events_to_budget() respects token limits."""

    def test_short_text_unchanged(self):
        """Text within budget should not be altered."""
        text = "Short text that fits."
        result = truncate_events_to_budget(text, max_tokens=50_000)
        assert result == text

    def test_long_text_truncated(self):
        """Text exceeding budget should be truncated."""
        # ~4 chars per token, so 50K tokens ~ 200K chars
        long_text = "x" * 300_000
        result = truncate_events_to_budget(long_text, max_tokens=50_000)
        assert len(result) < len(long_text)
        # Should be approximately within budget (4 chars/token)
        assert len(result) <= 50_000 * 4 + 1000  # small margin

    def test_returns_nonempty_for_long_input(self):
        """Even heavily truncated text should not be empty."""
        long_text = "important content " * 100_000
        result = truncate_events_to_budget(long_text, max_tokens=1_000)
        assert len(result) > 0

    def test_empty_input(self):
        """Empty string should return empty string."""
        result = truncate_events_to_budget("", max_tokens=50_000)
        assert result == ""


# ===========================================================================
# Edge cases
# ===========================================================================


class TestNarrateEdgeCases:
    """Edge cases and error handling."""

    def test_run_dir_without_otel_files(self, tmp_path: Path):
        """Should handle run dirs with no OTEL files gracefully."""
        with patch("pf.benchmark.narrate._invoke_llm") as mock_llm:
            mock_llm.return_value = "No events found."
            result_path = generate_narrative(
                tmp_path, "test-scenario", ["dev"], "Test"
            )
        assert result_path.exists()

    def test_run_dir_does_not_exist(self, tmp_path: Path):
        """Should raise for non-existent run directory."""
        bad_path = tmp_path / "nonexistent"
        with pytest.raises((FileNotFoundError, ValueError)):
            generate_narrative(bad_path, "test", ["dev"], "Test")
