"""Tests for pf init command.

Story 126-2: Rewrite pf init in Python — directory structure,
commands/skills, settings.

Tests verify:
1. pf init creates .pennyfarthing/ directory structure
2. pf init creates .claude/ directory structure
3. Commands copied with pf-* prefix
4. Skills copied with pf-* prefix
5. Minimal settings.local.json written (5 hooks only)
6. .gitignore updated
7. Idempotent — running twice produces same result
8. --dry-run shows what would be done without doing it
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def target_dir(tmp_path: Path) -> Path:
    """Empty target directory simulating a fresh project."""
    target = tmp_path / "my-project"
    target.mkdir()
    return target


@pytest.fixture
def mock_dist(tmp_path: Path) -> Path:
    """Minimal mock pennyfarthing-dist with sample commands and skills.

    Layout:
        pennyfarthing-dist/
          commands/
            pf-sprint.md
            pf-dev.md
            pf-tea.md
            internal-only.md   (should NOT be copied)
          skills/
            pf-testing/
              pf-testing.md
              references/
                patterns.md
            pf-sprint/
              pf-sprint.md
            internal-skill/    (should NOT be copied)
              internal.md
    """
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()

    # Commands
    commands_dir = dist / "commands"
    commands_dir.mkdir()
    (commands_dir / "pf-sprint.md").write_text(
        "---\nname: pf-sprint\n---\n# Sprint command\n"
    )
    (commands_dir / "pf-dev.md").write_text(
        "---\nname: pf-dev\n---\n# Dev command\n"
    )
    (commands_dir / "pf-tea.md").write_text(
        "---\nname: pf-tea\n---\n# Tea command\n"
    )
    # Non-pf command — must NOT be copied
    (commands_dir / "internal-only.md").write_text(
        "---\nname: internal\n---\n# Internal\n"
    )

    # Skills
    skills_dir = dist / "skills"
    skills_dir.mkdir()

    skill1 = skills_dir / "pf-testing"
    skill1.mkdir()
    (skill1 / "pf-testing.md").write_text("# Testing skill\n")
    (skill1 / "references").mkdir()
    (skill1 / "references" / "patterns.md").write_text("# Patterns\n")

    skill2 = skills_dir / "pf-sprint"
    skill2.mkdir()
    (skill2 / "pf-sprint.md").write_text("# Sprint skill\n")

    # Non-pf skill — must NOT be copied
    internal_skill = skills_dir / "internal-skill"
    internal_skill.mkdir()
    (internal_skill / "internal.md").write_text("# Internal\n")

    return dist


# ===================================================================
# AC 1: pf init creates .pennyfarthing/ directory structure
# ===================================================================


class TestPennyfarthingDirCreation:
    """AC: pf init creates .pennyfarthing/ directory structure."""

    def test_creates_pennyfarthing_root(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .pennyfarthing/ directory."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert result["success"] is True
        assert (target_dir / ".pennyfarthing").is_dir()

    def test_creates_commands_subdir(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .pennyfarthing/commands/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".pennyfarthing" / "commands").is_dir()

    def test_creates_skills_subdir(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .pennyfarthing/skills/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".pennyfarthing" / "skills").is_dir()

    def test_creates_scripts_tree(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .pennyfarthing/scripts/ and scripts/lib/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".pennyfarthing" / "scripts").is_dir()
        assert (target_dir / ".pennyfarthing" / "scripts" / "lib").is_dir()


# ===================================================================
# AC 2: pf init creates .claude/ directory structure
# ===================================================================


class TestClaudeDirCreation:
    """AC: pf init creates .claude/ directory structure."""

    def test_creates_claude_root(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .claude/ directory."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert result["success"] is True
        assert (target_dir / ".claude").is_dir()

    def test_creates_claude_commands(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .claude/commands/ for Claude Code command access."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".claude" / "commands").is_dir()

    def test_creates_claude_skills(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .claude/skills/ for Claude Code skill access."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".claude" / "skills").is_dir()


# ===================================================================
# AC 3: Commands copied with pf-* prefix
# ===================================================================


class TestCommandsCopy:
    """AC: Commands and skills copied with pf-* prefix."""

    def test_copies_pf_prefixed_commands(self, target_dir: Path, mock_dist: Path) -> None:
        """Should copy all pf-*.md commands to .pennyfarthing/commands/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        commands_dir = target_dir / ".pennyfarthing" / "commands"
        assert (commands_dir / "pf-sprint.md").is_file()
        assert (commands_dir / "pf-dev.md").is_file()
        assert (commands_dir / "pf-tea.md").is_file()

    def test_preserves_command_content(self, target_dir: Path, mock_dist: Path) -> None:
        """Copied commands should have identical content to source."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        source = (mock_dist / "commands" / "pf-sprint.md").read_text()
        copied = (target_dir / ".pennyfarthing" / "commands" / "pf-sprint.md").read_text()
        assert source == copied

    def test_skips_non_pf_commands(self, target_dir: Path, mock_dist: Path) -> None:
        """Should NOT copy commands without pf-* prefix."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        commands_dir = target_dir / ".pennyfarthing" / "commands"
        assert not (commands_dir / "internal-only.md").exists()

    def test_copies_commands_to_claude_dir(self, target_dir: Path, mock_dist: Path) -> None:
        """Should also make pf-* commands accessible from .claude/commands/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        claude_commands = target_dir / ".claude" / "commands"
        pf_commands = list(claude_commands.glob("pf-*.md"))
        assert len(pf_commands) >= 3


# ===================================================================
# AC 4: Skills copied with pf-* prefix
# ===================================================================


class TestSkillsCopy:
    """AC: Skills copied with pf-* prefix."""

    def test_copies_pf_prefixed_skills(self, target_dir: Path, mock_dist: Path) -> None:
        """Should copy all pf-* skill directories."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        skills_dir = target_dir / ".pennyfarthing" / "skills"
        assert (skills_dir / "pf-testing").is_dir()
        assert (skills_dir / "pf-sprint").is_dir()

    def test_copies_skill_contents_recursively(self, target_dir: Path, mock_dist: Path) -> None:
        """Copied skills should include all nested files and directories."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        skill_dir = target_dir / ".pennyfarthing" / "skills" / "pf-testing"
        assert (skill_dir / "pf-testing.md").is_file()
        assert (skill_dir / "references" / "patterns.md").is_file()

    def test_preserves_skill_content(self, target_dir: Path, mock_dist: Path) -> None:
        """Copied skill files should have identical content to source."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        source = (mock_dist / "skills" / "pf-testing" / "pf-testing.md").read_text()
        copied = (
            target_dir / ".pennyfarthing" / "skills" / "pf-testing" / "pf-testing.md"
        ).read_text()
        assert source == copied

    def test_skips_non_pf_skills(self, target_dir: Path, mock_dist: Path) -> None:
        """Should NOT copy skills without pf-* prefix."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        skills_dir = target_dir / ".pennyfarthing" / "skills"
        assert not (skills_dir / "internal-skill").exists()

    def test_copies_skills_to_claude_dir(self, target_dir: Path, mock_dist: Path) -> None:
        """Should also make pf-* skills accessible from .claude/skills/."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        claude_skills = target_dir / ".claude" / "skills"
        pf_skills = [d for d in claude_skills.iterdir() if d.name.startswith("pf-")]
        assert len(pf_skills) >= 2


