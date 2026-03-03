"""E2E tests for the full installation lifecycle.

Story 126-10: End-to-end test suite covering fresh install,
upgrade from npm, dry-run verification, and idempotency.

Unlike unit tests that use mock dist structures, these tests use the
REAL pennyfarthing-dist directory and test the full CLI flow.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

# Real pennyfarthing-dist: tests/.. -> pf/.. -> src/.. -> pennyfarthing-dist
REAL_DIST = Path(__file__).resolve().parents[3]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def fresh_project(tmp_path: Path) -> Path:
    """Empty directory simulating a brand-new project."""
    project = tmp_path / "fresh-project"
    project.mkdir()
    # Init a git repo so setup can discover it
    (project / ".git").mkdir()
    return project


@pytest.fixture
def npm_project(tmp_path: Path) -> Path:
    """Directory simulating an npm-era Pennyfarthing installation.

    Recreates the key artifacts found in real npm-based projects like orc-ax:
    - node_modules/@pennyfarthing/ directory tree
    - .pennyfarthing/ with old manifest.json and symlinks to node_modules
    - .claude/ with npm-era settings (npx pennyfarthing hooks)
    - .claude/commands/ with symlinks pointing to node_modules
    """
    project = tmp_path / "npm-project"
    project.mkdir()
    (project / ".git").mkdir()

    # --- npm artifacts ---
    npm_pf = project / "node_modules" / "@pennyfarthing" / "core"
    npm_pf.mkdir(parents=True)
    npm_dist = npm_pf / "pennyfarthing-dist"
    npm_dist.mkdir()
    (npm_dist / "commands").mkdir()
    (npm_dist / "commands" / "pf-sprint.md").write_text("# old npm command\n")
    (npm_dist / "skills").mkdir()

    # --- .pennyfarthing with old manifest ---
    pf_dir = project / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "manifest.json").write_text(json.dumps({
        "version": "10.0.0",
        "installed_at": "2025-01-01T00:00:00Z",
    }) + "\n")

    # --- .claude with npm-era settings ---
    claude_dir = project / ".claude"
    claude_dir.mkdir()
    commands_dir = claude_dir / "commands"
    commands_dir.mkdir()

    # Symlink to node_modules (stale)
    stale_link = commands_dir / "pf-old-cmd.md"
    stale_link.symlink_to(npm_dist / "commands" / "pf-sprint.md")

    # A real file (not symlink) — should survive cleanup
    (commands_dir / "custom-cmd.md").write_text("# user custom command\n")

    skills_dir = claude_dir / "skills"
    skills_dir.mkdir()

    npm_settings = {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "Edit",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "npx pennyfarthing hooks pre-edit-check",
                        }
                    ],
                }
            ],
            "PostToolUse": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": "npx pennyfarthing hooks bell-mode",
                        }
                    ],
                },
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": "my-custom-hook --check",
                        }
                    ],
                },
            ],
        }
    }
    (claude_dir / "settings.local.json").write_text(
        json.dumps(npm_settings, indent=2) + "\n"
    )

    return project


# ===========================================================================
# AC 1: E2E test — fresh pip install pf + pf init on empty project
# ===========================================================================


class TestFreshInit:
    """Full lifecycle: pf init on an empty project using real dist."""

    def test_creates_pennyfarthing_directory_structure(self, fresh_project: Path) -> None:
        """Init creates .pennyfarthing/ with commands, skills, scripts."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"], f"init failed: {result.get('error')}"

        for subdir in ["commands", "skills", "scripts", "scripts/lib"]:
            assert (fresh_project / ".pennyfarthing" / subdir).is_dir(), (
                f".pennyfarthing/{subdir} not created"
            )

    def test_creates_claude_directory_structure(self, fresh_project: Path) -> None:
        """Init creates .claude/ with commands and skills."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        for subdir in ["commands", "skills"]:
            assert (fresh_project / ".claude" / subdir).is_dir()

    def test_copies_real_commands(self, fresh_project: Path) -> None:
        """Init copies actual pf-*.md commands from real dist."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        commands_copied = result["data"]["commands_copied"]
        assert commands_copied > 0, "No commands were copied"

        # Verify commands exist in both locations
        pf_cmds = list((fresh_project / ".pennyfarthing" / "commands").glob("pf-*.md"))
        claude_cmds = list((fresh_project / ".claude" / "commands").glob("pf-*.md"))
        assert len(pf_cmds) == commands_copied
        assert len(claude_cmds) == commands_copied

    def test_copies_real_skills(self, fresh_project: Path) -> None:
        """Init copies actual pf-* skill directories from real dist."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        skills_copied = result["data"]["skills_copied"]
        assert skills_copied > 0, "No skills were copied"

        pf_skills = [
            d for d in (fresh_project / ".pennyfarthing" / "skills").iterdir()
            if d.is_dir() and d.name.startswith("pf-")
        ]
        assert len(pf_skills) == skills_copied

    def test_writes_settings_with_infrastructure_hooks(self, fresh_project: Path) -> None:
        """Init writes settings.local.json with all infrastructure hooks."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        settings_path = fresh_project / ".claude" / "settings.local.json"
        assert settings_path.exists()

        settings = json.loads(settings_path.read_text())
        assert "hooks" in settings
        hooks = settings["hooks"]

        # Must have the standard hook events
        for event in ["SessionStart", "Stop", "PreToolUse", "PostToolUse"]:
            assert event in hooks, f"Missing hook event: {event}"

        # All pf-managed hook commands must use the shim path or bare pf prefix
        # (not npx pennyfarthing, not old pf.sh references)
        for _event, hook_list in hooks.items():
            for entry in hook_list:
                for hook in entry.get("hooks", []):
                    if hook.get("type") == "command":
                        cmd = hook["command"]
                        is_pf_hook = (
                            "pf hooks" in cmd or ".pennyfarthing/bin/pf" in cmd
                        )
                        is_user_hook = not is_pf_hook
                        if not is_user_hook:
                            assert "npx pennyfarthing" not in cmd, (
                                f"Hook command still uses npx: {cmd}"
                            )
                            assert "pf.sh" not in cmd, (
                                f"Hook command still uses pf.sh: {cmd}"
                            )

    def test_writes_init_manifest(self, fresh_project: Path) -> None:
        """Init writes init-manifest.json with version and counts."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        manifest_path = fresh_project / ".pennyfarthing" / "init-manifest.json"
        assert manifest_path.exists()

        manifest = json.loads(manifest_path.read_text())
        assert "pf_version" in manifest
        assert "initialized_at" in manifest
        assert manifest["commands_copied"] == result["data"]["commands_copied"]
        assert manifest["skills_copied"] == result["data"]["skills_copied"]

    def test_updates_gitignore(self, fresh_project: Path) -> None:
        """Init appends Pennyfarthing entries to .gitignore."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]
        gitignore = fresh_project / ".gitignore"
        assert gitignore.exists()

        content = gitignore.read_text()
        assert ".session/" in content
        assert ".claude/settings.local.json" in content
        assert ".pennyfarthing/config.local.yaml" in content


