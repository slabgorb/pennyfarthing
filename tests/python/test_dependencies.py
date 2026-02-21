"""
Tests for pf.dependencies module.

Covers models (ADR-0008), npm output parsing, analysis engine,
formatters (table/json/csv), CLI options, and edge cases.
"""

import asyncio
import json
from dataclasses import asdict
from pathlib import Path
from unittest.mock import AsyncMock, patch

from click.testing import CliRunner
from pf.dependencies.analyze import (
    _parse_audit_output,
    _parse_outdated_output,
    analyze_dependencies,
)
from pf.dependencies.cli import dependencies
from pf.dependencies.formatters import (
    export_csv,
    export_json,
    format_audit_table,
    format_outdated_table,
)
from pf.dependencies.models import (
    DependenciesResult,
    OutdatedPackage,
    SecurityAdvisory,
)

# =============================================================================
# Sample npm JSON outputs for mocking
# =============================================================================

SAMPLE_OUTDATED_OUTPUT = json.dumps({
    "express": {
        "current": "4.18.2",
        "wanted": "4.18.3",
        "latest": "5.0.0",
        "dependent": "my-app",
        "type": "dependencies",
    },
    "lodash": {
        "current": "4.17.20",
        "wanted": "4.17.21",
        "latest": "4.17.21",
        "dependent": "my-app",
        "type": "dependencies",
    },
    "typescript": {
        "current": "5.0.0",
        "wanted": "5.0.0",
        "latest": "5.7.2",
        "dependent": "my-app",
        "type": "devDependencies",
    },
})

EMPTY_OUTDATED_OUTPUT = json.dumps({})

SAMPLE_AUDIT_OUTPUT = json.dumps({
    "vulnerabilities": {
        "lodash": {
            "name": "lodash",
            "severity": "high",
            "via": [{"title": "Prototype Pollution", "severity": "high"}],
            "effects": [],
            "fixAvailable": True,
        },
        "express": {
            "name": "express",
            "severity": "moderate",
            "via": [{"title": "Path traversal", "severity": "moderate"}],
            "effects": [],
            "fixAvailable": True,
        },
        "debug": {
            "name": "debug",
            "severity": "low",
            "via": [{"title": "ReDoS", "severity": "low"}],
            "effects": [],
            "fixAvailable": False,
        },
    },
    "metadata": {
        "vulnerabilities": {
            "info": 0,
            "low": 1,
            "moderate": 1,
            "high": 1,
            "critical": 0,
            "total": 3,
        },
    },
})

EMPTY_AUDIT_OUTPUT = json.dumps({
    "vulnerabilities": {},
    "metadata": {
        "vulnerabilities": {
            "info": 0,
            "low": 0,
            "moderate": 0,
            "high": 0,
            "critical": 0,
            "total": 0,
        },
    },
})


# =============================================================================
# Model tests (AC: ADR-0008 dataclass pattern)
# =============================================================================

