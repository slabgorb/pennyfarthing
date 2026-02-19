"""
Tests for Sprint CLI Click migration (Story MSSCI-12662).

These tests verify that sprint commands use Click decorators and are
registered with the main pf CLI group.

Run with: python -m pytest tests/python/test_sprint_cli.py -v
"""

import subprocess
import sys
import time
from pathlib import Path

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestSprintGroupRegistration:
    """AC2: Sprint group registered with main pf CLI."""

    def test_sprint_group_in_main_cli_help(self):
        """Main CLI --help should show sprint command group."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"CLI failed: {result.stderr}"
        # Sprint should appear as a command group (not just "coming soon")
        assert "sprint" in result.stdout.lower(), "sprint group not shown in main CLI help"
        # Should NOT say "coming soon" anymore
        assert "coming soon" not in result.stdout.lower(), "sprint still marked as 'coming soon'"

    def test_pf_sprint_help_works(self):
        """pf sprint --help should show sprint subcommands."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()

    def test_sprint_shows_subcommands_in_help(self):
        """pf sprint --help should list status, backlog, work, archive, story, epic."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        output_lower = result.stdout.lower()
        assert "status" in output_lower, "status subcommand not shown"
        assert "backlog" in output_lower, "backlog subcommand not shown"
        assert "work" in output_lower, "work subcommand not shown"
        assert "archive" in output_lower, "archive subcommand not shown"
        assert "story" in output_lower, "story subgroup not shown"
        assert "epic" in output_lower, "epic subgroup not shown"


class TestSprintClickDecorators:
    """AC1: Sprint commands use @click.command() decorators."""

    def test_sprint_cli_uses_click_group(self):
        """sprint CLI should use @click.group() decorator."""
        cli_file = PROJECT_ROOT / "pf" / "sprint" / "cli.py"
        assert cli_file.exists(), "sprint/cli.py not found"

        source = cli_file.read_text()
        # Should have @click.group() for the sprint group
        assert "@click.group" in source, "sprint CLI should use @click.group()"

    def test_sprint_cli_uses_click_command(self):
        """Sprint subcommands should use @click.command() decorator."""
        cli_file = PROJECT_ROOT / "pf" / "sprint" / "cli.py"
        assert cli_file.exists(), "sprint/cli.py not found"

        source = cli_file.read_text()
        # Should have @click.command() for subcommands
        assert "@click.command" in source or ".command(" in source, (
            "sprint CLI should use @click.command() for subcommands"
        )

    def test_sprint_cli_no_argparse(self):
        """Sprint CLI should not use argparse anymore."""
        cli_file = PROJECT_ROOT / "pf" / "sprint" / "cli.py"
        assert cli_file.exists(), "sprint/cli.py not found"

        source = cli_file.read_text()
        # argparse should be removed
        assert "import argparse" not in source, "argparse should be removed"
        assert "ArgumentParser" not in source, "ArgumentParser should be removed"

    def test_sprint_cli_imports_click(self):
        """Sprint CLI should import click."""
        cli_file = PROJECT_ROOT / "pf" / "sprint" / "cli.py"
        assert cli_file.exists(), "sprint/cli.py not found"

        source = cli_file.read_text()
        assert "import click" in source, "sprint CLI should import click"


class TestSprintSubcommandExecution:
    """Test that sprint subcommands are runnable via main CLI."""

    def test_pf_sprint_status_runs(self):
        """pf sprint status should run without error."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "status"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        # May fail due to missing sprint yaml, but should not fail with "unknown command"
        # Success is returncode 0 OR error message that's not about unknown command
        if result.returncode != 0:
            assert "no such command" not in result.stderr.lower(), (
                f"status not registered as command: {result.stderr}"
            )
            assert "error: no such option" not in result.stderr.lower(), (
                f"status not registered as command: {result.stderr}"
            )

    def test_pf_sprint_backlog_runs(self):
        """pf sprint backlog should run without error."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "backlog"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30,
        )
        if result.returncode != 0:
            assert "no such command" not in result.stderr.lower(), (
                f"backlog not registered as command: {result.stderr}"
            )

    def test_pf_sprint_work_help(self):
        """pf sprint work --help should show help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "work", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"work --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()

    def test_pf_sprint_archive_help(self):
        """pf sprint archive --help should show help."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "archive", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"archive --help failed: {result.stderr}"
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()


class TestSprintStartupPerformance:
    """Verify sprint migration doesn't break startup time requirement."""

    def test_sprint_startup_under_200ms(self):
        """pf sprint --help should complete in under 200ms."""
        times = []
        for _ in range(3):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "sprint", "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            elapsed = (time.perf_counter() - start) * 1000  # ms
            if result.returncode == 0:
                times.append(elapsed)

        assert len(times) > 0, "sprint --help failed to run"
        avg_time = sum(times) / len(times)
        assert avg_time < 200, f"sprint --help took {avg_time:.1f}ms, should be < 200ms"

    def test_main_cli_startup_still_under_200ms(self):
        """Main CLI startup should still be under 200ms after sprint integration."""
        times = []
        for _ in range(3):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            elapsed = (time.perf_counter() - start) * 1000  # ms
            if result.returncode == 0:
                times.append(elapsed)

        assert len(times) > 0, "Main CLI --help failed to run"
        avg_time = sum(times) / len(times)
        assert avg_time < 200, f"Main CLI took {avg_time:.1f}ms, should be < 200ms"
