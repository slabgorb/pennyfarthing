"""Tests for justfile management in pf init.

Tests verify:
1. Fresh init (no justfile) creates both justfile and justfile.pf
2. Existing justfile without import gets import line added
3. Legacy justfile with inline framework recipes gets them migrated
4. Idempotent — running twice is safe
5. Dry-run creates no files
"""

from __future__ import annotations

from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def target_dir(tmp_path: Path) -> Path:
    """Empty target directory simulating a fresh project."""
    target = tmp_path / "my-project"
    target.mkdir()
    (target / ".pennyfarthing").mkdir()
    return target


@pytest.fixture
def mock_dist(tmp_path: Path) -> Path:
    """Minimal mock pennyfarthing-dist with justfile.pf.template."""
    dist = tmp_path / "pennyfarthing-dist"
    dist.mkdir()
    templates = dist / "templates"
    templates.mkdir()

    (templates / "justfile.pf.template").write_text(
        "# Framework recipes — auto-generated\n"
        "# DO NOT EDIT\n"
        "\n"
        "root := justfile_directory() / \"..\"\n"
        "\n"
        "wheelhub *args:\n"
        "    pf launch gui --no-open\n"
        "\n"
        "tui:\n"
        "    pf launch tui --foreground\n"
        "\n"
        "gui:\n"
        "    pf launch gui\n"
        "\n"
        "claude:\n"
        "    exec claude\n"
        "\n"
        'tmux-dev:\n'
        '    exec "{{root}}/tmux-dev"\n'
        "\n"
        "tmux dir=invocation_directory():\n"
        '    "{{root}}/tmux-dev" "{{dir}}"\n'
    )

    return dist


# ===================================================================
# 1. Fresh init — no justfile exists
# ===================================================================


