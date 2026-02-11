"""
Tests for @deprecated detection and caller cross-reference (Story 80-2).

Covers:
- DeprecationMarker model structure and defaults
- JSDoc @deprecated tag regex detection
- Symbol name extraction from declarations after JSDoc blocks
- Caller/importer cross-referencing
- Full deprecation analysis pipeline
- CLI integration for deprecation filtering
- Module exports
- Edge cases: no deprecations, no callers, multi-line JSDoc, malformed tags
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
from dataclasses import fields as dataclass_fields

import pytest
from click.testing import CliRunner

from pennyfarthing_scripts.codemarkers.models import DeprecationMarker


# =============================================================================
# Fixtures: TypeScript files with @deprecated JSDoc tags
# =============================================================================

TS_FILE_SINGLE_DEPRECATED = """\
/**
 * @deprecated Use newHelper instead
 */
export function oldHelper(x: number): number {
  return x + 1;
}

export function activeHelper(x: number): number {
  return x * 2;
}
"""

TS_FILE_MULTIPLE_DEPRECATED = """\
/**
 * @deprecated Use formatDate from date-fns
 */
export function legacyFormat(d: Date): string {
  return d.toISOString();
}

/**
 * A perfectly active function.
 */
export function currentFormat(d: Date): string {
  return d.toLocaleDateString();
}

/** @deprecated Replaced by UserServiceV2 */
export class UserService {
  getUser(id: string) { return null; }
}

/**
 * Multi-line JSDoc with various tags.
 * @param value - the input
 * @deprecated This constant is obsolete, use APP_CONFIG instead
 * @see APP_CONFIG
 */
export const OLD_CONFIG = { debug: true };
"""

TS_FILE_NO_DEPRECATED = """\
/**
 * A perfectly modern function with no deprecation.
 */
export function modernHelper(): void {
  console.log("I am current!");
}

// TODO: Refactor this later
export const VALUE = 42;
"""

TS_FILE_CALLERS = """\
import { oldHelper } from '../utils';
import { legacyFormat } from '../formatters';

const result = oldHelper(5);
console.log(legacyFormat(new Date()));
"""

TS_FILE_ANOTHER_CALLER = """\
import { oldHelper } from '../utils';

