"""Tests for story 42-3: Variance test — measure CV reduction.

Validates the CV (coefficient of variation) measurement module that compares
scoring variance before and after anchored rubrics are applied.

Acceptance Criteria:
- [AC1] Per-dimension CV comparison table (correctness, depth, quality, persona)
  with before/after values and percentage change
- [AC2] Statistical significance caveat — report includes sample size warning
  when N < 30
"""

from __future__ import annotations

import math

import pytest

from pf.benchmark.variance_cv import (
    CVComparison,
    CVReport,
    DimensionCV,
    calculate_cv,
    compare_cv,
    generate_cv_report,
)

DIMENSIONS = ["correctness", "depth", "quality", "persona"]


# ---------------------------------------------------------------------------
# Unit: calculate_cv
# ---------------------------------------------------------------------------


class TestCalculateCV:
    """CV = std_dev / mean. Lower CV = more consistent scoring."""

    def test_basic_cv_calculation(self) -> None:
        scores = [7.0, 7.0, 8.0, 8.0]
        cv = calculate_cv(scores)
        mean = 7.5
        std_dev = math.sqrt(sum((s - mean) ** 2 for s in scores) / len(scores))
        expected = std_dev / mean
        assert cv == pytest.approx(expected, rel=1e-6)

    def test_identical_scores_have_zero_cv(self) -> None:
        scores = [5.0, 5.0, 5.0, 5.0]
        assert calculate_cv(scores) == 0.0

    def test_high_variance_scores(self) -> None:
        scores = [1.0, 10.0, 1.0, 10.0]
        cv = calculate_cv(scores)
        assert cv > 0.5, "High variance scores should produce CV > 0.5"

    def test_single_score_returns_zero(self) -> None:
        assert calculate_cv([5.0]) == 0.0

    def test_empty_scores_returns_zero(self) -> None:
        assert calculate_cv([]) == 0.0

    def test_cv_is_always_non_negative(self) -> None:
        scores = [3.0, 7.0, 2.0, 9.0, 4.0]
        assert calculate_cv(scores) >= 0.0


# ---------------------------------------------------------------------------
# Unit: compare_cv
# ---------------------------------------------------------------------------


class TestCompareCV:
    """Compare pre-anchor and post-anchor CV values per dimension."""

    def test_returns_comparison_for_each_dimension(self) -> None:
        pre = {
            "correctness": [6.0, 8.0, 5.0, 9.0],
            "depth": [7.0, 7.0, 8.0, 6.0],
            "quality": [5.0, 9.0, 4.0, 8.0],
            "persona": [3.0, 7.0, 4.0, 8.0],
        }
        post = {
            "correctness": [7.0, 7.0, 8.0, 7.0],
            "depth": [7.0, 7.0, 7.0, 8.0],
            "quality": [6.0, 7.0, 7.0, 8.0],
            "persona": [5.0, 6.0, 6.0, 7.0],
        }
        result = compare_cv(pre, post)
        assert len(result) == 4
        dims = {r.dimension for r in result}
        assert dims == set(DIMENSIONS)

    def test_each_comparison_has_required_fields(self) -> None:
        pre = {"correctness": [5.0, 9.0, 4.0, 8.0]}
        post = {"correctness": [7.0, 7.0, 8.0, 7.0]}
        result = compare_cv(pre, post)
        assert len(result) == 1
        comp = result[0]
        assert isinstance(comp, CVComparison)
        assert hasattr(comp, "dimension")
        assert hasattr(comp, "pre_cv")
        assert hasattr(comp, "post_cv")
        assert hasattr(comp, "change_pct")
        assert hasattr(comp, "improved")

    def test_reduction_marked_as_improved(self) -> None:
        # Post-anchor scores are more consistent (lower CV)
        pre = {"correctness": [2.0, 10.0, 3.0, 9.0]}
        post = {"correctness": [6.0, 7.0, 7.0, 6.0]}
        result = compare_cv(pre, post)
        assert result[0].improved is True
        assert result[0].change_pct < 0, "Negative change_pct means CV decreased"

    def test_increase_marked_as_not_improved(self) -> None:
        # Post-anchor scores are LESS consistent
        pre = {"correctness": [7.0, 7.0, 7.0, 7.0]}
        post = {"correctness": [2.0, 10.0, 3.0, 9.0]}
        result = compare_cv(pre, post)
        assert result[0].improved is False
        assert result[0].change_pct > 0

    def test_no_change_marked_as_not_improved(self) -> None:
        pre = {"correctness": [5.0, 5.0, 5.0]}
        post = {"correctness": [5.0, 5.0, 5.0]}
        result = compare_cv(pre, post)
        assert result[0].improved is False
        assert result[0].change_pct == 0.0

    def test_missing_dimension_in_post_raises(self) -> None:
        pre = {"correctness": [5.0, 6.0], "depth": [4.0, 7.0]}
        post = {"correctness": [5.0, 6.0]}  # missing depth
        with pytest.raises(KeyError):
            compare_cv(pre, post)


# ---------------------------------------------------------------------------
# Unit: DimensionCV dataclass
# ---------------------------------------------------------------------------


