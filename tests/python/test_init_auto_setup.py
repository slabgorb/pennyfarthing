"""Tests for pf init auto-setup workflow (Story 126-3, MSSCI-15491).

Verifies that pf init runs an interactive setup workflow after
directory creation: repo discovery, theme selection, git hooks,
package manager detection, and Node package installation.

Run with: python -m pytest tests/python/test_init_auto_setup.py -v
"""

import json
from unittest.mock import MagicMock, patch

from pf.init.setup import (
    SetupState,
    detect_package_manager,
    discover_repos,
    install_node_packages,
    offer_git_hooks,
    select_theme,
)


class TestRepoDiscovery:
    """AC2: Repo discovery writes repos.yaml."""

    def test_discovers_git_repos_in_directory(self, tmp_path):
        """discover_repos finds git repos in the project tree."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # Create a fake git repo
        (tmp_path / ".git").mkdir()
        result = discover_repos(tmp_path)
        assert result["success"] is True
        assert "repos" in result
        assert len(result["repos"]) >= 1

    def test_writes_repos_yaml(self, tmp_path):
        """discover_repos writes repos.yaml to .pennyfarthing/."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".git").mkdir()
        result = discover_repos(tmp_path)
        assert result["success"] is True
        repos_file = tmp_path / ".pennyfarthing" / "repos.yaml"
        assert repos_file.exists(), "repos.yaml was not written"

    def test_repos_yaml_has_correct_structure(self, tmp_path):
        """repos.yaml contains repos dict with path and type."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".git").mkdir()
        result = discover_repos(tmp_path)
        assert result["success"] is True
        for repo in result["repos"]:
            assert "path" in repo, "repo missing 'path'"
            assert "type" in repo, "repo missing 'type'"

    def test_discover_repos_no_git_dir(self, tmp_path):
        """discover_repos returns empty list when no .git found."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = discover_repos(tmp_path)
        assert result["success"] is True
        assert result["repos"] == []


class TestThemeSelection:
    """AC3: Theme selection writes config.local.yaml."""

    def test_select_theme_writes_config(self, tmp_path):
        """select_theme writes theme to config.local.yaml."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = select_theme(tmp_path, interactive=False)
        assert result["success"] is True
        config_file = tmp_path / ".pennyfarthing" / "config.local.yaml"
        assert config_file.exists(), "config.local.yaml not written"

    def test_config_has_theme_key(self, tmp_path):
        """config.local.yaml contains a theme key after selection."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = select_theme(tmp_path, interactive=False)
        assert result["success"] is True
        assert "theme" in result, "result missing 'theme' key"
        assert result["theme"] is not None

    def test_select_theme_preserves_existing_config(self, tmp_path):
        """select_theme preserves existing keys in config.local.yaml."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        config_file = pf_dir / "config.local.yaml"
        config_file.write_text("bell_mode: enabled\n")
        result = select_theme(tmp_path, interactive=False)
        assert result["success"] is True
        content = config_file.read_text()
        assert "bell_mode" in content, "existing config keys were overwritten"


class TestGitHooksOptIn:
    """AC4: Git hooks offered (opt-in)."""

    def test_hooks_not_installed_by_default(self, tmp_path):
        """Git hooks are NOT installed when user declines (non-interactive, install=False)."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".git" / "hooks").mkdir(parents=True)
        result = offer_git_hooks(tmp_path, interactive=False, install=False)
        assert result["success"] is True
        assert result["installed"] is False

    def test_hooks_installed_when_opted_in(self, tmp_path):
        """Git hooks ARE installed when user opts in."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (tmp_path / ".git" / "hooks").mkdir(parents=True)
        result = offer_git_hooks(tmp_path, interactive=False, install=True)
        assert result["success"] is True
        assert result["installed"] is True

    def test_hooks_skipped_without_git_dir(self, tmp_path):
        """Git hooks step is skipped if no .git directory exists."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = offer_git_hooks(tmp_path, interactive=False, install=True)
        assert result["success"] is True
        assert result["installed"] is False