class TestModels:
    def test_outdated_package_fields(self):
        pkg = OutdatedPackage(
            name="express",
            current="4.18.2",
            wanted="4.18.3",
            latest="5.0.0",
            type="dependencies",
        )
        assert pkg.name == "express"
        assert pkg.current == "4.18.2"
        assert pkg.wanted == "4.18.3"
        assert pkg.latest == "5.0.0"
        assert pkg.type == "dependencies"

    def test_outdated_package_serializable(self):
        pkg = OutdatedPackage(
            name="lodash",
            current="4.17.20",
            wanted="4.17.21",
            latest="4.17.21",
            type="dependencies",
        )
        d = asdict(pkg)
        assert d["name"] == "lodash"
        assert d["current"] == "4.17.20"
        assert "wanted" in d
        assert "latest" in d
        assert "type" in d

    def test_security_advisory_fields(self):
        adv = SecurityAdvisory(severity="high", count=3)
        assert adv.severity == "high"
        assert adv.count == 3

    def test_security_advisory_serializable(self):
        adv = SecurityAdvisory(severity="critical", count=1)
        d = asdict(adv)
        assert d["severity"] == "critical"
        assert d["count"] == 1

    def test_dependencies_result_success(self):
        result = DependenciesResult(
            success=True,
            target_path="/tmp/project",
            outdated=[
                OutdatedPackage(name="express", current="4.18.2",
                                wanted="4.18.3", latest="5.0.0",
                                type="dependencies"),
            ],
            advisories=[SecurityAdvisory(severity="high", count=1)],
        )
        assert result.success is True
        assert result.error is None
        assert len(result.outdated) == 1
        assert len(result.advisories) == 1

    def test_dependencies_result_error(self):
        result = DependenciesResult(
            success=False,
            error="npm not found",
        )
        assert result.success is False
        assert result.error == "npm not found"
        assert result.outdated == []
        assert result.advisories == []

    def test_adr_0008_pattern_serializable(self):
        """ADR-0008: Result must be serializable via dataclasses.asdict()."""
        result = DependenciesResult(
            success=True,
            target_path="/tmp",
            outdated=[
                OutdatedPackage(name="a", current="1.0.0",
                                wanted="1.0.1", latest="2.0.0",
                                type="dependencies"),
            ],
            advisories=[SecurityAdvisory(severity="low", count=2)],
        )
        d = asdict(result)
        assert d["success"] is True
        assert d["error"] is None
        assert len(d["outdated"]) == 1
        assert len(d["advisories"]) == 1
        assert d["outdated"][0]["name"] == "a"

    def test_dependencies_result_defaults(self):
        """Default empty lists for outdated and advisories."""
        result = DependenciesResult(success=True)
        assert result.outdated == []
        assert result.advisories == []
        assert result.target_path == ""


# =============================================================================
# npm outdated parsing tests
# =============================================================================

class TestParseOutdatedOutput:
    def test_parses_package_count(self):
        packages = _parse_outdated_output(SAMPLE_OUTDATED_OUTPUT)
        assert len(packages) == 3

    def test_extracts_package_name(self):
        packages = _parse_outdated_output(SAMPLE_OUTDATED_OUTPUT)
        names = [p.name for p in packages]
        assert "express" in names
        assert "lodash" in names
        assert "typescript" in names

    def test_extracts_versions(self):
        packages = _parse_outdated_output(SAMPLE_OUTDATED_OUTPUT)
        express = next(p for p in packages if p.name == "express")
        assert express.current == "4.18.2"
        assert express.wanted == "4.18.3"
        assert express.latest == "5.0.0"

    def test_extracts_type(self):
        packages = _parse_outdated_output(SAMPLE_OUTDATED_OUTPUT)
        ts = next(p for p in packages if p.name == "typescript")
        assert ts.type == "devDependencies"

    def test_empty_output(self):
        packages = _parse_outdated_output(EMPTY_OUTDATED_OUTPUT)
        assert packages == []

    def test_invalid_json_returns_empty(self):
        packages = _parse_outdated_output("not valid json")
        assert packages == []

    def test_null_input_returns_empty(self):
        packages = _parse_outdated_output("")
        assert packages == []


# =============================================================================
# npm audit parsing tests
# =============================================================================

class TestParseAuditOutput:
    def test_parses_advisory_count(self):
        advisories = _parse_audit_output(SAMPLE_AUDIT_OUTPUT)
        assert len(advisories) > 0

    def test_extracts_severity_levels(self):
        advisories = _parse_audit_output(SAMPLE_AUDIT_OUTPUT)
        severities = {a.severity for a in advisories}
        assert "high" in severities
        assert "moderate" in severities

    def test_counts_per_severity(self):
        advisories = _parse_audit_output(SAMPLE_AUDIT_OUTPUT)
        high = next(a for a in advisories if a.severity == "high")
        assert high.count >= 1

    def test_empty_audit(self):
        advisories = _parse_audit_output(EMPTY_AUDIT_OUTPUT)
        assert advisories == []

    def test_invalid_json_returns_empty(self):
        advisories = _parse_audit_output("not valid json")
        assert advisories == []

    def test_no_vulnerabilities_key(self):
        advisories = _parse_audit_output(json.dumps({"metadata": {}}))
        assert advisories == []