# ===================================================================
# AC 5: Minimal settings.local.json written (5 hooks only)
# ===================================================================


class TestSettingsFile:
    """AC: Minimal settings.local.json written (5 hooks only)."""

    def test_creates_settings_file(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .claude/settings.local.json."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        assert settings_path.is_file()

    def test_settings_is_valid_json(self, target_dir: Path, mock_dist: Path) -> None:
        """settings.local.json should be valid JSON."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        assert isinstance(data, dict)

    def test_settings_has_hooks_section(self, target_dir: Path, mock_dist: Path) -> None:
        """settings.local.json should contain a hooks configuration."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        assert "hooks" in data

    def test_settings_has_exactly_five_hooks(self, target_dir: Path, mock_dist: Path) -> None:
        """settings.local.json should have exactly 5 essential hook entries."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})

        # Count total hook entries across all hook types
        total_hooks = sum(len(entries) for entries in hooks.values())
        assert total_hooks == 5, f"Expected 5 hooks, got {total_hooks}"

    def test_settings_has_session_start_hook(self, target_dir: Path, mock_dist: Path) -> None:
        """Should include session-start hook under SessionStart."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        assert "SessionStart" in hooks
        session_start = hooks["SessionStart"]
        commands = _extract_hook_commands(session_start)
        assert any("session-start" in cmd for cmd in commands)

    def test_settings_has_session_stop_hook(self, target_dir: Path, mock_dist: Path) -> None:
        """Should include session-stop hook under Stop."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        assert "Stop" in hooks
        stop = hooks["Stop"]
        commands = _extract_hook_commands(stop)
        assert any("session-stop" in cmd for cmd in commands)

    def test_settings_has_pre_edit_check_hook(self, target_dir: Path, mock_dist: Path) -> None:
        """Should include pre-edit-check hook under PreToolUse."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        pre_tool = hooks.get("PreToolUse", [])
        commands = _extract_hook_commands(pre_tool)
        assert any("pre-edit-check" in cmd for cmd in commands)

    def test_settings_has_context_warning_hook(self, target_dir: Path, mock_dist: Path) -> None:
        """Should include context-warning hook under PreToolUse."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        pre_tool = hooks.get("PreToolUse", [])
        commands = _extract_hook_commands(pre_tool)
        assert any("context-warning" in cmd for cmd in commands)

    def test_settings_has_bell_mode_hook(self, target_dir: Path, mock_dist: Path) -> None:
        """Should include bell-mode hook under PostToolUse."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        hooks = data.get("hooks", {})
        post_tool = hooks.get("PostToolUse", [])
        commands = _extract_hook_commands(post_tool)
        assert any("bell-mode" in cmd for cmd in commands)


# ===================================================================
# AC 6: .gitignore updated
# ===================================================================


class TestGitignoreUpdate:
    """AC: .gitignore updated."""

    def test_creates_gitignore_if_missing(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .gitignore if it doesn't exist."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        assert (target_dir / ".gitignore").is_file()

    def test_adds_pennyfarthing_entries(self, target_dir: Path, mock_dist: Path) -> None:
        """Should add pennyfarthing-related entries to .gitignore."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        content = (target_dir / ".gitignore").read_text()
        # Should include config.local.yaml (local-only setting)
        assert ".pennyfarthing/config.local.yaml" in content

    def test_adds_session_entries(self, target_dir: Path, mock_dist: Path) -> None:
        """Should add .session/ entries to .gitignore."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        content = (target_dir / ".gitignore").read_text()
        assert ".session/" in content or ".session/*" in content

    def test_adds_claude_settings_entry(self, target_dir: Path, mock_dist: Path) -> None:
        """Should add .claude/settings.local.json to .gitignore."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        content = (target_dir / ".gitignore").read_text()
        assert ".claude/settings.local.json" in content

    def test_appends_to_existing_gitignore(self, target_dir: Path, mock_dist: Path) -> None:
        """Should append to existing .gitignore without overwriting."""
        from pf.init.core import init_project

        existing = "node_modules/\n*.log\n"
        (target_dir / ".gitignore").write_text(existing)

        init_project(target_dir=target_dir, dist_root=mock_dist)

        content = (target_dir / ".gitignore").read_text()
        # Original entries preserved
        assert "node_modules/" in content
        assert "*.log" in content


# ===================================================================
# AC 7: Idempotent — running twice produces same result
# ===================================================================


class TestIdempotency:
    """AC: Idempotent — running twice produces same result."""

    def test_running_twice_both_succeed(self, target_dir: Path, mock_dist: Path) -> None:
        """Running pf init twice should both return success."""
        from pf.init.core import init_project

        result1 = init_project(target_dir=target_dir, dist_root=mock_dist)
        result2 = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert result1["success"] is True
        assert result2["success"] is True

    def test_running_twice_same_directories(self, target_dir: Path, mock_dist: Path) -> None:
        """Running pf init twice should produce identical directory structure."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)
        dirs_after_first = _snapshot_dirs(target_dir)

        init_project(target_dir=target_dir, dist_root=mock_dist)
        dirs_after_second = _snapshot_dirs(target_dir)

        assert dirs_after_first == dirs_after_second

    def test_running_twice_same_files(self, target_dir: Path, mock_dist: Path) -> None:
        """Running pf init twice should produce identical file set."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)
        files_after_first = _snapshot_files(target_dir)

        init_project(target_dir=target_dir, dist_root=mock_dist)
        files_after_second = _snapshot_files(target_dir)

        assert files_after_first == files_after_second

    def test_gitignore_no_duplicate_entries(self, target_dir: Path, mock_dist: Path) -> None:
        """Running twice should not duplicate .gitignore entries."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)
        init_project(target_dir=target_dir, dist_root=mock_dist)

        content = (target_dir / ".gitignore").read_text()
        lines = [
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.startswith("#")
        ]
        assert len(lines) == len(set(lines)), "Duplicate entries found in .gitignore"

    def test_settings_not_corrupted_on_rerun(self, target_dir: Path, mock_dist: Path) -> None:
        """Running twice should not corrupt settings.local.json."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)
        first_settings = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )

        init_project(target_dir=target_dir, dist_root=mock_dist)
        second_settings = json.loads(
            (target_dir / ".claude" / "settings.local.json").read_text()
        )

        assert first_settings == second_settings


# ===================================================================
# AC 8: --dry-run shows what would be done without doing it
# ===================================================================


class TestDryRun:
    """AC: --dry-run flag shows what would be done without doing it."""

    def test_dry_run_creates_no_directories(self, target_dir: Path, mock_dist: Path) -> None:
        """--dry-run should not create any directories."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)

        assert not (target_dir / ".pennyfarthing").exists()
        assert not (target_dir / ".claude").exists()

    def test_dry_run_creates_no_files(self, target_dir: Path, mock_dist: Path) -> None:
        """--dry-run should not create any files."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)

        created_files = list(target_dir.rglob("*"))
        assert len(created_files) == 0

    def test_dry_run_returns_success(self, target_dir: Path, mock_dist: Path) -> None:
        """--dry-run should return success with a plan."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)

        assert result["success"] is True

    def test_dry_run_returns_plan(self, target_dir: Path, mock_dist: Path) -> None:
        """--dry-run should return a plan describing what would be done."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)

        assert "data" in result
        plan = result["data"]
        # Plan should describe directories and files
        assert "directories" in plan or "actions" in plan

    def test_dry_run_lists_commands_to_copy(self, target_dir: Path, mock_dist: Path) -> None:
        """--dry-run plan should list commands that would be copied."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)

        plan_str = str(result.get("data", {}))
        assert "pf-sprint" in plan_str or "commands" in plan_str

    def test_dry_run_then_real_run(self, target_dir: Path, mock_dist: Path) -> None:
        """Dry run followed by real run should work correctly."""
        from pf.init.core import init_project

        dry_result = init_project(target_dir=target_dir, dist_root=mock_dist, dry_run=True)
        assert not (target_dir / ".pennyfarthing").exists()

        real_result = init_project(target_dir=target_dir, dist_root=mock_dist)
        assert real_result["success"] is True
        assert (target_dir / ".pennyfarthing").is_dir()


# ===================================================================
# CLI integration tests
# ===================================================================


class TestCliInvocation:
    """Test the Click CLI command integration."""

    def test_init_command_exists(self) -> None:
        """pf init should be importable as a Click command."""
        from pf.init.cli import init as init_cmd

        assert init_cmd is not None
        assert hasattr(init_cmd, "callback")

    def test_init_help(self, runner: CliRunner) -> None:
        """pf init --help should show help text."""
        from pf.init.cli import init as init_cmd

        result = runner.invoke(init_cmd, ["--help"])

        assert result.exit_code == 0
        assert "initialize" in result.output.lower() or "init" in result.output.lower()

    def test_init_has_dry_run_option(self, runner: CliRunner) -> None:
        """pf init should accept --dry-run flag."""
        from pf.init.cli import init as init_cmd

        result = runner.invoke(init_cmd, ["--help"])

        assert "--dry-run" in result.output


# ===================================================================
# Result format tests
# ===================================================================


class TestResultFormat:
    """Verify result objects follow {success, data?, error?} convention."""

    def test_success_result_has_required_keys(self, target_dir: Path, mock_dist: Path) -> None:
        """Successful init should return {success: True, data: {...}}."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert "success" in result
        assert result["success"] is True
        assert "data" in result

    def test_result_data_has_summary(self, target_dir: Path, mock_dist: Path) -> None:
        """Result data should include summary of what was created/copied."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        data = result.get("data", {})
        # Should report what was done
        assert "commands_copied" in data or "summary" in data

    def test_error_result_for_invalid_dist_root(self, target_dir: Path, tmp_path: Path) -> None:
        """Should return error for nonexistent dist_root."""
        from pf.init.core import init_project

        bad_dist = tmp_path / "nonexistent"
        result = init_project(target_dir=target_dir, dist_root=bad_dist)

        assert result["success"] is False
        assert "error" in result

    def test_error_result_for_invalid_target(self, tmp_path: Path, mock_dist: Path) -> None:
        """Should return error for nonexistent target_dir."""
        from pf.init.core import init_project

        bad_target = tmp_path / "does-not-exist"
        result = init_project(target_dir=bad_target, dist_root=mock_dist)

        assert result["success"] is False
        assert "error" in result


# ===================================================================
# Init manifest
# ===================================================================


class TestInitManifest:
    """Verify init-manifest.json is written for upgrade tracking."""

    def test_creates_manifest(self, target_dir: Path, mock_dist: Path) -> None:
        """Should create .pennyfarthing/init-manifest.json."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        manifest_path = target_dir / ".pennyfarthing" / "init-manifest.json"
        assert manifest_path.is_file()

    def test_manifest_has_version(self, target_dir: Path, mock_dist: Path) -> None:
        """Manifest should record pf version."""
        from pf import __version__
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        manifest = json.loads(
            (target_dir / ".pennyfarthing" / "init-manifest.json").read_text()
        )
        assert manifest["pf_version"] == __version__

    def test_manifest_has_timestamp(self, target_dir: Path, mock_dist: Path) -> None:
        """Manifest should record initialization timestamp."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        manifest = json.loads(
            (target_dir / ".pennyfarthing" / "init-manifest.json").read_text()
        )
        assert "initialized_at" in manifest
        # Should be a valid ISO timestamp
        assert "T" in manifest["initialized_at"]

    def test_manifest_has_counts(self, target_dir: Path, mock_dist: Path) -> None:
        """Manifest should record what was copied."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        manifest = json.loads(
            (target_dir / ".pennyfarthing" / "init-manifest.json").read_text()
        )
        assert manifest["commands_copied"] == 3
        assert manifest["skills_copied"] == 2


# ===================================================================
# Settings guard (don't overwrite existing)
# ===================================================================


class TestSettingsGuard:
    """Verify settings.local.json is not overwritten on re-init."""

    def test_preserves_existing_settings(self, target_dir: Path, mock_dist: Path) -> None:
        """Re-init should NOT overwrite user-modified settings."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)

        # Simulate user adding a custom key
        settings_path = target_dir / ".claude" / "settings.local.json"
        data = json.loads(settings_path.read_text())
        data["custom_key"] = "user_value"
        settings_path.write_text(json.dumps(data, indent=2) + "\n")

        # Re-init
        init_project(target_dir=target_dir, dist_root=mock_dist)

        preserved = json.loads(settings_path.read_text())
        assert preserved.get("custom_key") == "user_value"

    def test_settings_written_false_on_rerun(self, target_dir: Path, mock_dist: Path) -> None:
        """Result should report settings_written=False when file existed."""
        from pf.init.core import init_project

        init_project(target_dir=target_dir, dist_root=mock_dist)
        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert result["data"]["settings_written"] is False

    def test_settings_written_true_on_first_run(self, target_dir: Path, mock_dist: Path) -> None:
        """Result should report settings_written=True on fresh init."""
        from pf.init.core import init_project

        result = init_project(target_dir=target_dir, dist_root=mock_dist)

        assert result["data"]["settings_written"] is True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_hook_commands(hook_entries: list[dict]) -> list[str]:
    """Extract command strings from a list of hook entry dicts."""
    commands = []
    for entry in hook_entries:
        for hook in entry.get("hooks", []):
            if "command" in hook:
                commands.append(hook["command"])
    return commands


def _snapshot_dirs(root: Path) -> set[str]:
    """Snapshot all directory paths relative to root."""
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_dir()}


def _snapshot_files(root: Path) -> set[str]:
    """Snapshot all file paths relative to root."""
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}
