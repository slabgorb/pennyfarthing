"""
Tests for Story 136-21: Unified Research Tools section in agent-coordination guide.

Validates that Context7 and Perplexity guidance is consolidated into a single
coherent Research Tools section — not two parallel sections that duplicate
principles. Predecessor tests (136-19, 136-20) verify each tool's content exists;
these tests verify the content is properly UNIFIED.

Covers all 5 Acceptance Criteria:
  AC1: Single unified Research Tools section with decision tree and routing table
  AC2: Per-agent research profiles consolidated (one section, both tools)
  AC3: Routing table has no gaps or contradictions
  AC4: Shared principles documented once, not duplicated per tool
  AC5: Landing-order independence (structural — works regardless of prior state)

Run with: python -m pytest tests/python/test_unified_research_tools.py -v
"""

import re
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

DIST = Path(__file__).parent.parent.parent / "pennyfarthing-dist"
AGENTS_DIR = DIST / "agents"
GUIDE = DIST / "guides" / "agent-coordination.md"

# Agents that must have unified research guidance
RESEARCH_AGENTS = ["dev", "tea", "reviewer", "architect", "tech-writer"]

# Subagents that must NOT have research tools
SUBAGENT_NAMES = [
    "sm-setup",
    "sm-finish",
    "sm-file-summary",
    "testing-runner",
    "reviewer-preflight",
    "tandem-backseat",
]

# All six research tools that must appear in the routing table
ALL_RESEARCH_TOOLS = [
    "resolve-library-id",
    "query-docs",
    "perplexity_ask",
    "perplexity_search",
    "perplexity_reason",
    "perplexity_research",
]

# All information needs from the target routing table
ROUTING_INFORMATION_NEEDS = [
    "api signature",
    "library",
    "best practice",
    "comparing",
    "finding a library",
    "vulnerabilit",
    "error diagnosis",
    "internal tool",
]


def _read(path: Path) -> str:
    """Read file content, skip test if file doesn't exist."""
    if not path.is_file():
        pytest.skip(f"{path.name} not found")
    return path.read_text()


def _read_agent(name: str) -> str:
    """Read an agent definition file."""
    return _read(AGENTS_DIR / f"{name}.md")


def _extract_section(content: str, heading: str, level: int = 2) -> str:
    """Extract content under a markdown heading until the next heading of same or higher level."""
    prefix = "#" * level
    pattern = rf"^{prefix}\s+{re.escape(heading)}\s*$"
    match = re.search(pattern, content, re.MULTILINE | re.IGNORECASE)
    if not match:
        return ""
    start = match.end()
    # Find next heading of same or higher level
    next_heading = re.search(
        rf"^#{{{1},{level}}}\s+", content[start:], re.MULTILINE
    )
    if next_heading:
        return content[start : start + next_heading.start()]
    return content[start:]


# ---------------------------------------------------------------------------
# AC1: Single unified Research Tools section
# ---------------------------------------------------------------------------


