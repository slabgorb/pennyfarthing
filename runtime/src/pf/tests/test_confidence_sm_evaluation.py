"""Tests for SM confidence gate evaluation results — Story 90-3.

Epic: 90 (Confidence Circuit Breaker via Gate)
Story: 90-3 — Evaluate and document results

Tests the evaluation document that assesses the SM confidence gate's
effectiveness after deployment. The gate (confidence-sm.md) was shipped
in story 90-2. This story evaluates trigger frequency, wrong-approach
reduction, user experience, and makes a rollout recommendation.

Acceptance Criteria:
- [AC1] Evaluate trigger frequency after 1 sprint
- [AC2] Document whether it reduced wrong-approach incidents
- [AC3] Assess if the gate was annoying (user overrode or dismissed)
- [AC4] Document findings in a results file
- [AC5] Decide on rollout recommendation to other agents
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------

_THIS_DIR = Path(__file__).resolve().parent
# src/pf/tests -> src/pf -> src -> pennyfarthing-dist (project root)
_DIST_ROOT = _THIS_DIR.parents[2]
_EVAL_FILE = _DIST_ROOT / "gates" / "evaluations" / "confidence-sm.md"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def eval_path() -> Path:
    """Return the expected path to the evaluation results file."""
    return _EVAL_FILE


@pytest.fixture
def eval_content(eval_path: Path) -> str:
    """Read and return the evaluation file content. Fails if file missing."""
    assert eval_path.is_file(), f"Evaluation file not found: {eval_path}"
    return eval_path.read_text()


# ===========================================================================
# AC1: Evaluate trigger frequency after 1 sprint
# ===========================================================================


class TestTriggerFrequency:
    """AC1: Evaluation documents how often the gate triggered."""

    def test_eval_has_trigger_section(self, eval_content: str) -> None:
        """AC1: Evaluation has a section about trigger frequency."""
        assert re.search(
            r"(?i)trigger.*frequen|frequen.*trigger|how often|activation.*rate",
            eval_content,
        ), "Missing trigger frequency section"

    def test_trigger_section_has_data(self, eval_content: str) -> None:
        """AC1: Trigger section includes specific data or baseline note."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "triggered",
                "fired",
                "activated",
                "invoked",
                "n/a",
                "baseline",
                "times",
                "occurrences",
            ]
        ), "Trigger section lacks frequency data or baseline acknowledgment"


# ===========================================================================
# AC2: Document whether it reduced wrong-approach incidents
# ===========================================================================


class TestWrongApproachReduction:
    """AC2: Evaluation documents impact on wrong-approach incidents."""

    def test_eval_has_wrong_approach_section(self, eval_content: str) -> None:
        """AC2: Evaluation has a section about wrong-approach incidents."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "wrong-approach",
                "wrong approach",
                "incident",
                "misroute",
                "incorrect action",
                "ambiguous",
            ]
        ), "Missing wrong-approach reduction section"

    def test_wrong_approach_has_comparison(self, eval_content: str) -> None:
        """AC2: Wrong-approach section includes comparison or baseline note."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "before",
                "after",
                "baseline",
                "reduced",
                "comparison",
                "prior",
                "improvement",
                "no data yet",
            ]
        ), "Wrong-approach section lacks before/after comparison or baseline"


# ===========================================================================
# AC3: Assess if the gate was annoying
# ===========================================================================


class TestUserExperience:
    """AC3: Evaluation assesses user experience with the gate."""

    def test_eval_has_ux_section(self, eval_content: str) -> None:
        """AC3: Evaluation has a section about user experience."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "user experience",
                "annoying",
                "friction",
                "override",
                "dismiss",
                "usability",
            ]
        ), "Missing user experience assessment section"

    def test_ux_mentions_override_behavior(self, eval_content: str) -> None:
        """AC3: UX section addresses override/dismissal behavior."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower for term in ["override", "dismiss", "bypass", "skip", "ignored"]
        ), "UX section doesn't address override/dismissal behavior"


# ===========================================================================
# AC4: Document findings in a results file
# ===========================================================================


class TestResultsFile:
    """AC4: Evaluation results file exists with proper structure."""

    def test_eval_file_exists(self, eval_path: Path) -> None:
        """AC4: Evaluation results file exists at expected location."""
        assert eval_path.is_file(), f"Evaluation file not found: {eval_path}"

    def test_eval_file_not_empty(self, eval_path: Path) -> None:
        """AC4: Evaluation file is not empty."""
        assert eval_path.is_file(), f"File not found: {eval_path}"
        content = eval_path.read_text()
        assert len(content.strip()) > 0, "Evaluation file is empty"

    def test_eval_has_title(self, eval_content: str) -> None:
        """AC4: Evaluation has a title heading."""
        assert re.search(r"^#\s+", eval_content, re.MULTILINE), (
            "Evaluation file missing title heading"
        )

    def test_eval_has_structured_sections(self, eval_content: str) -> None:
        """AC4: Evaluation has multiple sections (at least 3 headings)."""
        headings = re.findall(r"^##\s+", eval_content, re.MULTILINE)
        assert len(headings) >= 3, f"Expected at least 3 sections, found {len(headings)}"

    def test_eval_references_gate(self, eval_content: str) -> None:
        """AC4: Evaluation references the confidence-sm gate."""
        assert "confidence-sm" in eval_content, (
            "Evaluation doesn't reference the confidence-sm gate"
        )


# ===========================================================================
# AC5: Decide on rollout recommendation to other agents
# ===========================================================================


class TestRolloutRecommendation:
    """AC5: Evaluation includes a rollout recommendation."""

    def test_eval_has_recommendation_section(self, eval_content: str) -> None:
        """AC5: Evaluation has a rollout recommendation section."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in ["recommendation", "rollout", "next steps", "decision"]
        ), "Missing rollout recommendation section"

    def test_recommendation_is_actionable(self, eval_content: str) -> None:
        """AC5: Recommendation states a clear actionable decision."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "expand",
                "hold",
                "remove",
                "proceed",
                "defer",
                "recommend",
                "adopt",
                "extend",
            ]
        ), "Recommendation lacks clear actionable decision"

    def test_recommendation_mentions_other_agents(self, eval_content: str) -> None:
        """AC5: Recommendation addresses rollout to other agents."""
        content_lower = eval_content.lower()
        assert any(
            term in content_lower
            for term in [
                "other agent",
                "additional agent",
                "tea",
                "dev",
                "reviewer",
                "all agents",
                "agent-specific",
                "per-agent",
            ]
        ), "Recommendation doesn't address rollout to other agents"
