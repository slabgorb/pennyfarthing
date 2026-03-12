"""
Tests for Story 136-20: Integrate Perplexity MCP for agent research tasks.

Validates that agent definitions and coordination guide contain Perplexity guidance
with correct speed-tier routing, tool mapping, and exclusions.

Covers all 7 Acceptance Criteria:
  AC1: agent-coordination guide has Perplexity in Research Tools section
  AC2: Dev agent includes Perplexity guidance
  AC3: TEA agent includes Perplexity guidance
  AC4: Reviewer agent includes Perplexity guidance
  AC5: Architect agent includes Perplexity guidance (+ Tech-Writer)
  AC6: Graceful degradation when Perplexity unavailable
  AC7: Subagents excluded from Perplexity usage

Run with: python -m pytest tests/python/test_perplexity_agent_guidance.py -v
"""

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DIST = Path(__file__).parent.parent.parent / "pennyfarthing-dist"
AGENTS_DIR = DIST / "agents"
GUIDE = DIST / "guides" / "agent-coordination.md"

# Main agents that MUST have Perplexity guidance
PERPLEXITY_AGENTS = ["dev", "tea", "reviewer", "architect", "tech-writer"]

# Subagent files that must NOT reference Perplexity
SUBAGENT_NAMES = [
    "sm-setup",
    "sm-finish",
    "sm-file-summary",
    "testing-runner",
    "reviewer-preflight",
    "tandem-backseat",
]


def _read(path: Path) -> str:
    """Read file content, skip test if file doesn't exist."""
    if not path.is_file():
        pytest.skip(f"{path.name} not found")
    return path.read_text()


def _read_agent(name: str) -> str:
    """Read an agent definition file."""
    return _read(AGENTS_DIR / f"{name}.md")


# ---------------------------------------------------------------------------
# AC1: Agent coordination guide has Perplexity in Research Tools section
# ---------------------------------------------------------------------------