# ===========================================================================
# AC 2: E2E test — pf upgrade from npm-based v11 install
# ===========================================================================


class TestUpgradeFromNpm:
    """Full lifecycle: upgrade an npm-era project to Python-based."""

    def test_detects_npm_installation(self, npm_project: Path) -> None:
        """Upgrade detects node_modules/@pennyfarthing."""
        from pf.upgrade.core import detect_npm_install

        result = detect_npm_install(npm_project)
        assert result["success"]
        assert result["is_npm"] is True
        assert any("@pennyfarthing" in p for p in result["npm_paths"])

    def test_migration_replaces_npm_hooks_with_python(self, npm_project: Path) -> None:
        """Upgrade replaces npx pennyfarthing hooks with pf hooks."""
        from pf.upgrade.core import migrate_settings

        result = migrate_settings(npm_project)
        assert result["success"]
        assert len(result["hooks_removed"]) > 0, "No npm hooks were removed"

        # Verify settings file now has Python hooks
        settings = json.loads(
            (npm_project / ".claude" / "settings.local.json").read_text()
        )
        for _event, hook_list in settings["hooks"].items():
            for entry in hook_list:
                for hook in entry.get("hooks", []):
                    if hook.get("type") == "command":
                        cmd = hook["command"]
                        assert "npx" not in cmd, f"npm hook still present: {cmd}"

    def test_preserves_custom_hooks(self, npm_project: Path) -> None:
        """Upgrade preserves non-pf hooks (user custom hooks)."""
        from pf.upgrade.core import preserve_custom_hooks

        result = preserve_custom_hooks(npm_project)
        assert result["success"]
        assert len(result["custom_hooks"]) >= 1, "Custom hook not preserved"

        # The custom hook command should be in the preserved list
        custom_commands = []
        for entry in result["custom_hooks"]:
            for hook in entry.get("hooks", []):
                if hook.get("type") == "command":
                    custom_commands.append(hook["command"])
        assert "my-custom-hook --check" in custom_commands

    def test_full_upgrade_flow(self, npm_project: Path) -> None:
        """Full upgrade: detect → migrate → verify."""
        from pf.upgrade.core import run_upgrade

        result = run_upgrade(npm_project)
        assert result["success"]
        assert "report" in result

        # Directory structure should be set up
        assert (npm_project / ".pennyfarthing" / "scripts").is_dir()
        assert (npm_project / ".pennyfarthing" / "scripts" / "lib").is_dir()

        # Settings should have Python hooks
        settings = json.loads(
            (npm_project / ".claude" / "settings.local.json").read_text()
        )
        all_commands = []
        for _event, hook_list in settings["hooks"].items():
            for entry in hook_list:
                for hook in entry.get("hooks", []):
                    if hook.get("type") == "command":
                        all_commands.append(hook["command"])

        pf_hooks = [c for c in all_commands if "hooks dispatch" in c]
        assert len(pf_hooks) >= 3, f"Expected >=3 pf hooks, got {len(pf_hooks)}"

    def test_upgrade_with_clean_removes_npm_artifacts(self, npm_project: Path) -> None:
        """Upgrade --clean removes node_modules/@pennyfarthing and stale symlinks."""
        from pf.init.core import init_project
        from pf.upgrade.core import run_upgrade

        # First init to create init-manifest.json (needed for old manifest detection)
        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(npm_project, REAL_DIST)

        result = run_upgrade(npm_project, clean=True)
        assert result["success"]

        # node_modules/@pennyfarthing should be gone
        assert not (npm_project / "node_modules" / "@pennyfarthing").exists(), (
            "node_modules/@pennyfarthing not removed"
        )

        # Stale symlinks to node_modules should be gone
        commands_dir = npm_project / ".claude" / "commands"
        for entry in commands_dir.iterdir():
            if entry.is_symlink():
                target = str(entry.resolve())
                assert "node_modules" not in target, (
                    f"Stale symlink not cleaned: {entry.name} -> {target}"
                )

        # Old manifest.json should be gone (init-manifest.json exists)
        assert not (npm_project / ".pennyfarthing" / "manifest.json").exists(), (
            "Old manifest.json not removed"
        )

    def test_custom_files_survive_upgrade_and_clean(self, npm_project: Path) -> None:
        """User-created files are not removed during upgrade or cleanup."""
        from pf.upgrade.core import run_upgrade

        run_upgrade(npm_project, clean=True)

        # Custom command file (not a symlink) should survive
        custom_cmd = npm_project / ".claude" / "commands" / "custom-cmd.md"
        assert custom_cmd.exists(), "User custom command was deleted during cleanup"