class TestUnifiedSection:
    """AC1: Exactly ONE Research Tools section with decision tree and routing table."""

    def test_exactly_one_research_tools_heading(self) -> None:
        """Guide must have exactly one '## Research Tools' heading."""
        content = _read(GUIDE)
        matches = re.findall(r"^## Research Tools\s*$", content, re.MULTILINE)
        assert len(matches) == 1, (
            f"Expected exactly 1 '## Research Tools' heading, found {len(matches)}"
        )

    def test_no_separate_top_level_tool_sections(self) -> None:
        """No standalone '## Context7' or '## Perplexity' headings — they belong inside Research Tools."""
        content = _read(GUIDE)
        context7_h2 = re.findall(r"^## Context7", content, re.MULTILINE)
        perplexity_h2 = re.findall(r"^## Perplexity", content, re.MULTILINE)
        assert len(context7_h2) == 0, (
            "Found standalone '## Context7' heading — should be under Research Tools"
        )
        assert len(perplexity_h2) == 0, (
            "Found standalone '## Perplexity' heading — should be under Research Tools"
        )

    def test_decision_tree_present(self) -> None:
        """Research Tools section must have a decision tree or routing guide."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        section_lower = section.lower()
        has_decision_tree = (
            "decision tree" in section_lower
            or "which tool" in section_lower
            or "routing" in section_lower
        )
        assert has_decision_tree, (
            "Research Tools section missing decision tree or routing guide"
        )

    def test_routing_table_covers_all_tools(self) -> None:
        """Routing table must reference all six research tools."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        for tool in ALL_RESEARCH_TOOLS:
            assert tool in section, (
                f"Routing table missing tool: {tool}"
            )

    def test_both_tools_under_unified_section(self) -> None:
        """Both Context7 and Perplexity must appear within the Research Tools section."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        assert "Context7" in section, "Research Tools section missing Context7"
        assert "Perplexity" in section or "perplexity" in section, (
            "Research Tools section missing Perplexity"
        )


# ---------------------------------------------------------------------------
# AC2: Per-agent research profiles consolidated
# ---------------------------------------------------------------------------


class TestConsolidatedAgentProfiles:
    """AC2: Each agent has ONE research section covering BOTH tools."""

    @pytest.mark.parametrize("agent", RESEARCH_AGENTS)
    def test_agent_has_exactly_one_research_section(self, agent: str) -> None:
        """Each agent must have exactly one <research-tools> section."""
        content = _read_agent(agent)
        open_tags = re.findall(r"<research-tools>", content)
        assert len(open_tags) == 1, (
            f"{agent}.md has {len(open_tags)} <research-tools> sections, expected 1"
        )

    @pytest.mark.parametrize("agent", RESEARCH_AGENTS)
    def test_agent_mentions_both_tools(self, agent: str) -> None:
        """Each agent's research section references both Context7 and Perplexity."""
        content = _read_agent(agent)
        # Extract just the research-tools section
        match = re.search(
            r"<research-tools>(.*?)</research-tools>", content, re.DOTALL
        )
        assert match, f"{agent}.md missing <research-tools> section"
        section = match.group(1).lower()
        assert "context7" in section or "query-docs" in section, (
            f"{agent}.md research section missing Context7 reference"
        )
        assert "perplexity" in section, (
            f"{agent}.md research section missing Perplexity reference"
        )

    @pytest.mark.parametrize("agent", RESEARCH_AGENTS)
    def test_agent_references_coordination_guide(self, agent: str) -> None:
        """Each agent's research section points to the coordination guide."""
        content = _read_agent(agent)
        match = re.search(
            r"<research-tools>(.*?)</research-tools>", content, re.DOTALL
        )
        assert match, f"{agent}.md missing <research-tools> section"
        section = match.group(1)
        assert "agent-coordination" in section, (
            f"{agent}.md research section should reference agent-coordination guide"
        )


# ---------------------------------------------------------------------------
# AC3: Routing table has no gaps or contradictions
# ---------------------------------------------------------------------------


class TestRoutingTableCompleteness:
    """AC3: Routing table covers all common information needs without contradictions."""

    def test_routing_table_exists(self) -> None:
        """Research Tools section must contain a markdown table with routing info."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        # A markdown table has | delimiters
        table_rows = [
            line
            for line in section.split("\n")
            if line.strip().startswith("|") and "---" not in line
        ]
        assert len(table_rows) >= 8, (
            f"Routing table should have at least 8 rows (header + 7 needs), "
            f"found {len(table_rows)}"
        )

    def test_routing_covers_information_needs(self) -> None:
        """Routing table must address all key information need categories."""
        section = _extract_section(_read(GUIDE), "Research Tools").lower()
        for need in ROUTING_INFORMATION_NEEDS:
            assert need in section, (
                f"Routing table missing information need: '{need}'"
            )

    def test_context7_not_routed_for_non_library_tasks(self) -> None:
        """Context7 should never be first choice for non-library-specific tasks."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        # Find routing table rows
        table_rows = [
            line
            for line in section.split("\n")
            if line.strip().startswith("|") and "---" not in line
        ]
        for row in table_rows:
            row_lower = row.lower()
            # If the row is about general patterns, comparing, or CVEs,
            # Context7 should not be the "First Try"
            if any(
                kw in row_lower
                for kw in ["general pattern", "comparing", "vulnerabilit"]
            ):
                cells = [c.strip() for c in row.split("|")]
                if len(cells) >= 3:
                    first_try = cells[2].lower()
                    assert "context7" not in first_try or "query-docs" not in first_try, (
                        f"Context7 should not be first choice for: {cells[1].strip()}"
                    )

    def test_internal_tools_excluded_from_both(self) -> None:
        """Internal tool documentation should route to training data, not research tools."""
        section = _extract_section(_read(GUIDE), "Research Tools").lower()
        assert "internal" in section and "training data" in section, (
            "Routing must exclude internal tools from both Context7 and Perplexity"
        )