class TestFreshInit:
    """Fresh init creates both justfile and .pennyfarthing/justfile.pf."""

    def test_creates_justfile_pf(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert (target_dir / ".pennyfarthing" / "justfile.pf").is_file()

    def test_justfile_pf_has_template_content(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / ".pennyfarthing" / "justfile.pf").read_text()
        assert "Framework recipes" in content
        assert "wheelhub" in content

    def test_creates_main_justfile(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["data"]["justfile_created"] is True
        assert (target_dir / "justfile").is_file()

    def test_main_justfile_has_import(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "import '.pennyfarthing/justfile.pf'" in content

    def test_main_justfile_has_default_recipe(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "default:" in content
        assert "just --list" in content

    def test_main_justfile_has_project_name(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "my-project" in content

    def test_result_reports_import_added(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["data"]["import_added"] is True
        assert result["data"]["justfile_pf_written"] is True


# ===================================================================
# 2. Existing justfile without import
# ===================================================================


class TestExistingJustfileWithoutImport:
    """Existing justfile gets import line added, project recipes preserved."""

    def test_adds_import_line(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "# Run all tests\n"
            "test-all:\n"
            "    pytest\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert result["data"]["import_added"] is True
        content = (target_dir / "justfile").read_text()
        assert "import '.pennyfarthing/justfile.pf'" in content

    def test_preserves_project_recipes(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        original = (
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "# Run all tests\n"
            "test-all:\n"
            "    pytest\n"
            "\n"
            "# Build the project\n"
            "build:\n"
            "    cargo build --release\n"
        )
        (target_dir / "justfile").write_text(original)

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "test-all:" in content
        assert "pytest" in content
        assert "build:" in content
        assert "cargo build" in content

    def test_import_placed_after_variables(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "# My project\n"
            "root := justfile_directory()\n"
            "env := 'production'\n"
            "\n"
            "default:\n"
            "    @just --list\n"
        )

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        lines = content.splitlines()
        import_idx = next(i for i, l in enumerate(lines) if "import" in l and "justfile.pf" in l)
        env_idx = next(i for i, l in enumerate(lines) if "env :=" in l)
        assert import_idx > env_idx

    def test_does_not_create_justfile_created_flag(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text("default:\n    @just --list\n")

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["data"]["justfile_created"] is False


# ===================================================================
# 3. Legacy justfile with inline framework recipes
# ===================================================================


class TestLegacyMigration:
    """Legacy inline framework recipes get commented out with [pf-migrated]."""

    def test_migrates_framework_recipes(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "# Start WheelHub\n"
            "wheelhub *args:\n"
            "    pf launch gui --no-open\n"
            "\n"
            "# My custom recipe\n"
            "test-all:\n"
            "    pytest\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert "wheelhub" in result["data"]["recipes_migrated"]

    def test_migrated_recipes_commented_out(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "# Start WheelHub\n"
            "wheelhub *args:\n"
            "    pf launch gui --no-open\n"
            "\n"
            "test-all:\n"
            "    pytest\n"
        )

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "# [pf-migrated]" in content
        # The wheelhub recipe header should be migrated
        for line in content.splitlines():
            if "wheelhub" in line and "import" not in line:
                assert line.startswith("# [pf-migrated]")

    def test_preserves_non_framework_recipes(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "wheelhub *args:\n"
            "    pf launch gui\n"
            "\n"
            "test-all:\n"
            "    pytest\n"
        )

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        # test-all should NOT be migrated
        for line in content.splitlines():
            if "test-all" in line:
                assert not line.startswith("# [pf-migrated]")

    def test_migrates_multiple_recipes(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "wheelhub *args:\n"
            "    pf launch gui\n"
            "\n"
            "tui:\n"
            "    pf launch tui\n"
            "\n"
            "claude:\n"
            "    exec claude\n"
            "\n"
            "test-all:\n"
            "    pytest\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        migrated = result["data"]["recipes_migrated"]
        assert "wheelhub" in migrated
        assert "tui" in migrated
        assert "claude" in migrated
        assert "test-all" not in migrated

    def test_reports_migrated_count(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "wheelhub *args:\n"
            "    pf launch gui\n"
            "\n"
            "gui:\n"
            "    pf launch gui\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert len(result["data"]["recipes_migrated"]) == 2


# ===================================================================
# 4. Idempotent — running twice is safe
# ===================================================================


class TestIdempotency:
    """Running update_framework_justfile twice produces consistent results."""

    def test_no_duplicate_imports(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)
        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        import_count = content.count("import '.pennyfarthing/justfile.pf'")
        assert import_count == 1

    def test_second_run_no_import_added(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)
        result = update_framework_justfile(target_dir, mock_dist)

        assert result["data"]["import_added"] is False

    def test_justfile_pf_always_overwritten(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist)

        # Tamper with justfile.pf
        pf_path = target_dir / ".pennyfarthing" / "justfile.pf"
        pf_path.write_text("# tampered\n")

        update_framework_justfile(target_dir, mock_dist)

        content = pf_path.read_text()
        assert "tampered" not in content
        assert "Framework recipes" in content

    def test_no_re_migration(self, target_dir: Path, mock_dist: Path) -> None:
        """Already-migrated recipes should not be migrated again."""
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "wheelhub *args:\n"
            "    pf launch gui\n"
        )

        update_framework_justfile(target_dir, mock_dist)
        result2 = update_framework_justfile(target_dir, mock_dist)

        # Second run: import already present, no migration needed
        assert result2["data"]["recipes_migrated"] == []

    def test_both_runs_succeed(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        r1 = update_framework_justfile(target_dir, mock_dist)
        r2 = update_framework_justfile(target_dir, mock_dist)

        assert r1["success"] is True
        assert r2["success"] is True


# ===================================================================
# 5. Dry-run creates no files
# ===================================================================


class TestDryRun:
    """Dry-run previews changes without writing files."""

    def test_no_files_created(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert not (target_dir / "justfile").exists()
        assert not (target_dir / ".pennyfarthing" / "justfile.pf").exists()

    def test_returns_success(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert result["success"] is True

    def test_reports_actions(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert len(result["data"]["actions"]) > 0

    def test_reports_import_needed(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        result = update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert result["data"]["import_added"] is True

    def test_dry_run_with_existing_justfile(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "wheelhub *args:\n"
            "    pf launch gui\n"
        )

        result = update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert result["data"]["import_added"] is True
        assert "wheelhub" in result["data"]["recipes_migrated"]
        # File should not be modified
        content = (target_dir / "justfile").read_text()
        assert "import" not in content


# ===================================================================
# Edge cases
# ===================================================================


class TestEdgeCases:
    """Edge cases and error handling."""

    def test_missing_template_returns_error(self, target_dir: Path, tmp_path: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        empty_dist = tmp_path / "empty-dist"
        empty_dist.mkdir()
        (empty_dist / "templates").mkdir()

        result = update_framework_justfile(target_dir, empty_dist)

        assert result["success"] is False
        assert "Template not found" in result["error"]

    def test_justfile_with_import_already_present(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "import '.pennyfarthing/justfile.pf'\n"
            "\n"
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert result["data"]["import_added"] is False
        assert result["data"]["justfile_created"] is False

    def test_comment_only_justfile(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "# My project\n"
            "# Under construction\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        content = (target_dir / "justfile").read_text()
        assert "import '.pennyfarthing/justfile.pf'" in content

    def test_pennyfarthing_dir_created_if_missing(
        self, tmp_path: Path, mock_dist: Path
    ) -> None:
        from pf.init.justfile import update_framework_justfile

        target = tmp_path / "no-pf-dir"
        target.mkdir()
        # No .pennyfarthing/ yet

        result = update_framework_justfile(target, mock_dist)

        assert result["success"] is True
        assert (target / ".pennyfarthing" / "justfile.pf").is_file()