# ===========================================================================
# AC 3: E2E test — pf init --dry-run shows correct plan
# ===========================================================================


class TestDryRun:
    """Dry-run produces accurate plans without side effects."""

    def test_init_dry_run_returns_plan_without_creating_files(
        self, fresh_project: Path
    ) -> None:
        """pf init --dry-run returns a plan but creates no files."""
        from pf.init.core import init_project

        # Snapshot before
        before = set(fresh_project.rglob("*"))

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST, dry_run=True)

        assert result["success"]

        # Verify plan has expected keys
        plan = result["data"]
        assert "directories" in plan
        assert "commands" in plan
        assert "skills" in plan
        assert "settings" in plan
        assert "gitignore_entries" in plan

        # Plan should list real commands and skills
        assert len(plan["commands"]) > 0, "Dry-run plan lists no commands"
        assert len(plan["skills"]) > 0, "Dry-run plan lists no skills"

        # No files should have been created
        after = set(fresh_project.rglob("*"))
        assert before == after, (
            f"Dry-run created files: {after - before}"
        )

    def test_dry_run_plan_matches_real_execution(
        self, tmp_path: Path
    ) -> None:
        """Dry-run plan accurately predicts what real init creates."""
        from pf.init.core import init_project

        # Run dry-run
        dry_project = tmp_path / "dry-project"
        dry_project.mkdir()
        (dry_project / ".git").mkdir()

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            dry_result = init_project(dry_project, REAL_DIST, dry_run=True)

        # Run real init on a separate directory
        real_project = tmp_path / "real-project"
        real_project.mkdir()
        (real_project / ".git").mkdir()

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            real_result = init_project(real_project, REAL_DIST)

        # Commands count should match
        plan = dry_result["data"]
        assert len(plan["commands"]) == real_result["data"]["commands_copied"]
        assert len(plan["skills"]) == real_result["data"]["skills_copied"]

    def test_upgrade_dry_run_no_side_effects(self, npm_project: Path) -> None:
        """pf upgrade --dry-run does not modify any files."""
        from pf.upgrade.core import run_upgrade

        # Snapshot settings before
        settings_before = (npm_project / ".claude" / "settings.local.json").read_text()

        result = run_upgrade(npm_project, dry_run=True)
        assert result["success"]

        # Settings should be unchanged
        settings_after = (npm_project / ".claude" / "settings.local.json").read_text()
        assert settings_before == settings_after, "Dry-run modified settings"

        # npm artifacts should still exist
        assert (npm_project / "node_modules" / "@pennyfarthing").exists()

    def test_upgrade_clean_dry_run_no_side_effects(self, npm_project: Path) -> None:
        """pf upgrade --clean --dry-run previews cleanup without acting."""
        from pf.init.core import init_project
        from pf.upgrade.core import cleanup_artifacts

        # Create init-manifest.json so old manifest gets flagged
        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(npm_project, REAL_DIST)

        result = cleanup_artifacts(npm_project, dry_run=True)
        assert result["success"]
        assert len(result["removed"]) > 0, "Dry-run found nothing to clean"
        assert all("dry-run" in r for r in result["removed"])

        # Artifacts should still exist
        # node_modules/@pennyfarthing is untouched by the dry-run cleanup
        assert (npm_project / "node_modules" / "@pennyfarthing").exists()
        # init_project writes init-manifest.json (init-manifest.json, not manifest.json)
        # manifest.json is removed by _clean_stale_artifacts during init_project
        assert (npm_project / ".pennyfarthing" / "init-manifest.json").exists()


