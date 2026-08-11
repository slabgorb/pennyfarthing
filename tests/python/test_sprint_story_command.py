"""
Tests for Sprint Story Command.

These tests verify that `pf sprint story show <id>` returns story details
and supports JSON output. Data-dependent tests use PROJ-00000 test fixture.

Run with: python -m pytest tests/python/test_sprint_story_command.py -v
"""

import json
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner
from pf.sprint.cli import sprint

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Test fixture: obviously fake story for data-dependent tests
TEST_STORY = {
    "id": "00-1",
    "jira": "PROJ-00000",
    "title": "Test story for unit tests",
    "points": 3,
    "status": "backlog",
    "priority": "P2",
    "workflow": "tdd",
}


def _mock_get_story_by_id(story_id):
    """Return test fixture for PROJ-00000, None otherwise."""
    if story_id in ("PROJ-00000", "00-1"):
        return TEST_STORY.copy()
    return None


class TestSprintStoryCommandRegistration:
    """Test that story subgroup is registered with sprint group."""

    def test_story_command_in_sprint_help(self):
        """pf sprint --help should show story subgroup."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        assert "story" in result.stdout.lower(), "story subgroup not shown in sprint --help"

    def test_story_command_has_help(self):
        """pf sprint story --help should show subcommands."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()

    def test_story_show_command_has_help(self):
        """pf sprint story show --help should show usage."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "show", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story show --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()


class TestSprintStoryTextOutput:
    """Test story show text output with PROJ-00000 test fixture."""

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_story_command_returns_story_details(self, mock_fn):
        """Story show command should return basic story details."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000"])
        assert result.exit_code == 0, f"story show failed: {result.output}"
        output = result.output.lower()
        assert "proj-00000" in output or "00-1" in output, (
            f"Story ID not in output: {result.output}"
        )

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_story_command_shows_title(self, mock_fn):
        """Story show command should show story title."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000"])
        assert result.exit_code == 0, f"story show failed: {result.output}"
        assert "title" in result.output.lower(), (
            f"Title not shown in output: {result.output}"
        )

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_story_command_shows_points(self, mock_fn):
        """Story show command should show story points."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000"])
        assert result.exit_code == 0, f"story show failed: {result.output}"
        assert "points" in result.output.lower(), (
            f"Points not shown in output: {result.output}"
        )

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_story_command_shows_status(self, mock_fn):
        """Story show command should show story status."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000"])
        assert result.exit_code == 0, f"story show failed: {result.output}"
        assert "status" in result.output.lower(), (
            f"Status not shown in output: {result.output}"
        )


class TestSprintStoryJsonOutput:
    """Test --json flag for structured output with PROJ-00000 test fixture."""

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_json_flag_returns_valid_json(self, mock_fn):
        """sprint story show PROJ-00000 --json should return valid JSON."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000", "--json"])
        assert result.exit_code == 0, f"story show --json failed: {result.output}"
        try:
            data = json.loads(result.output)
            assert isinstance(data, dict), "JSON output should be a dict"
        except json.JSONDecodeError as e:
            pytest.fail(f"Invalid JSON output: {e}\nOutput: {result.output}")

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_json_output_has_id_field(self, mock_fn):
        """JSON output should have id field."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000", "--json"])
        assert result.exit_code == 0, f"story show --json failed: {result.output}"
        data = json.loads(result.output)
        assert "id" in data, f"JSON missing 'id' field: {data.keys()}"

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_json_output_has_title_field(self, mock_fn):
        """JSON output should have title field."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000", "--json"])
        assert result.exit_code == 0, f"story show --json failed: {result.output}"
        data = json.loads(result.output)
        assert "title" in data, f"JSON missing 'title' field: {data.keys()}"

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_json_output_has_points_field(self, mock_fn):
        """JSON output should have points field."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000", "--json"])
        assert result.exit_code == 0, f"story show --json failed: {result.output}"
        data = json.loads(result.output)
        assert "points" in data, f"JSON missing 'points' field: {data.keys()}"

    @patch("pf.sprint.loader.get_story_by_id", side_effect=_mock_get_story_by_id)
    def test_json_output_has_status_field(self, mock_fn):
        """JSON output should have status field."""
        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "show", "PROJ-00000", "--json"])
        assert result.exit_code == 0, f"story show --json failed: {result.output}"
        data = json.loads(result.output)
        assert "status" in data, f"JSON missing 'status' field: {data.keys()}"


class TestSprintStoryErrorHandling:
    """Test error cases for story show command."""

    def test_story_not_found_error(self):
        """Nonexistent story PROJ-00000 should return error when not mocked."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "show", "PROJ-00000"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert "no such command" not in result.stderr.lower(), (
            "story show command not registered"
        )
        combined = (result.stdout + result.stderr).lower()
        assert result.returncode != 0 or "not found" in combined, (
            f"Should report error for nonexistent story: {combined}"
        )

    def test_missing_story_id_shows_usage(self):
        """Missing story ID for show should show usage or error."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "show"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert "no such command" not in result.stderr.lower(), (
            "story show command not registered"
        )
        combined = (result.stdout + result.stderr).lower()
        assert (
            result.returncode != 0 or
            "usage" in combined or
            "missing" in combined or
            "required" in combined
        ), f"Should indicate missing argument: {combined}"


class TestSprintStoryGroupHelp:
    """Test that story group without subcommand shows help."""

    def test_story_no_args_shows_help(self):
        """pf sprint story (no args) should show subcommand list."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        combined = (result.stdout + result.stderr).lower()
        assert "show" in combined, "story group should list 'show' subcommand"
        assert "add" in combined, "story group should list 'add' subcommand"
        assert "size" in combined, "story group should list 'size' subcommand"


class TestSprintStoryStartupPerformance:
    """Verify story command doesn't break startup time."""

    def test_story_help_under_200ms(self):
        """pf sprint story --help should complete in under 200ms."""
        times = []
        for _ in range(3):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "sprint", "story", "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            elapsed = (time.perf_counter() - start) * 1000  # ms
            assert result.returncode == 0, f"story --help failed: {result.stderr}"
            times.append(elapsed)

        avg_time = sum(times) / len(times)
        assert avg_time < 200, f"story --help took {avg_time:.1f}ms, should be < 200ms"
