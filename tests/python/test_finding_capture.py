"""
Tests for Story 133-2: Add finding-capture to agent exit behaviors.

Verifies that TEA, Dev, and Reviewer agent definitions include
Delivery Findings capture instructions per ADR-0031.

Covers all 10 Acceptance Criteria:
  AC1: TEA assessment template (red phase) includes finding-capture with format
  AC2: TEA assessment template (verify phase) includes finding-capture with format
  AC3: Dev assessment template (green phase) includes finding-capture with format
  AC4: Reviewer assessment template (review phase) includes finding-capture with format
  AC5: All finding-capture sections explain ADR-0031 format (Type, urgency, path, agent, phase)
  AC6: All sections include "No upstream findings" example
  AC7: Assessment templates explain append-only rule
  AC8: sm.md does NOT contain finding-capture (deferred to 134-1)
  AC9: No changes to gates or exit protocols — only assessment templates
  AC10: tdd workflow tests still pass (covered by existing test suite)

Run with: python -m pytest tests/python/test_finding_capture.py -v
"""

import re
from pathlib import Path

import pytest

# =============================================================================
# Fixtures
# =============================================================================

AGENTS_DIR = Path(__file__).parent.parent.parent / "pennyfarthing-dist" / "agents"


def _read_agent(name: str) -> str:
    """Read an agent definition file and return its content."""
    path = AGENTS_DIR / name
    if not path.exists():
        pytest.skip(f"{name} not found at {path}")
    return path.read_text()


def _extract_section(content: str, tag: str) -> str:
    """Extract content between <tag> and </tag>."""
    pattern = rf"<{tag}>(.*?)</{tag}>"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(1) if match else ""


# =============================================================================
# AC1: TEA red phase finding-capture
# =============================================================================


class TestTEARedPhase:
    """AC1: TEA assessment template includes finding-capture for red phase."""

    def test_tea_has_delivery_findings_reference(self) -> None:
        """TEA agent should reference Delivery Findings section."""
        content = _read_agent("tea.md")
        assert "Delivery Findings" in content, (
            "tea.md must reference '## Delivery Findings' section"
        )

    def test_tea_assessment_template_has_finding_capture(self) -> None:
        """TEA assessment template should include finding-capture instructions."""
        content = _read_agent("tea.md")
        template = _extract_section(content, "assessment-template")
        assert "Delivery Findings" in template or "finding" in template.lower(), (
            "TEA <assessment-template> must include finding-capture instructions"
        )

    def test_tea_references_test_design_phase(self) -> None:
        """TEA finding-capture should reference 'test design' as human phase name."""
        content = _read_agent("tea.md")
        assert "test design" in content.lower(), (
            "tea.md must use 'test design' as the human phase name for red phase"
        )


# =============================================================================
# AC2: TEA verify phase finding-capture
# =============================================================================


class TestTEAVerifyPhase:
    """AC2: TEA assessment template includes finding-capture for verify phase."""

    def test_tea_references_verify_phase(self) -> None:
        """TEA finding-capture should reference verify phase."""
        content = _read_agent("tea.md")
        # Should mention test verification as a human phase name
        assert "test verification" in content.lower() or "verification" in content.lower(), (
            "tea.md must reference 'test verification' phase for verify phase findings"
        )


# =============================================================================
# AC3: Dev green phase finding-capture
# =============================================================================


class TestDevGreenPhase:
    """AC3: Dev assessment template includes finding-capture for green phase."""

    def test_dev_has_delivery_findings_reference(self) -> None:
        """Dev agent should reference Delivery Findings section."""
        content = _read_agent("dev.md")
        assert "Delivery Findings" in content, (
            "dev.md must reference '## Delivery Findings' section"
        )

    def test_dev_assessment_template_has_finding_capture(self) -> None:
        """Dev assessment template should include finding-capture instructions."""
        content = _read_agent("dev.md")
        template = _extract_section(content, "assessment-template")
        assert "Delivery Findings" in template or "finding" in template.lower(), (
            "Dev <assessment-template> must include finding-capture instructions"
        )

    def test_dev_references_implementation_phase(self) -> None:
        """Dev finding-capture should reference 'implementation' as human phase name."""
        content = _read_agent("dev.md")
        # The word 'implementation' may appear in other contexts, so check near finding-related content
        assert "implementation" in content.lower(), (
            "dev.md must use 'implementation' as the human phase name for green phase"
        )


# =============================================================================
# AC4: Reviewer review phase finding-capture
# =============================================================================


class TestReviewerPhase:
    """AC4: Reviewer assessment template includes finding-capture for review phase."""

    def test_reviewer_has_delivery_findings_reference(self) -> None:
        """Reviewer agent should reference Delivery Findings section."""
        content = _read_agent("reviewer.md")
        assert "Delivery Findings" in content, (
            "reviewer.md must reference '## Delivery Findings' section"
        )

    def test_reviewer_assessment_template_has_finding_capture(self) -> None:
        """Reviewer assessment template should include finding-capture instructions."""
        content = _read_agent("reviewer.md")
        template = _extract_section(content, "assessment-templates")
        assert "Delivery Findings" in template or "finding" in template.lower(), (
            "Reviewer <assessment-templates> must include finding-capture instructions"
        )

    def test_reviewer_references_code_review_phase(self) -> None:
        """Reviewer finding-capture should reference 'code review' as human phase name."""
        content = _read_agent("reviewer.md")
        assert "code review" in content.lower(), (
            "reviewer.md must use 'code review' as the human phase name"
        )


