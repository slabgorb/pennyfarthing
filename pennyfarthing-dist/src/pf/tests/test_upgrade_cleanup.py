"""Tests for pf upgrade --clean artifact removal.

Story 126-14: pf upgrade cleanup — remove npm artifacts and stale symlinks.

Covers all acceptance criteria:
  AC1: pf upgrade --clean offers to remove node_modules/@pennyfarthing directory
  AC2: Stale symlinks in .claude/commands/ pointing to node_modules are detected and removed
  AC3: Old manifest.json (Node-era) removed after migration to init-manifest.json
  AC4: All cleanup requires user confirmation (or --yes flag for CI)
  AC5: Dry-run shows what would be cleaned without acting
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.upgrade.cli import upgrade
from pf.upgrade.core import cleanup_artifacts, detect_cleanup_targets

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def runner() -> CliRunner:
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def npm_project(tmp_path: Path) -> Path:
    """Project with npm-era artifacts to clean up."""
    # node_modules/@pennyfarthing directory
    npm_dir = tmp_path / "node_modules" / "@pennyfarthing" / "core"
    npm_dir.mkdir(parents=True)
    (npm_dir / "index.js").write_text("module.exports = {};")

    # .claude/commands/ with a stale symlink pointing to node_modules
    commands_dir = tmp_path / ".claude" / "commands"
    commands_dir.mkdir(parents=True)
    stale_link = commands_dir / "old-command.md"
    stale_link.symlink_to(
        tmp_path / "node_modules" / "@pennyfarthing" / "core" / "index.js"
    )
    # Also a valid symlink (should NOT be removed)
    good_file = tmp_path / "good-target.md"
    good_file.write_text("# Good command")
    good_link = commands_dir / "good-command.md"
    good_link.symlink_to(good_file)

    # Old manifest.json + new init-manifest.json
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(parents=True)
    (pf_dir / "manifest.json").write_text(json.dumps({"version": "10.0.0"}))
    (pf_dir / "init-manifest.json").write_text(
        json.dumps({"pf_version": "11.0.0", "initialized_at": "2026-01-01"})
    )

    # settings.local.json (needed for upgrade path)
    claude_dir = tmp_path / ".claude"
    (claude_dir / "settings.local.json").write_text(json.dumps({"hooks": {}}))

    return tmp_path


@pytest.fixture
def clean_project(tmp_path: Path) -> Path:
    """Project with no npm artifacts."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(parents=True)
    (pf_dir / "init-manifest.json").write_text(
        json.dumps({"pf_version": "11.0.0"})
    )
    commands_dir = tmp_path / ".claude" / "commands"
    commands_dir.mkdir(parents=True)
    return tmp_path


# ---------------------------------------------------------------------------
# detect_cleanup_targets
# ---------------------------------------------------------------------------


class TestDetectCleanupTargets:
    """AC1-3: Detection of npm-era artifacts."""

    def test_detects_npm_directory(self, npm_project: Path):
        result = detect_cleanup_targets(npm_project)
        assert result["success"]
        dirs = [t for t in result["targets"] if t["type"] == "directory"]
        assert len(dirs) == 1
        assert "node_modules/@pennyfarthing" in dirs[0]["path"]

    def test_detects_stale_symlinks(self, npm_project: Path):
        result = detect_cleanup_targets(npm_project)
        symlinks = [t for t in result["targets"] if t["type"] == "symlink"]
        assert len(symlinks) == 1
        assert "old-command.md" in symlinks[0]["path"]
        assert "node_modules" in symlinks[0]["target"]

    def test_ignores_valid_symlinks(self, npm_project: Path):
        result = detect_cleanup_targets(npm_project)
        symlinks = [t for t in result["targets"] if t["type"] == "symlink"]
        paths = [s["path"] for s in symlinks]
        assert not any("good-command" in p for p in paths)

    def test_detects_old_manifest(self, npm_project: Path):
        result = detect_cleanup_targets(npm_project)
        files = [t for t in result["targets"] if t["type"] == "file"]
        assert len(files) == 1
        assert "manifest.json" in files[0]["path"]

    def test_skips_manifest_without_replacement(self, tmp_path: Path):
        """Old manifest.json should NOT be flagged if init-manifest.json is missing."""
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir(parents=True)
        (pf_dir / "manifest.json").write_text("{}")
        result = detect_cleanup_targets(tmp_path)
        assert result["targets"] == []

    def test_clean_project_has_no_targets(self, clean_project: Path):
        result = detect_cleanup_targets(clean_project)
        assert result["success"]
        assert result["targets"] == []