export function wrapper() {
  return oldHelper(10);
}
"""


# =============================================================================
# DeprecationMarker model tests
# =============================================================================

class TestDeprecationMarkerModel:
    """DeprecationMarker must exist in models.py with required fields."""

    def test_model_exists(self):
        """DeprecationMarker should be importable from models."""
        assert DeprecationMarker is not None

    def test_required_fields(self):
        """Model must have path, line, symbol, text, caller_count, callers."""
        field_names = {f.name for f in dataclass_fields(DeprecationMarker)}
        required = {"path", "line", "symbol", "text", "caller_count", "callers"}
        assert required.issubset(field_names), (
            f"Missing fields: {required - field_names}"
        )

    def test_default_values(self):
        """caller_count defaults to 0, callers defaults to empty list."""
        marker = DeprecationMarker(
            path="src/utils.ts",
            line=3,
            symbol="oldHelper",
            text="@deprecated Use newHelper instead",
        )
        assert marker.caller_count == 0
        assert marker.callers == []

    def test_full_construction(self):
        """Model accepts all fields including callers."""
        marker = DeprecationMarker(
            path="src/utils.ts",
            line=3,
            symbol="oldHelper",
            text="@deprecated Use newHelper instead",
            caller_count=2,
            callers=["src/api/stats.ts", "src/hooks/useLegacy.ts"],
        )
        assert marker.path == "src/utils.ts"
        assert marker.line == 3
        assert marker.symbol == "oldHelper"
        assert marker.caller_count == 2
        assert len(marker.callers) == 2


# =============================================================================
# _grep_deprecations tests
# =============================================================================

class TestGrepDeprecations:
    """Tests for the JSDoc @deprecated tag scanning function."""

    def test_detects_single_deprecated_function(self, tmp_path):
        """Should find @deprecated on a single exported function."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)

        results = _grep_deprecations(tmp_path, [])
        assert len(results) == 1
        assert results[0]["symbol"] == "oldHelper"
        assert "@deprecated" in results[0]["text"]

    def test_detects_multiple_deprecated_symbols(self, tmp_path):
        """Should find all @deprecated tags in a file with mixed content."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        (tmp_path / "mixed.ts").write_text(TS_FILE_MULTIPLE_DEPRECATED)

        results = _grep_deprecations(tmp_path, [])
        symbols = {r["symbol"] for r in results}
        assert "legacyFormat" in symbols
        assert "UserService" in symbols
        assert "OLD_CONFIG" in symbols
        assert len(results) == 3

    def test_ignores_non_deprecated_functions(self, tmp_path):
        """Should not flag functions without @deprecated."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        (tmp_path / "modern.ts").write_text(TS_FILE_NO_DEPRECATED)

        results = _grep_deprecations(tmp_path, [])
        assert len(results) == 0

    def test_extracts_deprecation_text(self, tmp_path):
        """Should capture the @deprecated annotation text."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)

        results = _grep_deprecations(tmp_path, [])
        assert "Use newHelper instead" in results[0]["text"]

    def test_extracts_correct_line_number(self, tmp_path):
        """Line number should point to the @deprecated tag line."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)

        results = _grep_deprecations(tmp_path, [])
        # @deprecated is on line 2 of the file
        assert results[0]["line"] == 2

    def test_scans_ts_tsx_js_files(self, tmp_path):
        """Should scan .ts, .tsx, and .js files."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        deprecated_content = '/** @deprecated old */\nexport function old(): void {}\n'
        (tmp_path / "a.ts").write_text(deprecated_content)
        (tmp_path / "b.tsx").write_text(deprecated_content)
        (tmp_path / "c.js").write_text(deprecated_content)
        (tmp_path / "d.py").write_text("# @deprecated not scanned\ndef old(): pass\n")

        results = _grep_deprecations(tmp_path, [])
        paths = {r["path"] for r in results}
        assert "a.ts" in paths
        assert "b.tsx" in paths
        assert "c.js" in paths
        assert "d.py" not in paths

    def test_respects_exclude_patterns(self, tmp_path):
        """Should skip files matching exclusion patterns."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        nm_dir = tmp_path / "node_modules" / "pkg"
        nm_dir.mkdir(parents=True)
        (nm_dir / "index.ts").write_text(
            '/** @deprecated */\nexport function old(): void {}\n'
        )
        (tmp_path / "src.ts").write_text(
            '/** @deprecated */\nexport function old(): void {}\n'
        )

        results = _grep_deprecations(tmp_path, ["node_modules/*"])
        assert len(results) == 1
        assert "node_modules" not in results[0]["path"]

    def test_handles_inline_deprecated_jsdoc(self, tmp_path):
        """Should detect single-line JSDoc: /** @deprecated reason */"""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        content = '/** @deprecated Use v2 */\nexport const V1 = "old";\n'
        (tmp_path / "const.ts").write_text(content)

        results = _grep_deprecations(tmp_path, [])
        assert len(results) == 1
        assert results[0]["symbol"] == "V1"

    def test_extracts_symbol_from_function_declaration(self, tmp_path):
        """Should extract function name from 'export function NAME'."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        content = '/** @deprecated */\nexport function doSomething(): void {}\n'
        (tmp_path / "fn.ts").write_text(content)

        results = _grep_deprecations(tmp_path, [])
        assert results[0]["symbol"] == "doSomething"

    def test_extracts_symbol_from_class_declaration(self, tmp_path):
        """Should extract class name from 'export class NAME'."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        content = '/** @deprecated */\nexport class OldService {}\n'
        (tmp_path / "cls.ts").write_text(content)

        results = _grep_deprecations(tmp_path, [])
        assert results[0]["symbol"] == "OldService"

    def test_extracts_symbol_from_const_declaration(self, tmp_path):
        """Should extract const name from 'export const NAME'."""
        from pennyfarthing_scripts.codemarkers.analyze import _grep_deprecations

        content = '/** @deprecated */\nexport const MY_CONST = 42;\n'
        (tmp_path / "cst.ts").write_text(content)

        results = _grep_deprecations(tmp_path, [])
        assert results[0]["symbol"] == "MY_CONST"


# =============================================================================
# _count_callers tests
# =============================================================================

class TestCountCallers:
    """Tests for caller/importer cross-referencing."""

    def test_counts_import_references(self, tmp_path):
        """Should count files that import the deprecated symbol."""
        from pennyfarthing_scripts.codemarkers.analyze import _count_callers

        src = tmp_path / "src"
        src.mkdir()
        (src / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)
        (src / "consumer1.ts").write_text(TS_FILE_CALLERS)
        (src / "consumer2.ts").write_text(TS_FILE_ANOTHER_CALLER)

        count, callers = _count_callers("oldHelper", tmp_path, "src/utils.ts")
        assert count == 2
        assert len(callers) == 2

    def test_returns_caller_file_paths(self, tmp_path):
        """Callers list should contain relative file paths."""
        from pennyfarthing_scripts.codemarkers.analyze import _count_callers

        src = tmp_path / "src"
        src.mkdir()
        (src / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)
        (src / "consumer.ts").write_text(TS_FILE_CALLERS)

        count, callers = _count_callers("oldHelper", tmp_path, "src/utils.ts")
        assert all(isinstance(c, str) for c in callers)
        assert any("consumer" in c for c in callers)

    def test_excludes_defining_file(self, tmp_path):
        """Should not count the file that defines the symbol as a caller."""
        from pennyfarthing_scripts.codemarkers.analyze import _count_callers

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)

        count, callers = _count_callers("oldHelper", tmp_path, "utils.ts")
        assert count == 0
        assert "utils.ts" not in callers

    def test_zero_callers_when_unused(self, tmp_path):
        """Should return 0 callers when no files import the symbol."""
        from pennyfarthing_scripts.codemarkers.analyze import _count_callers

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)
        (tmp_path / "other.ts").write_text('export const x = 42;\n')

        count, callers = _count_callers("oldHelper", tmp_path, "utils.ts")
        assert count == 0
        assert callers == []


