"""
Tests for pennyfarthing_scripts.deadcode module.

Covers models, stale file detection, exclusion logic, enrichment, formatters, and CLI.
Tests are written in RED state — all should fail until Dev implements the module.
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

import pytest

from pennyfarthing_scripts.deadcode.models import (
    StaleFile,
    DeadCodeResult,
    UnusedExport,
    UnusedExportResult,
)
from pennyfarthing_scripts.deadcode.analyze import (
    _run_git_command,
    _should_exclude,
    _is_source_file,
    find_stale_files,
    analyze_repo,
    find_unused_exports,
    DEFAULT_EXCLUDES,
    SOURCE_EXTENSIONS,
)
from pennyfarthing_scripts.deadcode.formatters import (
    format_table,
    export_json,
    export_csv,
)
from pennyfarthing_scripts.deadcode.cli import deadcode


# =============================================================================
# Model tests (AC: StaleFile model with required fields)
# =============================================================================

class TestStaleFileModel:
    def test_required_fields(self):
        """StaleFile must have path, last_commit_date, days_since_last_commit, size_bytes."""
        sf = StaleFile(
            path="src/old_module.py",
            last_commit_date="2025-06-15T10:00:00+00:00",
            days_since_last_commit=240,
            size_bytes=4096,
        )
        assert sf.path == "src/old_module.py"
        assert sf.last_commit_date == "2025-06-15T10:00:00+00:00"
        assert sf.days_since_last_commit == 240
        assert sf.size_bytes == 4096

    def test_defaults(self):
        """StaleFile should have sensible defaults for optional fields."""
        sf = StaleFile(path="test.py")
        assert sf.last_commit_date == ""
        assert sf.days_since_last_commit == 0
        assert sf.size_bytes == 0

    def test_iso_8601_date_format(self):
        """last_commit_date should accept ISO 8601 format."""
        sf = StaleFile(
            path="old.ts",
            last_commit_date="2025-03-15T14:30:00+00:00",
        )
        assert "T" in sf.last_commit_date
        assert "+" in sf.last_commit_date


class TestDeadCodeResultModel:
    def test_success_result(self):
        """DeadCodeResult should represent a successful analysis."""
        result = DeadCodeResult(
            success=True,
            repo_name="pennyfarthing",
            repo_path="/tmp/pennyfarthing",
            time_window_days=180,
            stale_files=[StaleFile(path="old.py", days_since_last_commit=200)],
            total_files=100,
        )
        assert result.success is True
        assert result.repo_name == "pennyfarthing"
        assert len(result.stale_files) == 1
        assert result.total_files == 100
        assert result.error is None

    def test_error_result(self):
        """DeadCodeResult should represent a failed analysis."""
        result = DeadCodeResult(
            success=False,
            repo_name="test",
            repo_path="/nonexistent",
            time_window_days=180,
            error="Path not found: /nonexistent",
        )
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_empty_result(self):
        """DeadCodeResult with no stale files should still be valid."""
        result = DeadCodeResult(
            success=True,
            repo_name="clean-repo",
            repo_path="/tmp/clean",
            time_window_days=180,
            total_files=50,
        )
        assert result.stale_files == []
        assert result.total_files == 50


# =============================================================================
# _should_exclude tests (AC: Filters and exclusions)
# =============================================================================

class TestShouldExclude:
    def test_node_modules_excluded(self):
        """node_modules paths should be excluded."""
        assert _should_exclude("node_modules/foo/bar.js", DEFAULT_EXCLUDES)

    def test_dist_excluded(self):
        """dist directory should be excluded."""
        assert _should_exclude("dist/index.js", DEFAULT_EXCLUDES)

    def test_lock_files_excluded(self):
        """Lock files should be excluded."""
        assert _should_exclude("pnpm-lock.yaml", DEFAULT_EXCLUDES)
        assert _should_exclude("package-lock.json", DEFAULT_EXCLUDES)

    def test_source_files_not_excluded(self):
        """Regular source files should NOT be excluded."""
        assert not _should_exclude("src/app.ts", DEFAULT_EXCLUDES)
        assert not _should_exclude("lib/utils.py", DEFAULT_EXCLUDES)

    def test_custom_exclude_pattern(self):
        """Additional user-provided patterns should also filter."""
        patterns = DEFAULT_EXCLUDES + ["vendor/*"]
        assert _should_exclude("vendor/lib/thing.go", patterns)

    def test_basename_matching(self):
        """Exclusion should match on basename for extension patterns."""
        assert _should_exclude("deep/nested/file.min.js", DEFAULT_EXCLUDES)

    def test_build_dir_excluded(self):
        """build directory should be excluded."""
        assert _should_exclude("build/output.js", DEFAULT_EXCLUDES)


# =============================================================================
# _is_source_file tests (AC: Filters to source file extensions)
# =============================================================================

class TestIsSourceFile:
    def test_python_is_source(self):
        assert _is_source_file("src/module.py")

    def test_typescript_is_source(self):
        assert _is_source_file("src/app.ts")
        assert _is_source_file("src/App.tsx")

    def test_javascript_is_source(self):
        assert _is_source_file("lib/utils.js")
        assert _is_source_file("components/Button.jsx")

    def test_go_is_source(self):
        assert _is_source_file("cmd/main.go")

    def test_markdown_is_source(self):
        assert _is_source_file("docs/README.md")

    def test_yaml_is_source(self):
        assert _is_source_file("config.yaml")
        assert _is_source_file("config.yml")

    def test_image_not_source(self):
        assert not _is_source_file("assets/logo.png")
        assert not _is_source_file("icons/icon.svg")

    def test_font_not_source(self):
        assert not _is_source_file("fonts/Inter.woff2")

    def test_binary_not_source(self):
        assert not _is_source_file("binary.exe")
        assert not _is_source_file("archive.tar.gz")


# =============================================================================
# _run_git_command tests (AC: Git command execution)
# =============================================================================

class TestRunGitCommand:
    def test_returns_stdout_stderr_returncode(self):
        """_run_git_command should return (stdout, stderr, returncode) tuple."""
        # Mock the subprocess to avoid real git calls
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"output\n", b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            stdout, stderr, rc = asyncio.run(
                _run_git_command(["ls-files"], Path("/tmp"))
            )
            assert isinstance(stdout, str)
            assert isinstance(stderr, str)
            assert isinstance(rc, int)
            assert rc == 0

    def test_handles_git_failure(self):
        """Should return non-zero return code on git failure."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"", b"fatal: not a git repository")
        mock_proc.returncode = 128

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
            stdout, stderr, rc = asyncio.run(
                _run_git_command(["status"], Path("/nonexistent"))
            )
            assert rc == 128
            assert "fatal" in stderr


