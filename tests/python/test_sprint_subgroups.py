"""
Tests for Sprint CLI subgroups (story and epic).

Verifies that the story and epic Click subgroups are properly registered
and accessible, including backwards compatibility aliases.

Run with: python -m pytest tests/python/test_sprint_subgroups.py -v
"""

import subprocess
import sys
import time
from pathlib import Path

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestStorySubgroupHelp:
    """Test sprint story subgroup shows all subcommands."""

    def test_story_help_shows_subcommands(self):
        """pf sprint story --help should show all subcommands."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story --help failed: {result.stderr}"
        output_lower = result.stdout.lower()
        assert "show" in output_lower, "show subcommand not shown"
        assert "add" in output_lower, "add subcommand not shown"
        assert "update" in output_lower, "update subcommand not shown"
        assert "size" in output_lower, "size subcommand not shown"
        assert "template" in output_lower, "template subcommand not shown"
        assert "finish" in output_lower, "finish subcommand not shown"
        assert "claim" in output_lower, "claim subcommand not shown"


class TestEpicSubgroupHelp:
    """Test sprint epic subgroup shows all subcommands."""

    def test_epic_help_shows_subcommands(self):
        """pf sprint epic --help should show all subcommands."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "epic", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"epic --help failed: {result.stderr}"
        output_lower = result.stdout.lower()
        assert "add" in output_lower, "add subcommand not shown"
        assert "promote" in output_lower, "promote subcommand not shown"
        assert "archive" in output_lower, "archive subcommand not shown"
        assert "import" in output_lower, "import subcommand not shown"
        assert "remove" in output_lower, "remove subcommand not shown"


class TestStorySizeCommand:
    """Test sprint story size returns guidelines."""

    def test_story_size_returns_guidelines(self):
        """pf sprint story size should output sizing guidelines."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "size"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story size failed: {result.stderr}"
        output = result.stdout
        assert "Trivial" in output or "trivial" in output.lower(), "Should show Trivial scale"
        assert "Medium" in output or "medium" in output.lower(), "Should show Medium scale"

    def test_story_size_with_points(self):
        """pf sprint story size 3 should show specific guidance."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "size", "3"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story size 3 failed: {result.stderr}"
        assert "3 points" in result.stdout or "Small" in result.stdout, (
            f"Should show 3-point guidance: {result.stdout}"
        )


class TestStoryTemplateCommand:
    """Test sprint story template returns templates."""

    def test_story_template_lists_all(self):
        """pf sprint story template should list all templates."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "template"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story template failed: {result.stderr}"
        output_lower = result.stdout.lower()
        assert "feature" in output_lower, "feature template not listed"
        assert "bug" in output_lower, "bug template not listed"

    def test_story_template_specific_type(self):
        """pf sprint story template bug should show bug template."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "story", "template", "bug"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"story template bug failed: {result.stderr}"
        assert "bug" in result.stdout.lower(), "Bug template not shown"


RETIRED_ALIASES = ["story-add", "story-update", "epic-add", "archive-epic"]


class TestRetiredHyphenatedAliases:
    """The old hyphenated aliases have been removed, not merely hidden.

    162-30: this class was `TestBackwardsCompatAliases` and asserted that
    `pf sprint story-add|story-update|epic-add|archive-epic --help` each still
    exited 0. They no longer exist — `pf sprint --help` lists only the subgroup
    form (`story`, `epic`, ...) and each hyphenated name now exits 2 with
    "No such command". The deprecation cycle those aliases existed to cover has
    completed, so the four "alias still works" tests pin removed behavior and are
    replaced by their inverse plus a positive check that the subgroup form (the
    surface the aliases forwarded to) is the one that answers.
    """

    def test_retired_aliases_are_rejected(self):
        """Each retired alias must fail as an unknown command, not silently work."""
        still_alive = []
        for alias in RETIRED_ALIASES:
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "sprint", alias, "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            if result.returncode == 0:
                still_alive.append(alias)
            else:
                assert "No such command" in result.stderr, (
                    f"'{alias}' failed for an unexpected reason: {result.stderr}"
                )
        assert still_alive == [], (
            f"Retired hyphenated aliases are still accepted: {still_alive}"
        )

    def test_subgroup_form_answers_instead(self):
        """The surface the aliases forwarded to must be reachable."""
        for args in (["story", "add"], ["story", "update"], ["epic", "add"], ["epic", "archive"]):
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "sprint", *args, "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            assert result.returncode == 0, (
                f"pf sprint {' '.join(args)} --help failed: {result.stderr}"
            )
            assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()

    def test_hidden_aliases_not_in_help(self):
        """Hidden aliases should not appear in sprint --help output."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        assert "story-add" not in result.stdout, "story-add alias visible in help"
        assert "story-update" not in result.stdout, "story-update alias visible in help"
        assert "epic-add" not in result.stdout, "epic-add alias visible in help"


class TestSubgroupStartupPerformance:
    """Verify subgroups don't break startup time."""

    def test_subgroups_under_200ms(self):
        """pf sprint --help should complete in under 200ms with subgroups."""
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