class TestPackageManagerDetection:
    """AC5: Package manager auto-detected (pnpm > yarn > npm)."""

    def test_detects_pnpm(self, tmp_path):
        """Detects pnpm when pnpm-lock.yaml exists."""
        (tmp_path / "pnpm-lock.yaml").touch()
        assert detect_package_manager(tmp_path) == "pnpm"

    def test_detects_yarn(self, tmp_path):
        """Detects yarn when yarn.lock exists."""
        (tmp_path / "yarn.lock").touch()
        assert detect_package_manager(tmp_path) == "yarn"

    def test_detects_npm(self, tmp_path):
        """Detects npm when package-lock.json exists."""
        (tmp_path / "package-lock.json").touch()
        assert detect_package_manager(tmp_path) == "npm"

    def test_pnpm_takes_priority(self, tmp_path):
        """pnpm is preferred when multiple lock files exist."""
        (tmp_path / "pnpm-lock.yaml").touch()
        (tmp_path / "yarn.lock").touch()
        (tmp_path / "package-lock.json").touch()
        assert detect_package_manager(tmp_path) == "pnpm"

    def test_yarn_over_npm(self, tmp_path):
        """yarn is preferred over npm when both exist."""
        (tmp_path / "yarn.lock").touch()
        (tmp_path / "package-lock.json").touch()
        assert detect_package_manager(tmp_path) == "yarn"

    def test_returns_none_when_no_lockfile(self, tmp_path):
        """Returns None when no lock files found."""
        assert detect_package_manager(tmp_path) is None


class TestNodePackageInstall:
    """AC6: Node packages installed via detected package manager."""

    @patch("subprocess.run")
    def test_install_with_pnpm(self, mock_run, tmp_path):
        """Runs 'pnpm install' when pnpm is detected."""
        mock_run.return_value = MagicMock(returncode=0)
        result = install_node_packages(tmp_path, "pnpm")
        assert result["success"] is True
        assert result["package_manager"] == "pnpm"
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert "pnpm" in cmd
        assert "install" in cmd

    @patch("subprocess.run")
    def test_install_with_npm(self, mock_run, tmp_path):
        """Runs 'npm install' when npm is detected."""
        mock_run.return_value = MagicMock(returncode=0)
        result = install_node_packages(tmp_path, "npm")
        assert result["success"] is True
        assert result["package_manager"] == "npm"

    @patch("subprocess.run")
    def test_install_failure_returns_error(self, mock_run, tmp_path):
        """Returns error result when install command fails."""
        mock_run.return_value = MagicMock(returncode=1, stderr="ERESOLVE")
        result = install_node_packages(tmp_path, "pnpm")
        assert result["success"] is False
        assert "error" in result


class TestPartialCompletionReentry:
    """AC7: Handles partial completion and re-entry gracefully."""

    def test_setup_state_persisted(self, tmp_path):
        """SetupState saves progress to disk."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        state = SetupState(tmp_path)
        state.mark_complete("repo_discovery")
        state.save()
        assert state.state_file.exists()

    def test_setup_state_loaded_on_reentry(self, tmp_path):
        """SetupState loads previous progress from disk."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        # Simulate previous run that completed repo_discovery
        state_file = pf_dir / "setup-state.json"
        state_file.write_text(json.dumps({"completed": ["repo_discovery"]}))
        state = SetupState(tmp_path)
        state.load()
        assert state.is_complete("repo_discovery") is True
        assert state.is_complete("theme_selection") is False

    def test_next_step_returns_first_incomplete(self, tmp_path):
        """SetupState.next_step returns the first incomplete step."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        state = SetupState(tmp_path)
        state.completed = ["repo_discovery"]
        assert state.next_step() == "theme_selection"

    def test_next_step_returns_none_when_all_done(self, tmp_path):
        """SetupState.next_step returns None when all steps complete."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        state = SetupState(tmp_path)
        state.completed = list(SetupState.STEPS)
        assert state.next_step() is None
