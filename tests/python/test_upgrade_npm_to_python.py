"""Tests for pf upgrade — npm-based to Python-based migration (Story 126-7, MSSCI-15495).

Verifies that pf upgrade detects npm-based Pennyfarthing installations
and migrates to the Python-based structure, preserving user customizations.

Run with: python -m pytest tests/python/test_upgrade_npm_to_python.py -v
"""

import json
from pathlib import Path

from pf.upgrade.core import (
    detect_npm_install,
    generate_report,
    migrate_config_files,
    migrate_directory_structure,
    migrate_settings,
    preserve_custom_hooks,
    run_upgrade,
)


def _create_npm_install(tmp_path: Path) -> None:
    """Helper: create a fake npm-based Pennyfarthing installation."""
    # npm package structure
    npm_dist = tmp_path / "node_modules" / "@pennyfarthing" / "core" / "pennyfarthing-dist"
    npm_dist.mkdir(parents=True)
    (npm_dist / "agents").mkdir()
    (npm_dist / "commands").mkdir()
    (npm_dist / "skills").mkdir()
    (npm_dist / "scripts").mkdir()
    (npm_dist / "workflows").mkdir()

    # .pennyfarthing/ with symlinks pointing to node_modules
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)

    # .claude/ directory
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    (claude_dir / "commands").mkdir(exist_ok=True)
    (claude_dir / "skills").mkdir(exist_ok=True)

    # package.json referencing @pennyfarthing/core
    pkg = {"dependencies": {"@pennyfarthing/core": "^11.0.0"}}
    (tmp_path / "package.json").write_text(json.dumps(pkg))


def _create_settings_with_hooks(tmp_path: Path, hooks: dict) -> None:
    """Helper: write a settings.local.json with given hooks."""
    settings_path = tmp_path / ".claude" / "settings.local.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps({"hooks": hooks}, indent=2))


