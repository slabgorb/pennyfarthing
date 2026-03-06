# pf.benchmark — Benchmark scoring and evaluation
#
# Story 44-1: Multi-Judge Validation + Python port of TS benchmark modules
#
# Modules:
#   multi_judge  — Ensemble judge scoring (44-1)
#   aggregator   — Job-Fair result aggregation (ported from job-fair-aggregator.ts)
#   integration  — OCEAN correlation + benchmark queries (ported from benchmark-integration.ts)
#   judge_prompt — Gold standard calibration prompt builder (45-2)
#   variance    — Calibration variance analysis (45-4)

from pf.benchmark.judge_prompt import (
    BaselineIssue,
    GoldStandard,
    SoloJudgeInput,
    build_solo_judge_prompt,
)
from pf.benchmark.variance import (
    VarianceComparison,
    compare_calibration_variance,
    compute_score_variance,
)
from pf.benchmark.multi_judge import (
    aggregate_judge_scores,
    build_judge_filenames,
    build_multi_judge_summary,
    format_multi_judge_result,
    randomize_presentation_order,
    validate_multi_judge_count,
)

__all__ = [
    # judge_prompt
    "GoldStandard",
    "BaselineIssue",
    "SoloJudgeInput",
    "build_solo_judge_prompt",
    # variance
    "VarianceComparison",
    "compute_score_variance",
    "compare_calibration_variance",
    # multi_judge
    "validate_multi_judge_count",
    "randomize_presentation_order",
    "aggregate_judge_scores",
    "build_judge_filenames",
    "format_multi_judge_result",
    "build_multi_judge_summary",
]
