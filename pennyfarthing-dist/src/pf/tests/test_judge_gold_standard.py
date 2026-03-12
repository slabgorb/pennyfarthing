"""Tests for story 45-2: Gold standard calibration in judge prompts.

Validates that the judge prompt builder includes gold_standard calibration
context when available and omits it when absent.

Acceptance Criteria:
- [AC1] Judge prompt includes gold standard response + score when available
- [AC2] Calibration instruction tells judge to use gold standard as anchor,
        not as the only correct answer
- [AC3] Backward compatible — judge prompt unchanged without gold standard
"""

from __future__ import annotations

import pytest

from pf.benchmark.judge_prompt import (
    BaselineIssue,
    GoldStandard,
    SoloJudgeInput,
    build_solo_judge_prompt,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _gold_standard() -> GoldStandard:
    return GoldStandard(
        response=(
            "This code has a race condition in the cache invalidation logic. "
            "The mutex should be acquired before checking staleness."
        ),
        score=92,
        graded_by="keith",
        notes="Identifies race condition, suggests mutex pattern, covers edge cases",
    )


def _base_input() -> SoloJudgeInput:
    return SoloJudgeInput(
        spec="firefly",
        character="River Tam",
        challenge="Review the order service for concurrency bugs",
        response="I found a race condition in the cache layer...",
    )


# ===========================================================================
# AC1: Judge prompt includes gold standard when available
# ===========================================================================


class TestAC1GoldStandardInclusion:
    """Gold standard response and score appear in judge prompt when provided."""

    def test_prompt_contains_gold_standard_response(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert gs.response in prompt, (
            "Prompt must contain the gold standard response text"
        )

    def test_prompt_contains_gold_standard_score(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert "92" in prompt, "Prompt must contain the gold standard score"

    def test_prompt_contains_gold_standard_notes_when_present(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert gs.notes in prompt, "Prompt must include gold standard notes"

    def test_prompt_works_without_notes(self) -> None:
        gs = _gold_standard()
        gs.notes = None
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert gs.response in prompt, "Prompt must still include response without notes"
        assert "92" in prompt, "Prompt must still include score without notes"

    def test_no_gold_standard_section_when_absent(self) -> None:
        inp = _base_input()
        prompt = build_solo_judge_prompt(inp)

        assert "Gold Standard" not in prompt, (
            "Prompt must NOT contain Gold Standard section when none provided"
        )
        assert "Calibration" not in prompt, (
            "Prompt must NOT contain calibration instructions when no gold standard"
        )

    def test_no_gold_standard_section_when_none(self) -> None:
        inp = _base_input()
        inp.gold_standard = None
        prompt = build_solo_judge_prompt(inp)

        assert "Gold Standard" not in prompt, (
            "Prompt must NOT contain Gold Standard section when explicitly None"
        )


# ===========================================================================
# AC2: Calibration instruction — anchor, not "correct answer"
# ===========================================================================


class TestAC2CalibrationInstruction:
    """Calibration instruction uses gold standard as reference, not penalizing
    different-but-valid approaches."""

    def test_calibration_instruction_present(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert "calibrat" in prompt.lower(), (
            "Prompt must contain calibration instruction when gold standard provided"
        )

    def test_instruction_mentions_different_valid_approaches(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        lower = prompt.lower()
        assert "different" in lower and "valid" in lower, (
            "Calibration instruction must mention different valid approaches"
        )

    def test_gold_standard_presented_as_reference_or_anchor(self) -> None:
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        lower = prompt.lower()
        assert "reference" in lower or "anchor" in lower, (
            "Gold standard must be presented as a reference/anchor"
        )

    def test_no_calibration_instruction_without_gold_standard(self) -> None:
        inp = _base_input()
        prompt = build_solo_judge_prompt(inp)

        assert "calibrat" not in prompt.lower(), (
            "No calibration instruction when gold standard absent"
        )


# ===========================================================================
# AC3: Backward compatibility
# ===========================================================================


class TestAC3BackwardCompatibility:
    """Judge prompt works identically without gold standard."""

    def test_standard_rubric_dimensions_present_without_gs(self) -> None:
        inp = _base_input()
        prompt = build_solo_judge_prompt(inp)

        for dim in ("Correctness", "Depth", "Quality", "Persona"):
            assert dim in prompt, f"Must include {dim} dimension without gold standard"

    def test_standard_rubric_dimensions_present_with_gs(self) -> None:
        inp = _base_input()
        inp.gold_standard = _gold_standard()
        prompt = build_solo_judge_prompt(inp)

        for dim in ("Correctness", "Depth", "Quality", "Persona"):
            assert dim in prompt, f"Must include {dim} dimension with gold standard"

    def test_contestant_info_always_present(self) -> None:
        for gs in (None, _gold_standard()):
            inp = _base_input()
            inp.gold_standard = gs
            prompt = build_solo_judge_prompt(inp)

            assert "firefly" in prompt, "Must include spec"
            assert "River Tam" in prompt, "Must include character"

    def test_challenge_and_response_always_present(self) -> None:
        for gs in (None, _gold_standard()):
            inp = _base_input()
            inp.gold_standard = gs
            prompt = build_solo_judge_prompt(inp)

            assert "Review the order service" in prompt, "Must include challenge"
            assert "I found a race condition" in prompt, "Must include response"

    def test_json_output_format_always_present(self) -> None:
        for gs in (None, _gold_standard()):
            inp = _base_input()
            inp.gold_standard = gs
            prompt = build_solo_judge_prompt(inp)

            assert "weighted_total" in prompt, "Must include JSON output format"


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    """Boundary conditions and integration with checklist mode."""

    def test_score_boundary_low(self) -> None:
        gs = _gold_standard()
        gs.score = 1
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert gs.response in prompt

    def test_score_boundary_high(self) -> None:
        gs = _gold_standard()
        gs.score = 100
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert "100" in prompt

    def test_very_long_gold_standard_response(self) -> None:
        gs = _gold_standard()
        gs.response = "x" * 10_000
        inp = _base_input()
        inp.gold_standard = gs
        prompt = build_solo_judge_prompt(inp)

        assert "x" * 100 in prompt, "Must include long response without truncation"

    def test_gold_standard_with_checklist_mode(self) -> None:
        """Gold standard should still appear as calibration even in checklist mode."""
        gs = _gold_standard()
        inp = _base_input()
        inp.gold_standard = gs
        inp.baseline_issues = [
            BaselineIssue(id="BUG-1", severity="critical", description="Race condition"),
        ]
        prompt = build_solo_judge_prompt(inp)

        assert gs.response in prompt, "Gold standard must appear in checklist mode"
        assert "BUG-1" in prompt, "Baseline issues must also appear"
