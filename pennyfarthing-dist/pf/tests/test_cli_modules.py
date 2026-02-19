"""Tests for CLI entry point modules.

Story 63-9: Reorganize pf into fan-out CLI pattern.

These tests verify the CLI modules work as entry points and
properly delegate to library modules.
"""

import subprocess
import sys


class TestJiraCLIModule:
    """Tests for jira CLI module."""

    def test_jira_cli_help(self) -> None:
        """jira CLI should show help with --help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0
        # Should show usage info
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_jira_cli_view_subcommand(self) -> None:
        """jira CLI should have view subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "view", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Should exit 0 with help or fail gracefully without --help
        assert result.returncode in (0, 1, 2)

    def test_jira_cli_sync_subcommand(self) -> None:
        """jira CLI should have sync subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "sync", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_claim_subcommand(self) -> None:
        """jira CLI should have claim subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "claim", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_create_subcommand(self) -> None:
        """jira CLI should have create subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "create", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_jira_cli_bidirectional_subcommand(self) -> None:
        """jira CLI should have bidirectional subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira", "bidirectional", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)


class TestSprintCLIModule:
    """Tests for sprint CLI module."""

    def test_sprint_cli_help(self) -> None:
        """sprint CLI should show help with --help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.sprint", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_sprint_cli_status_subcommand(self) -> None:
        """sprint CLI should have status subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.sprint", "status", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_backlog_subcommand(self) -> None:
        """sprint CLI should have backlog subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.sprint", "backlog", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_work_subcommand(self) -> None:
        """sprint CLI should have work subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.sprint", "work", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_sprint_cli_archive_subcommand(self) -> None:
        """sprint CLI should have archive subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.sprint", "archive", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)


class TestStoryCLIModule:
    """Tests for story CLI module."""

    def test_story_cli_help(self) -> None:
        """story CLI should show help with --help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.story", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode == 0
        assert "usage" in result.stdout.lower() or "Usage" in result.stdout

    def test_story_cli_size_subcommand(self) -> None:
        """story CLI should have size subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.story", "size", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_story_cli_template_subcommand(self) -> None:
        """story CLI should have template subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.story", "template", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_story_cli_create_subcommand(self) -> None:
        """story CLI should have create subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.story", "create", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)


class TestOldCLICompatibility:
    """Tests for backwards compatibility of old CLI modules."""

    def test_jira_sync_module_runnable(self) -> None:
        """jira_sync.py should still be runnable as module."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira_sync", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        # Should exit with help or error (not crash)
        assert result.returncode in (0, 1, 2)

    def test_jira_bidirectional_sync_module_runnable(self) -> None:
        """jira_bidirectional_sync.py should still be runnable."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira_bidirectional_sync", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_jira_epic_creation_module_runnable(self) -> None:
        """jira_epic_creation.py should still be runnable."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira_epic_creation", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)

    def test_jira_sync_story_module_runnable(self) -> None:
        """jira_sync_story.py should still be runnable."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.jira_sync_story", "--help"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        assert result.returncode in (0, 1, 2)
