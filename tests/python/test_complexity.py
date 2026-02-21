"""
Tests for pf.complexity module.

Covers models (ADR-0008), ESLint output parsing, analysis engine,
formatters (table/json/csv), CLI options, and edge cases.
"""

import asyncio
import json
from dataclasses import asdict
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from click.testing import CliRunner
from pf.complexity.analyze import (
    _find_eslint,
    _parse_eslint_output,
    analyze_complexity,
)
from pf.complexity.cli import complexity
from pf.complexity.formatters import (
    export_csv,
    export_json,
    format_file_table,
)
from pf.complexity.models import (
    ComplexityResult,
    FileComplexity,
)

# =============================================================================
# Sample ESLint JSON output for mocking
# =============================================================================

SAMPLE_ESLINT_OUTPUT = json.dumps([
    {
        "filePath": "/tmp/project/src/server.ts",
        "messages": [
            {
                "ruleId": "complexity",
                "severity": 1,
                "message": "Function 'handleRequest' has a complexity of 12.",
                "line": 10,
                "column": 1,
            },
            {
                "ruleId": "complexity",
                "severity": 1,
                "message": "Arrow function has a complexity of 5.",
                "line": 50,
                "column": 5,
            },
            {
                "ruleId": "max-depth",
                "severity": 1,
                "message": "Blocks are nested too deeply (5).",
                "line": 20,
                "column": 9,
            },
            {
                "ruleId": "max-depth",
                "severity": 1,
                "message": "Blocks are nested too deeply (3).",
                "line": 55,
                "column": 9,
            },
            {
                "ruleId": "max-lines-per-function",
                "severity": 1,
                "message": "Function has too many lines (85). Maximum allowed is 1.",
                "line": 10,
                "column": 1,
            },
            {
                "ruleId": "max-lines-per-function",
                "severity": 1,
                "message": "Arrow function has too many lines (30). Maximum allowed is 1.",
                "line": 50,
                "column": 5,
            },
        ],
        "errorCount": 0,
        "warningCount": 6,
    },
    {
        "filePath": "/tmp/project/src/utils.ts",
        "messages": [
            {
                "ruleId": "complexity",
                "severity": 1,
                "message": "Function 'parseInput' has a complexity of 3.",
                "line": 1,
                "column": 1,
            },
            {
                "ruleId": "max-lines-per-function",
                "severity": 1,
                "message": "Function has too many lines (20). Maximum allowed is 1.",
                "line": 1,
                "column": 1,
            },
        ],
        "errorCount": 0,
        "warningCount": 2,
    },
])

EMPTY_ESLINT_OUTPUT = json.dumps([])

NO_MESSAGES_OUTPUT = json.dumps([
    {
        "filePath": "/tmp/project/src/simple.ts",
        "messages": [],
        "errorCount": 0,
        "warningCount": 0,
    },
])


# =============================================================================
# Model tests (AC: ADR-0008 dataclass pattern)
# =============================================================================

class TestModels:
    def test_file_complexity_defaults(self):
        fc = FileComplexity(path="src/app.ts")
        assert fc.path == "src/app.ts"
        assert fc.total_lines == 0
        assert fc.longest_function == 0
        assert fc.avg_cyclomatic_complexity == 0.0
        assert fc.max_nesting_depth == 0
        assert fc.function_count == 0

    def test_file_complexity_with_values(self):
        fc = FileComplexity(
            path="src/server.ts",
            total_lines=506,
            longest_function=85,
            avg_cyclomatic_complexity=4.2,
            max_nesting_depth=5,
            function_count=18,
        )
        assert fc.total_lines == 506
        assert fc.longest_function == 85
        assert fc.avg_cyclomatic_complexity == 4.2
        assert fc.max_nesting_depth == 5
        assert fc.function_count == 18

    def test_complexity_result_success(self):
        result = ComplexityResult(
            success=True,
            target_path="/tmp/project",
            file_count=2,
            files=[FileComplexity(path="a.ts"), FileComplexity(path="b.ts")],
        )
        assert result.success is True
        assert result.error is None
        assert result.file_count == 2
        assert len(result.files) == 2

    def test_complexity_result_error(self):
        result = ComplexityResult(
            success=False,
            error="eslint not found",
        )
        assert result.success is False
        assert result.error == "eslint not found"
        assert result.files == []

    def test_adr_0008_pattern_serializable(self):
        """ADR-0008: Result must be serializable via dataclasses.asdict()."""
        result = ComplexityResult(
            success=True,
            target_path="/tmp",
            file_count=1,
            files=[FileComplexity(path="a.ts", total_lines=100)],
        )
        d = asdict(result)
        assert d["success"] is True
        assert d["error"] is None
        assert len(d["files"]) == 1
        assert d["files"][0]["path"] == "a.ts"

    def test_per_file_metrics_fields(self):
        """AC: Per-file metrics include all required fields."""
        fc = FileComplexity(path="test.ts")
        d = asdict(fc)
        required_fields = {"path", "total_lines", "longest_function",
                          "avg_cyclomatic_complexity", "max_nesting_depth",
                          "function_count"}
        assert required_fields.issubset(d.keys())


