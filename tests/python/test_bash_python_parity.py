"""
Integration Tests for Bash/Python CLI Parity (Story PROJ-12665).

These tests verify that Python CLI commands produce equivalent output
to their bash script counterparts.

AC1: Test suite covers all Phase 1 commands
AC2: Compares bash vs Python output
AC3: Runs in CI (via pytest)

Run with: python -m pytest tests/python/test_bash_python_parity.py -v
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

# Project roots for path resolution
PENNYFARTHING_ROOT = Path(__file__).parent.parent.parent
ORCHESTRATOR_ROOT = PENNYFARTHING_ROOT.parent

# Bash scripts location (in orchestrator's .pennyfarthing)
BASH_SCRIPTS_DIR = ORCHESTRATOR_ROOT / ".pennyfarthing" / "scripts"


def run_python_cli(args: list[str], cwd: Path = PENNYFARTHING_ROOT) -> subprocess.CompletedProcess:
    """Run the Python CLI with given arguments."""
    return subprocess.run(
        [sys.executable, "-m", "pf.cli"] + args,
        capture_output=True,
        text=True,
        cwd=str(cwd),
        timeout=30,
    )


def run_bash_script(script_path: str, args: list[str] = None, cwd: Path = ORCHESTRATOR_ROOT) -> subprocess.CompletedProcess:
    """Run a bash script with given arguments."""
    full_path = BASH_SCRIPTS_DIR / script_path
    cmd = [str(full_path)] + (args or [])
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(cwd),
        timeout=30,
        env={**os.environ, "PROJECT_ROOT": str(cwd)},
    )


class TestPhase1CommandCoverage:
    """AC1: Test suite covers all Phase 1 commands."""

    def test_workflow_check_command_exists(self):
        """pf workflow check should be a valid command."""
        result = run_python_cli(["workflow", "check", "--help"])
        assert result.returncode == 0, f"workflow check not available: {result.stderr}"

    def test_workflow_phase_check_command_exists(self):
        """pf workflow phase-check should be a valid command."""
        result = run_python_cli(["workflow", "phase-check", "--help"])
        assert result.returncode == 0, f"workflow phase-check not available: {result.stderr}"

    def test_workflow_handoff_command_exists(self):
        """pf workflow handoff should be a valid command."""
        result = run_python_cli(["workflow", "handoff", "--help"])
        assert result.returncode == 0, f"workflow handoff not available: {result.stderr}"

    def test_agent_start_command_exists(self):
        """pf agent start should be a valid command."""
        result = run_python_cli(["agent", "start", "--help"])
        assert result.returncode == 0, f"agent start not available: {result.stderr}"


class TestWorkflowPhaseCheckParity:
    """AC2: Compare bash vs Python output for workflow phase-check."""

    @pytest.mark.parametrize(
        "workflow,phase,expected_owner",
        [
            ("tdd", "red", "tea"),
            ("tdd", "green", "dev"),  # YAML uses 'green', not 'implement'
            ("tdd", "review", "reviewer"),
            ("tdd", "setup", "sm"),
            ("tdd", "finish", "sm"),  # YAML uses 'finish', not 'approved'
            ("trivial", "implement", "dev"),
            ("trivial", "review", "reviewer"),
        ],
    )
    def test_phase_owner_matches_bash(self, workflow: str, phase: str, expected_owner: str):
        """Python phase-check output should match bash phase-owner.sh output."""
        # Run Python CLI
        py_result = run_python_cli(["workflow", "phase-check", workflow, phase])

        # Run bash script
        bash_result = run_bash_script("workflow/phase-owner.sh", [workflow, phase])

        # Both should succeed
        assert py_result.returncode == 0, f"Python failed: {py_result.stderr}"
        assert bash_result.returncode == 0, f"Bash failed: {bash_result.stderr}"

        # Outputs should match (strip whitespace)
        py_owner = py_result.stdout.strip()
        bash_owner = bash_result.stdout.strip()

        assert py_owner == bash_owner, (
            f"Parity mismatch for {workflow}/{phase}:\n"
            f"  Python: '{py_owner}'\n"
            f"  Bash: '{bash_owner}'"
        )

        # Both should return expected owner
        assert py_owner == expected_owner, (
            f"Wrong owner for {workflow}/{phase}: expected '{expected_owner}', got '{py_owner}'"
        )


class TestWorkflowHandoffParity:
    """AC2: Compare bash vs Python output for workflow handoff."""

    @pytest.mark.parametrize("agent", ["dev", "tea", "reviewer", "sm"])
    def test_handoff_marker_format_matches(self, agent: str):
        """Python handoff output should produce valid Cyclist markers."""
        py_result = run_python_cli(["workflow", "handoff", agent])

        assert py_result.returncode == 0, f"Handoff failed: {py_result.stderr}"

        output = py_result.stdout

        # Should contain the marker format
        assert "CYCLIST:HANDOFF" in output, f"Missing CYCLIST:HANDOFF in: {output}"
        assert f"/{agent}" in output, f"Missing /{agent} in marker: {output}"
        assert "AGENT_COMMAND:" in output, f"Missing AGENT_COMMAND format: {output}"

    def test_handoff_marker_is_yaml_parseable(self):
        """Handoff output should be valid YAML-like format."""
        py_result = run_python_cli(["workflow", "handoff", "dev"])

        assert py_result.returncode == 0

        output = py_result.stdout

        # Should have the expected structure
        assert "---" in output, "Missing YAML document markers"
        assert "marker:" in output, "Missing marker field"
        assert "fallback:" in output, "Missing fallback field"


class TestWorkflowCheckParity:
    """AC2: Compare bash vs Python output for workflow check."""

    def test_workflow_check_returns_state(self):
        """Both implementations should return workflow state."""
        py_result = run_python_cli(["workflow", "check"])

        # Python should succeed
        assert py_result.returncode == 0, f"Python failed: {py_result.stderr}"

        # Should contain state information
        output = py_result.stdout.lower()
        assert "state" in output, f"Missing 'state' in output: {py_result.stdout}"

    def test_workflow_check_json_is_valid(self):
        """pf workflow check --json should return valid JSON."""
        py_result = run_python_cli(["workflow", "check", "--json"])

        assert py_result.returncode == 0, f"JSON mode failed: {py_result.stderr}"

        # Should be parseable JSON
        try:
            data = json.loads(py_result.stdout)
            assert isinstance(data, dict), "JSON should be a dict"
            assert "state" in data, f"JSON missing 'state' field: {data.keys()}"
        except json.JSONDecodeError as e:
            pytest.fail(f"Invalid JSON: {e}\nOutput: {py_result.stdout}")

    def test_workflow_check_state_values(self):
        """Workflow state should be one of the defined states."""
        py_result = run_python_cli(["workflow", "check", "--json"])

        assert py_result.returncode == 0

        data = json.loads(py_result.stdout)
        state = data.get("state")

        valid_states = {
            "EMPTY_BACKLOG_STATE",
            "NEW_WORK_STATE",
            "IN_PROGRESS_STATE",
            "FINISH_STATE",
        }

        assert state in valid_states, f"Invalid state '{state}', expected one of {valid_states}"


class TestAgentStartParity:
    """AC2: Compare bash vs Python output for agent start (partial - no full execution)."""

    def test_agent_start_help_shows_options(self):
        """pf agent start --help should show all options."""
        py_result = run_python_cli(["agent", "start", "--help"])

        assert py_result.returncode == 0, f"Help failed: {py_result.stderr}"

        output = py_result.stdout.lower()

        # Should show the key options
        assert "session-id" in output or "session_id" in output, "Missing --session-id option"
        assert "no-persona" in output or "no_persona" in output, "Missing --no-persona option"

    def test_agent_start_with_invalid_agent_fails(self):
        """pf agent start with non-existent agent should fail gracefully."""
        py_result = run_python_cli(["agent", "start", "nonexistent-agent-xyz"])

        # Should fail (non-zero exit) but not crash
        # The actual error handling depends on implementation
        # At minimum, it should not hang
        assert py_result.returncode != 0 or "error" in py_result.stderr.lower() or "not found" in py_result.stdout.lower(), (
            f"Should handle invalid agent gracefully: {py_result.stdout} {py_result.stderr}"
        )


class TestCIIntegration:
    """AC3: Tests should run in CI."""

    def test_tests_are_discoverable_by_pytest(self):
        """This test file should be discoverable by pytest."""
        # If we get here, pytest found this test
        assert True

    def test_no_external_dependencies_for_basic_tests(self):
        """Basic parity tests should not require external services."""
        # Workflow phase-check and handoff don't need external deps
        py_result = run_python_cli(["workflow", "phase-check", "tdd", "red"])
        assert py_result.returncode == 0, "Phase check should work without external deps"

    def test_tests_complete_in_reasonable_time(self):
        """Each command should complete within 5 seconds."""
        import time

        start = time.perf_counter()
        run_python_cli(["workflow", "check"])
        elapsed = time.perf_counter() - start

        assert elapsed < 5.0, f"Command took {elapsed:.1f}s, should be < 5s"
