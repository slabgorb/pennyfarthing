"""Multi-Judge Validation Module.

Story 44-1: Add --multi-judge flag to /solo command.

Enables ensemble scoring where each agent run is evaluated by N independent
judge invocations with randomized presentation order. Produces aggregated
scores and placeholder for inter-rater agreement metrics (44-2).
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DimensionScore:
    value: int
    reasoning: str


@dataclass
class JudgeVerdict:
    scores: dict[str, DimensionScore]
    weighted_total: float
    assessment: str


@dataclass
class MultiJudgeResult:
    judges: list[JudgeVerdict]
    canonical_score: float
    judge_agreement: dict[str, Any] = field(
        default_factory=lambda: {
            "placeholder": True,
            "note": "Populated by 44-2 (Krippendorff Alpha)",
        }
    )


@dataclass
class SingleJudgeResult:
    weighted_total: float
    scores: dict[str, DimensionScore]
    assessment: str


def validate_multi_judge_count(n: int) -> dict[str, Any]:
    """Validate that N is in the valid range (1-5)."""
    if 1 <= n <= 5:
        return {"valid": True}
    return {"valid": False, "error": f"Judge count must be between 1 and 5, got {n}"}


def randomize_presentation_order(sections: list[str]) -> list[str]:
    """Return a shuffled copy of sections for judge presentation."""
    result = sections.copy()
    random.shuffle(result)
    return result


def aggregate_judge_scores(verdicts: list[JudgeVerdict]) -> float:
    """Compute the mean of weighted_total across all verdicts."""
    if not verdicts:
        raise ValueError("Cannot aggregate scores from empty verdicts list")
    return sum(v.weighted_total for v in verdicts) / len(verdicts)


def build_judge_filenames(count: int) -> list[str]:
    """Generate judge output filenames: judge_0.json, judge_1.json, etc."""
    return [f"judge_{i}.json" for i in range(count)]


def format_multi_judge_result(
    verdicts: list[JudgeVerdict],
    n: int,
) -> MultiJudgeResult | SingleJudgeResult:
    """Format judge results based on N.

    When n=1: return SingleJudgeResult (backward compat, no judges array).
    When n>1: return MultiJudgeResult with judges array and canonical score.
    """
    if n == 1:
        v = verdicts[0]
        return SingleJudgeResult(
            weighted_total=v.weighted_total,
            scores=v.scores,
            assessment=v.assessment,
        )
    return MultiJudgeResult(
        judges=verdicts,
        canonical_score=aggregate_judge_scores(verdicts),
    )


def build_multi_judge_summary(
    verdicts: list[JudgeVerdict],
    n: int,
) -> dict[str, Any]:
    """Build the summary YAML dict section for multi-judge results."""
    canonical = aggregate_judge_scores(verdicts)
    summary: dict[str, Any] = {
        "canonical_score": canonical,
        "judge_count": n,
        "individual_scores": [v.weighted_total for v in verdicts],
    }
    if n > 1:
        summary["judge_agreement"] = {
            "placeholder": True,
            "note": "Populated by 44-2 (Krippendorff Alpha)",
        }
    return summary
