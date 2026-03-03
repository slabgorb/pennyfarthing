"""Tests for pf init auto-setup workflow.

Story 126-3: Integrate auto-setup into pf init — repo discovery,
theme, git hooks, Node install.

Tests verify:
1. pf init runs setup workflow automatically after directory creation
2. Repo discovery writes repos.yaml
3. Theme selection writes config.local.yaml
4. Git hooks offered (opt-in)
5. Package manager auto-detected (pnpm > yarn > npm)
6. Node packages installed via detected package manager
7. Handles partial completion and re-entry gracefully
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def target_dir(tmp_path: Path) -> Path:
    """Empty target directory simulating a fresh project."""
    target = tmp_path / "my-project"
    target.mkdir()
    # Make it a git repo so hooks can be installed
    subprocess.run(["git", "init", str(target)], capture_output=True)
    return target


@pytest.fixture
def mock_dist(tmp_path: Path) -> Path:
    """Minimal mock pennyfarthing-dist with commands, skills, and themes.

    Layout:
        pennyfarthing-dist/
          commands/
            pf-sprint.md
          skills/
            pf-testing/
              pf-testing.md
          personas/
            themes/
              lord-of-the-rings.yaml
              classical-composers.yaml
          scripts/
            hooks/
              dispatcher-template.sh
              pre-commit.sh
              pre-push.sh
              post-merge.sh
    """
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()

    # Commands
    commands_dir = dist / "commands"
    commands_dir.mkdir()
    (commands_dir / "pf-sprint.md").write_text("# Sprint command\n")

    # Skills
    skills_dir = dist / "skills"
    skills_dir.mkdir()
    skill = skills_dir / "pf-testing"
    skill.mkdir()
    (skill / "pf-testing.md").write_text("# Testing skill\n")

    # Themes
    themes_dir = dist / "personas" / "themes"
    themes_dir.mkdir(parents=True)
    (themes_dir / "lord-of-the-rings.yaml").write_text(
        yaml.dump({"theme": {"name": "Lord of the Rings", "tier": "S"}})
    )
    (themes_dir / "classical-composers.yaml").write_text(
        yaml.dump({"theme": {"name": "Classical Composers", "tier": "A"}})
    )

    # Git hooks source
    hooks_dir = dist / "scripts" / "hooks"
    hooks_dir.mkdir(parents=True)
    (hooks_dir / "dispatcher-template.sh").write_text(
        '#!/bin/bash\n# __HOOK_NAME__ pennyfarthing-dispatcher\nfor f in .git/hooks/__HOOK_NAME__.d/*; do "$f"; done\n'
    )
    (hooks_dir / "pre-commit.sh").write_text("#!/bin/bash\n# pre-commit hook\n")
    (hooks_dir / "pre-push.sh").write_text("#!/bin/bash\n# pre-push hook\n")
    (hooks_dir / "post-merge.sh").write_text("#!/bin/bash\n# post-merge hook\n")

    return dist


@pytest.fixture
def initialized_project(target_dir: Path, mock_dist: Path) -> Path:
    """A project that has already run init_project (directories exist)."""
    from unittest.mock import patch

    from pf.init.core import init_project

    with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "test"}):
        init_project(target_dir=target_dir, dist_root=mock_dist)
    return target_dir


# ===================================================================
# AC 1: pf init runs setup workflow automatically after directory creation
# ===================================================================


class TestSetupRunsAfterInit:
    """AC: pf init runs setup workflow automatically after directory creation."""

    def test_init_calls_setup(self, target_dir: Path, mock_dist: Path) -> None:
        """init_project should invoke run_setup after scaffolding."""
        from pf.init.setup import run_setup

        with patch("pf.init.setup.run_setup", wraps=run_setup) as mock_setup:
            from pf.init.core import init_project

            # Force reimport to pick up patched version
            init_project(target_dir=target_dir, dist_root=mock_dist)

            mock_setup.assert_called_once()

    def test_init_result_includes_setup_data(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        """init_project result should include setup workflow results."""
        from pf.init.core import init_project

        result = init_project(
            target_dir=target_dir, dist_root=mock_dist
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert "setup" in data, "Result should include 'setup' key with setup workflow results"

    def test_setup_runs_after_directories_exist(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        """Setup should run after .pennyfarthing/ and .claude/ already exist."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=target_dir, dist_root=mock_dist, skip_prompts=True
        )

        assert result["success"] is True

    def test_run_setup_returns_result_object(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """run_setup should return {success, data?, error?} format."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=initialized_project, dist_root=mock_dist, skip_prompts=True
        )

        assert "success" in result
        assert isinstance(result["success"], bool)


# ===================================================================
# AC 2: Repo discovery writes repos.yaml
# ===================================================================


class TestRepoDiscovery:
    """AC: Repo discovery writes repos.yaml."""

    def test_discover_repos_finds_git_root(self, target_dir: Path) -> None:
        """Should detect the target directory as a git repo."""
        from pf.init.setup import discover_repos

        result = discover_repos(target_dir)

        assert result["success"] is True
        repos = result["data"]["repos"]
        assert len(repos) >= 1

    def test_discover_repos_identifies_type(self, target_dir: Path) -> None:
        """Should identify basic repo type (standalone project)."""
        from pf.init.setup import discover_repos

        result = discover_repos(target_dir)

        assert result["success"] is True
        repos = result["data"]["repos"]
        # At least one repo should have a type
        for _name, config in repos.items():
            assert "type" in config

    def test_write_repos_yaml_creates_file(
        self, initialized_project: Path
    ) -> None:
        """Should write repos.yaml to .pennyfarthing/ directory."""
        from pf.init.setup import write_repos_yaml

        repos = {
            "my-project": {
                "path": ".",
                "type": "standalone",
                "default_branch": "main",
                "branch_strategy": "trunk-based",
            }
        }

        result = write_repos_yaml(initialized_project, repos)

        assert result["success"] is True
        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        assert repos_path.is_file()

    def test_repos_yaml_is_valid_yaml(self, initialized_project: Path) -> None:
        """Written repos.yaml should be parseable YAML."""
        from pf.init.setup import write_repos_yaml

        repos = {
            "my-project": {
                "path": ".",
                "type": "standalone",
                "default_branch": "main",
                "branch_strategy": "trunk-based",
            }
        }

        write_repos_yaml(initialized_project, repos)

        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        data = yaml.safe_load(repos_path.read_text())
        assert "repos" in data
        assert "my-project" in data["repos"]

    def test_repos_yaml_has_required_fields(self, initialized_project: Path) -> None:
        """Each repo in repos.yaml should have path, type, default_branch."""
        from pf.init.setup import write_repos_yaml

        repos = {
            "my-project": {
                "path": ".",
                "type": "standalone",
                "default_branch": "main",
                "branch_strategy": "trunk-based",
            }
        }

        write_repos_yaml(initialized_project, repos)

        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        data = yaml.safe_load(repos_path.read_text())
        repo = data["repos"]["my-project"]
        assert "path" in repo
        assert "type" in repo
        assert "default_branch" in repo

    def test_setup_writes_repos_yaml(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Full setup should write repos.yaml."""
        from pf.init.setup import run_setup

        run_setup(
            target_dir=initialized_project, dist_root=mock_dist, skip_prompts=True
        )

        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        assert repos_path.is_file()


# ===================================================================
# AC 3: Theme selection writes config.local.yaml
# ===================================================================


class TestThemeSelection:
    """AC: Theme selection writes config.local.yaml."""

    def test_write_theme_config_creates_file(
        self, initialized_project: Path
    ) -> None:
        """Should create config.local.yaml in .pennyfarthing/."""
        from pf.init.setup import write_theme_config

        result = write_theme_config(initialized_project, "lord-of-the-rings")

        assert result["success"] is True
        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        assert config_path.is_file()

    def test_config_contains_theme_key(self, initialized_project: Path) -> None:
        """config.local.yaml should contain the selected theme."""
        from pf.init.setup import write_theme_config

        write_theme_config(initialized_project, "lord-of-the-rings")

        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        data = yaml.safe_load(config_path.read_text())
        assert data["theme"] == "lord-of-the-rings"

    def test_write_theme_preserves_existing_config(
        self, initialized_project: Path
    ) -> None:
        """Writing theme should not clobber other config keys."""
        from pf.init.setup import write_theme_config

        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        config_path.write_text(yaml.dump({"bell_mode": True, "relay_mode": False}))

        write_theme_config(initialized_project, "classical-composers")

        data = yaml.safe_load(config_path.read_text())
        assert data["theme"] == "classical-composers"
        assert data["bell_mode"] is True
        assert data["relay_mode"] is False

    def test_setup_writes_config_with_theme(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Full setup should write config.local.yaml with a theme."""
        from pf.init.setup import run_setup

        run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
        )

        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        assert config_path.is_file()
        data = yaml.safe_load(config_path.read_text())
        assert data["theme"] == "lord-of-the-rings"


# ===================================================================
# AC 4: Git hooks offered (opt-in)
# ===================================================================


class TestGitHooksOptIn:
    """AC: Git hooks offered (opt-in)."""

    def test_hooks_installed_when_opted_in(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Should install git hooks when user opts in."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            install_hooks=True,
        )

        assert result["success"] is True
        hooks_dir = initialized_project / ".git" / "hooks"
        # At least one hook dispatcher should exist
        assert any(
            f.name in ("pre-commit", "pre-push", "post-merge")
            for f in hooks_dir.iterdir()
            if f.is_file()
        )

    def test_hooks_not_installed_when_opted_out(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Should NOT install git hooks when user opts out."""
        from pf.init.setup import run_setup

        # Record existing hooks
        hooks_dir = initialized_project / ".git" / "hooks"
        hooks_before = set(hooks_dir.iterdir()) if hooks_dir.exists() else set()

        run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            install_hooks=False,
        )

        hooks_after = set(hooks_dir.iterdir()) if hooks_dir.exists() else set()
        # No new pennyfarthing hooks should have been added
        new_hooks = hooks_after - hooks_before
        pf_hooks = [h for h in new_hooks if "pennyfarthing" in h.name or h.suffix == ".d"]
        assert len(pf_hooks) == 0

    def test_hooks_default_is_not_installed(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Default (skip_prompts=True, no explicit choice) should skip hooks."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            # install_hooks not specified — should default to skip
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert data.get("git_hooks_installed") is False

    def test_setup_result_reports_hooks_status(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Result should report whether hooks were installed."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            install_hooks=True,
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert "git_hooks_installed" in data


# ===================================================================
# AC 5: Package manager auto-detected (pnpm > yarn > npm)
# ===================================================================


class TestPackageManagerDetection:
    """AC: Package manager auto-detected (pnpm > yarn > npm)."""

    def test_detects_pnpm_from_lockfile(self, target_dir: Path) -> None:
        """Should detect pnpm when pnpm-lock.yaml exists."""
        from pf.init.setup import detect_package_manager

        (target_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")

        result = detect_package_manager(target_dir)

        assert result == "pnpm"

    def test_detects_yarn_from_lockfile(self, target_dir: Path) -> None:
        """Should detect yarn when yarn.lock exists."""
        from pf.init.setup import detect_package_manager

        (target_dir / "yarn.lock").write_text("# yarn lockfile v1\n")

        result = detect_package_manager(target_dir)

        assert result == "yarn"

    def test_detects_npm_from_lockfile(self, target_dir: Path) -> None:
        """Should detect npm when package-lock.json exists."""
        from pf.init.setup import detect_package_manager

        (target_dir / "package-lock.json").write_text(
            json.dumps({"lockfileVersion": 3})
        )

        result = detect_package_manager(target_dir)

        assert result == "npm"

    def test_pnpm_takes_priority_over_npm(self, target_dir: Path) -> None:
        """When both pnpm-lock.yaml and package-lock.json exist, pnpm wins."""
        from pf.init.setup import detect_package_manager

        (target_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
        (target_dir / "package-lock.json").write_text(
            json.dumps({"lockfileVersion": 3})
        )

        result = detect_package_manager(target_dir)

        assert result == "pnpm"

    def test_pnpm_takes_priority_over_yarn(self, target_dir: Path) -> None:
        """When both pnpm-lock.yaml and yarn.lock exist, pnpm wins."""
        from pf.init.setup import detect_package_manager

        (target_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
        (target_dir / "yarn.lock").write_text("# yarn lockfile v1\n")

        result = detect_package_manager(target_dir)

        assert result == "pnpm"

    def test_yarn_takes_priority_over_npm(self, target_dir: Path) -> None:
        """When both yarn.lock and package-lock.json exist, yarn wins."""
        from pf.init.setup import detect_package_manager

        (target_dir / "yarn.lock").write_text("# yarn lockfile v1\n")
        (target_dir / "package-lock.json").write_text(
            json.dumps({"lockfileVersion": 3})
        )

        result = detect_package_manager(target_dir)

        assert result == "yarn"

    def test_returns_none_when_no_lockfile(self, target_dir: Path) -> None:
        """Should return None when no package manager lockfile found."""
        from pf.init.setup import detect_package_manager

        result = detect_package_manager(target_dir)

        assert result is None

    def test_detects_from_parent_directory(self, tmp_path: Path) -> None:
        """Should walk up to find lockfile in parent directory."""
        from pf.init.setup import detect_package_manager

        parent = tmp_path / "monorepo"
        parent.mkdir()
        (parent / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")

        child = parent / "packages" / "my-app"
        child.mkdir(parents=True)

        result = detect_package_manager(child)

        assert result == "pnpm"


# ===================================================================
# AC 6: Node packages installed via detected package manager
# ===================================================================


class TestNodePackageInstall:
    """AC: Node packages installed via detected package manager."""

    def test_install_returns_result_format(
        self, initialized_project: Path
    ) -> None:
        """install_node_packages should return {success, data?, error?}."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "npm", dry_run=True
        )

        assert "success" in result
        assert isinstance(result["success"], bool)

    def test_dry_run_does_not_install(self, initialized_project: Path) -> None:
        """Dry run should not actually install packages."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "npm", dry_run=True
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert data.get("action") == "dry-run"

    def test_dry_run_reports_command(self, initialized_project: Path) -> None:
        """Dry run should report the command that would be executed."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "pnpm", dry_run=True
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert "command" in data
        assert "pnpm" in data["command"]

    def test_uses_pnpm_when_detected(self, initialized_project: Path) -> None:
        """Should use pnpm install when pnpm is the detected manager."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "pnpm", dry_run=True
        )

        assert result["success"] is True
        assert "pnpm" in result["data"]["command"]

    def test_uses_yarn_when_detected(self, initialized_project: Path) -> None:
        """Should use yarn add when yarn is the detected manager."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "yarn", dry_run=True
        )

        assert result["success"] is True
        assert "yarn" in result["data"]["command"]

    def test_uses_npm_when_detected(self, initialized_project: Path) -> None:
        """Should use npm install when npm is the detected manager."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(
            initialized_project, "npm", dry_run=True
        )

        assert result["success"] is True
        assert "npm" in result["data"]["command"]

    def test_rejects_invalid_package_manager(
        self, initialized_project: Path
    ) -> None:
        """Should reject an unknown package manager."""
        from pf.init.setup import install_node_packages

        result = install_node_packages(initialized_project, "bun")

        assert result["success"] is False
        assert "error" in result

    def test_setup_detects_and_installs(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Full setup should detect package manager and install packages."""
        from pf.init.setup import run_setup

        # Create a lockfile so detection works
        (initialized_project / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert data.get("package_manager") == "pnpm"


# ===================================================================
# AC 7: Handles partial completion and re-entry gracefully
# ===================================================================


class TestPartialCompletionReentry:
    """AC: Handles partial completion and re-entry gracefully."""

    def test_get_setup_state_all_false_initially(
        self, target_dir: Path
    ) -> None:
        """Fresh project (before init) should report no setup steps completed."""
        from pf.init.setup import get_setup_state

        state = get_setup_state(target_dir)

        assert state["repos"] is False
        assert state["theme"] is False
        assert state["git_hooks"] is False
        assert state["node_packages"] is False

    def test_get_setup_state_detects_repos_yaml(
        self, initialized_project: Path
    ) -> None:
        """Should detect repos.yaml as completed."""
        from pf.init.setup import get_setup_state

        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        repos_path.write_text(
            yaml.dump({"repos": {"my-project": {"path": ".", "type": "standalone"}}})
        )

        state = get_setup_state(initialized_project)

        assert state["repos"] is True

    def test_get_setup_state_detects_theme_config(
        self, initialized_project: Path
    ) -> None:
        """Should detect config.local.yaml with theme as completed."""
        from pf.init.setup import get_setup_state

        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        config_path.write_text(yaml.dump({"theme": "lord-of-the-rings"}))

        state = get_setup_state(initialized_project)

        assert state["theme"] is True

    def test_setup_skips_completed_repos(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Re-running setup should not overwrite existing repos.yaml."""
        from pf.init.setup import run_setup, write_repos_yaml

        # Pre-populate repos.yaml with custom content
        custom_repos = {
            "custom-repo": {
                "path": "custom",
                "type": "api",
                "default_branch": "develop",
                "branch_strategy": "gitflow",
            }
        }
        write_repos_yaml(initialized_project, custom_repos)

        # Re-run setup
        run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
        )

        # Custom repos should be preserved
        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        data = yaml.safe_load(repos_path.read_text())
        assert "custom-repo" in data["repos"]

    def test_setup_skips_completed_theme(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Re-running setup should not overwrite existing theme selection."""
        from pf.init.setup import run_setup

        # Pre-populate config with a theme
        config_path = initialized_project / ".pennyfarthing" / "config.local.yaml"
        config_path.write_text(yaml.dump({"theme": "classical-composers"}))

        # Re-run setup without explicit theme
        run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
        )

        # Original theme should be preserved
        data = yaml.safe_load(config_path.read_text())
        assert data["theme"] == "classical-composers"

    def test_setup_completes_remaining_steps(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Setup with partial state should complete only missing steps."""
        from pf.init.setup import get_setup_state, run_setup

        # Pre-populate repos.yaml only
        repos_path = initialized_project / ".pennyfarthing" / "repos.yaml"
        repos_path.write_text(
            yaml.dump({"repos": {"my-project": {"path": ".", "type": "standalone"}}})
        )

        # Run setup — should skip repos, do theme + rest
        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
        )

        assert result["success"] is True
        state = get_setup_state(initialized_project)
        assert state["repos"] is True
        assert state["theme"] is True

    def test_setup_idempotent_when_fully_complete(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Running setup when everything is done should succeed without changes."""
        from pf.init.setup import run_setup

        # Run setup twice
        run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
            install_hooks=False,
        )

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
            install_hooks=False,
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert data.get("steps_skipped", 0) > 0


# ===================================================================
# Dry-run integration
# ===================================================================


class TestSetupDryRun:
    """Verify dry-run mode for the full setup workflow."""

    def test_dry_run_creates_no_config_files(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        """Dry run should not write repos.yaml or config.local.yaml.

        Uses target_dir (pre-init) so no repos.yaml or config exist yet.
        initialized_project has already run init which creates repos.yaml.
        """
        from pf.init.setup import run_setup

        run_setup(
            target_dir=target_dir,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
            dry_run=True,
        )

        assert not (target_dir / ".pennyfarthing" / "repos.yaml").exists()
        assert not (target_dir / ".pennyfarthing" / "config.local.yaml").exists()

    def test_dry_run_returns_plan(
        self, initialized_project: Path, mock_dist: Path
    ) -> None:
        """Dry run should return a plan describing what would happen."""
        from pf.init.setup import run_setup

        result = run_setup(
            target_dir=initialized_project,
            dist_root=mock_dist,
            skip_prompts=True,
            theme="lord-of-the-rings",
            dry_run=True,
        )

        assert result["success"] is True
        data = result.get("data", {})
        assert "steps" in data or "plan" in data


# ===================================================================
# Edge cases
# ===================================================================


class TestEdgeCases:
    """Edge cases and error paths."""

    def test_setup_without_git_repo(self, tmp_path: Path, mock_dist: Path) -> None:
        """Should handle projects that are not git repos (no hooks)."""
        from pf.init.setup import run_setup

        non_git = tmp_path / "no-git-project"
        non_git.mkdir()
        (non_git / ".pennyfarthing").mkdir()

        result = run_setup(
            target_dir=non_git,
            dist_root=mock_dist,
            skip_prompts=True,
            install_hooks=True,
        )

        # Should succeed but report hooks were skipped
        assert result["success"] is True
        data = result.get("data", {})
        assert data.get("git_hooks_installed") is False

    def test_setup_with_invalid_dist_root(
        self, initialized_project: Path, tmp_path: Path
    ) -> None:
        """Should return error when dist_root is invalid."""
        from pf.init.setup import run_setup

        bad_dist = tmp_path / "nonexistent"

        result = run_setup(
            target_dir=initialized_project,
            dist_root=bad_dist,
            skip_prompts=True,
        )

        assert result["success"] is False
        assert "error" in result

    def test_detect_package_manager_empty_dir(self, tmp_path: Path) -> None:
        """Should return None for empty directory with no lockfiles."""
        from pf.init.setup import detect_package_manager

        empty = tmp_path / "empty"
        empty.mkdir()

        result = detect_package_manager(empty)

        assert result is None
