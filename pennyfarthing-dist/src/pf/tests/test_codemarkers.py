"""Tests for codemarkers module.

Story 80-1: Python codemarkers module — grep + git blame.
MSSCI-14454

TDD RED phase — all tests written before implementation.
Tests cover: models, analyze engine, CLI, formatters.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class TestCodeMarkerModel:
    """CodeMarker dataclass fields and defaults."""

    def test_required_fields(self) -> None:
        """CodeMarker requires path, line, marker_type, text."""
        from pf.codemarkers.models import CodeMarker

        m = CodeMarker(path="src/app.ts", line=42, marker_type="TODO", text="TODO: refactor")
        assert m.path == "src/app.ts"
        assert m.line == 42
        assert m.marker_type == "TODO"
        assert m.text == "TODO: refactor"

    def test_default_blame_fields(self) -> None:
        """Blame fields default to empty/zero."""
        from pf.codemarkers.models import CodeMarker

        m = CodeMarker(path="a.py", line=1, marker_type="FIXME", text="FIXME: broken")
        assert m.author == ""
        assert m.date == ""
        assert m.age_days == 0.0
        assert m.is_stale is False

    def test_stale_marker(self) -> None:
        """is_stale can be set to True."""
        from pf.codemarkers.models import CodeMarker

        m = CodeMarker(
            path="old.py",
            line=10,
            marker_type="TODO",
            text="TODO: old",
            author="dev",
            date="2025-01-01T00:00:00",
            age_days=120.0,
            is_stale=True,
        )
        assert m.is_stale is True
        assert m.age_days == 120.0

    def test_serializable(self) -> None:
        """CodeMarker should be serializable via dataclasses.asdict."""
        from pf.codemarkers.models import CodeMarker

        m = CodeMarker(path="x.py", line=5, marker_type="HACK", text="HACK: workaround")
        d = asdict(m)
        assert d["path"] == "x.py"
        assert d["marker_type"] == "HACK"
        assert isinstance(d, dict)


class TestMarkerSummaryModel:
    """MarkerSummary aggregates counts by type."""

    def test_defaults(self) -> None:
        """MarkerSummary fields default to zero/empty."""
        from pf.codemarkers.models import MarkerSummary

        s = MarkerSummary()
        assert s.total_markers == 0
        assert s.stale_markers == 0
        assert s.by_type == {}

    def test_populated(self) -> None:
        """MarkerSummary with values."""
        from pf.codemarkers.models import MarkerSummary

        s = MarkerSummary(
            total_markers=10,
            stale_markers=3,
            by_type={"TODO": 6, "FIXME": 4},
        )
        assert s.total_markers == 10
        assert s.by_type["FIXME"] == 4


class TestCodeMarkersResultModel:
    """CodeMarkersResult follows ADR-0008 pattern."""

    def test_success_result(self) -> None:
        """Successful result has success=True and markers list."""
        from pf.codemarkers.models import CodeMarker, CodeMarkersResult

        r = CodeMarkersResult(
            success=True,
            repo_name="test",
            repo_path="/tmp/test",
            stale_threshold_days=90,
            markers=[CodeMarker(path="a.py", line=1, marker_type="TODO", text="TODO: x")],
        )
        assert r.success is True
        assert len(r.markers) == 1
        assert r.error is None

    def test_error_result(self) -> None:
        """Error result has success=False and error message."""
        from pf.codemarkers.models import CodeMarkersResult

        r = CodeMarkersResult(
            success=False,
            repo_name="bad",
            repo_path="/nonexistent",
            stale_threshold_days=90,
            error="Path not found",
        )
        assert r.success is False
        assert "not found" in r.error

    def test_json_serializable(self) -> None:
        """Full result serializes to JSON via asdict."""
        from pf.codemarkers.models import (
            CodeMarker,
            CodeMarkersResult,
            MarkerSummary,
        )

        r = CodeMarkersResult(
            success=True,
            repo_name="repo",
            repo_path="/tmp",
            stale_threshold_days=90,
            markers=[CodeMarker(path="b.py", line=2, marker_type="XXX", text="XXX: bad")],
            summary=MarkerSummary(total_markers=1, by_type={"XXX": 1}),
        )
        text = json.dumps(asdict(r), default=str)
        parsed = json.loads(text)
        assert parsed["success"] is True
        assert parsed["markers"][0]["marker_type"] == "XXX"


# ---------------------------------------------------------------------------
# Analyze — grep and blame
# ---------------------------------------------------------------------------


class TestGrepMarkers:
    """_grep_markers finds TODO/FIXME/HACK/XXX in source files."""

    def test_finds_todo(self, tmp_path: Path) -> None:
        """Detects TODO comments."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "app.py"
        f.write_text("x = 1\n# TODO: fix this\ny = 2\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1
        assert markers[0]["marker_type"] == "TODO"
        assert markers[0]["line"] == 2

    def test_finds_fixme(self, tmp_path: Path) -> None:
        """Detects FIXME comments."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "bug.ts"
        f.write_text("// FIXME: null check needed\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1
        assert markers[0]["marker_type"] == "FIXME"

    def test_finds_hack(self, tmp_path: Path) -> None:
        """Detects HACK comments."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "util.js"
        f.write_text("/* HACK: temporary workaround */\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1
        assert markers[0]["marker_type"] == "HACK"

    def test_finds_xxx(self, tmp_path: Path) -> None:
        """Detects XXX comments."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "danger.py"
        f.write_text("# XXX: this is terrible\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1
        assert markers[0]["marker_type"] == "XXX"

    def test_multiple_markers_same_file(self, tmp_path: Path) -> None:
        """Finds multiple markers in a single file."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "multi.py"
        f.write_text("# TODO: first\nx = 1\n# FIXME: second\n# HACK: third\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 3
        types = {m["marker_type"] for m in markers}
        assert types == {"TODO", "FIXME", "HACK"}

    def test_excludes_node_modules(self, tmp_path: Path) -> None:
        """Files matching exclude patterns are skipped."""
        from pf.codemarkers.analyze import _grep_markers

        nm = tmp_path / "node_modules" / "pkg"
        nm.mkdir(parents=True)
        (nm / "index.js").write_text("// TODO: vendor code\n")
        (tmp_path / "src.py").write_text("# TODO: real code\n")

        markers = _grep_markers(tmp_path, excludes=["node_modules/*"])
        paths = [m["path"] for m in markers]
        assert not any("node_modules" in p for p in paths)
        assert len(markers) == 1

    def test_case_sensitive(self, tmp_path: Path) -> None:
        """Markers must be uppercase to match."""
        from pf.codemarkers.analyze import _grep_markers

        f = tmp_path / "lower.py"
        f.write_text("# todo: lowercase should not match\n# TODO: uppercase matches\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1
        assert markers[0]["marker_type"] == "TODO"

    def test_nested_directories(self, tmp_path: Path) -> None:
        """Scans recursively into subdirectories."""
        from pf.codemarkers.analyze import _grep_markers

        sub = tmp_path / "src" / "lib"
        sub.mkdir(parents=True)
        (sub / "deep.ts").write_text("// FIXME: deep bug\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1

    def test_empty_directory(self, tmp_path: Path) -> None:
        """Returns empty list for directory with no markers."""
        from pf.codemarkers.analyze import _grep_markers

        (tmp_path / "clean.py").write_text("x = 1\ny = 2\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert markers == []

    def test_binary_files_skipped(self, tmp_path: Path) -> None:
        """Binary files should not cause crashes."""
        from pf.codemarkers.analyze import _grep_markers

        (tmp_path / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        (tmp_path / "code.py").write_text("# TODO: real marker\n")
        markers = _grep_markers(tmp_path, excludes=[])
        assert len(markers) == 1


class TestParseBlameOutput:
    """_parse_blame_porcelain extracts author and date from git blame --porcelain."""

    def test_parses_author_and_time(self) -> None:
        """Extracts author name and author-time from porcelain output."""
        from pf.codemarkers.analyze import _parse_blame_porcelain

        porcelain = (
            "abc123 1 1 1\n"
            "author John Doe\n"
            "author-mail <john@example.com>\n"
            "author-time 1700000000\n"
            "author-tz +0000\n"
            "committer John Doe\n"
            "committer-mail <john@example.com>\n"
            "committer-time 1700000000\n"
            "committer-tz +0000\n"
            "summary Some commit\n"
            "filename src/app.py\n"
            "\t# TODO: fix this\n"
        )
        result = _parse_blame_porcelain(porcelain, line=1)
        assert result["author"] == "John Doe"
        assert result["author_time"] == 1700000000

    def test_empty_output(self) -> None:
        """Returns empty dict for empty output."""
        from pf.codemarkers.analyze import _parse_blame_porcelain

        result = _parse_blame_porcelain("", line=1)
        assert result == {} or result.get("author") == ""


class TestBatchBlame:
    """_batch_blame_file calls git blame once per file, extracts multiple lines."""

    @pytest.mark.asyncio
    async def test_blames_entire_file(self) -> None:
        """Blames the whole file and returns data for requested lines."""
        from pf.codemarkers.analyze import _batch_blame_file

        blame_output = (
            "abc123 1 1 1\n"
            "author Alice\n"
            "author-time 1700000000\n"
            "author-tz +0000\n"
            "committer Alice\n"
            "committer-time 1700000000\n"
            "committer-tz +0000\n"
            "summary init\n"
            "filename test.py\n"
            "\tline 1\n"
            "def456 2 2 1\n"
            "author Bob\n"
            "author-time 1700100000\n"
            "author-tz +0000\n"
            "committer Bob\n"
            "committer-time 1700100000\n"
            "committer-tz +0000\n"
            "summary fix\n"
            "filename test.py\n"
            "\tline 2\n"
        )

        with patch(
            "pf.codemarkers.analyze._run_git_command",
            new_callable=AsyncMock,
            return_value=(blame_output, "", 0),
        ):
            results = await _batch_blame_file(Path("/repo"), "test.py", [1, 2])
            assert 1 in results
            assert 2 in results
            assert results[1]["author"] == "Alice"
            assert results[2]["author"] == "Bob"

    @pytest.mark.asyncio
    async def test_git_blame_failure_returns_empty(self) -> None:
        """When git blame fails, returns empty dict for all lines."""
        from pf.codemarkers.analyze import _batch_blame_file

        with patch(
            "pf.codemarkers.analyze._run_git_command",
            new_callable=AsyncMock,
            return_value=("", "fatal: not a git repo", 128),
        ):
            results = await _batch_blame_file(Path("/bad"), "x.py", [1])
            assert results == {} or results.get(1, {}).get("author", "") == ""


class TestAnalyzeRepo:
    """analyze_repo is the main entry point — grep + blame + staleness."""

    @pytest.mark.asyncio
    async def test_nonexistent_path(self) -> None:
        """Returns error result for nonexistent path."""
        from pf.codemarkers.analyze import analyze_repo

        result = await analyze_repo("bad", Path("/nonexistent/repo"), days=90)
        assert result.success is False
        assert "not found" in result.error.lower() or "not exist" in result.error.lower()

    @pytest.mark.asyncio
    async def test_empty_repo(self, tmp_path: Path) -> None:
        """Returns success with empty markers for repo with no markers."""
        from pf.codemarkers.analyze import analyze_repo

        (tmp_path / ".git").mkdir()
        (tmp_path / "clean.py").write_text("x = 1\n")

        with patch(
            "pf.codemarkers.analyze._batch_blame_file",
            new_callable=AsyncMock,
            return_value={},
        ):
            result = await analyze_repo("test", tmp_path, days=90)
            assert result.success is True
            assert len(result.markers) == 0

    @pytest.mark.asyncio
    async def test_markers_enriched_with_blame(self, tmp_path: Path) -> None:
        """Markers get author, date, age_days from git blame."""
        from pf.codemarkers.analyze import analyze_repo

        (tmp_path / ".git").mkdir()
        (tmp_path / "app.py").write_text("x = 1\n# TODO: fix this\ny = 2\n")

        # Mock blame: author Alice, time = 90 days ago
        import time

        ninety_days_ago = int(time.time()) - (90 * 86400)

        async def mock_blame(repo_path, file_path, lines):
            return {
                2: {"author": "Alice", "author_time": ninety_days_ago},
            }

        with patch(
            "pf.codemarkers.analyze._batch_blame_file",
            side_effect=mock_blame,
        ):
            result = await analyze_repo("test", tmp_path, days=90)
            assert result.success is True
            assert len(result.markers) == 1
            assert result.markers[0].author == "Alice"
            assert result.markers[0].age_days >= 89  # approximately 90

    @pytest.mark.asyncio
    async def test_stale_threshold(self, tmp_path: Path) -> None:
        """Markers older than threshold are flagged is_stale=True."""
        from pf.codemarkers.analyze import analyze_repo

        (tmp_path / ".git").mkdir()
        (tmp_path / "old.py").write_text("# TODO: ancient code\n")

        import time

        old_time = int(time.time()) - (200 * 86400)  # 200 days ago

        async def mock_blame(repo_path, file_path, lines):
            return {1: {"author": "OldDev", "author_time": old_time}}

        with patch(
            "pf.codemarkers.analyze._batch_blame_file",
            side_effect=mock_blame,
        ):
            result = await analyze_repo("test", tmp_path, days=90)
            assert result.markers[0].is_stale is True
            assert result.markers[0].age_days >= 199

    @pytest.mark.asyncio
    async def test_summary_computed(self, tmp_path: Path) -> None:
        """Result includes summary with counts by type."""
        from pf.codemarkers.analyze import analyze_repo

        (tmp_path / ".git").mkdir()
        (tmp_path / "mix.py").write_text("# TODO: one\n# FIXME: two\n# TODO: three\n")

        import time

        recent = int(time.time()) - (10 * 86400)

        async def mock_blame(repo_path, file_path, lines):
            return {ln: {"author": "Dev", "author_time": recent} for ln in lines}

        with patch(
            "pf.codemarkers.analyze._batch_blame_file",
            side_effect=mock_blame,
        ):
            result = await analyze_repo("test", tmp_path, days=90)
            assert result.summary is not None
            assert result.summary.total_markers == 3
            assert result.summary.by_type["TODO"] == 2
            assert result.summary.by_type["FIXME"] == 1
            assert result.summary.stale_markers == 0

    @pytest.mark.asyncio
    async def test_default_excludes_applied(self, tmp_path: Path) -> None:
        """DEFAULT_EXCLUDES filters out node_modules, dist, etc."""
        from pf.codemarkers.analyze import analyze_repo

        (tmp_path / ".git").mkdir()
        nm = tmp_path / "node_modules" / "pkg"
        nm.mkdir(parents=True)
        (nm / "lib.js").write_text("// TODO: vendor code\n")
        (tmp_path / "src.py").write_text("# TODO: real code\n")

        import time

        recent = int(time.time()) - 86400

        async def mock_blame(repo_path, file_path, lines):
            return {ln: {"author": "Dev", "author_time": recent} for ln in lines}

        with patch(
            "pf.codemarkers.analyze._batch_blame_file",
            side_effect=mock_blame,
        ):
            result = await analyze_repo("test", tmp_path, days=90)
            paths = [m.path for m in result.markers]
            assert not any("node_modules" in p for p in paths)


class TestShouldExclude:
    """_should_exclude matches file paths against glob patterns."""

    def test_matches_node_modules(self) -> None:
        from pf.codemarkers.analyze import _should_exclude

        assert _should_exclude("node_modules/pkg/index.js", ["node_modules/*"]) is True

    def test_matches_lock_file(self) -> None:
        from pf.codemarkers.analyze import _should_exclude

        assert _should_exclude("package-lock.json", ["package-lock.json"]) is True

    def test_matches_glob_extension(self) -> None:
        from pf.codemarkers.analyze import _should_exclude

        assert _should_exclude("bundle.min.js", ["*.min.js"]) is True

    def test_no_match(self) -> None:
        from pf.codemarkers.analyze import _should_exclude

        assert _should_exclude("src/app.py", ["node_modules/*", "dist/*"]) is False


# ---------------------------------------------------------------------------
# Formatters
# ---------------------------------------------------------------------------


class TestTableFormatter:
    """format_marker_table produces column-aligned output."""

    def test_empty_list(self) -> None:
        """Empty marker list produces 'no markers' message."""
        from pf.codemarkers.formatters import format_marker_table

        out = format_marker_table([])
        assert "no" in out.lower() or "No" in out

    def test_table_has_headers(self) -> None:
        """Table output includes column headers."""
        from pf.codemarkers.formatters import format_marker_table
        from pf.codemarkers.models import CodeMarker

        markers = [
            CodeMarker(
                path="a.py",
                line=1,
                marker_type="TODO",
                text="TODO: test",
                author="Dev",
                age_days=10.0,
            ),
        ]
        out = format_marker_table(markers)
        assert "Type" in out
        assert "File" in out or "Path" in out
        assert "Age" in out

    def test_top_n_limits_output(self) -> None:
        """Table respects top_n limit."""
        from pf.codemarkers.formatters import format_marker_table
        from pf.codemarkers.models import CodeMarker

        markers = [
            CodeMarker(path=f"f{i}.py", line=i, marker_type="TODO", text=f"TODO: {i}")
            for i in range(50)
        ]
        out = format_marker_table(markers, top_n=5)
        # Header + separator + 5 data rows = 7 lines
        lines = [line for line in out.strip().split("\n") if line.strip()]
        assert len(lines) <= 7


class TestJsonExport:
    """export_json serializes full result to JSON."""

    def test_valid_json(self) -> None:
        from pf.codemarkers.formatters import export_json
        from pf.codemarkers.models import (
            CodeMarker,
            CodeMarkersResult,
            MarkerSummary,
        )

        r = CodeMarkersResult(
            success=True,
            repo_name="test",
            repo_path="/tmp",
            stale_threshold_days=90,
            markers=[CodeMarker(path="x.py", line=1, marker_type="TODO", text="TODO: x")],
            summary=MarkerSummary(total_markers=1, by_type={"TODO": 1}),
        )
        text = export_json(r)
        parsed = json.loads(text)
        assert parsed["success"] is True
        assert len(parsed["markers"]) == 1


class TestCsvExport:
    """export_csv outputs CSV with headers."""

    def test_csv_header_row(self) -> None:
        from pf.codemarkers.formatters import export_csv
        from pf.codemarkers.models import CodeMarker

        markers = [
            CodeMarker(path="a.py", line=1, marker_type="TODO", text="TODO: test"),
        ]
        text = export_csv(markers)
        lines = text.strip().split("\n")
        assert "path" in lines[0]
        assert "marker_type" in lines[0]
        assert len(lines) == 2  # header + 1 data row


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


class TestCLI:
    """Click CLI commands."""

    def test_cli_help(self) -> None:
        """codemarkers group shows help."""
        from click.testing import CliRunner

        from pf.codemarkers.cli import codemarkers

        runner = CliRunner()
        result = runner.invoke(codemarkers, ["--help"])
        assert result.exit_code == 0
        assert "analyze" in result.output.lower()

    def test_analyze_command_exists(self) -> None:
        """analyze subcommand is registered."""
        from click.testing import CliRunner

        from pf.codemarkers.cli import codemarkers

        runner = CliRunner()
        result = runner.invoke(codemarkers, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--days" in result.output
        assert "--format" in result.output

    def test_stale_command_exists(self) -> None:
        """stale subcommand is registered."""
        from click.testing import CliRunner

        from pf.codemarkers.cli import codemarkers

        runner = CliRunner()
        result = runner.invoke(codemarkers, ["stale", "--help"])
        assert result.exit_code == 0

    def test_summary_command_exists(self) -> None:
        """summary subcommand is registered."""
        from click.testing import CliRunner

        from pf.codemarkers.cli import codemarkers

        runner = CliRunner()
        result = runner.invoke(codemarkers, ["summary", "--help"])
        assert result.exit_code == 0

    def test_json_format_option(self) -> None:
        """--format json produces JSON output."""
        from click.testing import CliRunner

        from pf.codemarkers.cli import codemarkers

        runner = CliRunner()
        with patch("pf.codemarkers.cli._run_analysis") as mock_run:
            from pf.codemarkers.models import CodeMarkersResult, MarkerSummary

            mock_run.return_value = CodeMarkersResult(
                success=True,
                repo_name="test",
                repo_path="/tmp",
                stale_threshold_days=90,
                markers=[],
                summary=MarkerSummary(),
            )
            result = runner.invoke(codemarkers, ["analyze", "--path", "/tmp", "--format", "json"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert parsed["success"] is True


# ---------------------------------------------------------------------------
# __init__ re-exports
# ---------------------------------------------------------------------------


class TestModuleExports:
    """__init__.py re-exports key symbols."""

    def test_exports_models(self) -> None:
        from pf.codemarkers import (
            CodeMarker,
            CodeMarkersResult,
        )

        assert CodeMarker is not None
        assert CodeMarkersResult is not None

    def test_exports_analyze(self) -> None:
        from pf.codemarkers import analyze_repo

        assert callable(analyze_repo)
