"""Tests for pf.benchmark.multi_judge — Multi-Judge Validation.

Story 44-1: Add --multi-judge flag to /solo command.

Acceptance Criteria:
- [AC1] --multi-judge N invokes judge N times per run (validated via count)
- [AC2] Each judge invocation randomizes presentation order
- [AC3] Judge verdicts stored as array in runs/judge_{i}.json
- [AC4] Aggregated score (mean of weighted_totals) is canonical score
- [AC5] --multi-judge 1 behaves identically to single-judge
- [AC6] Summary YAML includes judge_agreement section
"""

from __future__ import annotations

import pytest

from pf.benchmark.multi_judge import (
    DimensionScore,
    JudgeVerdict,
    MultiJudgeResult,
    SingleJudgeResult,
    aggregate_judge_scores,
    build_judge_filenames,
    build_multi_judge_summary,
    format_multi_judge_result,
    randomize_presentation_order,
    validate_multi_judge_count,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_verdict(weighted_total: float, assessment: str = "test") -> JudgeVerdict:
    return JudgeVerdict(
        scores={
            "correctness": DimensionScore(value=8, reasoning="solid"),
            "depth": DimensionScore(value=7, reasoning="thorough"),
            "quality": DimensionScore(value=9, reasoning="clear"),
            "persona": DimensionScore(value=8, reasoning="in character"),
        },
        weighted_total=weighted_total,
        assessment=assessment,
    )


# ===========================================================================
# AC1: Validation of --multi-judge N
# ===========================================================================


class TestValidateMultiJudgeCount:
    """AC1: --multi-judge N must be 1-5."""

    def test_valid_count_3(self):
        result = validate_multi_judge_count(3)
        assert result["valid"] is True

    def test_valid_count_1(self):
        result = validate_multi_judge_count(1)
        assert result["valid"] is True

    def test_valid_count_5(self):
        result = validate_multi_judge_count(5)
        assert result["valid"] is True

    def test_invalid_count_0(self):
        result = validate_multi_judge_count(0)
        assert result["valid"] is False
        assert "error" in result

    def test_invalid_count_6(self):
        result = validate_multi_judge_count(6)
        assert result["valid"] is False
        assert "error" in result

    def test_invalid_count_negative(self):
        result = validate_multi_judge_count(-1)
        assert result["valid"] is False
        assert "error" in result

    def test_error_message_mentions_range(self):
        result = validate_multi_judge_count(0)
        assert "1" in result["error"] and "5" in result["error"]


# ===========================================================================
# AC2: Randomized presentation order
# ===========================================================================


class TestRandomizePresentationOrder:
    """AC2: Each judge invocation randomizes section ordering."""

    def test_returns_same_elements(self):
        sections = ["description", "code_under_review", "expected_issues"]
        result = randomize_presentation_order(sections)
        assert sorted(result) == sorted(sections)

    def test_does_not_modify_original(self):
        sections = ["description", "code_under_review", "expected_issues"]
        original = sections.copy()
        randomize_presentation_order(sections)
        assert sections == original

    def test_returns_new_list(self):
        sections = ["a", "b", "c"]
        result = randomize_presentation_order(sections)
        assert result is not sections

    def test_produces_different_orders(self):
        """Over 100 calls, at least two different orderings should appear."""
        sections = ["description", "code_under_review", "expected_issues", "context"]
        orderings = set()
        for _ in range(100):
            result = randomize_presentation_order(sections)
            orderings.add(tuple(result))
        assert len(orderings) > 1, "All 100 shuffles produced the same order"

    def test_single_element_returns_same(self):
        result = randomize_presentation_order(["only_one"])
        assert result == ["only_one"]

    def test_empty_list_returns_empty(self):
        result = randomize_presentation_order([])
        assert result == []


# ===========================================================================
# AC3: Judge verdict filenames
# ===========================================================================


class TestBuildJudgeFilenames:
    """AC3: Judge verdicts stored as judge_{i}.json."""

    def test_three_judges(self):
        filenames = build_judge_filenames(3)
        assert filenames == ["judge_0.json", "judge_1.json", "judge_2.json"]

    def test_single_judge(self):
        filenames = build_judge_filenames(1)
        assert filenames == ["judge_0.json"]

    def test_five_judges(self):
        filenames = build_judge_filenames(5)
        assert len(filenames) == 5
        assert filenames[4] == "judge_4.json"

    def test_zero_based_indexing(self):
        filenames = build_judge_filenames(2)
        assert filenames[0] == "judge_0.json"
        assert filenames[1] == "judge_1.json"


# ===========================================================================
# AC4: Aggregated score is mean of weighted_totals
# ===========================================================================


class TestAggregateJudgeScores:
    """AC4: Canonical score = mean of weighted_totals."""

    def test_three_judges_mean(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        result = aggregate_judge_scores(verdicts)
        assert abs(result - 78.33) < 0.01

    def test_single_judge_returns_its_score(self):
        verdicts = [_make_verdict(85.0)]
        result = aggregate_judge_scores(verdicts)
        assert result == 85.0

    def test_two_judges(self):
        verdicts = [_make_verdict(70.0), _make_verdict(80.0)]
        result = aggregate_judge_scores(verdicts)
        assert result == 75.0

    def test_identical_scores(self):
        verdicts = [_make_verdict(90.0), _make_verdict(90.0), _make_verdict(90.0)]
        result = aggregate_judge_scores(verdicts)
        assert result == 90.0

    def test_empty_raises(self):
        with pytest.raises((ValueError, ZeroDivisionError)):
            aggregate_judge_scores([])


# ===========================================================================
# AC5: --multi-judge 1 behaves identically to single-judge
# ===========================================================================


class TestFormatMultiJudgeResult:
    """AC5: n=1 returns SingleJudgeResult, n>1 returns MultiJudgeResult."""

    def test_n1_returns_single_judge_result(self):
        verdict = _make_verdict(85.0, "great work")
        result = format_multi_judge_result([verdict], n=1)
        assert isinstance(result, SingleJudgeResult)

    def test_n1_no_judges_array(self):
        verdict = _make_verdict(85.0)
        result = format_multi_judge_result([verdict], n=1)
        assert not hasattr(result, "judges")

    def test_n1_has_weighted_total(self):
        verdict = _make_verdict(85.0)
        result = format_multi_judge_result([verdict], n=1)
        assert result.weighted_total == 85.0

    def test_n1_has_scores(self):
        verdict = _make_verdict(85.0)
        result = format_multi_judge_result([verdict], n=1)
        assert "correctness" in result.scores

    def test_n1_has_assessment(self):
        verdict = _make_verdict(85.0, "excellent")
        result = format_multi_judge_result([verdict], n=1)
        assert result.assessment == "excellent"

    def test_n3_returns_multi_judge_result(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        result = format_multi_judge_result(verdicts, n=3)
        assert isinstance(result, MultiJudgeResult)

    def test_n3_has_judges_array(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        result = format_multi_judge_result(verdicts, n=3)
        assert len(result.judges) == 3

    def test_n3_has_canonical_score(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        result = format_multi_judge_result(verdicts, n=3)
        assert abs(result.canonical_score - 78.33) < 0.01

    def test_n3_has_judge_agreement(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        result = format_multi_judge_result(verdicts, n=3)
        assert "placeholder" in result.judge_agreement


# ===========================================================================
# AC6: Summary YAML includes judge_agreement section
# ===========================================================================


class TestBuildMultiJudgeSummary:
    """AC6: Summary dict includes judge_agreement when n>1."""

    def test_n3_has_judge_agreement_key(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        summary = build_multi_judge_summary(verdicts, n=3)
        assert "judge_agreement" in summary

    def test_judge_agreement_is_placeholder(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        summary = build_multi_judge_summary(verdicts, n=3)
        assert summary["judge_agreement"]["placeholder"] is True

    def test_n1_no_judge_agreement(self):
        verdicts = [_make_verdict(85.0)]
        summary = build_multi_judge_summary(verdicts, n=1)
        assert "judge_agreement" not in summary

    def test_summary_has_canonical_score(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        summary = build_multi_judge_summary(verdicts, n=3)
        assert "canonical_score" in summary
        assert abs(summary["canonical_score"] - 78.33) < 0.01

    def test_summary_has_judge_count(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        summary = build_multi_judge_summary(verdicts, n=3)
        assert summary["judge_count"] == 3

    def test_summary_has_individual_scores(self):
        verdicts = [_make_verdict(78.0), _make_verdict(82.0), _make_verdict(75.0)]
        summary = build_multi_judge_summary(verdicts, n=3)
        assert summary["individual_scores"] == [78.0, 82.0, 75.0]
