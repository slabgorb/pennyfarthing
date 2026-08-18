"""Tests for 162-78: ADR-0043 review-finding disposition gate.

Ground truth: docs/adr/0043-review-finding-disposition-gate.md (Accepted 2026-08-18).

The review pipeline promotes every confirmed finding to a story by default, so the
backlog measures reviewer throughput instead of remaining product work (epic 162 is
the evidence: ~35 of its stories were review follow-ups). ADR-0043 closes the triage
gap with a disposition gate at reviewer exit. This suite pins the *mechanism* — the
promotion rule and the budget cap — which is pure logic and the only unit-testable
surface. The reviewer.md prose and the markdown approval gate are pinned by a single
doc-contract test at the bottom.

RED until Dev implements ``pf.reviewer.disposition``. The disposition vocabulary here
(fix-now / fold / defer / drop) is ADR-0043's; how it reconciles with 150-20's legacy
go/no-go ``FIX``/``RECORD`` field in ``pf.reviewer.findings`` is a Dev/Architect
integration call logged as a Delivery Finding — these tests deliberately target the
new rule as pure functions so they do not pre-judge that migration.

ACs pinned:
- AC1: the four ADR dispositions are the valid set; anything else is rejected.
- AC2: fix-now / fold / drop never create a story.
- AC3: a ``defer`` on a ``[SEC]`` or ``correctness`` finding auto-promotes to a story
       (no justification required) — the ONLY auto-promotion allowed.
- AC4: a ``defer`` on any other category requires an explicit justification; without
       one it is invalid and defaults to ``drop`` (burden of proof flips).
- AC5: a ``defer`` on a ``chore-grade`` finding never creates a story, justification
       or not.
- AC6: per-epic follow-up budget (default N=10) — overflow defers collapse into a
       single "review-debt" story instead of unbounded fan-out.
- AC7: the exit-gate validator rejects a confirmed finding with no disposition, an
       unjustified non-[SEC]/non-correctness defer, and a chore-grade defer.
- AC8: reviewer.md documents the four dispositions and the auto-promotion restriction.

Story: 162-78
"""

from __future__ import annotations

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# AC1: Disposition vocabulary
# ---------------------------------------------------------------------------


class TestDispositionVocabulary:
    """ADR-0043 defines exactly four dispositions."""

    def test_valid_dispositions_is_the_adr_set(self) -> None:
        from pf.reviewer.disposition import VALID_DISPOSITIONS

        assert set(VALID_DISPOSITIONS) == {"fix-now", "fold", "defer", "drop"}

    def test_valid_dispositions_is_immutable(self) -> None:
        # Closed set — encode the invariant as a frozenset (project type-design rule).
        from pf.reviewer.disposition import VALID_DISPOSITIONS

        assert isinstance(VALID_DISPOSITIONS, frozenset)

    def test_promotable_categories_are_sec_and_correctness_only(self) -> None:
        from pf.reviewer.disposition import PROMOTABLE_CATEGORIES

        assert set(PROMOTABLE_CATEGORIES) == {"SEC", "correctness"}

    def test_classify_rejects_unknown_disposition(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="escalate", category="other")
        assert result["valid"] is False
        assert result["becomes_story"] is False


# ---------------------------------------------------------------------------
# AC2: Non-defer dispositions never create a story
# ---------------------------------------------------------------------------


class TestNonDeferNeverPromotes:
    @pytest.mark.parametrize("disposition", ["fix-now", "fold", "drop"])
    def test_non_defer_does_not_become_story(self, disposition: str) -> None:
        from pf.reviewer.disposition import classify_promotion

        # Even a SEC finding does not become a story unless the disposition is defer.
        result = classify_promotion(disposition=disposition, category="SEC")
        assert result["valid"] is True
        assert result["becomes_story"] is False


# ---------------------------------------------------------------------------
# AC3: Auto-promotion is restricted to [SEC] / correctness defers
# ---------------------------------------------------------------------------


class TestAutoPromotion:
    @pytest.mark.parametrize("category", ["SEC", "correctness"])
    def test_sec_and_correctness_defer_auto_promotes_without_justification(
        self, category: str
    ) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category=category)
        assert result["valid"] is True
        assert result["becomes_story"] is True

    def test_promotable_defer_stays_defer(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="correctness")
        assert result["effective_disposition"] == "defer"


# ---------------------------------------------------------------------------
# AC4: Non-promotable defer requires justification; else defaults to drop
# ---------------------------------------------------------------------------