class TestDimensionCV:
    """DimensionCV holds per-dimension scores and computes CV."""

    def test_from_scores(self) -> None:
        dim = DimensionCV(dimension="correctness", scores=[7.0, 8.0, 7.0, 8.0])
        assert dim.dimension == "correctness"
        assert dim.cv == pytest.approx(calculate_cv([7.0, 8.0, 7.0, 8.0]))
        assert dim.mean == pytest.approx(7.5)
        assert dim.n == 4


# ---------------------------------------------------------------------------
# Integration: generate_cv_report
# ---------------------------------------------------------------------------


class TestGenerateCVReport:
    """Full report generation with before/after comparison."""

    @pytest.fixture
    def sample_pre_scores(self) -> dict[str, list[float]]:
        return {
            "correctness": [6.0, 8.0, 5.0, 9.0],
            "depth": [7.0, 7.0, 8.0, 6.0],
            "quality": [5.0, 9.0, 4.0, 8.0],
            "persona": [3.0, 7.0, 4.0, 8.0],
        }

    @pytest.fixture
    def sample_post_scores(self) -> dict[str, list[float]]:
        return {
            "correctness": [7.0, 7.0, 8.0, 7.0],
            "depth": [7.0, 7.0, 7.0, 8.0],
            "quality": [6.0, 7.0, 7.0, 8.0],
            "persona": [5.0, 6.0, 6.0, 7.0],
        }

    def test_report_has_all_dimensions(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        assert isinstance(report, CVReport)
        assert len(report.comparisons) == 4
        dims = {c.dimension for c in report.comparisons}
        assert dims == set(DIMENSIONS)

    def test_report_includes_sample_size(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        for comp in report.comparisons:
            assert comp.n_pre > 0
            assert comp.n_post > 0

    # -----------------------------------------------------------------------
    # AC2: Statistical significance caveat
    # -----------------------------------------------------------------------

    def test_report_includes_sample_size_caveat_when_small_n(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        """With N < 30, report must include a caveat about limited confidence."""
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        assert report.sample_size_caveat is True
        assert "caveat" in report.caveat_text.lower() or "confidence" in report.caveat_text.lower() or "sample" in report.caveat_text.lower()

    def test_no_caveat_when_large_n(self) -> None:
        """With N >= 30, no sample size caveat needed."""
        large_pre = {"correctness": [float(i % 10) for i in range(30)]}
        large_post = {"correctness": [float(i % 8) for i in range(30)]}
        report = generate_cv_report(large_pre, large_post)
        assert report.sample_size_caveat is False

    # -----------------------------------------------------------------------
    # AC1: Report format — before/after with percentage change
    # -----------------------------------------------------------------------

    def test_report_to_markdown_contains_table(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        """Markdown output must contain a comparison table."""
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        md = report.to_markdown()
        assert "| Dimension" in md
        assert "Pre-Anchor CV" in md or "pre_cv" in md.lower() or "Before" in md
        assert "Post-Anchor CV" in md or "post_cv" in md.lower() or "After" in md
        assert "%" in md, "Table must show percentage change"

    def test_report_to_markdown_contains_all_dimensions(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        md = report.to_markdown()
        for dim in DIMENSIONS:
            assert dim in md.lower(), f"Report must include {dim}"

    def test_report_to_markdown_contains_caveat_section(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        """Small N report must include caveat text in markdown."""
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        md = report.to_markdown()
        assert "sample" in md.lower() or "caveat" in md.lower() or "confidence" in md.lower()

    def test_report_summary_counts_improved_dimensions(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        improved = sum(1 for c in report.comparisons if c.improved)
        assert report.dimensions_improved == improved

    def test_report_overall_cv_change(
        self,
        sample_pre_scores: dict[str, list[float]],
        sample_post_scores: dict[str, list[float]],
    ) -> None:
        """Report must include overall CV change across all dimensions."""
        report = generate_cv_report(sample_pre_scores, sample_post_scores)
        assert hasattr(report, "overall_change_pct")
        assert isinstance(report.overall_change_pct, float)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases that could produce misleading CV values."""

    def test_zero_mean_dimension_handled(self) -> None:
        """If mean is 0, CV is undefined — should return 0 or inf, not crash."""
        scores = [0.0, 0.0, 0.0]
        cv = calculate_cv(scores)
        assert math.isfinite(cv)

    def test_near_zero_mean_high_variance(self) -> None:
        """Very small mean with any variance produces very high CV."""
        scores = [0.1, 0.2, 0.1]
        cv = calculate_cv(scores)
        assert cv > 0

    def test_negative_scores_handled(self) -> None:
        """Scores should be positive in practice, but don't crash on negatives."""
        scores = [-1.0, 2.0, -1.0, 2.0]
        cv = calculate_cv(scores)
        assert math.isfinite(cv)

    def test_single_dimension_report(self) -> None:
        """Report works with just one dimension."""
        pre = {"correctness": [5.0, 9.0, 4.0, 8.0]}
        post = {"correctness": [7.0, 7.0, 8.0, 7.0]}
        report = generate_cv_report(pre, post)
        assert len(report.comparisons) == 1
        assert report.comparisons[0].dimension == "correctness"