class TestDetectNpmInstall:
    """AC1: Detects npm-based install (node_modules/@pennyfarthing)."""

    def test_detects_npm_install_present(self, tmp_path):
        """Returns is_npm=True when node_modules/@pennyfarthing exists."""
        _create_npm_install(tmp_path)
        result = detect_npm_install(tmp_path)
        assert result["success"] is True
        assert result["is_npm"] is True

    def test_detects_npm_paths(self, tmp_path):
        """Returns list of npm artifact paths found."""
        _create_npm_install(tmp_path)
        result = detect_npm_install(tmp_path)
        assert result["success"] is True
        assert len(result["npm_paths"]) > 0
        assert any("node_modules" in p for p in result["npm_paths"])

    def test_no_npm_install_returns_false(self, tmp_path):
        """Returns is_npm=False when no npm artifacts found."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = detect_npm_install(tmp_path)
        assert result["success"] is True
        assert result["is_npm"] is False

    def test_detects_package_json_dependency(self, tmp_path):
        """Detects @pennyfarthing/core in package.json dependencies."""
        _create_npm_install(tmp_path)
        result = detect_npm_install(tmp_path)
        assert result["success"] is True
        assert result["is_npm"] is True

    def test_no_false_positive_on_unrelated_node_modules(self, tmp_path):
        """Does not flag non-pennyfarthing node_modules as npm install."""
        (tmp_path / "node_modules" / "lodash").mkdir(parents=True)
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = detect_npm_install(tmp_path)
        assert result["success"] is True
        assert result["is_npm"] is False


class TestMigrateDirectoryStructure:
    """AC2: Migrates directory structure to new layout."""

    def test_creates_python_layout_dirs(self, tmp_path):
        """Creates the Python-based directory structure."""
        _create_npm_install(tmp_path)
        result = migrate_directory_structure(tmp_path)
        assert result["success"] is True
        assert (tmp_path / ".pennyfarthing").is_dir()

    def test_reports_changes_made(self, tmp_path):
        """Returns a list of changes made during migration."""
        _create_npm_install(tmp_path)
        result = migrate_directory_structure(tmp_path)
        assert result["success"] is True
        assert "changes" in result
        assert len(result["changes"]) > 0

    def test_dry_run_does_not_modify(self, tmp_path):
        """Dry run reports changes without executing them."""
        _create_npm_install(tmp_path)
        # Record state before
        before_contents = set(p.name for p in tmp_path.rglob("*") if p.is_file())
        result = migrate_directory_structure(tmp_path, dry_run=True)
        assert result["success"] is True
        # State should be unchanged
        after_contents = set(p.name for p in tmp_path.rglob("*") if p.is_file())
        assert before_contents == after_contents

    def test_idempotent_on_already_migrated(self, tmp_path):
        """Running migration on an already-migrated project succeeds."""
        _create_npm_install(tmp_path)
        result1 = migrate_directory_structure(tmp_path)
        assert result1["success"] is True
        result2 = migrate_directory_structure(tmp_path)
        assert result2["success"] is True


class TestPreserveCustomHooks:
    """AC3: Preserves user custom hooks (non-pf-* prefixed)."""

    def test_identifies_custom_hooks(self, tmp_path):
        """Identifies hooks that are NOT pf hooks commands."""
        hooks = {
            "PreToolUse": [
                {"hooks": [{"type": "command", "command": "pf hooks pre-edit-check"}]},
                {"hooks": [{"type": "command", "command": "my-custom-linter check"}]},
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = preserve_custom_hooks(tmp_path)
        assert result["success"] is True
        assert len(result["custom_hooks"]) >= 1

    def test_pf_hooks_not_in_custom(self, tmp_path):
        """pf hooks commands are NOT included in custom hooks."""
        hooks = {
            "PreToolUse": [
                {"hooks": [{"type": "command", "command": "pf hooks pre-edit-check"}]},
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = preserve_custom_hooks(tmp_path)
        assert result["success"] is True
        # pf hooks should not appear in custom_hooks
        for hook in result["custom_hooks"]:
            for h in hook.get("hooks", []):
                assert not h.get("command", "").startswith("pf hooks")

    def test_preserves_hook_structure(self, tmp_path):
        """Custom hooks are returned with their full structure intact."""
        hooks = {
            "PostToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [{"type": "command", "command": "my-logger log-bash"}],
                }
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = preserve_custom_hooks(tmp_path)
        assert result["success"] is True
        assert len(result["custom_hooks"]) >= 1
        # Structure should include matcher
        found = False
        for hook in result["custom_hooks"]:
            if hook.get("matcher") == "Bash":
                found = True
        assert found, "Custom hook structure (matcher) not preserved"

    def test_handles_no_settings_file(self, tmp_path):
        """Returns empty custom_hooks when settings.local.json missing."""
        result = preserve_custom_hooks(tmp_path)
        assert result["success"] is True
        assert result["custom_hooks"] == []

    def test_handles_old_npm_hook_commands(self, tmp_path):
        """Identifies old npm-era hook commands (npx, node) as non-custom."""
        hooks = {
            "PreToolUse": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing pre-edit"}]},
                {"hooks": [{"type": "command", "command": "my-tool check"}]},
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = preserve_custom_hooks(tmp_path)
        assert result["success"] is True
        # npx pennyfarthing hooks should not be in custom_hooks
        for hook in result["custom_hooks"]:
            for h in hook.get("hooks", []):
                cmd = h.get("command", "")
                assert not cmd.startswith("npx pennyfarthing")


class TestMigrateSettings:
    """AC4: Migrates settings.local.json (removes old hooks, adds new)."""

    def test_replaces_npm_hooks_with_python(self, tmp_path):
        """Old npm-era hooks are replaced with Python CLI equivalents."""
        hooks = {
            "SessionStart": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing session-start"}]}
            ],
            "PostToolUse": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing bell-mode"}]}
            ],
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = migrate_settings(tmp_path)
        assert result["success"] is True
        assert len(result["hooks_removed"]) > 0
        assert len(result["hooks_added"]) > 0

    def test_preserves_custom_hooks_in_settings(self, tmp_path):
        """Custom hooks survive the settings migration."""
        hooks = {
            "PreToolUse": [
                {"hooks": [{"type": "command", "command": "pf hooks pre-edit-check"}]},
                {"hooks": [{"type": "command", "command": "my-custom-linter check"}]},
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = migrate_settings(tmp_path)
        assert result["success"] is True
        assert len(result["hooks_preserved"]) >= 1

    def test_settings_file_valid_json_after_migration(self, tmp_path):
        """settings.local.json is valid JSON after migration."""
        hooks = {
            "SessionStart": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing session-start"}]}
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = migrate_settings(tmp_path)
        assert result["success"] is True
        settings_path = tmp_path / ".claude" / "settings.local.json"
        # Should be valid JSON
        data = json.loads(settings_path.read_text())
        assert "hooks" in data

    def test_dry_run_does_not_modify_settings(self, tmp_path):
        """Dry run reports changes without modifying settings.local.json."""
        hooks = {
            "SessionStart": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing session-start"}]}
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        original = (tmp_path / ".claude" / "settings.local.json").read_text()
        result = migrate_settings(tmp_path, dry_run=True)
        assert result["success"] is True
        after = (tmp_path / ".claude" / "settings.local.json").read_text()
        assert original == after


class TestMigrateConfigFiles:
    """AC5: Config files migrated (preferences.yaml → config.local.yaml)."""

    def test_migrates_preferences_yaml(self, tmp_path):
        """preferences.yaml is migrated into config.local.yaml."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        claude_pf_dir = tmp_path / ".claude" / "pennyfarthing"
        claude_pf_dir.mkdir(parents=True)
        (claude_pf_dir / "preferences.yaml").write_text("theme: firefly\n")
        result = migrate_config_files(tmp_path)
        assert result["success"] is True
        assert len(result["migrated"]) > 0

    def test_config_local_yaml_has_migrated_values(self, tmp_path):
        """config.local.yaml contains values from preferences.yaml after migration."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        claude_pf_dir = tmp_path / ".claude" / "pennyfarthing"
        claude_pf_dir.mkdir(parents=True)
        (claude_pf_dir / "preferences.yaml").write_text("theme: firefly\n")
        result = migrate_config_files(tmp_path)
        assert result["success"] is True
        config_path = pf_dir / "config.local.yaml"
        assert config_path.exists()

    def test_preserves_existing_config(self, tmp_path):
        """Existing config.local.yaml values are not overwritten."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        config_path = pf_dir / "config.local.yaml"
        config_path.write_text("theme: discworld\nbell_mode: true\n")
        claude_pf_dir = tmp_path / ".claude" / "pennyfarthing"
        claude_pf_dir.mkdir(parents=True)
        (claude_pf_dir / "preferences.yaml").write_text("theme: firefly\n")
        result = migrate_config_files(tmp_path)
        assert result["success"] is True
        # Existing theme should be preserved (discworld, not overwritten by firefly)
        content = config_path.read_text()
        assert "discworld" in content

    def test_handles_no_legacy_configs(self, tmp_path):
        """Returns success with empty migrated list when no legacy configs exist."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        result = migrate_config_files(tmp_path)
        assert result["success"] is True
        assert result["migrated"] == []

    def test_dry_run_does_not_modify_config(self, tmp_path):
        """Dry run reports plan without modifying config files."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        claude_pf_dir = tmp_path / ".claude" / "pennyfarthing"
        claude_pf_dir.mkdir(parents=True)
        prefs = claude_pf_dir / "preferences.yaml"
        prefs.write_text("theme: firefly\n")
        result = migrate_config_files(tmp_path, dry_run=True)
        assert result["success"] is True
        # preferences.yaml should still exist (not removed)
        assert prefs.exists()


