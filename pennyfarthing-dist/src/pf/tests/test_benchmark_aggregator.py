"""Tests for pf.benchmark.aggregator — Job-Fair Aggregator (Python port).

Ported from: packages/core/src/benchmark/job-fair-aggregator.test.ts
Plus additional coverage for the full API surface.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.benchmark.aggregator import (
    AggregateStats,
    DimensionStats,
    Performer,
    RoleStats,
    TrendPoint,
    aggregate_by_dimension,
    aggregate_job_fair_results,
    calculate_std_dev,
    generate_differential_report,
    get_baseline_comparison,
    get_dimension_values,
    get_historical_trend,
    get_role_statistics,
    get_top_performers,
    save_historical_snapshot,
)

# ---------------------------------------------------------------------------
# Fixtures: Mock results directory
# ---------------------------------------------------------------------------

@pytest.fixture
def results_dir(tmp_path: Path) -> Path:
    """Create a mock results directory with two theme runs."""
    # Theme: west-wing, timestamp: 20260301T120000Z
    ww_dir = tmp_path / "west-wing-20260301T120000Z"
    ww_dir.mkdir()
    (ww_dir / "summary.yaml").write_text(yaml.dump({
        "theme": "west-wing",
        "timestamp": "2026-03-01T12:00:00Z",
        "matrix": {
            "rows": [
                {"character": "Leo McGarry", "dev": 85.0, "reviewer": 78.0, "tea": 82.0, "sm": 90.0},
                {"character": "Sam Seaborn", "dev": 80.0, "reviewer": 88.0, "tea": 92.0, "sm": 75.0},
            ],
        },
        "champions": {
            "dev": {"character": "Leo McGarry", "score": 85.0},
            "tea": {"character": "Sam Seaborn", "score": 92.0},
        },
    }))

    # Theme: breaking-bad, timestamp: 20260301T130000Z
    bb_dir = tmp_path / "breaking-bad-20260301T130000Z"
    bb_dir.mkdir()
    (bb_dir / "summary.yaml").write_text(yaml.dump({
        "theme": "breaking-bad",
        "timestamp": "2026-03-01T13:00:00Z",
        "matrix": {
            "rows": [
                {"character": "Walter White", "dev": 92.0, "reviewer": 70.0, "tea": 78.0, "sm": 85.0},
                {"character": "Gus Fring", "dev": 88.0, "reviewer": 95.0, "tea": 80.0, "sm": 91.0},
            ],
        },
    }))

    return tmp_path


@pytest.fixture
def empty_results_dir(tmp_path: Path) -> Path:
    """Create an empty results directory."""
    return tmp_path / "nonexistent"


# ===========================================================================
# calculate_std_dev
# ===========================================================================

class TestCalculateStdDev:

    def test_known_values(self):
        values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
        mean = sum(values) / len(values)
        result = calculate_std_dev(values, mean)
        assert abs(result - 2.0) < 0.01

    def test_single_value_returns_zero(self):
        assert calculate_std_dev([5.0], 5.0) == 0

    def test_identical_values(self):
        assert calculate_std_dev([3.0, 3.0, 3.0], 3.0) == 0


# ===========================================================================
# aggregate_job_fair_results
# ===========================================================================

class TestAggregateJobFairResults:

    def test_returns_aggregate_stats(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        assert isinstance(stats, AggregateStats)

    def test_includes_both_themes(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        assert "west-wing" in stats.themes_included
        assert "breaking-bad" in stats.themes_included

    def test_has_by_role(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        assert "dev" in stats.by_role
        assert "reviewer" in stats.by_role
        assert "tea" in stats.by_role
        assert "sm" in stats.by_role

    def test_role_mean_calculated(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        dev_stats = stats.by_role["dev"]
        # dev scores: 85, 80, 92, 88 → mean = 86.25
        assert abs(dev_stats.mean_score - 86.25) < 0.01

    def test_role_std_dev_calculated(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        dev_stats = stats.by_role["dev"]
        assert dev_stats.std_dev > 0

    def test_top_performers_sorted_desc(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        dev_top = stats.by_role["dev"].top_performers
        for i in range(len(dev_top) - 1):
            assert dev_top[i].score >= dev_top[i + 1].score

    def test_overall_champions_not_empty(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        assert len(stats.overall_champions) > 0

    def test_empty_dir_returns_empty(self, empty_results_dir):
        stats = aggregate_job_fair_results(str(empty_results_dir))
        assert stats.themes_included == []
        assert stats.by_role == {}
        assert stats.overall_champions == []

    def test_has_last_updated(self, results_dir):
        stats = aggregate_job_fair_results(str(results_dir))
        assert stats.last_updated is not None


# ===========================================================================
# get_baseline_comparison
# ===========================================================================

class TestGetBaselineComparison:

    def test_returns_float_for_known_role(self, results_dir):
        result = get_baseline_comparison("dev", str(results_dir))
        assert isinstance(result, float)

    def test_returns_none_for_unknown_role(self, empty_results_dir):
        result = get_baseline_comparison("unknown-role", str(empty_results_dir))
        assert result is None


# ===========================================================================
# get_role_statistics
# ===========================================================================

class TestGetRoleStatistics:

    def test_returns_role_stats(self, results_dir):
        stats = get_role_statistics("dev", str(results_dir))
        assert isinstance(stats, RoleStats)

    def test_unknown_role_returns_zero(self, empty_results_dir):
        stats = get_role_statistics("nonexistent", str(empty_results_dir))
        assert stats.mean_score == 0


# ===========================================================================
# get_top_performers
# ===========================================================================

class TestGetTopPerformers:

    def test_returns_limited_list(self, results_dir):
        performers = get_top_performers("dev", 2, str(results_dir))
        assert len(performers) <= 2

    def test_returns_performer_objects(self, results_dir):
        performers = get_top_performers("dev", 5, str(results_dir))
        assert all(isinstance(p, Performer) for p in performers)


# ===========================================================================
# get_historical_trend
# ===========================================================================

class TestGetHistoricalTrend:

    def test_empty_for_nonexistent(self, empty_results_dir):
        trend = get_historical_trend(None, str(empty_results_dir))
        assert trend == []

    def test_returns_trend_points(self, results_dir):
        # Save a snapshot first, then retrieve
        save_historical_snapshot(str(results_dir))
        trend = get_historical_trend(None, str(results_dir))
        assert len(trend) >= 1
        assert isinstance(trend[0], TrendPoint)


# ===========================================================================
# save_historical_snapshot
# ===========================================================================

class TestSaveHistoricalSnapshot:

    def test_creates_history_file(self, results_dir):
        save_historical_snapshot(str(results_dir))
        history_path = results_dir / "aggregate" / "history.yaml"
        assert history_path.exists()

    def test_appends_to_existing(self, results_dir):
        save_historical_snapshot(str(results_dir))
        save_historical_snapshot(str(results_dir))
        history_path = results_dir / "aggregate" / "history.yaml"
        data = yaml.safe_load(history_path.read_text())
        assert len(data["snapshots"]) == 2


# ===========================================================================
# Dimension aggregation
# ===========================================================================

class TestAggregateByDimension:

    def test_returns_dimension_stats(self, results_dir, tmp_path):
        # Create mock themes dir with dimension data
        themes_dir = tmp_path / "themes"
        themes_dir.mkdir()
        (themes_dir / "west-wing.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "dramatic", "era": "contemporary"}},
        }))
        (themes_dir / "breaking-bad.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "serious", "era": "contemporary"}},
        }))

        stats = aggregate_by_dimension("tone", str(results_dir), str(themes_dir))
        assert isinstance(stats, DimensionStats)
        assert stats.dimension == "tone"

    def test_nonexistent_dir_returns_empty_values(self, empty_results_dir):
        stats = aggregate_by_dimension("tone", str(empty_results_dir))
        assert stats.values == []


class TestGetDimensionValues:

    def test_returns_values_with_counts(self, tmp_path):
        themes_dir = tmp_path / "themes"
        themes_dir.mkdir()
        (themes_dir / "a.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "comedic"}},
        }))
        (themes_dir / "b.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "comedic"}},
        }))
        (themes_dir / "c.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "serious"}},
        }))

        values = get_dimension_values("tone", str(themes_dir))
        assert len(values) == 2
        comedic = next(v for v in values if v["value"] == "comedic")
        assert comedic["theme_count"] == 2


class TestGenerateDifferentialReport:

    def test_returns_markdown_string(self, results_dir, tmp_path):
        themes_dir = tmp_path / "themes"
        themes_dir.mkdir()
        (themes_dir / "west-wing.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "dramatic"}},
        }))
        (themes_dir / "breaking-bad.yaml").write_text(yaml.dump({
            "theme": {"dimensions": {"tone": "serious"}},
        }))

        report = generate_differential_report("tone", str(results_dir), str(themes_dir))
        assert "# Differential Report: tone" in report
        assert isinstance(report, str)