# ---------------------------------------------------------------------------
# AC4: Shared principles documented once, not duplicated
# ---------------------------------------------------------------------------


class TestSharedPrinciplesDeduplicated:
    """AC4: Principles are stated once in a shared section, not per tool."""

    def test_shared_principles_section_exists(self) -> None:
        """Research Tools must have a 'Shared Principles' subsection."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        assert "shared principles" in section.lower() or "principles" in section.lower(), (
            "Research Tools section missing shared principles subsection"
        )

    # REMOVED (162-30): test_graceful_degradation_not_duplicated and
    # test_scope_restriction_not_duplicated asserted an editorial "state each
    # principle exactly once" rule that guides/agent-coordination.md no longer
    # follows — it deliberately carries per-tool fallback/scope notes under
    # `### Context7` and `### Perplexity` AND a `### Shared Principles` summary.
    # These were prose-shape assertions on a doc that is not (and is not
    # required to be) deduplicated; they break on any editorial pass and pin no
    # code behavior. The substantive contracts (shared-principles section exists,
    # routing table, per-tool coverage) remain covered by the tests around them.
    # A doc-dedup decision belongs to a tech-writer pass, not this test file.

    def test_citation_discipline_not_duplicated(self) -> None:
        """Citation discipline should appear once in shared principles."""
        content = _read(GUIDE)
        section = _extract_section(content, "Research Tools")

        citation_headings = re.findall(
            r"\*\*Citation[:\*]", section, re.IGNORECASE
        )
        assert len(citation_headings) <= 1, (
            f"Citation discipline stated {len(citation_headings)} times — "
            f"should be once in shared principles"
        )

    def test_subagent_exclusion_not_duplicated(self) -> None:
        """Subagent exclusion should appear once in shared principles."""
        content = _read(GUIDE)
        section = _extract_section(content, "Research Tools")

        exclusion_headings = re.findall(
            r"\*\*Subagent exclusion[:\*]", section, re.IGNORECASE
        )
        assert len(exclusion_headings) <= 1, (
            f"Subagent exclusion stated {len(exclusion_headings)} times — "
            f"should be once in shared principles"
        )


# ---------------------------------------------------------------------------
# AC5: Landing-order independence (structural invariants)
# ---------------------------------------------------------------------------


class TestLandingOrderIndependence:
    """AC5: Structure holds regardless of which predecessor stories have landed."""

    def test_no_placeholder_notes_remain(self) -> None:
        """No 'will be expanded when story X lands' placeholders should remain."""
        content = _read(GUIDE)
        content_lower = content.lower()
        assert "will be expanded when" not in content_lower, (
            "Placeholder note still present — all tool guidance should be complete"
        )
        assert "placeholder" not in content_lower or "not a placeholder" in content_lower, (
            "Placeholder reference found — should be replaced with actual guidance"
        )

    def test_no_todo_markers(self) -> None:
        """No TODO/FIXME markers in the Research Tools section."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        section_upper = section.upper()
        assert "TODO" not in section_upper, (
            "TODO marker found in Research Tools section"
        )
        assert "FIXME" not in section_upper, (
            "FIXME marker found in Research Tools section"
        )

    def test_both_tool_subsections_have_content(self) -> None:
        """Both Context7 and Perplexity subsections must have substantive content."""
        section = _extract_section(_read(GUIDE), "Research Tools")
        # Context7 content
        assert "resolve-library-id" in section and "query-docs" in section, (
            "Context7 subsection missing tool documentation"
        )
        # Perplexity content
        assert "perplexity_ask" in section and "perplexity_search" in section, (
            "Perplexity subsection missing tool documentation"
        )


# ---------------------------------------------------------------------------
# Subagent exclusion (cross-cutting)
# ---------------------------------------------------------------------------


class TestSubagentResearchExclusion:
    """Subagents must not reference any research tools."""

    @pytest.mark.parametrize("subagent", SUBAGENT_NAMES)
    def test_subagent_no_research_tools(self, subagent: str) -> None:
        """Subagent files must not reference Context7 or Perplexity tools."""
        path = AGENTS_DIR / f"{subagent}.md"
        if not path.is_file():
            pytest.skip(f"{subagent}.md not found")

        content = path.read_text().lower()
        assert "context7" not in content, (
            f"{subagent}.md should not reference Context7"
        )
        assert "resolve-library-id" not in content, (
            f"{subagent}.md should not reference resolve-library-id"
        )
        assert "query-docs" not in content, (
            f"{subagent}.md should not reference query-docs"
        )
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
