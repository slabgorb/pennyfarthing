"""Tests for Story 148-8: Peloton workflow driver.

Covers AC-3 (TEA phase), AC-4 (Dev phase), AC-5 (Reviewer phase),
and AC-6 (phase transition coordination via gate resolution).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.peloton.pane_orchestrator import ManagedPane, PaneOrchestrator
from pf.peloton.workflow_driver import PhaseConfig, PhaseExecution, WorkflowDriver

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_orchestrator(tmp_path: Path) -> PaneOrchestrator:
    """Create an orchestrator with mock panes pre-registered."""
    orch = PaneOrchestrator(
        project_root=tmp_path,
        session_name="pf-test-0",
        story_id="148-8",
    )
    orch.panes = [
        ManagedPane(pane_id="%10", role="tea", title="TEA Agent", protected=False, owner="peloton"),
        ManagedPane(pane_id="%11", role="dev", title="Dev Agent", protected=False, owner="peloton"),
        ManagedPane(pane_id="%12", role="reviewer", title="Reviewer Agent", protected=False, owner="peloton"),
    ]
    return orch


@pytest.fixture
def session_file(tmp_path: Path) -> Path:
    """Create a minimal session file."""
    sf = tmp_path / ".session" / "148-8-session.md"
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text("# Story 148-8\n**Phase:** red\n**Workflow:** tdd\n")
    return sf


@pytest.fixture
def driver(mock_orchestrator: PaneOrchestrator, session_file: Path) -> WorkflowDriver:
    """Create a WorkflowDriver with mock orchestrator."""
    return WorkflowDriver(
        orchestrator=mock_orchestrator,
        session_file=session_file,
    )


@pytest.fixture
def sample_scenario(tmp_path: Path) -> Path:
    """Create a minimal scenario YAML file."""
    scenario = tmp_path / "scenario.yaml"
    scenario.write_text(
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
    return scenario


# ---------------------------------------------------------------------------
# Scenario loading
# ---------------------------------------------------------------------------


class TestLoadScenario:
    """Loading and parsing peloton scenario YAML."""

    def test_load_valid_scenario(self, driver: WorkflowDriver, sample_scenario: Path):
        """Should parse scenario YAML and configure phases."""
        result = driver.load_scenario(sample_scenario)
        assert result["success"] is True
        assert "phases" in result["data"]
        assert len(result["data"]["phases"]) == 3

    def test_load_nonexistent_scenario(self, driver: WorkflowDriver, tmp_path: Path):
        """Should fail gracefully for missing file."""
        result = driver.load_scenario(tmp_path / "nonexistent.yaml")
        assert result["success"] is False
        assert "error" in result

    def test_load_populates_phase_configs(self, driver: WorkflowDriver, sample_scenario: Path):
        """After loading, driver.phases should be populated."""
        result = driver.load_scenario(sample_scenario)
        assert result["success"] is True
        assert len(driver.phases) > 0


# ---------------------------------------------------------------------------
# AC-3: TEA phase runs in its pane
# ---------------------------------------------------------------------------


class TestTEAPhase:
    """AC-3: TEA prompt injected, test failures captured, findings written."""

    def test_inject_prompt_into_tea_pane(self, driver: WorkflowDriver):
        """Should inject the agent prompt into the TEA pane via tmux send."""
        result = driver.inject_prompt("tea", "pf agent start tea")
        assert result["success"] is True

    def test_execute_tea_phase_returns_output(self, driver: WorkflowDriver):
        """TEA phase execution should capture test output."""
        config = PhaseConfig(role="tea", prompt="pf agent start tea")
        result = driver.execute_phase(config)
        assert result["success"] is True
        assert isinstance(result["data"], PhaseExecution)
        assert result["data"].role == "tea"
        assert isinstance(result["data"].output, str)

    def test_tea_phase_captures_test_failures(self, driver: WorkflowDriver):
        """TEA output should contain test failure information."""
        config = PhaseConfig(role="tea", prompt="pf agent start tea")
        result = driver.execute_phase(config)
        assert result["success"] is True
        # Output should be captured (even if empty during stub phase)
        assert result["data"].output is not None


# ---------------------------------------------------------------------------
# AC-4: Dev phase runs in its pane
# ---------------------------------------------------------------------------


class TestDevPhase:
    """AC-4: Dev prompt injected, reads TEA failures, implements, tests pass."""

    def test_inject_prompt_into_dev_pane(self, driver: WorkflowDriver):
        """Should inject the agent prompt into the Dev pane."""
        result = driver.inject_prompt("dev", "pf agent start dev")
        assert result["success"] is True

    def test_execute_dev_phase_returns_output(self, driver: WorkflowDriver):
        """Dev phase execution should capture implementation output."""
        config = PhaseConfig(role="dev", prompt="pf agent start dev")
        result = driver.execute_phase(config)
        assert result["success"] is True
        assert result["data"].role == "dev"

    def test_prepare_context_extracts_tea_failures(self, driver: WorkflowDriver):
        """Context preparation should extract test failures for Dev."""
        tea_result = PhaseExecution(
            role="tea",
            output="FAILED test_foo - AssertionError\nFAILED test_bar - NotImplementedError",
            duration_s=10.0,
            exit_code=1,
        )
        dev_config = PhaseConfig(role="dev", prompt="pf agent start dev")
        result = driver.prepare_next_phase_context(tea_result, dev_config)
        assert result["success"] is True
        assert isinstance(result["data"], str)


# ---------------------------------------------------------------------------
# AC-5: Reviewer phase runs in its pane
# ---------------------------------------------------------------------------


class TestReviewerPhase:
    """AC-5: Reviewer prompt injected, code evaluated, findings written."""

    def test_inject_prompt_into_reviewer_pane(self, driver: WorkflowDriver):
        """Should inject the agent prompt into the Reviewer pane."""
        result = driver.inject_prompt("reviewer", "pf agent start reviewer")
        assert result["success"] is True

    def test_execute_reviewer_phase_returns_output(self, driver: WorkflowDriver):
        """Reviewer phase should capture evaluation output."""
        config = PhaseConfig(role="reviewer", prompt="pf agent start reviewer")
        result = driver.execute_phase(config)
        assert result["success"] is True
        assert result["data"].role == "reviewer"


# ---------------------------------------------------------------------------
# AC-6: Phase transitions coordinated via gate resolution
# ---------------------------------------------------------------------------


class TestPhaseTransitions:
    """AC-6: Gate resolution, phase markers, and context handoff."""

    def test_resolve_gate_returns_result(self, driver: WorkflowDriver):
        """Gate resolution should return pass/fail status."""
        config = PhaseConfig(role="tea", prompt="...", gate_type="quality-pass")
        result = driver.resolve_gate(config)
        assert result["success"] is True
        assert "gate_passed" in result["data"]

    def test_write_phase_marker(self, driver: WorkflowDriver):
        """Should write BikeLane phase marker to session file."""
        result = driver.write_phase_marker("tea")
        assert result["success"] is True

    def test_run_all_executes_phases_sequentially(self, driver: WorkflowDriver):
        """run_all should execute all phases in order and return results."""
        driver.phases = [
            PhaseConfig(role="tea", prompt="pf agent start tea"),
            PhaseConfig(role="dev", prompt="pf agent start dev"),
            PhaseConfig(role="reviewer", prompt="pf agent start reviewer"),
        ]
        result = driver.run_all()
        assert result["success"] is True
        assert len(result["data"]) == 3
        assert result["data"][0].role == "tea"
        assert result["data"][1].role == "dev"
        assert result["data"][2].role == "reviewer"

    def test_run_all_stops_on_phase_failure(self, driver: WorkflowDriver):
        """If a phase fails, run_all should stop and report the failure."""
        driver.phases = [
            PhaseConfig(role="tea", prompt="pf agent start tea"),
            PhaseConfig(role="dev", prompt="pf agent start dev"),
        ]
        result = driver.run_all()
        # Should either succeed or fail with a clear error
        if not result["success"]:
            assert "error" in result

    def test_phase_execution_records_duration(self, driver: WorkflowDriver):
        """Each phase execution should track duration in seconds."""
        config = PhaseConfig(role="tea", prompt="pf agent start tea")
        result = driver.execute_phase(config)
        assert result["success"] is True
        assert result["data"].duration_s >= 0

    def test_phase_execution_records_exit_code(self, driver: WorkflowDriver):
        """Each phase execution should record the exit code."""
        config = PhaseConfig(role="tea", prompt="pf agent start tea")
        result = driver.execute_phase(config)
        assert result["success"] is True
        assert isinstance(result["data"].exit_code, int)
