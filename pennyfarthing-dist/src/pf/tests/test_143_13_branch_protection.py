"""Tests for branch protection PreToolUse hook."""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from pf.hooks.branch_protection import (
    _extract_push_target,
    _get_protected_branches,
    main,
)


class TestGetProtectedBranches:
    """Test protected branch detection from repos.yaml."""

    def test_defaults_without_project_root(self):
        result = _get_protected_branches(None)
        assert "main" in result
        assert "develop" in result
        assert "master" in result

    def test_reads_from_repos_yaml(self, tmp_path):
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        repos_yaml = pf_dir / "repos.yaml"
        repos_yaml.write_text(
            "repos:\n  api:\n    default_branch: release\n"
        )
        result = _get_protected_branches(tmp_path)
        assert "release" in result
        assert "main" in result  # defaults still present

    def test_handles_missing_repos_yaml(self, tmp_path):
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = _get_protected_branches(tmp_path)
        assert "main" in result


class TestExtractPushTarget:
    """Test push target extraction from command strings."""

    def test_explicit_branch(self):
        assert _extract_push_target("git push origin main") == "main"

    def test_refspec(self):
        assert _extract_push_target("git push origin HEAD:develop") == "develop"

    def test_no_target(self):
        assert _extract_push_target("git push origin") is None

    def test_with_flags(self):
        assert _extract_push_target("git push -u origin feat/foo") == "feat/foo"

    def test_no_push(self):
        assert _extract_push_target("git status") is None


class TestBranchProtectionHook:
    """Test the main hook entry point."""

    def _run_hook(self, tool_name: str, command: str, current_branch: str = "feat/test"):
        input_data = json.dumps({
            "tool_name": tool_name,
            "tool_input": {"command": command},
        })
        with (
            patch("sys.stdin.read", return_value=input_data),
            patch("pf.hooks.branch_protection._get_current_branch", return_value=current_branch),
            patch("pf.hooks.branch_protection.find_project_root", return_value=None),
        ):
            main()

    def test_allows_commit_on_feature_branch(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git commit -m 'feat: something'", "feat/test")
        assert exc_info.value.code == 0

    def test_blocks_commit_on_main(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git commit -m 'bad commit'", "main")
        assert exc_info.value.code == 2

    def test_blocks_commit_on_develop(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git commit -m 'bad commit'", "develop")
        assert exc_info.value.code == 2

    def test_blocks_merge_on_protected(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git merge feat/something", "main")
        assert exc_info.value.code == 2

    def test_blocks_push_to_main(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git push origin main", "feat/test")
        assert exc_info.value.code == 2

    def test_blocks_push_from_protected(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git push origin", "develop")
        assert exc_info.value.code == 2

    def test_allows_push_to_feature_branch(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git push origin feat/test", "feat/test")
        assert exc_info.value.code == 0

    def test_ignores_non_bash_tools(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Edit", "git commit -m 'not bash'", "main")
        assert exc_info.value.code == 0

    def test_allows_non_git_commands(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "ls -la", "main")
        assert exc_info.value.code == 0

    def test_allows_git_read_commands_on_protected(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git status", "main")
        assert exc_info.value.code == 0

    def test_allows_git_log_on_protected(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git log --oneline", "main")
        assert exc_info.value.code == 0

    def test_blocks_push_with_refspec_to_protected(self):
        with pytest.raises(SystemExit) as exc_info:
            self._run_hook("Bash", "git push origin HEAD:main", "feat/test")
        assert exc_info.value.code == 2