# =============================================================================
# ESLint output parsing tests
# =============================================================================

class TestParseEslintOutput:
    def test_parses_file_count(self):
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        assert len(files) == 2

    def test_extracts_cyclomatic_complexity(self):
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        server = next(f for f in files if "server" in f.path)
        # server.ts has complexity 12 and 5 → avg = 8.5
        assert server.avg_cyclomatic_complexity == pytest.approx(8.5, abs=0.1)

    def test_extracts_max_nesting_depth(self):
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        server = next(f for f in files if "server" in f.path)
        # max-depth messages: 5 and 3 → max = 5
        assert server.max_nesting_depth == 5

    def test_extracts_longest_function(self):
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        server = next(f for f in files if "server" in f.path)
        # max-lines-per-function messages: 85 and 30 → longest = 85
        assert server.longest_function == 85

    def test_extracts_function_count(self):
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        server = next(f for f in files if "server" in f.path)
        # complexity rule fires once per function: 2 messages
        assert server.function_count == 2

    def test_relative_paths(self):
        """Parsed file paths should be relative to target directory."""
        files = _parse_eslint_output(SAMPLE_ESLINT_OUTPUT, Path("/tmp/project"))
        for f in files:
            assert not f.path.startswith("/"), f"Path should be relative: {f.path}"

    def test_empty_eslint_output(self):
        files = _parse_eslint_output(EMPTY_ESLINT_OUTPUT, Path("/tmp/project"))
        assert files == []

    def test_no_messages_still_returns_file(self):
        """Files with no rule violations should still appear with zero metrics."""
        files = _parse_eslint_output(NO_MESSAGES_OUTPUT, Path("/tmp/project"))
        assert len(files) == 1
        assert files[0].avg_cyclomatic_complexity == 0.0
        assert files[0].function_count == 0

    def test_invalid_json_returns_empty(self):
        files = _parse_eslint_output("not valid json", Path("/tmp"))
        assert files == []

    def test_single_function_file(self):
        """File with exactly one function should have avg == that value."""
        output = json.dumps([{
            "filePath": "/tmp/project/src/one.ts",
            "messages": [
                {"ruleId": "complexity", "severity": 1,
                 "message": "Function 'main' has a complexity of 7.",
                 "line": 1, "column": 1},
                {"ruleId": "max-lines-per-function", "severity": 1,
                 "message": "Function has too many lines (42). Maximum allowed is 1.",
                 "line": 1, "column": 1},
            ],
            "errorCount": 0, "warningCount": 2,
        }])
        files = _parse_eslint_output(output, Path("/tmp/project"))
        assert len(files) == 1
        assert files[0].avg_cyclomatic_complexity == 7.0
        assert files[0].longest_function == 42
        assert files[0].function_count == 1


# =============================================================================
# _find_eslint tests
# =============================================================================

class TestFindEslint:
    def test_finds_eslint_in_node_modules(self):
        with patch("pathlib.Path.exists", return_value=True):
            result = _find_eslint(Path("/tmp/project"))
            assert result is not None

    def test_returns_none_when_not_found(self):
        with patch("pathlib.Path.exists", return_value=False):
            result = _find_eslint(Path("/tmp/project"))
            assert result is None


# =============================================================================
# analyze_complexity tests (AC: module core, graceful error)
# =============================================================================

