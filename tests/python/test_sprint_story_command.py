"""
Tests for Sprint Story Command (Story MSSCI-12664).

These tests verify that `pf sprint story <id>` returns story details
and supports JSON output.

Run with: python -m pytest tests/python/test_sprint_story_command.py -v
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestSprintStoryCommandRegistration:
    """Test that story subcommand is registered with sprint group."""

    def test_story_command_in_sprint_help(self):
        """AC1: pf sprint --help should show story subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        assert "story" in result.stdout.lower(), "story subcommand not shown in sprint --help"

    def test_story_command_has_help(self):
        """pf sprint story --help should show usage."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()


class TestSprintStoryTextOutput:
    """AC1: pf sprint story 67-1 returns story details."""

    def test_story_command_returns_story_details(self):
        """Story command should return basic story details."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        # Command MUST succeed
        assert result.returncode == 0, f"story command failed: {result.stderr}"
        output = result.stdout.lower()
        # Should show story ID somewhere in output
        assert "mssci-12664" in output or "12664" in output, (
            f"Story ID not in output: {result.stdout}"
        )

    def test_story_command_shows_title(self):
        """Story command should show story title."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story command failed: {result.stderr}"
        # Should show title field
        assert "title" in result.stdout.lower() or "implement" in result.stdout.lower(), (
            f"Title not shown in output: {result.stdout}"
        )

    def test_story_command_shows_points(self):
        """Story command should show story points."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story command failed: {result.stderr}"
        # Should show points
        assert "points" in result.stdout.lower() or "1" in result.stdout, (
            f"Points not shown in output: {result.stdout}"
        )

    def test_story_command_shows_status(self):
        """Story command should show story status."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story command failed: {result.stderr}"
        # Should show status field
        assert "status" in result.stdout.lower(), (
            f"Status not shown in output: {result.stdout}"
        )


class TestSprintStoryJsonOutput:
    """AC2: --json flag for structured output."""

    def test_json_flag_returns_valid_json(self):
        """pf sprint story MSSCI-12664 --json should return valid JSON."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story --json command failed: {result.stderr}"
        # Should be valid JSON
        try:
            data = json.loads(result.stdout)
            assert isinstance(data, dict), "JSON output should be a dict"
        except json.JSONDecodeError as e:
            pytest.fail(f"Invalid JSON output: {e}\nOutput: {result.stdout}")

    def test_json_output_has_id_field(self):
        """JSON output should have id field."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story --json command failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "id" in data, f"JSON missing 'id' field: {data.keys()}"

    def test_json_output_has_title_field(self):
        """JSON output should have title field."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story --json command failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "title" in data, f"JSON missing 'title' field: {data.keys()}"

    def test_json_output_has_points_field(self):
        """JSON output should have points field."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story --json command failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "points" in data, f"JSON missing 'points' field: {data.keys()}"

    def test_json_output_has_status_field(self):
        """JSON output should have status field."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "MSSCI-12664", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        assert result.returncode == 0, f"story --json command failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "status" in data, f"JSON missing 'status' field: {data.keys()}"


class TestSprintStoryErrorHandling:
    """Test error cases for story command."""

    def test_story_not_found_error(self):
        """Nonexistent story ID should return error."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "NONEXISTENT-99999"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        # Command should exist but fail gracefully with error message
        # First verify the command itself exists (returncode 2 means "no such command")
        assert "no such command" not in result.stderr.lower(), (
            "story command not registered - implement the command first"
        )
        # Then check for proper error handling
        combined = (result.stdout + result.stderr).lower()
        assert result.returncode != 0 or "not found" in combined, (
            f"Should report error for nonexistent story: {combined}"
        )

    def test_missing_story_id_shows_usage(self):
        """Missing story ID should show usage or error."""
        result = subprocess.run(
            [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        # First verify the command itself exists
        assert "no such command" not in result.stderr.lower(), (
            "story command not registered - implement the command first"
        )
        # Should either error or show usage
        combined = (result.stdout + result.stderr).lower()
        assert (
            result.returncode != 0 or
            "usage" in combined or
            "missing" in combined or
            "required" in combined
        ), f"Should indicate missing argument: {combined}"


class TestSprintStoryStartupPerformance:
    """Verify story command doesn't break startup time."""

    def test_story_help_under_200ms(self):
        """pf sprint story --help should complete in under 200ms."""
        times = []
        for _ in range(3):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, "-m", "pennyfarthing_scripts.cli", "sprint", "story", "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            elapsed = (time.perf_counter() - start) * 1000  # ms
            # Command MUST succeed for performance test
            assert result.returncode == 0, f"story --help failed: {result.stderr}"
            times.append(elapsed)

        avg_time = sum(times) / len(times)
        assert avg_time < 200, f"story --help took {avg_time:.1f}ms, should be < 200ms"
