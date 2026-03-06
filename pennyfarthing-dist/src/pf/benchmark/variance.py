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
    raise NotImplementedError


def compare_calibration_variance(
    without_gs: list[float],
    with_gs: list[float],
) -> VarianceComparison:
    """Compare scoring variance between runs with and without gold standard."""
    raise NotImplementedError