class TestBurdenOfProofFlips:
    def test_other_defer_without_justification_is_invalid(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="other")
        assert result["valid"] is False
        assert result["becomes_story"] is False

    def test_other_defer_without_justification_defaults_to_drop(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="other")
        assert result["effective_disposition"] == "drop"

    def test_other_defer_with_justification_promotes(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(
            disposition="defer",
            category="other",
            justification="Blocks the 162-45 stack-ready gate; tracked separately.",
        )
        assert result["valid"] is True
        assert result["becomes_story"] is True

    def test_blank_justification_does_not_count(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="other", justification="   ")
        assert result["valid"] is False
        assert result["becomes_story"] is False


# ---------------------------------------------------------------------------
# AC5: chore-grade never gets a story
# ---------------------------------------------------------------------------


class TestChoreGradeNeverPromotes:
    def test_chore_grade_defer_is_invalid(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="chore-grade")
        assert result["valid"] is False
        assert result["becomes_story"] is False

    def test_chore_grade_defer_ignores_justification(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(
            disposition="defer",
            category="chore-grade",
            justification="I really want this one tracked.",
        )
        assert result["becomes_story"] is False
        # chore-grade is unconditionally invalid, not merely non-promoting —
        # a justification must not buy it validity (mutation guard, 162-78 review F4).
        assert result["valid"] is False

    def test_chore_grade_defer_ignores_surrounding_whitespace(self) -> None:
        # Un-normalized "chore-grade " (trailing space) must not slip past the
        # bare-equality suppression into the "other" promote path (162-78 review F1/[SEC]).
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(
            disposition="defer",
            category="  Chore-Grade ",
            justification="legit-looking",
        )
        assert result["valid"] is False
        assert result["becomes_story"] is False

    def test_chore_grade_defer_defaults_to_drop(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category="chore-grade")
        assert result["effective_disposition"] == "drop"


# ---------------------------------------------------------------------------
# Input normalization & required-category (162-78 review F1: [SEC]/[EDGE])
# ---------------------------------------------------------------------------


class TestNormalizationAndRequiredCategory:
    def test_mixed_case_disposition_is_accepted(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="Defer", category="SEC")
        assert result["valid"] is True
        assert result["becomes_story"] is True

    def test_mixed_case_disposition_via_validate(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(
            [{"id": "F1", "disposition": "DEFER", "category": "correctness"}]
        )
        assert result["valid"] is True

    def test_defer_without_category_is_invalid(self) -> None:
        from pf.reviewer.disposition import classify_promotion

        result = classify_promotion(disposition="defer", category=None)
        assert result["valid"] is False
        assert result["becomes_story"] is False
        assert "category" in result["error"].lower()

    def test_defer_missing_category_key_via_validate(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions([{"id": "F1", "disposition": "defer"}])
        assert result["valid"] is False
        assert any("F1" in e for e in result["errors"])


# ---------------------------------------------------------------------------
# AC6: Per-epic follow-up budget (default N=10)
# ---------------------------------------------------------------------------


class TestFollowupBudget:
    def test_default_budget_is_ten(self) -> None:
        from pf.reviewer.disposition import DEFAULT_FOLLOWUP_BUDGET

        assert DEFAULT_FOLLOWUP_BUDGET == 10

    def test_under_budget_creates_one_story_per_defer(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=3, existing_defers=2)
        assert result["stories_created"] == 3
        assert result["review_debt_story"] is False
        assert result["collapsed"] == 0

    def test_exactly_at_budget_does_not_trigger_debt(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=8, existing_defers=2)  # total == 10
        assert result["stories_created"] == 8
        assert result["review_debt_story"] is False

    def test_overflow_collapses_into_single_review_debt_story(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        # 9 existing + 5 new = 14; only 1 slot left under the cap, the other 4 collapse.
        result = apply_followup_budget(new_defers=5, existing_defers=9)
        assert result["review_debt_story"] is True
        assert result["collapsed"] == 4
        # one individual story fills the last slot, plus the single debt story
        assert result["stories_created"] == 2

    def test_already_over_budget_collapses_all_new_into_one_debt_story(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=6, existing_defers=12)
        assert result["review_debt_story"] is True
        assert result["collapsed"] == 6
        assert result["stories_created"] == 1

    def test_no_new_defers_creates_nothing(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=0, existing_defers=4)
        assert result["stories_created"] == 0
        assert result["review_debt_story"] is False

    def test_at_budget_boundary_reports_zero_collapsed(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=8, existing_defers=2)  # total == 10
        assert result["collapsed"] == 0

    def test_zero_budget_freezes_all_defers_into_one_debt_story(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        result = apply_followup_budget(new_defers=3, existing_defers=0, budget=0)
        assert result["review_debt_story"] is True
        assert result["collapsed"] == 3
        assert result["stories_created"] == 1

    def test_negative_input_returns_error_not_nonsense(self) -> None:
        from pf.reviewer.disposition import apply_followup_budget

        # SOUL #10: return an error result, do not silently inflate/deflate the cap.
        result = apply_followup_budget(new_defers=3, existing_defers=-5)
        assert result["error"] is not None
        assert result["stories_created"] == 0


# ---------------------------------------------------------------------------
# AC7: The exit-gate validator (what the reviewer approval gate calls)
# ---------------------------------------------------------------------------


class TestValidateDispositions:
    """Return-result convention (SOUL #10 / project rule #6): dict, not exception."""

    def test_all_valid_findings_pass(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        findings = [
            {"id": "F1", "disposition": "fix-now", "category": "correctness"},
            {"id": "F2", "disposition": "defer", "category": "SEC"},
            {"id": "F3", "disposition": "drop", "category": "chore-grade"},
            {
                "id": "F4",
                "disposition": "defer",
                "category": "other",
                "justification": "Real debt, tracked as 162-70.",
            },
        ]
        result = validate_dispositions(findings)
        assert result["valid"] is True
        assert result["errors"] == []

    def test_none_findings_returns_error_not_throw(self) -> None:
        # SOUL #10: the module docstring promises no throw — None must not TypeError.
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(None)
        assert result["valid"] is False
        assert result["errors"]

    def test_missing_disposition_is_rejected(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions([{"id": "F1", "category": "correctness"}])
        assert result["valid"] is False
        assert any("F1" in e for e in result["errors"])

    def test_empty_disposition_is_rejected(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(
            [{"id": "F1", "disposition": "", "category": "correctness"}]
        )
        assert result["valid"] is False

    def test_unjustified_other_defer_is_rejected(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(
            [{"id": "F9", "disposition": "defer", "category": "other"}]
        )
        assert result["valid"] is False
        assert any("F9" in e for e in result["errors"])

    def test_chore_grade_defer_is_rejected(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(
            [{"id": "F7", "disposition": "defer", "category": "chore-grade"}]
        )
        assert result["valid"] is False
        assert any("F7" in e for e in result["errors"])

    def test_errors_report_every_offender_not_just_the_first(self) -> None:
        from pf.reviewer.disposition import validate_dispositions

        result = validate_dispositions(
            [
                {"id": "F1", "disposition": "defer", "category": "other"},  # unjustified
                {"id": "F2", "disposition": "defer", "category": "chore-grade"},  # never
            ]
        )
        assert result["valid"] is False
        joined = " ".join(result["errors"])
        assert "F1" in joined and "F2" in joined


# ---------------------------------------------------------------------------
# AC8: reviewer.md documents the disposition protocol (prose deliverable)
# ---------------------------------------------------------------------------


class TestReviewerDocContract:
    """The gate enforces structure; the agent prose has to actually describe the rule
    or the human running the reviewer never applies it."""

    @staticmethod
    def _reviewer_md() -> Path:
        # test file: pennyfarthing-dist/src/pf/tests/test_*.py -> parents[3] = pennyfarthing-dist
        return Path(__file__).resolve().parents[3] / "agents" / "reviewer.md"

    def test_reviewer_md_exists(self) -> None:
        assert self._reviewer_md().exists()

    def test_reviewer_md_documents_the_four_dispositions(self) -> None:
        text = self._reviewer_md().read_text(encoding="utf-8").lower()
        for disposition in ("fix-now", "fold", "defer", "drop"):
            assert disposition in text, f"reviewer.md must document disposition '{disposition}'"

    def test_reviewer_md_documents_auto_promotion_restriction(self) -> None:
        text = self._reviewer_md().read_text(encoding="utf-8").lower()
        # The doc must describe the disposition/auto-promotion mechanism explicitly —
        # "correctness"/"sec" alone appear for unrelated reasons and would pass vacuously.
        assert "disposition" in text, "reviewer.md must introduce the disposition concept"
        assert "auto-promot" in text, "reviewer.md must state the auto-promotion restriction"
        # ...and it must scope that restriction to the two promotable categories.
        assert "correctness" in text
        assert "sec" in text