# ---------------------------------------------------------------------------
# cleanup_artifacts
# ---------------------------------------------------------------------------


class TestCleanupArtifacts:
    """AC1-3: Actual removal of artifacts."""

    def test_removes_npm_directory(self, npm_project: Path):
        result = cleanup_artifacts(npm_project)
        assert result["success"]
        assert not (npm_project / "node_modules" / "@pennyfarthing").exists()
        assert any("node_modules/@pennyfarthing" in r for r in result["removed"])

    def test_removes_stale_symlinks(self, npm_project: Path):
        cleanup_artifacts(npm_project)
        assert not (npm_project / ".claude" / "commands" / "old-command.md").exists()
        # Valid symlink should still exist
        assert (npm_project / ".claude" / "commands" / "good-command.md").exists()

    def test_removes_old_manifest(self, npm_project: Path):
        cleanup_artifacts(npm_project)
        assert not (npm_project / ".pennyfarthing" / "manifest.json").exists()
        # New manifest should still exist
        assert (npm_project / ".pennyfarthing" / "init-manifest.json").exists()

    def test_dry_run_does_not_remove(self, npm_project: Path):
        """AC5: Dry-run shows what would be cleaned without acting."""
        result = cleanup_artifacts(npm_project, dry_run=True)
        assert result["success"]
        assert len(result["removed"]) > 0
        assert all("dry-run" in r for r in result["removed"])
        # Everything should still exist
        assert (npm_project / "node_modules" / "@pennyfarthing").exists()
        assert (npm_project / ".claude" / "commands" / "old-command.md").is_symlink()
        assert (npm_project / ".pennyfarthing" / "manifest.json").exists()

    def test_no_targets_returns_empty(self, clean_project: Path):
        result = cleanup_artifacts(clean_project)
        assert result["success"]
        assert result["removed"] == []
        assert result["skipped"] == []


# ---------------------------------------------------------------------------
# CLI: --clean flag
# ---------------------------------------------------------------------------


class TestCleanCLI:
    """AC4: User confirmation and --yes flag."""

    def test_clean_with_yes_flag(self, runner: CliRunner, npm_project: Path):
        """--yes skips confirmation prompt."""
        result = runner.invoke(upgrade, ["--clean", "--yes", str(npm_project)])
        assert result.exit_code == 0
        assert not (npm_project / "node_modules" / "@pennyfarthing").exists()

    def test_clean_dry_run(self, runner: CliRunner, npm_project: Path):
        """AC5: --dry-run --clean shows plan without executing."""
        result = runner.invoke(
            upgrade, ["--dry-run", "--clean", str(npm_project)]
        )
        assert result.exit_code == 0
        assert "dry-run" in result.output
        # Nothing actually removed
        assert (npm_project / "node_modules" / "@pennyfarthing").exists()

    def test_clean_prompts_user(self, runner: CliRunner, npm_project: Path):
        """AC4: Without --yes, prompts for confirmation."""
        result = runner.invoke(
            upgrade, ["--clean", str(npm_project)], input="y\n"
        )
        assert result.exit_code == 0
        assert "Proceed with cleanup?" in result.output
        assert not (npm_project / "node_modules" / "@pennyfarthing").exists()

    def test_clean_cancelled_by_user(self, runner: CliRunner, npm_project: Path):
        """AC4: User can decline cleanup."""
        result = runner.invoke(
            upgrade, ["--clean", str(npm_project)], input="n\n"
        )
        assert result.exit_code == 0
        assert "Cleanup cancelled" in result.output
        # Nothing removed
        assert (npm_project / "node_modules" / "@pennyfarthing").exists()

    def test_clean_no_artifacts(self, runner: CliRunner, clean_project: Path):
        """No artifacts message when nothing to clean."""
        result = runner.invoke(
            upgrade, ["--clean", str(clean_project)]
        )
        assert result.exit_code == 0
        assert "No artifacts to clean up" in result.output


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------


class TestCleanupReport:
    """Cleanup section appears in upgrade report."""

    def test_report_includes_cleanup(self, runner: CliRunner, npm_project: Path):
        result = runner.invoke(
            upgrade, ["--clean", "--yes", str(npm_project)]
        )
        assert result.exit_code == 0
        assert "Cleanup:" in result.output
        assert "Removed:" in result.output

    def test_dry_run_report_includes_cleanup(
        self, runner: CliRunner, npm_project: Path
    ):
        result = runner.invoke(
            upgrade, ["--dry-run", "--clean", str(npm_project)]
        )
        assert result.exit_code == 0
        assert "Cleanup:" in result.output
