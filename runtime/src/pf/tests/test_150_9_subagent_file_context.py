"""Tests for reviewer subagent file context mode (150-9).

Verifies the SUBAGENT_FILE_CONTEXT registry and utility functions
that determine which subagents need full file contents vs just diffs.
"""

from __future__ import annotations

from unittest.mock import patch, MagicMock
import subprocess

import pytest

from pf.reviewer.diff_mode import (
    SUBAGENT_DIFF_MODES,
    SUBAGENT_FILE_CONTEXT,
    needs_file_context,
    get_changed_files,
)


class TestSubagentFileContextRegistry:
    """SUBAGENT_FILE_CONTEXT registry exists and is well-formed."""

    def test_registry_exists(self):
        """SUBAGENT_FILE_CONTEXT is a dict[str, bool]."""
        assert isinstance(SUBAGENT_FILE_CONTEXT, dict)
        for key, value in SUBAGENT_FILE_CONTEXT.items():
            assert isinstance(key, str), f"Key {key!r} is not a string"
            assert isinstance(value, bool), f"Value for {key!r} is not a bool"

    def test_all_nine_subagents_mapped(self):
        """Every key in SUBAGENT_DIFF_MODES has a corresponding entry."""
        assert set(SUBAGENT_FILE_CONTEXT.keys()) == set(SUBAGENT_DIFF_MODES.keys())

    def test_exactly_nine_entries(self):
        """Registry has exactly 9 entries."""
        assert len(SUBAGENT_FILE_CONTEXT) == 9


class TestFileContextAssignments:
    """Correct True/False assignments per the story spec."""

    @pytest.mark.parametrize(
        "subagent",
        [
            "reviewer-security",
            "reviewer-edge-hunter",
            "reviewer-test-analyzer",
            "reviewer-rule-checker",
        ],
    )
    def test_needs_full_file_context(self, subagent: str):
        """Cross-file analysis specialists need full file context."""
        assert SUBAGENT_FILE_CONTEXT[subagent] is True

    @pytest.mark.parametrize(
        "subagent",
        [
            "reviewer-simplifier",
            "reviewer-comment-analyzer",
            "reviewer-type-design",
            "reviewer-silent-failure-hunter",
            "reviewer-preflight",
        ],
    )
    def test_does_not_need_full_file_context(self, subagent: str):
        """Localized analysis specialists do not need full file context."""
        assert SUBAGENT_FILE_CONTEXT[subagent] is False


class TestNeedsFileContext:
    """needs_file_context() convenience function."""

    def test_returns_true_for_security(self):
        assert needs_file_context("reviewer-security") is True

    def test_returns_false_for_simplifier(self):
        assert needs_file_context("reviewer-simplifier") is False

    def test_returns_false_for_preflight(self):
        assert needs_file_context("reviewer-preflight") is False

    def test_unknown_subagent_raises_key_error(self):
        with pytest.raises(KeyError):
            needs_file_context("reviewer-nonexistent")


class TestGetChangedFiles:
    """get_changed_files() runs git diff --name-only and returns file paths."""

    @patch("pf.reviewer.diff_mode.subprocess.run")
    def test_returns_file_list(self, mock_run: MagicMock):
        mock_run.return_value = MagicMock(
            stdout="src/main.py\nsrc/lib.py\ntests/test_main.py\n",
            returncode=0,
        )
        result = get_changed_files("develop")
        assert result == ["src/main.py", "src/lib.py", "tests/test_main.py"]
        mock_run.assert_called_once_with(
            ["git", "diff", "--name-only", "develop...HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=None,
        )

    @patch("pf.reviewer.diff_mode.subprocess.run")
    def test_filters_empty_lines(self, mock_run: MagicMock):
        mock_run.return_value = MagicMock(
            stdout="file_a.py\n\nfile_b.py\n\n",
            returncode=0,
        )
        result = get_changed_files("main")
        assert result == ["file_a.py", "file_b.py"]

    @patch("pf.reviewer.diff_mode.subprocess.run")
    def test_passes_repo_path_as_cwd(self, mock_run: MagicMock):
        mock_run.return_value = MagicMock(
            stdout="file.py\n",
            returncode=0,
        )
        result = get_changed_files("develop", repo_path="/some/repo")
        mock_run.assert_called_once_with(
            ["git", "diff", "--name-only", "develop...HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd="/some/repo",
        )

    @patch("pf.reviewer.diff_mode.subprocess.run")
    def test_empty_diff_returns_empty_list(self, mock_run: MagicMock):
        mock_run.return_value = MagicMock(stdout="", returncode=0)
        result = get_changed_files("main")
        assert result == []

    @patch("pf.reviewer.diff_mode.subprocess.run")
    def test_propagates_subprocess_error(self, mock_run: MagicMock):
        mock_run.side_effect = subprocess.CalledProcessError(128, "git")
        with pytest.raises(subprocess.CalledProcessError):
            get_changed_files("develop")