# =============================================================================
# find_stale_files tests (AC: Git-based stale file detection)
# =============================================================================

# Simulated git ls-files output (all tracked files)
MOCK_LS_FILES = """src/app.ts
src/old_module.py
src/active.ts
lib/legacy.js
node_modules/dep/index.js
assets/logo.png
pnpm-lock.yaml"""

# Simulated git log --name-only output (recently touched files)
MOCK_RECENT_FILES = """src/app.ts
src/active.ts"""


class TestFindStaleFiles:
    def test_identifies_stale_files(self):
        """Files in ls-files but not in recent log are stale."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return (MOCK_LS_FILES, "", 0)
            elif "log" in args and "--name-only" in args:
                return (MOCK_RECENT_FILES, "", 0)
            elif "log" in args and "--format=%aI" in str(args):
                return ("2025-06-01T10:00:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=1024)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert result.success is True
        stale_paths = [sf.path for sf in result.stale_files]
        # Old module and legacy file should be stale
        assert "src/old_module.py" in stale_paths
        assert "lib/legacy.js" in stale_paths
        # Active files should NOT be stale
        assert "src/app.ts" not in stale_paths
        assert "src/active.ts" not in stale_paths

    def test_excludes_node_modules(self):
        """node_modules files should be excluded even if stale."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return (MOCK_LS_FILES, "", 0)
            elif "log" in args and "--name-only" in args:
                return (MOCK_RECENT_FILES, "", 0)
            elif "log" in args:
                return ("2025-06-01T10:00:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=512)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        stale_paths = [sf.path for sf in result.stale_files]
        assert "node_modules/dep/index.js" not in stale_paths

    def test_filters_to_source_extensions(self):
        """Non-source files (images, etc.) should be excluded."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return (MOCK_LS_FILES, "", 0)
            elif "log" in args and "--name-only" in args:
                return (MOCK_RECENT_FILES, "", 0)
            elif "log" in args:
                return ("2025-06-01T10:00:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=512)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        stale_paths = [sf.path for sf in result.stale_files]
        assert "assets/logo.png" not in stale_paths

    def test_enriches_with_last_commit_date(self):
        """Stale files should have last_commit_date from git log -1."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("src/old.py", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("", "", 0)  # nothing recently touched
            elif "log" in args and "--format=%aI" in str(args):
                return ("2025-03-15T14:30:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=2048)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert len(result.stale_files) == 1
        sf = result.stale_files[0]
        assert sf.last_commit_date == "2025-03-15T14:30:00+00:00"

    def test_enriches_with_size_bytes(self):
        """Stale files should have size_bytes from Path.stat()."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("src/old.py", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("", "", 0)
            elif "log" in args:
                return ("2025-03-15T14:30:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=8192)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert len(result.stale_files) == 1
        assert result.stale_files[0].size_bytes == 8192

    def test_calculates_days_since_last_commit(self):
        """days_since_last_commit should be computed from last_commit_date."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("src/old.py", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("", "", 0)
            elif "log" in args:
                return ("2025-06-01T10:00:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=1024)
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert len(result.stale_files) == 1
        assert result.stale_files[0].days_since_last_commit > 0

    def test_empty_repo_returns_empty_result(self):
        """Repo with no tracked files should return empty stale list."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert result.success is True
        assert result.stale_files == []

    def test_all_files_recently_touched(self):
        """When all files have recent commits, no stale files."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("src/app.ts\nsrc/utils.ts", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("src/app.ts\nsrc/utils.ts", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_stale_files(Path("/tmp/repo"), days=180))

        assert result.success is True
        assert result.stale_files == []


# =============================================================================
# analyze_repo tests (AC: Error handling, result object pattern)
# =============================================================================

class TestAnalyzeRepo:
    def test_nonexistent_path(self):
        """analyze_repo should return error for nonexistent paths."""
        result = asyncio.run(analyze_repo("test", Path("/nonexistent/path"), 180))
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_git_failure(self):
        """analyze_repo should handle git command failures gracefully."""
        async def mock_git(args, cwd):
            return ("", "fatal: not a git repository", 128)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 180))
            assert result.success is False
            assert result.error is not None

    def test_successful_analysis(self):
        """analyze_repo should return success with stale files."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("src/old.py\nsrc/new.ts", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("src/new.ts", "", 0)
            elif "log" in args:
                return ("2025-06-01T10:00:00+00:00", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True), \
           patch("pathlib.Path.stat") as mock_stat:
            mock_stat.return_value = MagicMock(st_size=1024)
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 180))

        assert result.success is True
        assert result.repo_name == "test"
        assert len(result.stale_files) > 0

    def test_returns_total_file_count(self):
        """analyze_repo should report total tracked file count."""
        async def mock_git(args, cwd):
            if "ls-files" in args:
                return ("a.py\nb.ts\nc.js", "", 0)
            elif "log" in args and "--name-only" in args:
                return ("a.py\nb.ts\nc.js", "", 0)
            return ("", "", 0)

        with patch(
            "pennyfarthing_scripts.deadcode.analyze._run_git_command",
            side_effect=mock_git,
        ), patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(analyze_repo("test", Path("/tmp"), 180))

        assert result.success is True
        assert result.total_files == 3


# =============================================================================
# Formatter tests (AC: --format json for API consumption)
# =============================================================================

class TestFormatters:
    def test_format_table_with_data(self):
        """format_table should produce readable output with stale files."""
        files = [
            StaleFile(
                path="src/old.py",
                last_commit_date="2025-06-01T10:00:00+00:00",
                days_since_last_commit=240,
                size_bytes=4096,
            ),
        ]
        table = format_table(files)
        assert "src/old.py" in table
        assert "240" in table

    def test_format_table_empty(self):
        """format_table with no files should show informative message."""
        table = format_table([])
        assert "no stale" in table.lower() or "0" in table

    def test_format_table_top_n(self):
        """format_table should respect top_n limit."""
        files = [
            StaleFile(path=f"file{i}.py", days_since_last_commit=i * 10)
            for i in range(30)
        ]
        table = format_table(files, top_n=5)
        # Should not show all 30 files
        assert table.count("file") <= 10  # header + 5 data rows max

    def test_export_json(self):
        """export_json should return valid JSON matching result structure."""
        result = DeadCodeResult(
            success=True,
            repo_name="test",
            repo_path="/tmp/test",
            time_window_days=180,
            stale_files=[
                StaleFile(path="old.py", days_since_last_commit=200, size_bytes=1024),
            ],
            total_files=50,
        )
        output = export_json(result)
        data = json.loads(output)
        assert data["success"] is True
        assert data["repo_name"] == "test"
        assert len(data["stale_files"]) == 1
        assert data["stale_files"][0]["path"] == "old.py"

    def test_export_csv(self):
        """export_csv should have header row and data rows."""
        files = [
            StaleFile(
                path="src/old.py",
                last_commit_date="2025-06-01T10:00:00+00:00",
                days_since_last_commit=240,
                size_bytes=4096,
            ),
        ]
        csv_output = export_csv(files)
        assert "path" in csv_output
        assert "src/old.py" in csv_output
        assert "240" in csv_output


# =============================================================================
# CLI tests (AC: CLI entry point with options)
# =============================================================================

class TestCLI:
    def test_help(self):
        """deadcode group should show help with stale subcommand."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["--help"])
        assert result.exit_code == 0
        assert "stale" in result.output

    def test_stale_help(self):
        """stale subcommand should show help with expected options."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert result.exit_code == 0
        assert "--days" in result.output
        assert "--top" in result.output
        assert "--format" in result.output

    def test_stale_default_days(self):
        """stale should default to 180 days."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "180" in result.output

    def test_stale_format_choices(self):
        """--format should accept table, json, csv."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "table" in result.output
        assert "json" in result.output
        assert "csv" in result.output

    def test_stale_json_output(self):
        """stale --format json should output valid JSON."""
        from click.testing import CliRunner

        mock_result = DeadCodeResult(
            success=True,
            repo_name="test",
            repo_path="/tmp",
            time_window_days=180,
            stale_files=[
                StaleFile(path="old.py", days_since_last_commit=200),
            ],
            total_files=10,
        )
        with patch(
            "pennyfarthing_scripts.deadcode.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(deadcode, ["stale", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True

    def test_stale_exclude_option(self):
        """--exclude should be repeatable."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "--exclude" in result.output

    def test_stale_repo_option(self):
        """--repo should be available for single repo analysis."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "--repo" in result.output

    def test_stale_path_option(self):
        """--path should be available for standalone repo path."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "--path" in result.output

    def test_stale_branch_option(self):
        """--branch should be available."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "--branch" in result.output

    def test_stale_output_option(self):
        """--output should be available for file output."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["stale", "--help"])
        assert "--output" in result.output


# =============================================================================
# CLI registration tests (AC: Module registered in cli.py)
# =============================================================================

class TestCLIRegistration:
    def test_deadcode_importable(self):
        """deadcode CLI group should be importable."""
        from pennyfarthing_scripts.deadcode.cli import deadcode
        assert deadcode is not None

    def test_deadcode_module_entry(self):
        """python -m pennyfarthing_scripts.deadcode should work."""
        from pennyfarthing_scripts.deadcode import __main__
        assert __main__ is not None


# =============================================================================
# DEFAULT_EXCLUDES and SOURCE_EXTENSIONS constants
# =============================================================================

class TestConstants:
    def test_default_excludes_contains_node_modules(self):
        assert any("node_modules" in p for p in DEFAULT_EXCLUDES)

    def test_default_excludes_contains_dist(self):
        assert any("dist" in p for p in DEFAULT_EXCLUDES)

    def test_default_excludes_contains_lock_files(self):
        assert any("lock" in p.lower() for p in DEFAULT_EXCLUDES)

    def test_source_extensions_has_python(self):
        assert ".py" in SOURCE_EXTENSIONS

    def test_source_extensions_has_typescript(self):
        assert ".ts" in SOURCE_EXTENSIONS
        assert ".tsx" in SOURCE_EXTENSIONS

    def test_source_extensions_has_javascript(self):
        assert ".js" in SOURCE_EXTENSIONS

    def test_source_extensions_has_go(self):
        assert ".go" in SOURCE_EXTENSIONS


# =============================================================================
# UnusedExport model tests (AC: UnusedExport with symbol, file, line, export_type)
# =============================================================================

class TestUnusedExportModel:
    def test_required_fields(self):
        """UnusedExport must have symbol, file, line, export_type."""
        ue = UnusedExport(
            symbol="helperFn",
            file="src/utils.ts",
            line=42,
            export_type="named",
        )
        assert ue.symbol == "helperFn"
        assert ue.file == "src/utils.ts"
        assert ue.line == 42
        assert ue.export_type == "named"

    def test_default_export_type(self):
        """export_type should default to 'named'."""
        ue = UnusedExport(symbol="foo", file="a.ts", line=1)
        assert ue.export_type == "named"

    def test_default_export_type_value(self):
        """export_type can be 'default'."""
        ue = UnusedExport(symbol="default", file="a.ts", line=1, export_type="default")
        assert ue.export_type == "default"


class TestUnusedExportResultModel:
    def test_success_result(self):
        """UnusedExportResult should represent a successful analysis."""
        result = UnusedExportResult(
            success=True,
            repo_name="pennyfarthing",
            repo_path="/tmp/pennyfarthing",
            unused_exports=[UnusedExport(symbol="foo", file="a.ts", line=1)],
            total_exports_scanned=50,
        )
        assert result.success is True
        assert len(result.unused_exports) == 1
        assert result.total_exports_scanned == 50
        assert result.error is None

    def test_error_result(self):
        """UnusedExportResult should represent a failed analysis."""
        result = UnusedExportResult(
            success=False,
            repo_name="test",
            repo_path="/tmp",
            error="ts-prune not found",
        )
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_empty_result(self):
        """UnusedExportResult with no unused exports is valid."""
        result = UnusedExportResult(
            success=True,
            repo_name="clean",
            repo_path="/tmp/clean",
            total_exports_scanned=100,
        )
        assert result.unused_exports == []
        assert result.total_exports_scanned == 100


# =============================================================================
# find_unused_exports tests (AC: ts-prune output parsed into UnusedExport)
# =============================================================================

# Simulated ts-prune output format
MOCK_TS_PRUNE_OUTPUT = """src/utils.ts:10 - helperFn
src/utils.ts:25 - formatDate
src/components/Button.tsx:1 - default
src/types.ts:5 - UserConfig"""

MOCK_TS_PRUNE_EMPTY = ""


class TestFindUnusedExports:
    def test_parses_ts_prune_output(self):
        """Should parse ts-prune stdout into UnusedExport instances."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (MOCK_TS_PRUNE_OUTPUT.encode(), b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert result.success is True
        assert len(result.unused_exports) == 4
        symbols = [ue.symbol for ue in result.unused_exports]
        assert "helperFn" in symbols
        assert "formatDate" in symbols
        assert "default" in symbols
        assert "UserConfig" in symbols

    def test_parses_file_and_line(self):
        """Should extract file path and line number from ts-prune output."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"src/utils.ts:10 - helperFn", b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert len(result.unused_exports) == 1
        ue = result.unused_exports[0]
        assert ue.file == "src/utils.ts"
        assert ue.line == 10
        assert ue.symbol == "helperFn"

    def test_detects_default_export_type(self):
        """Should set export_type='default' for default exports."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"src/App.tsx:1 - default", b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert result.unused_exports[0].export_type == "default"

    def test_empty_output_returns_empty_result(self):
        """No ts-prune output means no unused exports."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"", b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert result.success is True
        assert result.unused_exports == []

    def test_nonexistent_path_returns_error(self):
        """Should return error for nonexistent repo path."""
        result = asyncio.run(find_unused_exports(Path("/nonexistent/repo")))
        assert result.success is False
        assert "not found" in result.error.lower()

    def test_ts_prune_failure_returns_error(self):
        """Should handle ts-prune command failure gracefully."""
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (b"", b"npx: command not found")
        mock_proc.returncode = 127

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert result.success is False
        assert result.error is not None

    def test_skips_malformed_lines(self):
        """Should skip lines that don't match expected format."""
        output = "src/utils.ts:10 - helperFn\nsome garbage line\n\nsrc/app.ts:5 - main"
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (output.encode(), b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert result.success is True
        assert len(result.unused_exports) == 2

    def test_handles_used_in_module_lines(self):
        """Should skip ts-prune lines ending with '(used in module)' marker."""
        output = "src/utils.ts:10 - helperFn\nsrc/api.ts:3 - fetchData (used in module)"
        mock_proc = AsyncMock()
        mock_proc.communicate.return_value = (output.encode(), b"")
        mock_proc.returncode = 0

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("pathlib.Path.exists", return_value=True):
            result = asyncio.run(find_unused_exports(Path("/tmp/repo")))

        assert len(result.unused_exports) == 1
        assert result.unused_exports[0].symbol == "helperFn"


# =============================================================================
# Unused export formatter tests (AC: table/json/csv for exports)
# =============================================================================

class TestUnusedExportFormatters:
    def test_format_exports_table_with_data(self):
        """format_exports_table should produce readable output."""
        from pennyfarthing_scripts.deadcode.formatters import format_exports_table

        exports = [
            UnusedExport(symbol="helperFn", file="src/utils.ts", line=10, export_type="named"),
            UnusedExport(symbol="default", file="src/App.tsx", line=1, export_type="default"),
        ]
        table = format_exports_table(exports)
        assert "helperFn" in table
        assert "src/utils.ts" in table
        assert "10" in table

    def test_format_exports_table_empty(self):
        """format_exports_table with no exports shows informative message."""
        from pennyfarthing_scripts.deadcode.formatters import format_exports_table

        table = format_exports_table([])
        assert "no unused" in table.lower()

    def test_format_exports_table_top_n(self):
        """format_exports_table should respect top_n limit."""
        from pennyfarthing_scripts.deadcode.formatters import format_exports_table

        exports = [
            UnusedExport(symbol=f"fn{i}", file=f"file{i}.ts", line=i)
            for i in range(20)
        ]
        table = format_exports_table(exports, top_n=5)
        assert table.count("fn") <= 10  # header context + 5 data rows max

    def test_export_exports_json(self):
        """export_exports_json should return valid JSON."""
        from pennyfarthing_scripts.deadcode.formatters import export_exports_json

        result = UnusedExportResult(
            success=True,
            repo_name="test",
            repo_path="/tmp",
            unused_exports=[
                UnusedExport(symbol="foo", file="a.ts", line=1),
            ],
            total_exports_scanned=50,
        )
        output = export_exports_json(result)
        data = json.loads(output)
        assert data["success"] is True
        assert len(data["unused_exports"]) == 1
        assert data["unused_exports"][0]["symbol"] == "foo"

    def test_export_exports_csv(self):
        """export_exports_csv should have header and data rows."""
        from pennyfarthing_scripts.deadcode.formatters import export_exports_csv

        exports = [
            UnusedExport(symbol="helperFn", file="src/utils.ts", line=10, export_type="named"),
        ]
        csv_output = export_exports_csv(exports)
        assert "symbol" in csv_output
        assert "helperFn" in csv_output
        assert "src/utils.ts" in csv_output


# =============================================================================
# CLI exports subcommand tests (AC: pf deadcode exports subcommand)
# =============================================================================

class TestExportsCLI:
    def test_help_shows_exports(self):
        """deadcode group help should list exports subcommand."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["--help"])
        assert result.exit_code == 0
        assert "exports" in result.output

    def test_exports_help(self):
        """exports subcommand should show help with expected options."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["exports", "--help"])
        assert result.exit_code == 0
        assert "--format" in result.output
        assert "--top" in result.output

    def test_exports_json_output(self):
        """exports --format json should output valid JSON."""
        from click.testing import CliRunner

        mock_result = UnusedExportResult(
            success=True,
            repo_name="test",
            repo_path="/tmp",
            unused_exports=[
                UnusedExport(symbol="foo", file="a.ts", line=1),
            ],
            total_exports_scanned=10,
        )
        with patch(
            "pennyfarthing_scripts.deadcode.cli._run_exports_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(deadcode, ["exports", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True

    def test_exports_path_option(self):
        """--path should be available for standalone repo path."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["exports", "--help"])
        assert "--path" in result.output

    def test_exports_repo_option(self):
        """--repo should be available for named repo."""
        from click.testing import CliRunner

        runner = CliRunner()
        result = runner.invoke(deadcode, ["exports", "--help"])
        assert "--repo" in result.output