class TestAnalyzeComplexity:
    def test_eslint_not_found_returns_error(self):
        """AC: Graceful error when eslint is not installed."""
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=None,
        ):
            result = asyncio.run(analyze_complexity(Path("/tmp/project")))
            assert result.success is False
            assert "eslint" in result.error.lower()

    def test_successful_analysis(self):
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=Path("/tmp/project/node_modules/.bin/eslint"),
        ), patch(
            "pf.complexity.analyze._run_eslint",
            new_callable=AsyncMock,
            return_value=(SAMPLE_ESLINT_OUTPUT, "", 1),
        ), patch(
            "pf.complexity.analyze._count_file_lines",
            new_callable=AsyncMock,
            return_value=506,
        ):
            result = asyncio.run(analyze_complexity(Path("/tmp/project")))
            assert result.success is True
            assert result.file_count >= 1
            assert len(result.files) >= 1

    def test_result_has_target_path(self):
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=Path("/tmp/project/node_modules/.bin/eslint"),
        ), patch(
            "pf.complexity.analyze._run_eslint",
            new_callable=AsyncMock,
            return_value=(SAMPLE_ESLINT_OUTPUT, "", 1),
        ), patch(
            "pf.complexity.analyze._count_file_lines",
            new_callable=AsyncMock,
            return_value=100,
        ):
            result = asyncio.run(analyze_complexity(Path("/tmp/project")))
            assert result.target_path != ""

    def test_eslint_nonzero_exit_still_parses(self):
        """ESLint returns exit code 1 for warnings — should still parse output."""
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=Path("/tmp/node_modules/.bin/eslint"),
        ), patch(
            "pf.complexity.analyze._run_eslint",
            new_callable=AsyncMock,
            return_value=(SAMPLE_ESLINT_OUTPUT, "", 1),
        ), patch(
            "pf.complexity.analyze._count_file_lines",
            new_callable=AsyncMock,
            return_value=200,
        ):
            result = asyncio.run(analyze_complexity(Path("/tmp/project")))
            assert result.success is True
            assert len(result.files) > 0

    def test_empty_results(self):
        """No TS/JS files found should return success with empty files list."""
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=Path("/tmp/node_modules/.bin/eslint"),
        ), patch(
            "pf.complexity.analyze._run_eslint",
            new_callable=AsyncMock,
            return_value=(EMPTY_ESLINT_OUTPUT, "", 0),
        ):
            result = asyncio.run(analyze_complexity(Path("/tmp/project")))
            assert result.success is True
            assert result.file_count == 0
            assert result.files == []

    def test_excludes_patterns(self):
        """Files matching exclude patterns should be filtered out."""
        output_with_excluded = json.dumps([
            {
                "filePath": "/tmp/project/src/app.ts",
                "messages": [
                    {"ruleId": "complexity", "severity": 1,
                     "message": "Function has a complexity of 5.",
                     "line": 1, "column": 1},
                ],
                "errorCount": 0, "warningCount": 1,
            },
            {
                "filePath": "/tmp/project/node_modules/lib/index.ts",
                "messages": [
                    {"ruleId": "complexity", "severity": 1,
                     "message": "Function has a complexity of 20.",
                     "line": 1, "column": 1},
                ],
                "errorCount": 0, "warningCount": 1,
            },
        ])
        with patch(
            "pf.complexity.analyze._find_eslint",
            return_value=Path("/tmp/node_modules/.bin/eslint"),
        ), patch(
            "pf.complexity.analyze._run_eslint",
            new_callable=AsyncMock,
            return_value=(output_with_excluded, "", 1),
        ), patch(
            "pf.complexity.analyze._count_file_lines",
            new_callable=AsyncMock,
            return_value=100,
        ):
            result = asyncio.run(analyze_complexity(
                Path("/tmp/project"), excludes=["node_modules/*"]
            ))
            paths = [f.path for f in result.files]
            assert any("app" in p for p in paths)
            assert not any("node_modules" in p for p in paths)


# =============================================================================
# Formatter tests (AC: table, JSON, CSV formatters)
# =============================================================================

