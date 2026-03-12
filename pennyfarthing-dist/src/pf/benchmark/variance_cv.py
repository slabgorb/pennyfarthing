"""CV (Coefficient of Variation) measurement for anchored rubric validation.

Story 42-3: Compare scoring variance before and after anchored rubrics.
CV = std_dev / mean — lower CV means more consistent scoring.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pf.benchmark.aggregator import calculate_std_dev

SMALL_SAMPLE_THRESHOLD = 30


@dataclass
class DimensionCV:
    dimension: str
    scores: list[float]

    @property
    def cv(self) -> float:
        return calculate_cv(self.scores)

    @property
    def mean(self) -> float:
        if not self.scores:
            return 0.0
        return sum(self.scores) / len(self.scores)

    @property
    def n(self) -> int:
        return len(self.scores)


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
    comparisons: list[CVComparison] = field(default_factory=list)
    sample_size_caveat: bool = False
    caveat_text: str = ""
    dimensions_improved: int = 0
    overall_change_pct: float = 0.0

    def to_markdown(self) -> str:
        lines = [
            "# CV Comparison Report",
            "",
            "| Dimension | Pre-Anchor CV | Post-Anchor CV | Change % | Improved |",
            "|-----------|--------------|----------------|----------|----------|",
        ]
        for c in self.comparisons:
            marker = "Yes" if c.improved else "No"
            lines.append(
                f"| {c.dimension} | {c.pre_cv:.4f} | {c.post_cv:.4f} "
                f"| {c.change_pct:+.1f}% | {marker} |"
            )
        lines.append("")
        lines.append(
            f"**Overall CV change:** {self.overall_change_pct:+.1f}% "
            f"| **Dimensions improved:** {self.dimensions_improved}/{len(self.comparisons)}"
        )
        if self.sample_size_caveat:
            lines.append("")
            lines.append(f"**Caveat:** {self.caveat_text}")
        return "\n".join(lines)


def calculate_cv(scores: list[float]) -> float:
    """Calculate coefficient of variation (std_dev / mean) for a list of scores."""
    if len(scores) <= 1:
        return 0.0
    mean = sum(scores) / len(scores)
    if mean == 0.0:
        return 0.0
    std_dev = calculate_std_dev(scores, mean)
    return abs(std_dev / mean)


def compare_cv(
    pre: dict[str, list[float]],
    post: dict[str, list[float]],
) -> list[CVComparison]:
    """Compare CV before and after anchoring for each dimension."""
    results = []
    for dim, pre_scores in pre.items():
        post_scores = post[dim]  # raises KeyError if missing
        pre_cv = calculate_cv(pre_scores)
        post_cv = calculate_cv(post_scores)
        if pre_cv == 0.0 and post_cv == 0.0:
            change_pct = 0.0
        elif pre_cv == 0.0:
            change_pct = 100.0  # from zero to non-zero is a 100% increase
        else:
            change_pct = ((post_cv - pre_cv) / pre_cv) * 100.0
        results.append(CVComparison(
            dimension=dim,
            pre_cv=pre_cv,
            post_cv=post_cv,
            change_pct=change_pct,
            improved=post_cv < pre_cv,
            n_pre=len(pre_scores),
            n_post=len(post_scores),
        ))
    return results


def generate_cv_report(
    pre: dict[str, list[float]],
    post: dict[str, list[float]],
) -> CVReport:
    """Generate a full CV comparison report."""
    comparisons = compare_cv(pre, post)
    dimensions_improved = sum(1 for c in comparisons if c.improved)

    # Overall change: mean of per-dimension change percentages
    if comparisons:
        overall_change_pct = sum(c.change_pct for c in comparisons) / len(comparisons)
    else:
        overall_change_pct = 0.0

    # Sample size caveat when any dimension has N < threshold
    max_n = max(
        (max(c.n_pre, c.n_post) for c in comparisons),
        default=0,
    )
    small_sample = max_n < SMALL_SAMPLE_THRESHOLD

    caveat_text = ""
    if small_sample:
        caveat_text = (
            f"Sample sizes are small (max N={max_n}, threshold={SMALL_SAMPLE_THRESHOLD}). "
            "Results should be interpreted with limited confidence. "
            "CV comparisons with fewer than 30 observations per condition "
            "may not reflect stable population parameters."
        )

    return CVReport(
        comparisons=comparisons,
        sample_size_caveat=small_sample,
        caveat_text=caveat_text,
        dimensions_improved=dimensions_improved,
        overall_change_pct=overall_change_pct,
    )