# =============================================================================
# analyze_deprecations integration tests
# =============================================================================

class TestAnalyzeDeprecations:
    """Full pipeline: scan for deprecations + cross-reference callers."""

    def test_returns_deprecation_markers(self, tmp_path):
        """Should return a list of DeprecationMarker objects."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)
        (tmp_path / "caller.ts").write_text(TS_FILE_CALLERS)

        result = asyncio.run(analyze_deprecations(tmp_path))
        assert result["success"] is True
        assert len(result["deprecations"]) >= 1
        marker = result["deprecations"][0]
        assert isinstance(marker, DeprecationMarker)

    def test_populates_caller_count(self, tmp_path):
        """Each marker should have caller_count populated."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)
        (tmp_path / "caller1.ts").write_text(TS_FILE_CALLERS)
        (tmp_path / "caller2.ts").write_text(TS_FILE_ANOTHER_CALLER)

        result = asyncio.run(analyze_deprecations(tmp_path))
        marker = result["deprecations"][0]
        assert marker.caller_count == 2
        assert len(marker.callers) == 2

    def test_includes_summary(self, tmp_path):
        """Result should include a summary with total_deprecations and deprecations_with_callers."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_SINGLE_DEPRECATED)

        result = asyncio.run(analyze_deprecations(tmp_path))
        assert "summary" in result
        assert "total_deprecations" in result["summary"]
        assert "deprecations_with_callers" in result["summary"]

    def test_empty_repo_returns_empty(self, tmp_path):
        """Repo with no .ts files should return empty deprecations."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        (tmp_path / "readme.md").write_text("# Hello\n")

        result = asyncio.run(analyze_deprecations(tmp_path))
        assert result["success"] is True
        assert result["deprecations"] == []
        assert result["summary"]["total_deprecations"] == 0

    def test_nonexistent_path_returns_error(self):
        """Non-existent path should return error result."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        result = asyncio.run(analyze_deprecations(Path("/nonexistent/path/xyz")))
        assert result["success"] is False
        assert "error" in result

    def test_summary_counts_callers_correctly(self, tmp_path):
        """deprecations_with_callers counts only markers where caller_count > 0."""
        from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations

        (tmp_path / "utils.ts").write_text(TS_FILE_MULTIPLE_DEPRECATED)
        # Only oldHelper-like references, not all deprecated symbols
        (tmp_path / "caller.ts").write_text(
            'import { legacyFormat } from "./utils";\nlegacyFormat(new Date());\n'
        )

        result = asyncio.run(analyze_deprecations(tmp_path))
        summary = result["summary"]
        assert summary["total_deprecations"] == 3
        # Only legacyFormat has callers
        assert summary["deprecations_with_callers"] >= 1


# =============================================================================
# CLI integration tests
# =============================================================================

class TestDeprecationCLI:
    """Tests for CLI deprecation subcommand."""

    def test_deprecations_command_exists(self):
        """The codemarkers CLI should have a 'deprecations' subcommand."""
        from pennyfarthing_scripts.codemarkers.cli import codemarkers

        runner = CliRunner()
        result = runner.invoke(codemarkers, ["deprecations", "--help"])
        assert result.exit_code == 0
        assert "deprecat" in result.output.lower()

    def test_deprecations_json_output(self):
        """--format json should return valid JSON with deprecations key."""
        from pennyfarthing_scripts.codemarkers.cli import codemarkers

        mock_result = {
            "success": True,
            "deprecations": [],
            "summary": {"total_deprecations": 0, "deprecations_with_callers": 0},
        }
        with patch(
            "pennyfarthing_scripts.codemarkers.cli._run_deprecation_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(codemarkers, ["deprecations", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert "deprecations" in data


# =============================================================================
# Module export tests
# =============================================================================

class TestModuleExports:
    """Verify __init__.py re-exports deprecation symbols."""

    def test_deprecation_marker_exported(self):
        """DeprecationMarker should be importable from the package."""
        from pennyfarthing_scripts.codemarkers import DeprecationMarker as Exported
        assert Exported is DeprecationMarker

    def test_analyze_deprecations_exported(self):
        """analyze_deprecations should be importable from the package."""
        from pennyfarthing_scripts.codemarkers import analyze_deprecations
        assert callable(analyze_deprecations)