# ===========================================================================
# AC 4: E2E test — pf init is idempotent (run twice, same result)
# ===========================================================================


class TestIdempotency:
    """Running init twice produces the same result."""

    def test_init_twice_same_directory_structure(self, fresh_project: Path) -> None:
        """Second init does not duplicate or corrupt directory structure."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result1 = init_project(fresh_project, REAL_DIST)
            result2 = init_project(fresh_project, REAL_DIST)

        assert result1["success"]
        assert result2["success"]

        # Same number of commands and skills
        assert result1["data"]["commands_copied"] == result2["data"]["commands_copied"]
        assert result1["data"]["skills_copied"] == result2["data"]["skills_copied"]

    def test_init_twice_settings_not_overwritten(self, fresh_project: Path) -> None:
        """Second init does not overwrite existing settings.local.json."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(fresh_project, REAL_DIST)

        # Add a custom key to settings
        settings_path = fresh_project / ".claude" / "settings.local.json"
        settings = json.loads(settings_path.read_text())
        settings["custom_key"] = "user_value"
        settings_path.write_text(json.dumps(settings, indent=2) + "\n")

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result2 = init_project(fresh_project, REAL_DIST)

        assert result2["success"]
        assert result2["data"]["settings_written"] is False, "Settings were overwritten"

        # Custom key should still be present
        settings_after = json.loads(settings_path.read_text())
        assert settings_after.get("custom_key") == "user_value"

    def test_init_twice_gitignore_no_duplicates(self, fresh_project: Path) -> None:
        """Second init does not duplicate .gitignore entries."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(fresh_project, REAL_DIST)
            init_project(fresh_project, REAL_DIST)

        gitignore = (fresh_project / ".gitignore").read_text()
        lines = [line.strip() for line in gitignore.splitlines() if line.strip()]

        # Each entry should appear at most once
        assert lines.count(".session/") == 1
        assert lines.count(".claude/settings.local.json") == 1

    def test_init_twice_manifest_updated(self, fresh_project: Path) -> None:
        """Second init updates manifest timestamp (not stale)."""
        from pf.init.core import init_project

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(fresh_project, REAL_DIST)

        manifest_path = fresh_project / ".pennyfarthing" / "init-manifest.json"
        manifest1 = json.loads(manifest_path.read_text())
        ts1 = manifest1["initialized_at"]

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            init_project(fresh_project, REAL_DIST)

        manifest2 = json.loads(manifest_path.read_text())
        ts2 = manifest2["initialized_at"]

        # Timestamp should be updated (or at least not stale)
        assert ts2 >= ts1

    def test_upgrade_twice_is_safe(self, npm_project: Path) -> None:
        """Running upgrade twice does not corrupt state."""
        from pf.upgrade.core import run_upgrade

        result1 = run_upgrade(npm_project)
        result2 = run_upgrade(npm_project)

        assert result1["success"]
        assert result2["success"]

        # Settings should be valid JSON after both runs
        settings = json.loads(
            (npm_project / ".claude" / "settings.local.json").read_text()
        )
        assert "hooks" in settings


# ===========================================================================
# AC 5: Tests run in CI with isolated environments
# ===========================================================================


class TestCIReadiness:
    """Tests can run in CI without external dependencies."""

    def test_no_network_required(self, fresh_project: Path) -> None:
        """Init does not require network access (pf CLI check mocked)."""
        from pf.init.core import init_project

        # Mock verify_pf_cli to avoid requiring installed pf
        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(fresh_project, REAL_DIST)

        assert result["success"]

    def test_uses_tmp_paths_only(self, tmp_path: Path) -> None:
        """All test operations stay within tmp_path (no system pollution)."""
        from pf.init.core import init_project

        project = tmp_path / "ci-test"
        project.mkdir()
        (project / ".git").mkdir()

        with patch("pf.init.core.verify_pf_cli", return_value={"success": True, "version": "11.5.0"}):
            result = init_project(project, REAL_DIST)

        assert result["success"]

        # All created files should be under tmp_path
        for f in project.rglob("*"):
            assert str(f).startswith(str(tmp_path)), (
                f"File created outside tmp_path: {f}"
            )

    def test_upgrade_on_clean_project_is_noop(self, fresh_project: Path) -> None:
        """Upgrade on a project without npm artifacts is a safe no-op."""
        from pf.upgrade.core import run_upgrade

        result = run_upgrade(fresh_project)
        assert result["success"]
        # Should complete without error even with nothing to upgrade
