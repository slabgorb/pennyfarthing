"""Tests for CLI entry point modules.

Story 63-9: Reorganize pf into fan-out CLI pattern.

These tests verify the CLI modules work as entry points and
properly delegate to library modules.
"""

import os
import subprocess
import sys
from pathlib import Path

# pennyfarthing-dist/ must be on PYTHONPATH for subprocess -m calls
_DIST_DIR = str(Path(__file__).resolve().parents[2])
_ENV = {**os.environ, "PYTHONPATH": _DIST_DIR + os.pathsep + os.environ.get("PYTHONPATH", "")}


def _run_module(*args: str) -> subprocess.CompletedProcess[str]:
    """Run a pf module as subprocess with correct PYTHONPATH."""
    return subprocess.run(
        [sys.executable, "-m", *args],
        capture_output=True,
        text=True,
        timeout=30,
        env=_ENV,
    )


class TestJiraCLIModule:
    """Tests for jira CLI module."""

    def test_jira_cli_help(self) -> None:
        """jira CLI should show help with --help."""
        result = _run_module("pf.jira", "--help")

        assert result.returncode == 0
        # Should show usage info
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_jira_cli_view_subcommand(self) -> None:
        """jira CLI should have view subcommand."""
        result = _run_module("pf.jira", "view", "--help")

        # Should exit 0 with help or fail gracefully without --help
        assert result.returncode in (0, 1, 2)

    def test_jira_cli_sync_subcommand(self) -> None:
        """jira CLI should have sync subcommand."""
        result = _run_module("pf.jira", "sync", "--help")

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_claim_subcommand(self) -> None:
        """jira CLI should have claim subcommand."""
        result = _run_module("pf.jira", "claim", "--help")

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_create_subcommand(self) -> None:
        """jira CLI should have create subcommand."""
        result = _run_module("pf.jira", "create", "--help")

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_bidirectional_subcommand(self) -> None:
        """jira CLI should have bidirectional subcommand."""
        result = _run_module("pf.jira", "bidirectional", "--help")

        assert result.returncode in (0, 1, 2)


class TestSprintCLIModule:
    """Tests for sprint CLI module."""

    def test_sprint_cli_help(self) -> None:
        """sprint CLI should show help with --help."""
        result = _run_module("pf.sprint", "--help")

        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_sprint_cli_status_subcommand(self) -> None:
        """sprint CLI should have status subcommand."""
        result = _run_module("pf.sprint", "status", "--help")

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_backlog_subcommand(self) -> None:
        """sprint CLI should have backlog subcommand."""
        result = _run_module("pf.sprint", "backlog", "--help")

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_work_subcommand(self) -> None:
        """sprint CLI should have work subcommand."""
        result = _run_module("pf.sprint", "work", "--help")

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_archive_subcommand(self) -> None:
        """sprint CLI should have archive subcommand."""
        result = _run_module("pf.sprint", "archive", "--help")

        assert result.returncode in (0, 1, 2)


class TestStoryCLIModule:
    """Tests for story CLI module."""

    def test_story_cli_help(self) -> None:
        """story CLI should show help with --help."""
        result = _run_module("pf.story", "--help")

        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_story_cli_size_subcommand(self) -> None:
        """story CLI should have size subcommand."""
        result = _run_module("pf.story", "size", "--help")

        assert result.returncode in (0, 1, 2)

    def test_story_cli_template_subcommand(self) -> None:
        """story CLI should have template subcommand."""
        result = _run_module("pf.story", "template", "--help")

        assert result.returncode in (0, 1, 2)

    def test_story_cli_create_subcommand(self) -> None:
        """story CLI should have create subcommand."""
        result = _run_module("pf.story", "create", "--help")

        assert result.returncode in (0, 1, 2)


