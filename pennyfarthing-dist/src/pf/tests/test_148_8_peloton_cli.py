"""Tests for Story 148-8: Peloton CLI command.

Covers AC-1 (CLI entry point) and AC-9 (integration test structure).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.peloton.cli import peloton


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Create a Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def scenario_file(tmp_path: Path) -> Path:
    """Create a valid scenario YAML."""
    sf = tmp_path / "scenario.yaml"
    sf.write_text(
        "id: test-scenario\n"
        "title: Test Scenario\n"
        "story_id: 148-8\n"
        "jira: MSSCI-16421\n"
        "repo_path: .\n"
        "base_commit: abc123\n"
        "branch: feat/test\n"
        "phases:\n"
        "  - tea\n"
        "  - dev\n"
        "  - reviewer\n"
        "ground_truth: []\n"
    )
    return sf


# ---------------------------------------------------------------------------
# AC-1: CLI command exists
# ---------------------------------------------------------------------------


class TestPelotonCLI:
    """AC-1: `pf peloton start <scenario-yaml>` command exists."""

    def test_peloton_group_exists(self, runner: CliRunner):
        """The peloton Click group should be importable and invocable."""
        result = runner.invoke(peloton, ["--help"])
        assert result.exit_code == 0
        assert "peloton" in result.output.lower() or "automated" in result.output.lower()

    def test_start_subcommand_exists(self, runner: CliRunner):
        """The 'start' subcommand should be listed."""
        result = runner.invoke(peloton, ["--help"])
        assert result.exit_code == 0
        assert "start" in result.output

    def test_start_requires_scenario_path(self, runner: CliRunner):
        """start without args should show usage error."""
        result = runner.invoke(peloton, ["start"])
        assert result.exit_code != 0

    def test_start_accepts_scenario_path(self, runner: CliRunner, scenario_file: Path):
        """start with a valid scenario path should be accepted (may fail on tmux)."""
        result = runner.invoke(peloton, ["start", str(scenario_file)])
        # Will fail with NotImplementedError from stub, which is correct RED state
        assert result.exit_code == 0

    def test_start_accepts_theme_option(self, runner: CliRunner, scenario_file: Path):
        """--theme flag should be accepted by the CLI."""
        result = runner.invoke(peloton, ["start", str(scenario_file), "--theme", "dune"])
        # CLI accepts the flag (won't fail on arg parsing)
        # Will fail on NotImplementedError which is expected
        assert result.exit_code == 0

    def test_start_accepts_model_option(self, runner: CliRunner, scenario_file: Path):
        """--model flag should be accepted by the CLI."""
        result = runner.invoke(peloton, ["start", str(scenario_file), "--model", "claude-sonnet-4-20250514"])
        assert result.exit_code == 0

    def test_start_rejects_nonexistent_scenario(self, runner: CliRunner, tmp_path: Path):
        """start with nonexistent file should fail."""
        result = runner.invoke(peloton, ["start", str(tmp_path / "ghost.yaml")])
        assert result.exit_code != 0


# ---------------------------------------------------------------------------
# AC-9: Integration test structure
# ---------------------------------------------------------------------------


class TestPelotonIntegration:
    """AC-9: End-to-end peloton run structure validation."""

    def test_pipeline_output_directory_structure(self, tmp_path: Path):
        """Output should follow internal/results/pipeline-replay/<id>/run-N/ structure."""
        from pf.peloton.result_aggregator import PipelineOutput

        output = PipelineOutput(
            scenario_id="test-scenario",
            run_id=1,
            output_dir=tmp_path / "internal" / "results" / "pipeline-replay" / "test-scenario" / "run-1",
        )
        expected_parts = ["internal", "results", "pipeline-replay", "test-scenario", "run-1"]
        path_parts = output.output_dir.parts
        for part in expected_parts:
            assert part in path_parts, f"Expected '{part}' in output path"

    def test_score_result_has_metrics(self):
        """ScoreResult should contain precision, recall, and f1."""
        from pf.peloton.result_aggregator import ScoreResult

        score = ScoreResult(precision=0.8, recall=0.6, f1=0.685)
        assert score.precision == 0.8
        assert score.recall == 0.6
        assert score.f1 == 0.685

    def test_phase_execution_dataclass(self):
        """PhaseExecution should hold all required fields."""
        from pf.peloton.workflow_driver import PhaseExecution

        pe = PhaseExecution(
            role="tea",
            output="test output",
            duration_s=10.0,
            exit_code=0,
            gate_passed=True,
        )
        assert pe.role == "tea"
        assert pe.output == "test output"
        assert pe.duration_s == 10.0
        assert pe.exit_code == 0
        assert pe.gate_passed is True

    def test_managed_pane_dataclass(self):
        """ManagedPane should hold pane metadata."""
        from pf.peloton.pane_orchestrator import ManagedPane

        mp = ManagedPane(
            pane_id="%5",
            role="tea",
            title="TEA Agent",
            protected=False,
            owner="peloton",
        )
        assert mp.pane_id == "%5"
        assert mp.role == "tea"
        assert mp.protected is False

    def test_pane_orchestrator_naming_convention(self, tmp_path: Path):
        """Pane titles should follow {role}-agent or {story-id}-{role} convention."""
        from pf.peloton.pane_orchestrator import PaneOrchestrator

        orch = PaneOrchestrator(
            project_root=tmp_path,
            session_name="pf-test-0",
            story_id="148-8",
        )
        result = orch.spawn_agent_panes(["tea", "dev", "reviewer"])
        assert result["success"] is True
        for role, pane in result["data"].items():
            title_lower = pane.title.lower()
            has_role = role in title_lower
            has_story_id = "148-8" in pane.title
            assert has_role or has_story_id, (
                f"Title '{pane.title}' should contain role '{role}' or story id '148-8'"
            )