class TestAgentCoordinationGuidePerplexity:
    """AC1: Research Tools section has complete Perplexity documentation."""

    def test_perplexity_section_exists(self) -> None:
        """Guide must have a Perplexity subsection in Research Tools."""
        content = _read(GUIDE)
        assert "perplexity" in content.lower(), (
            "agent-coordination.md missing Perplexity in Research Tools"
        )

    def test_speed_tier_routing(self) -> None:
        """Guide documents all four Perplexity tools with speed tiers."""
        content = _read(GUIDE)
        assert "perplexity_ask" in content, "Missing perplexity_ask in guide"
        assert "perplexity_search" in content, "Missing perplexity_search in guide"
        assert "perplexity_reason" in content, "Missing perplexity_reason in guide"
        assert "perplexity_research" in content, "Missing perplexity_research in guide"

    def test_default_tool_is_ask(self) -> None:
        """Guide documents perplexity_ask as the default/first-choice tool."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "perplexity_ask" in content and (
            "default" in content_lower or "first" in content_lower
        ), "Guide must establish perplexity_ask as the default tool"

    def test_citation_discipline(self) -> None:
        """Guide documents citation requirements for Perplexity-sourced decisions."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "citation" in content_lower or "cite" in content_lower, (
            "Missing citation discipline in Research Tools"
        )

    def test_scope_restriction(self) -> None:
        """Guide documents that queries must relate to active work."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "scope" in content_lower or "active" in content_lower, (
            "Missing scope restriction (queries must relate to active work)"
        )

    def test_graceful_degradation_in_guide(self) -> None:
        """Guide documents graceful degradation when Perplexity unavailable."""
        content = _read(GUIDE)
        content_lower = content.lower()
        has_degradation = (
            "unavailable" in content_lower
            and "perplexity" in content_lower
        )
        has_general_degradation = "graceful degradation" in content_lower
        assert has_degradation or has_general_degradation, (
            "Missing graceful degradation policy for Perplexity in Research Tools"
        )

    def test_placeholder_note_removed(self) -> None:
        """The 136-20 placeholder note should be replaced with real content."""
        content = _read(GUIDE)
        assert "will be expanded when story 136-20 lands" not in content, (
            "Placeholder note for 136-20 still present — replace with actual guidance"
        )

    def test_subagent_exclusion_in_guide(self) -> None:
        """Guide explicitly states subagents should not use Perplexity."""
        content = _read(GUIDE)
        content_lower = content.lower()
        has_subagent = "subagent" in content_lower
        has_exclusion = (
            "not" in content_lower
            or "exclude" in content_lower
            or "should not" in content_lower
        )
        assert has_subagent and has_exclusion, (
            "Missing subagent exclusion for Perplexity in Research Tools"
        )


# ---------------------------------------------------------------------------
# AC2: Dev agent includes Perplexity guidance
# ---------------------------------------------------------------------------


class TestDevAgentPerplexity:
    """AC2: Dev agent has Perplexity guidance for implementation research."""

    def test_perplexity_referenced(self) -> None:
        """Dev agent must reference Perplexity tools."""
        content = _read_agent("dev")
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "dev.md missing Perplexity guidance"
        )

    def test_ask_as_default(self) -> None:
        """Dev agent uses perplexity_ask as primary tool."""
        content = _read_agent("dev")
        assert "perplexity_ask" in content, (
            "dev.md should reference perplexity_ask as primary research tool"
        )

    def test_research_excluded(self) -> None:
        """Dev agent explicitly excludes perplexity_research (too slow)."""
        content = _read_agent("dev")
        content_lower = content.lower()
        # Dev should either not mention perplexity_research
        # or explicitly say not to use it
        if "perplexity_research" in content:
            has_exclusion = (
                "not" in content_lower
                or "avoid" in content_lower
                or "slow" in content_lower
                or "architect" in content_lower
            )
            assert has_exclusion, (
                "dev.md mentions perplexity_research without discouraging its use"
            )


# ---------------------------------------------------------------------------
# AC3: TEA agent includes Perplexity guidance
# ---------------------------------------------------------------------------


class TestTeaAgentPerplexity:
    """AC3: TEA agent has Perplexity guidance for test pattern research."""

    def test_perplexity_referenced(self) -> None:
        """TEA agent must reference Perplexity tools."""
        content = _read_agent("tea")
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "tea.md missing Perplexity guidance"
        )

    def test_ask_referenced(self) -> None:
        """TEA agent references perplexity_ask for test pattern discovery."""
        content = _read_agent("tea")
        assert "perplexity_ask" in content, (
            "tea.md should reference perplexity_ask for test pattern discovery"
        )

    def test_trust_but_verify(self) -> None:
        """TEA agent includes trust-but-verify for Perplexity suggestions."""
        content = _read_agent("tea")
        content_lower = content.lower()
        has_verify = (
            "trust" in content_lower and "verify" in content_lower
        ) or "verify" in content_lower
        assert has_verify, (
            "tea.md missing trust-but-verify principle for research tools"
        )


# ---------------------------------------------------------------------------
# AC4: Reviewer agent includes Perplexity guidance
# ---------------------------------------------------------------------------


class TestReviewerAgentPerplexity:
    """AC4: Reviewer agent has Perplexity guidance for review verification."""

    def test_perplexity_referenced(self) -> None:
        """Reviewer agent must reference Perplexity tools."""
        content = _read_agent("reviewer")
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "reviewer.md missing Perplexity guidance"
        )

    def test_scoped_usage(self) -> None:
        """Reviewer uses Perplexity only for suspicious patterns, not everything."""
        content = _read_agent("reviewer")
        content_lower = content.lower()
        has_scoping = (
            "suspicious" in content_lower
            or "looks off" in content_lower
            or "spot-check" in content_lower
            or "spot check" in content_lower
            or "vulnerabilit" in content_lower
        )
        assert has_scoping, (
            "reviewer.md missing scoped Perplexity usage "
            "(should be for suspicious patterns / vulnerabilities only)"
        )


# ---------------------------------------------------------------------------
# AC5: Architect and Tech-Writer include Perplexity guidance
# ---------------------------------------------------------------------------


class TestArchitectAgentPerplexity:
    """AC5a: Architect agent has Perplexity guidance including deep research."""

    def test_perplexity_referenced(self) -> None:
        """Architect agent must reference Perplexity tools."""
        content = _read_agent("architect")
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "architect.md missing Perplexity guidance"
        )

    def test_research_tool_permitted(self) -> None:
        """Architect is the only agent with perplexity_research permission."""
        content = _read_agent("architect")
        assert "perplexity_research" in content, (
            "architect.md should reference perplexity_research "
            "(Architect is the only agent permitted to use it)"
        )

    def test_reason_tool_referenced(self) -> None:
        """Architect references perplexity_reason for trade-off analysis."""
        content = _read_agent("architect")
        assert "perplexity_reason" in content, (
            "architect.md should reference perplexity_reason for trade-off analysis"
        )


class TestTechWriterAgentPerplexity:
    """AC5b: Tech-Writer agent has Perplexity guidance for fact verification."""

    def test_perplexity_referenced(self) -> None:
        """Tech-Writer agent must reference Perplexity tools."""
        content = _read_agent("tech-writer")
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "tech-writer.md missing Perplexity guidance"
        )


# ---------------------------------------------------------------------------
# AC6: Graceful degradation when Perplexity unavailable
# ---------------------------------------------------------------------------


class TestPerplexityGracefulDegradation:
    """AC6: Graceful degradation documented across agents and guide."""

    def test_guide_has_degradation_policy(self) -> None:
        """Coordination guide documents Perplexity degradation policy."""
        content = _read(GUIDE)
        content_lower = content.lower()
        # Must mention unavailability AND a fallback strategy
        has_unavailable = "unavailable" in content_lower
        has_fallback = (
            "training data" in content_lower
            or "proceed" in content_lower
            or "fallback" in content_lower
        )
        assert has_unavailable and has_fallback, (
            "Guide must document both unavailability scenario and fallback strategy"
        )

    def test_no_blocking_on_failure(self) -> None:
        """Guide explicitly says do NOT block or retry on Perplexity failure."""
        content = _read(GUIDE)
        content_lower = content.lower()
        has_no_block = (
            "not block" in content_lower
            or "do not block" in content_lower
            or "don't block" in content_lower
            or "never block" in content_lower
        )
        has_no_retry = (
            "not retry" in content_lower
            or "do not" in content_lower
        )
        assert has_no_block or has_no_retry, (
            "Guide must state agents should not block or retry on Perplexity failure"
        )


# ---------------------------------------------------------------------------
# AC7: Subagents excluded from Perplexity usage
# ---------------------------------------------------------------------------


class TestSubagentPerplexityExclusion:
    """AC7: No subagent definitions reference Perplexity tools."""

    @pytest.mark.parametrize("subagent", SUBAGENT_NAMES)
    def test_subagent_no_perplexity_reference(self, subagent: str) -> None:
        """Subagent files must not reference Perplexity tools."""
        path = AGENTS_DIR / f"{subagent}.md"
        if not path.is_file():
            pytest.skip(f"{subagent}.md not found")

        content = path.read_text().lower()
        assert "perplexity_ask" not in content, (
            f"{subagent}.md should not reference perplexity_ask"
        )
        assert "perplexity_search" not in content, (
            f"{subagent}.md should not reference perplexity_search"
        )
        assert "perplexity_reason" not in content, (
            f"{subagent}.md should not reference perplexity_reason"
        )
        assert "perplexity_research" not in content, (
            f"{subagent}.md should not reference perplexity_research"
        )
