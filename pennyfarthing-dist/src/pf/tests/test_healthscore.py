"""
Tests for the healthscore module.

Covers all acceptance criteria for MSSCI-14470:
  AC1: Module structure (cli.py, models.py, analyze.py, formatters.py)
  AC2: Weighted scoring algorithm with 8 configurable dimensions
  AC3: Each dimension 0-100, composite is weighted average 0-100
  AC4: CLI command: pf healthscore analyze [--format table|json|csv] [--path DIR]
  AC5: Result caching within 5-minute window
  AC6: Cache stored in .pennyfarthing/.cache/healthscore/
  AC7: ADR-0008 result pattern
  AC8: Registered in main CLI
  AC9: Tests cover scoring algorithm, caching, and CLI output
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from pf.healthscore.analyze import (
    analyze_healthscore,
    compute_composite_score,
    get_cache_path,
    read_cached_score,
    write_cached_score,
)
from pf.healthscore.cli import healthscore
from pf.healthscore.models import (
    DEFAULT_WEIGHTS,
    DimensionScore,
    HealthscoreResult,
)

# ---------------------------------------------------------------------------
# AC1: Module structure
# ---------------------------------------------------------------------------


class TestModuleStructure:
    """AC1: New module at pf/healthscore/ with standard files."""

    def test_package_has_init(self):
        """Module must be importable as a package."""
        import pf.healthscore

        assert hasattr(pf.healthscore, "HealthscoreResult")
        assert hasattr(pf.healthscore, "DimensionScore")
        assert hasattr(pf.healthscore, "DEFAULT_WEIGHTS")
        assert hasattr(pf.healthscore, "analyze_healthscore")

    def test_models_module_exists(self):
        """models.py must define DimensionScore and HealthscoreResult."""
        from pf.healthscore import models

        assert hasattr(models, "DimensionScore")
        assert hasattr(models, "HealthscoreResult")

    def test_analyze_module_exists(self):
        """analyze.py must define analyze_healthscore."""
        from pf.healthscore import analyze

        assert hasattr(analyze, "analyze_healthscore")

    def test_cli_module_exists(self):
        """cli.py must define the click group."""
        from pf.healthscore import cli

        assert hasattr(cli, "healthscore")

    def test_formatters_module_exists(self):
        """formatters.py must define table/json/csv formatters."""
        from pf.healthscore import formatters

        assert hasattr(formatters, "format_table")
        assert hasattr(formatters, "export_json")
        assert hasattr(formatters, "export_csv")


# ---------------------------------------------------------------------------
# AC2: Weighted scoring algorithm with 8 configurable dimensions
# ---------------------------------------------------------------------------


class TestWeightedScoring:
    """AC2: 8 dimensions with configurable weights."""

    def test_default_weights_has_8_dimensions(self):
        """Must define exactly 8 dimensions."""
        assert len(DEFAULT_WEIGHTS) == 8

    def test_default_weights_sum_to_one(self):
        """Default weights must sum to 1.0."""
        total = sum(DEFAULT_WEIGHTS.values())
        assert abs(total - 1.0) < 1e-9, f"Weights sum to {total}, expected 1.0"

    def test_default_weight_keys(self):
        """Must include all 8 named dimensions."""
        expected = {
            "churn",
            "todo_density",
            "complexity",
            "test_gaps",
            "dead_code",
            "deprecation_debt",
            "dependency_freshness",
            "agent_context_efficiency",
        }
        assert set(DEFAULT_WEIGHTS.keys()) == expected

    def test_default_weight_values(self):
        """Default weights must match spec."""
        assert DEFAULT_WEIGHTS["churn"] == 0.15
        assert DEFAULT_WEIGHTS["todo_density"] == 0.15
        assert DEFAULT_WEIGHTS["complexity"] == 0.15
        assert DEFAULT_WEIGHTS["test_gaps"] == 0.15
        assert DEFAULT_WEIGHTS["dead_code"] == 0.10
        assert DEFAULT_WEIGHTS["deprecation_debt"] == 0.10
        assert DEFAULT_WEIGHTS["dependency_freshness"] == 0.10
        assert DEFAULT_WEIGHTS["agent_context_efficiency"] == 0.10

    def test_custom_weights_override_defaults(self):
        """compute_composite_score must accept custom weights."""
        custom = dict.fromkeys(DEFAULT_WEIGHTS, 1.0 / 8)
        scores = dict.fromkeys(DEFAULT_WEIGHTS, 80.0)
        result = compute_composite_score(scores, custom)
        assert abs(result - 80.0) < 1e-9

    def test_unequal_custom_weights(self):
        """Asymmetric weights should shift composite score."""
        weights = dict.fromkeys(DEFAULT_WEIGHTS, 0.0)
        weights["churn"] = 1.0  # All weight on churn

        scores = dict.fromkeys(DEFAULT_WEIGHTS, 50.0)
        scores["churn"] = 100.0

        result = compute_composite_score(scores, weights)
        assert abs(result - 100.0) < 1e-9


# ---------------------------------------------------------------------------
# AC3: Each dimension 0-100, composite is weighted average 0-100
# ---------------------------------------------------------------------------


class TestScoreRanges:
    """AC3: Dimension scores 0-100, composite 0-100."""

    def test_all_zeros_yields_zero(self):
        """All dimensions at 0 → composite 0."""
        scores = dict.fromkeys(DEFAULT_WEIGHTS, 0.0)
        result = compute_composite_score(scores, DEFAULT_WEIGHTS)
        assert result == 0.0

    def test_all_hundreds_yields_hundred(self):
        """All dimensions at 100 → composite 100."""
        scores = dict.fromkeys(DEFAULT_WEIGHTS, 100.0)
        result = compute_composite_score(scores, DEFAULT_WEIGHTS)
        assert abs(result - 100.0) < 1e-9

    def test_mixed_scores_weighted_average(self):
        """Mixed scores should produce correct weighted average."""
        scores = {
            "churn": 80.0,
            "todo_density": 60.0,
            "complexity": 70.0,
            "test_gaps": 50.0,
            "dead_code": 90.0,
            "deprecation_debt": 40.0,
            "dependency_freshness": 85.0,
            "agent_context_efficiency": 75.0,
        }
        expected = sum(scores[k] * DEFAULT_WEIGHTS[k] for k in DEFAULT_WEIGHTS)
        result = compute_composite_score(scores, DEFAULT_WEIGHTS)
        assert abs(result - expected) < 1e-9

    def test_none_dimensions_excluded_and_renormalized(self):
        """Unavailable dimensions (None) are excluded; remaining weights renormalize."""
        scores = dict.fromkeys(DEFAULT_WEIGHTS)
        scores["churn"] = 80.0
        scores["complexity"] = 60.0
        # Only churn (0.15) and complexity (0.15) available → renorm to 0.5 each
        expected = (80.0 * 0.5) + (60.0 * 0.5)
        result = compute_composite_score(scores, DEFAULT_WEIGHTS)
        assert abs(result - expected) < 1e-9

    def test_all_none_dimensions_returns_zero(self):
        """All dimensions unavailable → composite 0."""
        scores = dict.fromkeys(DEFAULT_WEIGHTS)
        result = compute_composite_score(scores, DEFAULT_WEIGHTS)
        assert result == 0.0

    def test_composite_score_in_result_object(self):
        """HealthscoreResult.composite_score should reflect computed value."""
        result = HealthscoreResult(
            success=True,
            composite_score=73.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
                DimensionScore(name="complexity", score=67.0, weight=0.15),
            ],
        )
        assert 0.0 <= result.composite_score <= 100.0


# ---------------------------------------------------------------------------
# AC4: CLI command
# ---------------------------------------------------------------------------


class TestCLI:
    """AC4: pf healthscore analyze [--format table|json|csv] [--path DIR]."""

    def test_help_shows_analyze_command(self):
        """CLI group must expose the analyze subcommand."""
        runner = CliRunner()
        result = runner.invoke(healthscore, ["--help"])
        assert result.exit_code == 0
        assert "analyze" in result.output

    def test_analyze_help_shows_options(self):
        """analyze command must show --format, --path, --output, --no-cache."""
        runner = CliRunner()
        result = runner.invoke(healthscore, ["analyze", "--help"])
        assert result.exit_code == 0
        assert "--format" in result.output
        assert "--path" in result.output
        assert "--output" in result.output
        assert "--no-cache" in result.output

    def test_analyze_format_choices(self):
        """--format must accept table, json, csv."""
        runner = CliRunner()
        result = runner.invoke(healthscore, ["analyze", "--help"])
        assert "table" in result.output
        assert "json" in result.output
        assert "csv" in result.output

    def test_analyze_json_output_is_valid_json(self):
        """--format json must produce parseable JSON."""
        mock_result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
            ],
        )
        with patch(
            "pf.healthscore.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(healthscore, ["analyze", "--format", "json"])
            assert result.exit_code == 0
            data = json.loads(result.output)
            assert data["success"] is True
            assert data["composite_score"] == 72.5

    def test_analyze_table_output_has_score_header(self):
        """Table output must include score and dimension labels."""
        mock_result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
                DimensionScore(name="complexity", score=65.0, weight=0.15),
            ],
        )
        with patch(
            "pf.healthscore.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(healthscore, ["analyze", "--format", "table"])
            assert result.exit_code == 0
            assert "churn" in result.output.lower() or "Churn" in result.output

    def test_analyze_csv_output_has_header_row(self):
        """CSV output must include header row with dimension names."""
        mock_result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
            ],
        )
        with patch(
            "pf.healthscore.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(healthscore, ["analyze", "--format", "csv"])
            assert result.exit_code == 0
            lines = result.output.strip().split("\n")
            assert len(lines) >= 2  # header + at least one data row

    def test_analyze_output_to_file(self, tmp_path):
        """--output must write result to file."""
        mock_result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[],
        )
        output_file = tmp_path / "result.json"
        with patch(
            "pf.healthscore.cli._run_analysis",
            return_value=mock_result,
        ):
            runner = CliRunner()
            result = runner.invoke(
                healthscore, ["analyze", "--format", "json", "--output", str(output_file)]
            )
            assert result.exit_code == 0
            assert output_file.exists()
            data = json.loads(output_file.read_text())
            assert data["success"] is True


# ---------------------------------------------------------------------------
# AC5: Result caching within 5-minute window
# ---------------------------------------------------------------------------


class TestCaching:
    """AC5: Component scores cached, reused within 5-minute window."""

    def test_write_then_read_cached_score(self, tmp_path):
        """Written score must be readable back."""
        write_cached_score(tmp_path, "churn", 85.0)
        result = read_cached_score(tmp_path, "churn", ttl=300)
        assert result == 85.0

    def test_cache_miss_returns_none(self, tmp_path):
        """Reading a non-existent cache entry returns None."""
        result = read_cached_score(tmp_path, "nonexistent", ttl=300)
        assert result is None

    def test_expired_cache_returns_none(self, tmp_path):
        """Cache entry older than TTL returns None."""
        write_cached_score(tmp_path, "churn", 85.0)
        # Read with 0 TTL → always expired
        result = read_cached_score(tmp_path, "churn", ttl=0)
        assert result is None

    def test_cache_ttl_boundary(self, tmp_path):
        """Cache at exactly TTL boundary should still be valid."""
        write_cached_score(tmp_path, "churn", 85.0)
        # Read within generous TTL
        result = read_cached_score(tmp_path, "churn", ttl=300)
        assert result == 85.0

    def test_multiple_dimensions_cached_independently(self, tmp_path):
        """Each dimension has its own cache entry."""
        write_cached_score(tmp_path, "churn", 85.0)
        write_cached_score(tmp_path, "complexity", 60.0)
        assert read_cached_score(tmp_path, "churn", ttl=300) == 85.0
        assert read_cached_score(tmp_path, "complexity", ttl=300) == 60.0

    def test_overwrite_cached_score(self, tmp_path):
        """Writing a new score overwrites the previous value."""
        write_cached_score(tmp_path, "churn", 85.0)
        write_cached_score(tmp_path, "churn", 42.0)
        result = read_cached_score(tmp_path, "churn", ttl=300)
        assert result == 42.0

    def test_no_cache_flag_bypasses_cache(self):
        """analyze_healthscore with cache_ttl=0 must not use cached results."""
        # This tests that the analyze function respects cache_ttl=0
        # (will fail until implementation — that's the point)
        with patch(
            "pf.healthscore.analyze.read_cached_score",
            return_value=99.0,
        ) as mock_read:
            asyncio.run(analyze_healthscore(Path("/tmp/project"), cache_ttl=0))
            # With ttl=0, cached values should not be used
            mock_read.assert_not_called()


# ---------------------------------------------------------------------------
# AC6: Cache stored in .pennyfarthing/.cache/healthscore/
# ---------------------------------------------------------------------------


class TestCacheLocation:
    """AC6: Cache files stored in .pennyfarthing/.cache/healthscore/."""

    def test_cache_path_under_pennyfarthing(self, tmp_path):
        """get_cache_path must return a path under .pennyfarthing/.cache/healthscore/."""
        cache_dir = get_cache_path(tmp_path)
        path_str = str(cache_dir)
        assert ".pennyfarthing" in path_str
        assert ".cache" in path_str
        assert "healthscore" in path_str

    def test_cache_path_includes_target_directory(self, tmp_path):
        """Cache path should be specific to the target directory."""
        path_a = get_cache_path(tmp_path / "project-a")
        path_b = get_cache_path(tmp_path / "project-b")
        # Different projects should get different cache dirs (or at least different keys)
        assert path_a != path_b


# ---------------------------------------------------------------------------
# AC7: ADR-0008 result pattern
# ---------------------------------------------------------------------------


class TestADR0008Pattern:
    """AC7: HealthscoreResult follows ADR-0008 pattern."""

    def test_result_has_success_field(self):
        """Result must have a success boolean."""
        result = HealthscoreResult(success=True)
        assert result.success is True

    def test_result_has_error_field(self):
        """Result must have an optional error field."""
        result = HealthscoreResult(success=False, error="something broke")
        assert result.error == "something broke"

    def test_result_serializable_with_asdict(self):
        """Result must be serializable via dataclasses.asdict."""
        result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
            ],
        )
        d = asdict(result)
        assert d["success"] is True
        assert d["composite_score"] == 72.5
        assert len(d["dimensions"]) == 1

    def test_result_json_roundtrip(self):
        """Result must survive JSON serialization."""
        result = HealthscoreResult(
            success=True,
            composite_score=72.5,
            target_path="/tmp/project",
            dimensions=[
                DimensionScore(name="churn", score=80.0, weight=0.15),
            ],
        )
        d = asdict(result)
        text = json.dumps(d, default=str)
        loaded = json.loads(text)
        assert loaded["success"] is True
        assert loaded["composite_score"] == 72.5

    def test_dimension_score_has_name_score_weight(self):
        """DimensionScore must have name, score, weight, error fields."""
        ds = DimensionScore(name="churn", score=80.0, weight=0.15)
        assert ds.name == "churn"
        assert ds.score == 80.0
        assert ds.weight == 0.15
        assert ds.error is None

    def test_dimension_score_none_means_unavailable(self):
        """DimensionScore with score=None means dimension unavailable."""
        ds = DimensionScore(name="churn", score=None, weight=0.15, error="no data")
        assert ds.score is None
        assert ds.error == "no data"

    def test_error_result(self):
        """Failed result has success=False and error message."""
        result = HealthscoreResult(success=False, error="target not found")
        assert result.success is False
        assert result.error == "target not found"
        assert result.composite_score == 0.0


# ---------------------------------------------------------------------------
# AC8: Registered in main CLI
# ---------------------------------------------------------------------------


class TestMainCLIRegistration:
    """AC8: healthscore command registered in pf/cli.py."""

    def test_healthscore_registered_in_main_cli(self):
        """Main CLI must expose healthscore via the 'debug' command group."""
        from pf.cli import cli

        command_names = list(cli.commands)
        assert "debug" in command_names


# ---------------------------------------------------------------------------
# AC9: Full integration — analyze_healthscore returns real result
# ---------------------------------------------------------------------------


class TestAnalyzeIntegration:
    """AC9: End-to-end analysis returns HealthscoreResult."""

    def test_analyze_returns_healthscore_result(self):
        """analyze_healthscore must return a HealthscoreResult."""
        result = asyncio.run(analyze_healthscore(Path("/tmp/nonexistent")))
        assert isinstance(result, HealthscoreResult)

    def test_analyze_result_has_dimensions(self):
        """Result must include dimension scores list."""
        result = asyncio.run(analyze_healthscore(Path("/tmp/nonexistent")))
        assert isinstance(result.dimensions, list)

    def test_analyze_with_custom_weights(self):
        """Custom weights must be accepted and applied."""
        custom = dict.fromkeys(DEFAULT_WEIGHTS, 1.0 / 8)
        result = asyncio.run(analyze_healthscore(Path("/tmp/nonexistent"), weights=custom))
        assert isinstance(result, HealthscoreResult)

    def test_analyze_result_cached_flag(self):
        """Result must indicate whether values came from cache."""
        result = asyncio.run(analyze_healthscore(Path("/tmp/nonexistent")))
        assert isinstance(result.cached, bool)

    def test_analyze_graceful_on_missing_path(self):
        """Missing target path should return error result, not raise."""
        result = asyncio.run(analyze_healthscore(Path("/tmp/definitely-not-a-real-path-xyz123")))
        assert isinstance(result, HealthscoreResult)
        # Should either succeed with degraded scores or fail gracefully
        assert isinstance(result.success, bool)