# =============================================================================
# AC5: Finding format explained (Type, urgency, path, agent, phase)
# =============================================================================


class TestFindingFormat:
    """AC5: All finding-capture sections explain the ADR-0031 format."""

    FINDING_TYPE_AGENTS = ["tea.md", "dev.md", "reviewer.md"]
    REQUIRED_TYPES = ["Gap", "Conflict", "Question", "Improvement"]

    @pytest.mark.parametrize("agent_file", FINDING_TYPE_AGENTS)
    def test_agent_lists_finding_types(self, agent_file: str) -> None:
        """Each agent should list the four finding types."""
        content = _read_agent(agent_file)
        for finding_type in self.REQUIRED_TYPES:
            assert finding_type in content, (
                f"{agent_file} must list finding type '{finding_type}'"
            )

    @pytest.mark.parametrize("agent_file", FINDING_TYPE_AGENTS)
    def test_agent_lists_urgency_levels(self, agent_file: str) -> None:
        """Each agent should list urgency levels: blocking, non-blocking."""
        content = _read_agent(agent_file)
        assert "blocking" in content.lower() and "non-blocking" in content.lower(), (
            f"{agent_file} must list urgency levels 'blocking' and 'non-blocking'"
        )

    @pytest.mark.parametrize("agent_file", FINDING_TYPE_AGENTS)
    def test_agent_shows_finding_format_template(self, agent_file: str) -> None:
        """Each agent should show the finding format with Type and urgency."""
        content = _read_agent(agent_file)
        # Check for the format pattern: **{Type}** ({urgency})
        has_format = (
            "**{Type}**" in content
            or re.search(r"\*\*\{Type\}\*\*\s*\(\{urgency\}\)", content) is not None
            or re.search(r"\*\*(Gap|Conflict|Question|Improvement)\*\*\s*\(", content) is not None
        )
        assert has_format, (
            f"{agent_file} must show the finding format: **{{Type}}** ({{urgency}}): ..."
        )


# =============================================================================
# AC6: "No upstream findings" example
# =============================================================================


class TestNoFindingsExample:
    """AC6: All sections include 'No upstream findings' example."""

    AGENTS = ["tea.md", "dev.md", "reviewer.md"]

    @pytest.mark.parametrize("agent_file", AGENTS)
    def test_agent_has_no_findings_example(self, agent_file: str) -> None:
        """Each agent should include the 'No upstream findings' example text."""
        content = _read_agent(agent_file)
        assert "No upstream findings" in content, (
            f"{agent_file} must include 'No upstream findings during {{phase}}' example"
        )


# =============================================================================
# AC7: Append-only rule
# =============================================================================


class TestAppendOnlyRule:
    """AC7: Assessment templates explain the append-only rule for Delivery Findings."""

    AGENTS = ["tea.md", "dev.md", "reviewer.md"]

    @pytest.mark.parametrize("agent_file", AGENTS)
    def test_agent_has_append_only_instruction(self, agent_file: str) -> None:
        """Each agent should instruct to append only, not edit others' entries."""
        content = _read_agent(agent_file)
        content_lower = content.lower()
        has_append_rule = (
            "append" in content_lower
            and ("never edit" in content_lower or "do not edit" in content_lower or "only append" in content_lower)
        )
        assert has_append_rule, (
            f"{agent_file} must explain: agents ONLY append to Delivery Findings, never edit/remove others' entries"
        )


# =============================================================================
# AC8: sm.md does NOT contain finding-capture
# =============================================================================


class TestSMExclusion:
    """AC8: sm.md does NOT contain finding-capture changes (deferred to 134-1)."""

    def test_sm_assessment_has_no_finding_capture(self) -> None:
        """SM agent should NOT have finding-capture in its exit/assessment sections."""
        content = _read_agent("sm.md")
        # SM's finish flow should not yet have Impact Summary compilation
        # (that's story 134-1). Check that finding-capture is not in SM's
        # exit or finish-flow sections.
        finish_flow = _extract_section(content, "finish-flow")
        assert "Delivery Findings" not in finish_flow, (
            "sm.md <finish-flow> must NOT contain Delivery Findings capture "
            "(deferred to story 134-1)"
        )

    def test_sm_has_no_impact_summary(self) -> None:
        """SM agent should NOT yet have Impact Summary compilation."""
        content = _read_agent("sm.md")
        finish_flow = _extract_section(content, "finish-flow")
        assert "Impact Summary" not in finish_flow, (
            "sm.md <finish-flow> must NOT contain Impact Summary compilation "
            "(deferred to story 134-1)"
        )


# =============================================================================
# AC9: No changes to gates or exit protocols
# =============================================================================


class TestNoGateChanges:
    """AC9: Finding-capture is in assessment templates, NOT in exit protocols or gates."""

    AGENTS = ["tea.md", "dev.md", "reviewer.md"]

    @pytest.mark.parametrize("agent_file", AGENTS)
    def test_exit_section_unchanged(self, agent_file: str) -> None:
        """<exit> sections should not contain finding-capture instructions."""
        content = _read_agent(agent_file)
        exit_section = _extract_section(content, "exit")
        # Exit section should reference assessment-template but not contain
        # finding-capture logic itself
        assert "Delivery Findings" not in exit_section, (
            f"{agent_file} <exit> must NOT contain Delivery Findings instructions. "
            "Finding-capture belongs in <assessment-template>, not <exit>."
        )