class TestFormatters:
    def test_format_file_table_with_data(self):
        files = [
            FileComplexity(
                path="src/server.ts",
                total_lines=506,
                longest_function=85,
                avg_cyclomatic_complexity=4.2,
                max_nesting_depth=5,
                function_count=18,
            ),
        ]
        table = format_file_table(files)
        assert "src/server.ts" in table
        assert "4.2" in table

    def test_format_file_table_empty(self):
        table = format_file_table([])
        assert "no" in table.lower() or "empty" in table.lower()

    def test_format_file_table_has_headers(self):
        """Table should have column headers for readability."""
        files = [FileComplexity(path="a.ts", avg_cyclomatic_complexity=1.0)]
        table = format_file_table(files)
        # Should contain some form of header row
        assert "Complexity" in table or "complexity" in table.lower()

    def test_format_file_table_top_n(self):
        """--top N should limit output rows."""
        files = [
            FileComplexity(path=f"file{i}.ts", avg_cyclomatic_complexity=float(i))
            for i in range(30)
        ]
        table = format_file_table(files, top_n=5)
        # Count data lines (excluding header and separator)
        lines = [l for l in table.split("\n") if l.strip()]
        # Header + separator + 5 data = 7 lines
        assert len(lines) == 7

    def test_export_json_matches_api_contract(self):
        """AC: JSON output matches the API contract from epic context."""
        result = ComplexityResult(
            success=True,
            target_path="/tmp/project/src",
            file_count=1,
            files=[
                FileComplexity(
                    path="src/server.ts",
                    total_lines=506,
                    longest_function=85,
                    avg_cyclomatic_complexity=4.2,
                    max_nesting_depth=5,
                    function_count=18,
                ),
            ],
        )
        output = export_json(result)
        data = json.loads(output)
        # Top-level contract
        assert data["success"] is True
        assert "target_path" in data
        assert "file_count" in data
        assert "files" in data
        assert data["error"] is None
        # Per-file contract
        file_data = data["files"][0]
        assert "path" in file_data
        assert "total_lines" in file_data
        assert "longest_function" in file_data
        assert "avg_cyclomatic_complexity" in file_data
        assert "max_nesting_depth" in file_data
        assert "function_count" in file_data

    def test_export_json_error_result(self):
        result = ComplexityResult(
            success=False,
            error="eslint not found",
        )
        output = export_json(result)
        data = json.loads(output)
        assert data["success"] is False
        assert data["error"] == "eslint not found"

    def test_export_csv(self):
        files = [
            FileComplexity(
                path="src/app.ts",
                total_lines=200,
                longest_function=40,
                avg_cyclomatic_complexity=3.5,
                max_nesting_depth=3,
                function_count=8,
            ),
        ]
        csv_output = export_csv(files)
        assert "path" in csv_output  # header
        assert "src/app.ts" in csv_output
        assert "3.5" in csv_output

    def test_export_csv_empty(self):
        csv_output = export_csv([])
        # Should still have header row
        assert "path" in csv_output


# =============================================================================
# CLI tests (AC: module runnable, CLI options)
# =============================================================================

class TestCLI:
    def test_help(self):
        runner = CliRunner()
        result = runner.invoke(complexity, ["--help"])
        assert result.exit_code == 0
        assert "analyze" in result.output

    def test_analyze_help(self):
        runner = CliRunner()
        result = runner.invoke(complexity, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--format" in result.output
        assert "--top" in result.output
        assert "--output" in result.output
        assert "--exclude" in result.output
        assert "--path" in result.output

    def test_format_choices(self):
        """AC: CLI supports --format table|json|csv."""
        runner = CliRunner()
        result = runner.invoke(complexity, ["analyze", "--help"])
        assert "table" in result.output
        assert "json" in result.output
        assert "csv" in result.output

    def test_analyze_json_format(self):
        mock_result = ComplexityResult(
            success=True,
            target_path="/tmp",
            file_count=1,
            files=[
                FileComplexity(path="app.ts", avg_cyclomatic_complexity=5.0),
            ],
        )
        with patch(
            "pf.complexity.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(complexity, ["analyze", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True

    def test_analyze_table_format(self):
        mock_result = ComplexityResult(
            success=True,
            target_path="/tmp",
            file_count=1,
            files=[
                FileComplexity(path="app.ts", avg_cyclomatic_complexity=5.0,
                              total_lines=100, function_count=3),
            ],
        )
        with patch(
            "pf.complexity.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(complexity, ["analyze", "--format", "table"])
            assert result.exit_code == 0
            assert "app.ts" in result.output

    def test_analyze_csv_format(self):
        mock_result = ComplexityResult(
            success=True,
            target_path="/tmp",
            file_count=1,
            files=[
                FileComplexity(path="app.ts", avg_cyclomatic_complexity=5.0),
            ],
        )
        with patch(
            "pf.complexity.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(complexity, ["analyze", "--format", "csv"])
            assert result.exit_code == 0
            assert "path" in result.output
            assert "app.ts" in result.output
