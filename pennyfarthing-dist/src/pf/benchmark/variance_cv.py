"""CV (Coefficient of Variation) measurement for anchored rubric validation.

Story 42-3: Compare scoring variance before and after anchored rubrics.
CV = std_dev / mean — lower CV means more consistent scoring.

Stub module — implementation pending (TDD RED state).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DimensionCV:
    dimension: str
    scores: list[float]

    @property
    def cv(self) -> float:
        raise NotImplementedError("Not yet implemented")

    @property
    def mean(self) -> float:
        raise NotImplementedError("Not yet implemented")

    @property
    def n(self) -> int:
        raise NotImplementedError("Not yet implemented")


@dataclass
class CVComparison:
    dimension: str
    pre_cv: float
    post_cv: float
    change_pct: float
    improved: bool
    n_pre: int = 0
    n_post: int = 0


@dataclass
class CVReport:
    comparisons: list[CVComparison]
    sample_size_caveat: bool = False
    caveat_text: str = ""
    dimensions_improved: int = 0
    overall_change_pct: float = 0.0

    def to_markdown(self) -> str:
        raise NotImplementedError("Not yet implemented")


def calculate_cv(scores: list[float]) -> float:
    """Calculate coefficient of variation (std_dev / mean) for a list of scores."""
    raise NotImplementedError("Not yet implemented")


def compare_cv(
    pre: dict[str, list[float]],
    post: dict[str, list[float]],
) -> list[CVComparison]:
    """Compare CV before and after anchoring for each dimension."""
    raise NotImplementedError("Not yet implemented")


def generate_cv_report(
    pre: dict[str, list[float]],
    post: dict[str, list[float]],
) -> CVReport:
    """Generate a full CV comparison report."""
    raise NotImplementedError("Not yet implemented")
