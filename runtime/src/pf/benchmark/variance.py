"""Variance Comparison — Gold Standard Calibration Analysis.

Story 45-4: Variance comparison: with/without gold standard.

Computes scoring variance and compares calibration effectiveness.
Used by benchmark tooling to validate that gold standard anchors
reduce inter-judge scoring spread.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class VarianceComparison:
    without_gs_variance: float
    with_gs_variance: float
    variance_reduction_pct: float


def compute_score_variance(scores: list[float]) -> float:
    """Compute population variance of a list of scores."""
    if not scores:
        raise ValueError("Cannot compute variance of empty score list")
    n = len(scores)
    mean = sum(scores) / n
    return sum((x - mean) ** 2 for x in scores) / n


def compare_calibration_variance(
    without_gs: list[float],
    with_gs: list[float],
) -> VarianceComparison:
    """Compare scoring variance between runs with and without gold standard."""
    without_var = compute_score_variance(without_gs)
    with_var = compute_score_variance(with_gs)
    if without_var == 0:
        reduction_pct = 0.0
    else:
        reduction_pct = (without_var - with_var) / without_var * 100
    return VarianceComparison(
        without_gs_variance=without_var,
        with_gs_variance=with_var,
        variance_reduction_pct=reduction_pct,
    )