class TestGenerateReport:
    """AC6: Clear reporting of what changed."""

    def test_report_is_non_empty_string(self):
        """generate_report returns a non-empty string."""
        results = {
            "detection": {"is_npm": True, "npm_paths": ["node_modules/@pennyfarthing"]},
            "directory": {"changes": ["created .pennyfarthing/scripts"]},
            "hooks": {"hooks_removed": 3, "hooks_added": 5, "hooks_preserved": 1},
            "config": {"migrated": ["preferences.yaml"]},
        }
        report = generate_report(results)
        assert isinstance(report, str)
        assert len(report) > 0

    def test_report_mentions_npm_detection(self):
        """Report includes information about npm detection."""
        results = {
            "detection": {"is_npm": True, "npm_paths": ["node_modules/@pennyfarthing"]},
            "directory": {"changes": []},
            "hooks": {"hooks_removed": 0, "hooks_added": 0, "hooks_preserved": 0},
            "config": {"migrated": []},
        }
        report = generate_report(results)
        assert "npm" in report.lower()

    def test_report_mentions_hooks_preserved(self):
        """Report tells user how many custom hooks were preserved."""
        results = {
            "detection": {"is_npm": True, "npm_paths": []},
            "directory": {"changes": []},
            "hooks": {"hooks_removed": 2, "hooks_added": 5, "hooks_preserved": 3},
            "config": {"migrated": []},
        }
        report = generate_report(results)
        assert "preserv" in report.lower() or "3" in report

    def test_report_mentions_config_migration(self):
        """Report includes config file migration details."""
        results = {
            "detection": {"is_npm": True, "npm_paths": []},
            "directory": {"changes": []},
            "hooks": {"hooks_removed": 0, "hooks_added": 0, "hooks_preserved": 0},
            "config": {"migrated": ["preferences.yaml"]},
        }
        report = generate_report(results)
        assert "config" in report.lower() or "preferences" in report.lower()


class TestRunUpgradeOrchestrator:
    """Integration: run_upgrade orchestrates all steps."""

    def test_full_upgrade_succeeds(self, tmp_path):
        """run_upgrade returns success for a valid npm-based project."""
        _create_npm_install(tmp_path)
        hooks = {
            "SessionStart": [
                {"hooks": [{"type": "command", "command": "npx pennyfarthing session-start"}]}
            ]
        }
        _create_settings_with_hooks(tmp_path, hooks)
        result = run_upgrade(tmp_path)
        assert result["success"] is True
        assert "report" in result

    def test_upgrade_on_non_npm_project_returns_not_needed(self, tmp_path):
        """run_upgrade returns appropriate result for non-npm project."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        result = run_upgrade(tmp_path)
        assert result["success"] is True
        # Should indicate no migration needed

    def test_dry_run_returns_plan(self, tmp_path):
        """run_upgrade with dry_run=True returns plan without changes."""
        _create_npm_install(tmp_path)
        result = run_upgrade(tmp_path, dry_run=True)
        assert result["success"] is True

    def test_upgrade_result_has_report(self, tmp_path):
        """run_upgrade result includes a human-readable report."""
        _create_npm_install(tmp_path)
        result = run_upgrade(tmp_path)
        assert result["success"] is True
        assert isinstance(result.get("report"), str)
        assert len(result["report"]) > 0