# =============================================================================
# analyze_dependencies tests (AC: module core, graceful error)
# =============================================================================

class TestAnalyzeDependencies:
    def test_npm_not_found_returns_error(self):
        """AC: Graceful error when npm is not available."""
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=None,
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.success is False
            assert "npm" in result.error.lower()

    def test_successful_analysis(self):
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=True,
        ), patch(
            "pf.dependencies.analyze._run_npm_outdated",
            new_callable=AsyncMock,
            return_value=(SAMPLE_OUTDATED_OUTPUT, "", 1),
        ), patch(
            "pf.dependencies.analyze._run_npm_audit",
            new_callable=AsyncMock,
            return_value=(SAMPLE_AUDIT_OUTPUT, "", 0),
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.success is True
            assert len(result.outdated) > 0
            assert len(result.advisories) > 0

    def test_result_has_target_path(self):
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=True,
        ), patch(
            "pf.dependencies.analyze._run_npm_outdated",
            new_callable=AsyncMock,
            return_value=(SAMPLE_OUTDATED_OUTPUT, "", 1),
        ), patch(
            "pf.dependencies.analyze._run_npm_audit",
            new_callable=AsyncMock,
            return_value=(SAMPLE_AUDIT_OUTPUT, "", 0),
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.target_path != ""

    def test_outdated_failure_still_returns_audit(self):
        """If npm outdated fails, audit results should still be returned."""
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=True,
        ), patch(
            "pf.dependencies.analyze._run_npm_outdated",
            new_callable=AsyncMock,
            return_value=("", "error", 2),
        ), patch(
            "pf.dependencies.analyze._run_npm_audit",
            new_callable=AsyncMock,
            return_value=(SAMPLE_AUDIT_OUTPUT, "", 0),
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.success is True
            assert len(result.advisories) > 0

    def test_audit_failure_still_returns_outdated(self):
        """If npm audit fails, outdated results should still be returned."""
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=True,
        ), patch(
            "pf.dependencies.analyze._run_npm_outdated",
            new_callable=AsyncMock,
            return_value=(SAMPLE_OUTDATED_OUTPUT, "", 1),
        ), patch(
            "pf.dependencies.analyze._run_npm_audit",
            new_callable=AsyncMock,
            return_value=("", "error", 2),
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.success is True
            assert len(result.outdated) > 0

    def test_no_package_json_returns_error(self):
        """AC: Graceful error when no package.json exists."""
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=False,
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/empty")))
            assert result.success is False
            assert "package.json" in result.error.lower()

    def test_both_empty_results(self):
        """No outdated packages and no vulnerabilities."""
        with patch(
            "pf.dependencies.analyze._find_npm",
            return_value=Path("/usr/local/bin/npm"),
        ), patch(
            "pf.dependencies.analyze._check_package_json",
            return_value=True,
        ), patch(
            "pf.dependencies.analyze._run_npm_outdated",
            new_callable=AsyncMock,
            return_value=(EMPTY_OUTDATED_OUTPUT, "", 0),
        ), patch(
            "pf.dependencies.analyze._run_npm_audit",
            new_callable=AsyncMock,
            return_value=(EMPTY_AUDIT_OUTPUT, "", 0),
        ):
            result = asyncio.run(analyze_dependencies(Path("/tmp/project")))
            assert result.success is True
            assert result.outdated == []
            assert result.advisories == []


# =============================================================================
# Formatter tests (AC: table, JSON, CSV formatters)
# =============================================================================

class TestFormatters:
    def test_format_outdated_table_with_data(self):
        packages = [
            OutdatedPackage(name="express", current="4.18.2",
                            wanted="4.18.3", latest="5.0.0",
                            type="dependencies"),
        ]
        table = format_outdated_table(packages)
        assert "express" in table
        assert "4.18.2" in table
        assert "5.0.0" in table

    def test_format_outdated_table_empty(self):
        table = format_outdated_table([])
        assert "no" in table.lower() or "up to date" in table.lower()

    def test_format_outdated_table_has_headers(self):
        packages = [
            OutdatedPackage(name="a", current="1.0.0",
                            wanted="1.0.1", latest="2.0.0",
                            type="dependencies"),
        ]
        table = format_outdated_table(packages)
        assert "Package" in table or "Name" in table or "package" in table.lower()

    def test_format_audit_table_with_data(self):
        advisories = [
            SecurityAdvisory(severity="high", count=2),
            SecurityAdvisory(severity="low", count=1),
        ]
        table = format_audit_table(advisories)
        assert "high" in table.lower()
        assert "2" in table

    def test_format_audit_table_empty(self):
        table = format_audit_table([])
        assert "no" in table.lower() or "clean" in table.lower()

    def test_export_json_matches_api_contract(self):
        """AC: JSON output matches the API contract."""
        result = DependenciesResult(
            success=True,
            target_path="/tmp/project",
            outdated=[
                OutdatedPackage(name="express", current="4.18.2",
                                wanted="4.18.3", latest="5.0.0",
                                type="dependencies"),
            ],
            advisories=[SecurityAdvisory(severity="high", count=1)],
        )
        output = export_json(result)
        data = json.loads(output)
        assert data["success"] is True
        assert "target_path" in data
        assert "outdated" in data
        assert "advisories" in data
        assert data["error"] is None
        # Per-package contract
        pkg = data["outdated"][0]
        assert "name" in pkg
        assert "current" in pkg
        assert "wanted" in pkg
        assert "latest" in pkg
        assert "type" in pkg
        # Advisory contract
        adv = data["advisories"][0]
        assert "severity" in adv
        assert "count" in adv

    def test_export_json_error_result(self):
        result = DependenciesResult(
            success=False,
            error="npm not found",
        )
        output = export_json(result)
        data = json.loads(output)
        assert data["success"] is False
        assert data["error"] == "npm not found"

    def test_export_csv_outdated(self):
        packages = [
            OutdatedPackage(name="express", current="4.18.2",
                            wanted="4.18.3", latest="5.0.0",
                            type="dependencies"),
        ]
        csv_output = export_csv(packages)
        assert "name" in csv_output  # header
        assert "express" in csv_output
        assert "4.18.2" in csv_output

    def test_export_csv_empty(self):
        csv_output = export_csv([])
        assert "name" in csv_output  # header still present


# =============================================================================
# CLI tests (AC: module runnable, CLI options)
# =============================================================================

class TestCLI:
    def test_help(self):
        runner = CliRunner()
        result = runner.invoke(dependencies, ["--help"])
        assert result.exit_code == 0
        assert "analyze" in result.output

    def test_analyze_help(self):
        runner = CliRunner()
        result = runner.invoke(dependencies, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--format" in result.output
        assert "--path" in result.output

    def test_format_choices(self):
        """AC: CLI supports --format table|json|csv."""
        runner = CliRunner()
        result = runner.invoke(dependencies, ["analyze", "--help"])
        assert "table" in result.output
        assert "json" in result.output

    def test_analyze_json_format(self):
        mock_result = DependenciesResult(
            success=True,
            target_path="/tmp",
            outdated=[
                OutdatedPackage(name="express", current="4.18.2",
                                wanted="4.18.3", latest="5.0.0",
                                type="dependencies"),
            ],
            advisories=[SecurityAdvisory(severity="high", count=1)],
        )
        with patch(
            "pf.dependencies.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(dependencies, ["analyze", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True

    def test_analyze_table_format(self):
        mock_result = DependenciesResult(
            success=True,
            target_path="/tmp",
            outdated=[
                OutdatedPackage(name="express", current="4.18.2",
                                wanted="4.18.3", latest="5.0.0",
                                type="dependencies"),
            ],
            advisories=[],
        )
        with patch(
            "pf.dependencies.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(dependencies, ["analyze", "--format", "table"])
            assert result.exit_code == 0
            assert "express" in result.output
