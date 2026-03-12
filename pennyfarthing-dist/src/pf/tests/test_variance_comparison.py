"""Tests for story 45-4: Variance comparison with/without gold standard.

Validates that calibration variance analysis functions correctly compute
variance and demonstrate that gold standard calibration reduces scoring spread.

Acceptance Criteria:
- [AC1] Compare scoring variance with and without gold standard calibration
- [AC2] Show that variance decreases when gold standards are available
- [AC3] Results captured in a reproducible test or benchmark
"""

from __future__ import annotations

import pytest

from pf.benchmark.variance import (
    VarianceComparison,
    compare_calibration_variance,
    compute_score_variance,
)

# ---------------------------------------------------------------------------
# Fixtures — deterministic data for reproducibility (AC3)
# ---------------------------------------------------------------------------

# Simulated scores WITHOUT gold standard — judges disagree widely
SCORES_WITHOUT_GS = [65.0, 82.0, 71.0, 90.0, 58.0]

# Simulated scores WITH gold standard — judges anchor near the reference
SCORES_WITH_GS = [76.0, 79.0, 74.0, 81.0, 78.0]


# ===========================================================================
# AC1: Compare scoring variance with and without gold standard
# ===========================================================================


class TestAC1VarianceComputation:
    """Variance computation produces correct results for known inputs."""

    def test_variance_of_identical_scores_is_zero(self) -> None:
        scores = [75.0, 75.0, 75.0, 75.0]
        assert compute_score_variance(scores) == 0.0

    def test_variance_of_known_values(self) -> None:
        # [2, 4, 4, 4, 5, 5, 7, 9] — population variance = 4.0
        scores = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
        result = compute_score_variance(scores)
        assert abs(result - 4.0) < 0.001, f"Expected 4.0, got {result}"

    def test_variance_of_two_values(self) -> None:
        # [0, 10] — mean=5, variance = ((5^2 + 5^2) / 2) = 25.0
        scores = [0.0, 10.0]
        result = compute_score_variance(scores)
        assert abs(result - 25.0) < 0.001, f"Expected 25.0, got {result}"

    def test_single_score_variance_is_zero(self) -> None:
        scores = [42.0]
        assert compute_score_variance(scores) == 0.0

    def test_empty_scores_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            compute_score_variance([])

    def test_comparison_returns_both_variances(self) -> None:
        result = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        assert isinstance(result, VarianceComparison)
        assert result.without_gs_variance > 0
        assert result.with_gs_variance > 0


# ===========================================================================
# AC2: Variance decreases with gold standard
# ===========================================================================


class TestAC2VarianceDecreases:
    """Gold standard calibration reduces scoring variance."""

    def test_with_gs_variance_is_lower(self) -> None:
        result = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        assert result.with_gs_variance < result.without_gs_variance, (
            f"Expected with_gs ({result.with_gs_variance}) < "
            f"without_gs ({result.without_gs_variance})"
        )

    def test_variance_reduction_percentage_is_positive(self) -> None:
        result = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        assert result.variance_reduction_pct > 0, (
            f"Expected positive reduction, got {result.variance_reduction_pct}%"
        )

    def test_variance_reduction_percentage_calculation(self) -> None:
        """Reduction pct = (without - with) / without * 100."""
        result = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        expected_pct = (
            (result.without_gs_variance - result.with_gs_variance)
            / result.without_gs_variance
            * 100
        )
        assert abs(result.variance_reduction_pct - expected_pct) < 0.001

    def test_identical_variances_yield_zero_reduction(self) -> None:
        same = [70.0, 80.0, 90.0]
        result = compare_calibration_variance(same, same)
        assert result.variance_reduction_pct == 0.0

    def test_higher_with_gs_variance_yields_negative_reduction(self) -> None:
        """If calibration somehow increases variance, reduction is negative."""
        tight = [78.0, 79.0, 80.0]
        spread = [50.0, 80.0, 100.0]
        result = compare_calibration_variance(tight, spread)
        assert result.variance_reduction_pct < 0


# ===========================================================================
# AC3: Reproducible results
# ===========================================================================


class TestAC3Reproducibility:
    """Results are deterministic and consistent across runs."""

    def test_same_input_same_output(self) -> None:
        r1 = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        r2 = compare_calibration_variance(SCORES_WITHOUT_GS, SCORES_WITH_GS)
        assert r1.without_gs_variance == r2.without_gs_variance
        assert r1.with_gs_variance == r2.with_gs_variance
        assert r1.variance_reduction_pct == r2.variance_reduction_pct

    def test_variance_matches_manual_calculation(self) -> None:
        """Verify against hand-computed variance for SCORES_WITHOUT_GS."""
        # Mean of [65, 82, 71, 90, 58] = 73.2
        # Deviations: [-8.2, 8.8, -2.2, 16.8, -15.2]
        # Squared: [67.24, 77.44, 4.84, 282.24, 231.04]
        # Sum: 662.8, / 5 = 132.56
        result = compute_score_variance(SCORES_WITHOUT_GS)
        assert abs(result - 132.56) < 0.01, f"Expected 132.56, got {result}"

    def test_with_gs_variance_matches_manual(self) -> None:
        """Verify against hand-computed variance for SCORES_WITH_GS."""
        # Mean of [76, 79, 74, 81, 78] = 77.6
        # Deviations: [-1.6, 1.4, -3.6, 3.4, 0.4]
        # Squared: [2.56, 1.96, 12.96, 11.56, 0.16]
        # Sum: 29.2, / 5 = 5.84
        result = compute_score_variance(SCORES_WITH_GS)
        assert abs(result - 5.84) < 0.01, f"Expected 5.84, got {result}"
