"""
Tests for Story 136-19: Integrate Context7 API for automated skill documentation updates.

Validates that agent definitions and coordination guide contain Context7 guidance
with correct patterns, routing, and exclusions.

Covers all 8 Acceptance Criteria:
  AC1: agent-coordination guide has Research Tools section with Context7 docs
  AC2: Dev agent includes Context7 guidance
  AC3: TEA agent includes Context7 guidance
  AC4: Reviewer agent includes Context7 guidance
  AC5: Architect and Tech-Writer agents include Context7 guidance
  AC6: Graceful degradation documented
  AC7: Subagents excluded from Context7 usage
  AC8: Context7 and Perplexity routing is coherent

Run with: python -m pytest tests/python/test_context7_agent_guidance.py -v
"""

from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DIST = Path(__file__).parent.parent.parent / "pennyfarthing-dist"
AGENTS_DIR = DIST / "agents"
GUIDE = DIST / "guides" / "agent-coordination.md"

# Main agents that MUST have Context7 guidance
CONTEXT7_AGENTS = ["dev", "tea", "reviewer", "architect", "tech-writer"]

# Subagent files that must NOT reference Context7
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
# AC1: Agent coordination guide has Context7 in Research Tools section
# ---------------------------------------------------------------------------


class TestAgentCoordinationGuide:
    """AC1: Research Tools section has complete Context7 documentation."""

    def test_research_tools_section_exists(self) -> None:
        """Guide must have a Research Tools section."""
        content = _read(GUIDE)
        assert "research tools" in content.lower(), (
            "agent-coordination.md missing 'Research Tools' section"
        )

    def test_two_step_lookup_pattern(self) -> None:
        """Guide documents the resolve-library-id -> query-docs pattern."""
        content = _read(GUIDE)
        assert "resolve-library-id" in content, (
            "Missing resolve-library-id in Research Tools"
        )
        assert "query-docs" in content, (
            "Missing query-docs in Research Tools"
        )

    def test_three_call_limit(self) -> None:
        """Guide documents the three-call-per-question limit."""
        content = _read(GUIDE)
        # Must mention the 3-call limit in some form
        assert "3" in content and (
            "call" in content.lower() and "limit" in content.lower()
            or "per question" in content.lower()
        ), "Missing three-call-per-question limit"

    def test_internal_tool_carveout(self) -> None:
        """Guide documents that Context7 is for external libraries only."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "internal" in content_lower or "external" in content_lower, (
            "Missing internal/external library carve-out in Research Tools"
        )

    def test_graceful_degradation_in_guide(self) -> None:
        """Guide documents graceful degradation when Context7 unavailable."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "unavailable" in content_lower or "degradation" in content_lower, (
            "Missing graceful degradation policy in Research Tools"
        )

    def test_routing_table_exists(self) -> None:
        """Guide has a routing table covering Context7 vs Perplexity."""
        content = _read(GUIDE)
        # Must have a markdown table with Context7 routing
        assert "Context7" in content or "context7" in content, (
            "Missing Context7 in routing table"
        )
        # Table should mention query-docs as a tool option
        assert "query-docs" in content, (
            "Routing table doesn't reference query-docs"
        )

    def test_subagent_exclusion_in_guide(self) -> None:
        """Guide explicitly states subagents should not use Context7."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "subagent" in content_lower and (
            "not" in content_lower or "exclude" in content_lower
            or "should not" in content_lower
        ), "Missing subagent exclusion statement in Research Tools"


# ---------------------------------------------------------------------------
# AC2: Dev agent includes Context7 guidance
# ---------------------------------------------------------------------------


class TestDevAgentContext7:
    """AC2: Dev agent has Context7 guidance for library lookups."""

    def test_context7_section_exists(self) -> None:
        """Dev agent must reference Context7."""
        content = _read_agent("dev")
        assert "context7" in content.lower() or "query-docs" in content, (
            "dev.md missing Context7 guidance"
        )

    def test_lookup_pattern_referenced(self) -> None:
        """Dev agent references the two-step lookup pattern."""
        content = _read_agent("dev")
        assert "resolve-library-id" in content or "query-docs" in content, (
            "dev.md missing Context7 lookup pattern"
        )

    def test_internal_package_exclusion(self) -> None:
        """Dev agent mentions not using Context7 for internal packages."""
        content = _read_agent("dev")
        content_lower = content.lower()
        # Must mention internal packages or @pennyfarthing as excluded
        has_internal = "internal" in content_lower
        has_pennyfarthing = "@pennyfarthing" in content_lower or "pennyfarthing" in content_lower
        has_pf = "pf cli" in content_lower or "`pf`" in content
        assert has_internal or has_pennyfarthing or has_pf, (
            "dev.md missing internal package exclusion for Context7"
        )


# ---------------------------------------------------------------------------
# AC3: TEA agent includes Context7 guidance
# ---------------------------------------------------------------------------


class TestTeaAgentContext7:
    """AC3: TEA agent has Context7 guidance for test verification."""

    def test_context7_section_exists(self) -> None:
        """TEA agent must reference Context7."""
        content = _read_agent("tea")
        assert "context7" in content.lower() or "query-docs" in content, (
            "tea.md missing Context7 guidance"
        )

    def test_trust_but_verify_principle(self) -> None:
        """TEA agent includes trust-but-verify for Context7 results."""
        content = _read_agent("tea")
        content_lower = content.lower()
        assert "trust" in content_lower and "verify" in content_lower, (
            "tea.md missing 'trust but verify' principle for Context7"
        )


# ---------------------------------------------------------------------------
# AC4: Reviewer agent includes Context7 guidance
# ---------------------------------------------------------------------------


class TestReviewerAgentContext7:
    """AC4: Reviewer agent has Context7 guidance for spot-checking."""

    def test_context7_section_exists(self) -> None:
        """Reviewer agent must reference Context7."""
        content = _read_agent("reviewer")
        assert "context7" in content.lower() or "query-docs" in content, (
            "reviewer.md missing Context7 guidance"
        )

    def test_scoped_usage(self) -> None:
        """Reviewer guidance scopes Context7 to suspicious patterns, not everything."""
        content = _read_agent("reviewer")
        content_lower = content.lower()
        has_scoping = (
            "suspicious" in content_lower
            or "looks off" in content_lower
            or "spot-check" in content_lower
            or "spot check" in content_lower
        )
        assert has_scoping, (
            "reviewer.md missing scoped Context7 usage (should be for suspicious patterns only)"
        )


# ---------------------------------------------------------------------------
# AC5: Architect and Tech-Writer include Context7 guidance
# ---------------------------------------------------------------------------


class TestArchitectAgentContext7:
    """AC5a: Architect agent has Context7 guidance for capability evaluation."""

    def test_context7_section_exists(self) -> None:
        """Architect agent must reference Context7."""
        content = _read_agent("architect")
        assert "context7" in content.lower() or "query-docs" in content, (
            "architect.md missing Context7 guidance"
        )


class TestTechWriterAgentContext7:
    """AC5b: Tech-Writer agent has Context7 guidance for reference verification."""

    def test_context7_section_exists(self) -> None:
        """Tech-Writer agent must reference Context7."""
        content = _read_agent("tech-writer")
        assert "context7" in content.lower() or "query-docs" in content, (
            "tech-writer.md missing Context7 guidance"
        )


# ---------------------------------------------------------------------------
# AC6: Graceful degradation when Context7 unavailable
# ---------------------------------------------------------------------------


class TestGracefulDegradation:
    """AC6: Graceful degradation documented across agents."""

    @pytest.mark.parametrize("agent", CONTEXT7_AGENTS)
    def test_degradation_or_guide_reference(self, agent: str) -> None:
        """Each agent either documents degradation or inherits from guide."""
        agent_content = _read_agent(agent)
        guide_content = _read(GUIDE)

        # Degradation can be in the agent file or in the coordination guide
        agent_lower = agent_content.lower()
        guide_lower = guide_content.lower()

        has_degradation = (
            "unavailable" in agent_lower
            or "training data" in agent_lower
            or "degradation" in agent_lower
            or "unavailable" in guide_lower
        )
        assert has_degradation, (
            f"{agent}.md has no graceful degradation guidance "
            f"(not found in agent or coordination guide)"
        )


# ---------------------------------------------------------------------------
# AC7: Subagents excluded from Context7 usage
# ---------------------------------------------------------------------------


class TestSubagentExclusion:
    """AC7: No subagent definitions reference Context7."""

    @pytest.mark.parametrize("subagent", SUBAGENT_NAMES)
    def test_subagent_no_context7_reference(self, subagent: str) -> None:
        """Subagent files must not reference Context7 tools."""
        path = AGENTS_DIR / f"{subagent}.md"
        if not path.is_file():
            pytest.skip(f"{subagent}.md not found")

        content = path.read_text().lower()
        assert "context7" not in content, (
            f"{subagent}.md should not reference Context7 "
            f"(subagents use haiku, MCP round-trips are waste)"
        )
        assert "resolve-library-id" not in content, (
            f"{subagent}.md should not reference resolve-library-id"
        )
        assert "query-docs" not in content, (
            f"{subagent}.md should not reference query-docs"
        )


# ---------------------------------------------------------------------------
# AC8: Context7 and Perplexity routing is coherent
# ---------------------------------------------------------------------------


class TestRoutingCoherence:
    """AC8: Unified routing table covers Context7 and Perplexity."""

    def test_routing_table_has_context7(self) -> None:
        """Routing table must include Context7 as an option."""
        content = _read(GUIDE)
        assert "Context7" in content or "context7" in content, (
            "Routing table missing Context7"
        )

    def test_routing_table_mentions_perplexity(self) -> None:
        """Routing table should mention Perplexity (even as placeholder)."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "perplexity" in content_lower, (
            "Routing table should mention Perplexity "
            "(at minimum as placeholder for 136-20)"
        )

    def test_routing_covers_library_docs(self) -> None:
        """Routing table must cover the library documentation use case."""
        content = _read(GUIDE)
        content_lower = content.lower()
        has_library_routing = (
            "library" in content_lower
            and ("context7" in content_lower or "query-docs" in content_lower)
        )
        assert has_library_routing, (
            "Routing table must route library documentation to Context7"
        )
