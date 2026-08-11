"""Tests for working-tree audit after reviewer mutation-testing subagents (Story 162-67).

The reviewer-test-analyzer may run a mutation battery via Bash. If a mutation is
left applied (subagent crash, no restore), the live working tree is silently
corrupted. The audit helper catches this mechanically so the reviewer can FAIL LOUD
instead of proceeding on a corrupted codebase.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from pf.reviewer.worktree_audit import check_working_tree_clean

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _init_git_repo(path: Path) -> None:
    """Initialize a bare git repo with one commit so status works."""
    subprocess.run(["git", "init", "-b", "main", str(path)], check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=path,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=path,
        check=True,
        capture_output=True,
    )
    # Create initial commit so HEAD exists
    readme = path / "README.md"
    readme.write_text("initial\n")
    subprocess.run(["git", "add", "README.md"], cwd=path, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "init", "--no-gpg-sign"],
        cwd=path,
        check=True,
        capture_output=True,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCheckWorkingTreeClean:
    """check_working_tree_clean() returns {success, dirty_files, error}."""

    def test_clean_repo_returns_success(self, tmp_path: Path) -> None:
        """A repo with no uncommitted changes reports success."""
        _init_git_repo(tmp_path)

        result = check_working_tree_clean(cwd=tmp_path)

        assert result["success"] is True
        assert result["dirty_files"] == []
        assert result.get("error") is None

    def test_dirty_repo_returns_failure_with_file_list(self, tmp_path: Path) -> None:
        """A repo with modified/untracked files reports failure and names them."""
        _init_git_repo(tmp_path)

        # Simulate a left-behind mutation: modify a tracked file
        (tmp_path / "README.md").write_text("MUTATED\n")
        # Also add an untracked file (less likely but possible)
        (tmp_path / "untracked.py").write_text("new file\n")

        result = check_working_tree_clean(cwd=tmp_path)

        assert result["success"] is False
        assert len(result["dirty_files"]) >= 1
        # The modified tracked file must appear
        assert any("README.md" in f for f in result["dirty_files"])
        assert result.get("error") is None

    def test_staged_change_is_flagged(self, tmp_path: Path) -> None:
        """A staged (but not committed) change is also a dirty-tree signal."""
        _init_git_repo(tmp_path)

        (tmp_path / "README.md").write_text("staged mutation\n")
        subprocess.run(
            ["git", "add", "README.md"], cwd=tmp_path, check=True, capture_output=True
        )

        result = check_working_tree_clean(cwd=tmp_path)

        assert result["success"] is False
        assert any("README.md" in f for f in result["dirty_files"])

    def test_non_git_directory_returns_error(self, tmp_path: Path) -> None:
        """Running against a non-git directory returns success=False with an error."""
        # tmp_path has no .git
        result = check_working_tree_clean(cwd=tmp_path)

        assert result["success"] is False
        assert result.get("error") is not None

    def test_defaults_to_cwd_when_no_path_given(self, monkeypatch, tmp_path: Path) -> None:
        """When cwd is None the helper uses the process working directory."""
        _init_git_repo(tmp_path)
        monkeypatch.chdir(tmp_path)

        result = check_working_tree_clean()

        assert result["success"] is True

    def test_result_always_contains_required_keys(self, tmp_path: Path) -> None:
        """Return dict always has 'success' and 'dirty_files' keys."""
        _init_git_repo(tmp_path)
        result = check_working_tree_clean(cwd=tmp_path)
        assert "success" in result
        assert "dirty_files" in result

    def test_single_deleted_source_file_is_flagged(self, tmp_path: Path) -> None:
        """A deletion (the real 162-48 incident pattern) is caught.

        The 162-48 incident: reviewer-test-analyzer deleted a guard clause and
        left the deletion applied. That shows up as 'D README.md' in git status.
        """
        _init_git_repo(tmp_path)

        # Stage a deletion — the exact pattern from the incident
        (tmp_path / "README.md").unlink()
        subprocess.run(
            ["git", "rm", "README.md"], cwd=tmp_path, check=True, capture_output=True
        )

        result = check_working_tree_clean(cwd=tmp_path)

        assert result["success"] is False
        assert any("README.md" in f for f in result["dirty_files"])
