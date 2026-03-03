"""Tests for pf workflow check command.

Story: MSSCI-12657 - Implement pf workflow check command
Epic: epic-67 (Pennyfarthing Python CLI)

Acceptance Criteria:
- [AC1] pf workflow check returns workflow state
- [AC2] --json flag outputs JSON format
- [AC3] Exit code 0 for all states (including empty)

These tests verify the `pf workflow check` CLI command behavior.
Tests should fail until the implementation is complete.
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.cli import cli
from pf.workflow import get_workflow_state

# Mock path: workflow.cli imports from workflow.state, so mock at the source module
MOCK_PATH = "pf.workflow.state.get_workflow_state"


def _subprocess_env() -> dict:
    """Build env for subprocess calls that need the pf package on sys.path.

    The test process adds pennyfarthing-dist/src to sys.path via conftest.py,
    but subprocess calls inherit the system environment without that addition.
    """
    src_dir = str(Path(__file__).resolve().parents[3] / "src")
    env = os.environ.copy()
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{src_dir}:{existing}" if existing else src_dir
    return env


class TestWorkflowCheckCLI:
    """Tests for the CLI entry point (AC1, AC2, AC3)."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        """Create a CLI test runner."""
        return CliRunner()

    def test_workflow_check_command_exists(self, runner: CliRunner) -> None:
        """AC1: workflow check command should exist and be invokable."""
        result = runner.invoke(cli, ["workflow", "check", "--help"])
        assert result.exit_code == 0
        assert "workflow state" in result.output.lower()

    def test_workflow_check_returns_state_field(self, runner: CliRunner) -> None:
        """AC1: workflow check should return state in output."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "IN_PROGRESS_STATE"}
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0
            assert "State:" in result.output or "state" in result.output.lower()

    def test_workflow_check_shows_story_id_when_present(
        self, runner: CliRunner
    ) -> None:
        """AC1: workflow check should show story_id when in progress."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "red",
            }
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0
            assert "MSSCI-12657" in result.output

    def test_workflow_check_shows_workflow_type(self, runner: CliRunner) -> None:
        """AC1: workflow check should show workflow type when in progress."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "red",
            }
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0
            assert "tdd" in result.output.lower()

    def test_workflow_check_shows_phase(self, runner: CliRunner) -> None:
        """AC1: workflow check should show phase when in progress."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "red",
            }
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0
            assert "red" in result.output.lower()


class TestWorkflowCheckJSONOutput:
    """Tests for JSON output format (AC2)."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        """Create a CLI test runner."""
        return CliRunner()

    def test_json_flag_produces_valid_json(self, runner: CliRunner) -> None:
        """AC2: --json flag should output valid JSON."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "EMPTY_BACKLOG_STATE"}
            result = runner.invoke(cli, ["workflow", "check", "--json"])
            assert result.exit_code == 0
            # Should be valid JSON
            parsed = json.loads(result.output)
            assert isinstance(parsed, dict)

    def test_json_output_contains_state_field(self, runner: CliRunner) -> None:
        """AC2: JSON output should contain state field."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "NEW_WORK_STATE"}
            result = runner.invoke(cli, ["workflow", "check", "--json"])
            parsed = json.loads(result.output)
            assert "state" in parsed
            assert parsed["state"] == "NEW_WORK_STATE"

    def test_json_output_contains_all_fields_when_in_progress(
        self, runner: CliRunner
    ) -> None:
        """AC2: JSON output should contain all fields for in-progress state."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "implement",
            }
            result = runner.invoke(cli, ["workflow", "check", "--json"])
            parsed = json.loads(result.output)
            assert parsed["state"] == "IN_PROGRESS_STATE"
            assert parsed["story_id"] == "MSSCI-12657"
            assert parsed["workflow"] == "tdd"
            assert parsed["phase"] == "implement"

    def test_json_output_is_properly_formatted(self, runner: CliRunner) -> None:
        """AC2: JSON output should be formatted with indentation."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "TEST-123",
            }
            result = runner.invoke(cli, ["workflow", "check", "--json"])
            # Should have newlines (indented JSON, not compact)
            assert "\n" in result.output


class TestWorkflowCheckExitCodes:
    """Tests for exit codes (AC3)."""

    @pytest.fixture
    def runner(self) -> CliRunner:
        """Create a CLI test runner."""
        return CliRunner()

    def test_exit_code_zero_for_empty_backlog(self, runner: CliRunner) -> None:
        """AC3: Exit code 0 for EMPTY_BACKLOG_STATE."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "EMPTY_BACKLOG_STATE"}
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0

    def test_exit_code_zero_for_new_work(self, runner: CliRunner) -> None:
        """AC3: Exit code 0 for NEW_WORK_STATE."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "NEW_WORK_STATE"}
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0

    def test_exit_code_zero_for_in_progress(self, runner: CliRunner) -> None:
        """AC3: Exit code 0 for IN_PROGRESS_STATE."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "IN_PROGRESS_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "red",
            }
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0

    def test_exit_code_zero_for_finish_state(self, runner: CliRunner) -> None:
        """AC3: Exit code 0 for FINISH_STATE."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {
                "state": "FINISH_STATE",
                "story_id": "MSSCI-12657",
                "workflow": "tdd",
                "phase": "approved",
            }
            result = runner.invoke(cli, ["workflow", "check"])
            assert result.exit_code == 0

    def test_exit_code_zero_for_json_mode(self, runner: CliRunner) -> None:
        """AC3: Exit code 0 with --json flag."""
        with patch(MOCK_PATH) as mock_state:
            mock_state.return_value = {"state": "EMPTY_BACKLOG_STATE"}
            result = runner.invoke(cli, ["workflow", "check", "--json"])
            assert result.exit_code == 0


class TestGetWorkflowState:
    """Tests for the underlying get_workflow_state function."""

    def test_returns_dict(self) -> None:
        """get_workflow_state should return a dictionary."""
        result = get_workflow_state()
        assert isinstance(result, dict)

    def test_always_has_state_field(self) -> None:
        """get_workflow_state should always return a state field."""
        result = get_workflow_state()
        assert "state" in result

    def test_state_is_valid_value(self) -> None:
        """get_workflow_state should return a valid state value."""
        result = get_workflow_state()
        valid_states = {
            "EMPTY_BACKLOG_STATE",
            "NEW_WORK_STATE",
            "IN_PROGRESS_STATE",
            "FINISH_STATE",
        }
        assert result["state"] in valid_states

    def test_empty_backlog_when_no_session_dir(self, tmp_path: Path) -> None:
        """get_workflow_state should return EMPTY_BACKLOG_STATE when no .session dir."""
        import os

        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            result = get_workflow_state()
            # Without .session directory, should indicate empty or new work
            assert result["state"] in {"EMPTY_BACKLOG_STATE", "NEW_WORK_STATE"}
        finally:
            os.chdir(original_dir)

    def test_new_work_when_empty_session_dir(self, tmp_path: Path) -> None:
        """get_workflow_state should return NEW_WORK_STATE when .session is empty."""
        import os

        session_dir = tmp_path / ".session"
        session_dir.mkdir()

        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            result = get_workflow_state()
            assert result["state"] == "NEW_WORK_STATE"
        finally:
            os.chdir(original_dir)

    def test_in_progress_with_session_file(self, tmp_path: Path) -> None:
        """get_workflow_state should return IN_PROGRESS_STATE with active session."""
        import os

        session_dir = tmp_path / ".session"
        session_dir.mkdir()

        session_file = session_dir / "MSSCI-12657-session.md"
        session_file.write_text(
            """# Story Session: MSSCI-12657

