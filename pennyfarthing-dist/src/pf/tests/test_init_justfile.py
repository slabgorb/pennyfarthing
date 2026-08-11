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
        'root := justfile_directory() / ".."\n'
        "\n"
        "frame *args:\n"
        "    pf launch frame\n"
        "\n"
        "tui:\n"
        "    pf launch tui --foreground\n"
        "\n"
        "dashboard:\n"
        "    pf launch frame\n"
        "\n"
        "claude:\n"
        "    exec claude\n"
        "\n"
        "start:\n"
        '    exec "{{root}}/start-session"\n'
        "\n"
        "start-at dir=invocation_directory():\n"
        '    "{{root}}/start-session" "{{dir}}"\n'
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
        assert "frame" in content

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
        import_idx = next(
            i for i, line in enumerate(lines) if "import" in line and "justfile.pf" in line
        )
        env_idx = next(i for i, line in enumerate(lines) if "env :=" in line)
        assert import_idx > env_idx

    def test_does_not_create_justfile_created_flag(self, target_dir: Path, mock_dist: Path) -> None:
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
            "# Start Frame\n"
            "frame *args:\n"
            "    pf launch frame\n"
            "\n"
            "# My custom recipe\n"
            "test-all:\n"
            "    pytest\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert "frame" in result["data"]["recipes_migrated"]

    def test_migrated_recipes_commented_out(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "# Start Frame\n"
            "frame *args:\n"
            "    pf launch frame\n"
            "\n"
            "test-all:\n"
            "    pytest\n"
        )

        update_framework_justfile(target_dir, mock_dist)

        content = (target_dir / "justfile").read_text()
        assert "# [pf-migrated]" in content
        # The frame recipe header should be migrated
        for line in content.splitlines():
            if "frame" in line and "import" not in line:
                assert line.startswith("# [pf-migrated]")

    def test_preserves_non_framework_recipes(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "root := justfile_directory()\n"
            "\n"
            "default:\n"
            "    @just --list\n"
            "\n"
            "frame *args:\n"
            "    pf launch frame\n"
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
            "frame *args:\n"
            "    pf launch frame\n"
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
        assert "frame" in migrated
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
            "frame *args:\n"
            "    pf launch frame\n"
            "\n"
            # `gui` used to be listed here, but it was removed from
            # FRAMEWORK_RECIPES when the dead gui recipe was dropped
            # (9f8786396), so it is no longer migratable. `tui` is a
            # current framework recipe and preserves this test's intent:
            # the count must reflect *all* migrated recipes, not just one.
            "tui:\n"
            "    pf frame start\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        migrated = result["data"]["recipes_migrated"]
        assert len(migrated) == 2, migrated
        # Names, not just the count — a count-only assertion would pass if the
        # migrator reported the wrong recipes.
        assert sorted(migrated) == ["frame", "tui"], migrated

    def test_non_framework_recipe_is_not_migrated(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        """A project's own recipe must survive untouched (162-5).

        `gui` is the concrete regression: once it left FRAMEWORK_RECIPES it
        became a user recipe, and migrating it would silently comment out
        working project tooling.
        """
        from pf.init.justfile import update_framework_justfile

        (target_dir / "justfile").write_text(
            "gui:\n"
            "    ./my-own-gui\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["data"]["recipes_migrated"] == []
        content = (target_dir / "justfile").read_text()
        assert "# [pf-migrated]" not in content
        assert "    ./my-own-gui" in content


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
            "frame *args:\n"
            "    pf launch frame\n"
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
            "frame *args:\n"
            "    pf launch frame\n"
        )

        result = update_framework_justfile(target_dir, mock_dist, dry_run=True)

        assert result["data"]["import_added"] is True
        assert "frame" in result["data"]["recipes_migrated"]
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

    def test_justfile_with_import_already_present(self, target_dir: Path, mock_dist: Path) -> None:
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

        (target_dir / "justfile").write_text("# My project\n# Under construction\n")

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        content = (target_dir / "justfile").read_text()
        assert "import '.pennyfarthing/justfile.pf'" in content

    def test_pennyfarthing_dir_created_if_missing(self, tmp_path: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        target = tmp_path / "no-pf-dir"
        target.mkdir()
        # No .pennyfarthing/ yet

        result = update_framework_justfile(target, mock_dist)

        assert result["success"] is True
        assert (target / ".pennyfarthing" / "justfile.pf").is_file()


# ===================================================================
# 6. Staleness detection — warn when justfile.pf diverges from template
# ===================================================================


# Stale claude recipe content matching the old consumer copies
_STALE_JUSTFILE_PF = """\
# Pennyfarthing framework recipes — auto-generated by pf init
# DO NOT EDIT — overwritten on every pf init

pf *args:
    #!/usr/bin/env bash
    set -euo pipefail
    "{{root}}/.pennyfarthing/bin/pf" {{args}}

frame:
    just pf launch frame

tui:
    just pf launch tui --foreground

claude:
    #!/usr/bin/env bash
    set -euo pipefail

    # Get port from Frame (starts it if needed)
    PORT=$(just pf launch frame 2>/dev/null | tail -1)
    if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
        PORT=""
    fi

    if [[ -n "$PORT" ]]; then
        export CLAUDE_CODE_ENABLE_TELEMETRY="1"
        export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$PORT"
    fi

    exec claude
"""


class TestStalenessDetection:
    """Detect when deployed justfile.pf diverges from template."""

    def test_stale_when_content_differs(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import check_justfile_pf_staleness

        # Deploy stale content (old claude recipe with subprocess pipeline)
        (target_dir / ".pennyfarthing" / "justfile.pf").write_text(_STALE_JUSTFILE_PF)

        result = check_justfile_pf_staleness(target_dir, mock_dist)

        assert result["stale"] is True

    def test_not_stale_when_content_matches(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import check_justfile_pf_staleness

        # Deploy content matching the template exactly
        template = (mock_dist / "templates" / "justfile.pf.template").read_text()
        (target_dir / ".pennyfarthing" / "justfile.pf").write_text(template)

        result = check_justfile_pf_staleness(target_dir, mock_dist)

        assert result["stale"] is False

    def test_not_deployed_reports_missing(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import check_justfile_pf_staleness

        # No justfile.pf exists yet
        result = check_justfile_pf_staleness(target_dir, mock_dist)

        assert result["deployed"] is False
        assert result["stale"] is True  # Missing counts as stale

    def test_deployed_flag_true_when_exists(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import check_justfile_pf_staleness

        (target_dir / ".pennyfarthing" / "justfile.pf").write_text("# anything")

        result = check_justfile_pf_staleness(target_dir, mock_dist)

        assert result["deployed"] is True

    def test_missing_template_returns_error(self, target_dir: Path, tmp_path: Path) -> None:
        from pf.init.justfile import check_justfile_pf_staleness

        empty_dist = tmp_path / "empty-dist"
        empty_dist.mkdir()
        (empty_dist / "templates").mkdir()

        result = check_justfile_pf_staleness(target_dir, empty_dist)

        assert result["success"] is False


# ===================================================================
# 7. Update result includes staleness info
# ===================================================================


class TestUpdateReportsStaleness:
    """update_framework_justfile reports whether deployed copy was stale."""

    def test_reports_was_stale_when_content_differed(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        from pf.init.justfile import update_framework_justfile

        # Deploy stale content first
        (target_dir / ".pennyfarthing" / "justfile.pf").write_text(_STALE_JUSTFILE_PF)

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert result["data"]["was_stale"] is True

    def test_reports_not_stale_when_content_matched(
        self, target_dir: Path, mock_dist: Path
    ) -> None:
        from pf.init.justfile import update_framework_justfile

        # Deploy matching content
        template = (mock_dist / "templates" / "justfile.pf.template").read_text()
        (target_dir / ".pennyfarthing" / "justfile.pf").write_text(template)
        # Also need an existing justfile with import so it doesn't fail on that
        (target_dir / "justfile").write_text(
            "import '.pennyfarthing/justfile.pf'\n\nroot := justfile_directory()\n\ndefault:\n    @just --list\n"
        )

        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert result["data"]["was_stale"] is False

    def test_reports_not_stale_on_fresh_init(self, target_dir: Path, mock_dist: Path) -> None:
        from pf.init.justfile import update_framework_justfile

        # No prior justfile.pf — fresh init is not "stale"
        result = update_framework_justfile(target_dir, mock_dist)

        assert result["success"] is True
        assert result["data"]["was_stale"] is False