## Story Details
- **Jira:** MSSCI-12657
- **Workflow:** tdd
- **Phase:** red
"""
        )

        original_dir = os.getcwd()
        try:
            os.chdir(tmp_path)
            result = get_workflow_state()
            assert result["state"] == "IN_PROGRESS_STATE"
            assert result.get("story_id") == "MSSCI-12657"
            assert result.get("workflow") == "tdd"
            assert result.get("phase") == "red"
        finally:
            os.chdir(original_dir)


class TestSubprocessExecution:
    """Tests verifying the CLI works as a subprocess (integration)."""

    def test_module_runnable(self) -> None:
        """CLI should be runnable as python -m pf.cli."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "workflow", "check"],
            capture_output=True,
            text=True,
            timeout=30,
            env=_subprocess_env(),
        )
        # Should not crash - exit 0 for any valid state
        assert result.returncode == 0

    def test_module_with_json_flag(self) -> None:
        """CLI should accept --json flag when run as subprocess."""
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pf.cli",
                "workflow",
                "check",
                "--json",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            env=_subprocess_env(),
        )
        assert result.returncode == 0
        # Output should be valid JSON
        parsed = json.loads(result.stdout)
        assert "state" in parsed

    def test_help_flag(self) -> None:
        """CLI should show help with --help flag."""
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pf.cli",
                "workflow",
                "check",
                "--help",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            env=_subprocess_env(),
        )
        assert result.returncode == 0
        assert "workflow state" in result.stdout.lower()
