"""
Tests for story 150-2: PR body template generation — Design Deviations support.

The existing generate_pr_body() is missing the Design Deviations section that
sm-finish expects in the PR body. This test suite covers:

  AC1: Design Deviations section included in PR body output
  AC2: Deviation content correctly extracted and formatted
  AC3: Jargon translation applied to deviation subsection headers
  AC4: Section ordering — Deviations placed after Details
  AC5: Backward compat — sessions without deviations degrade gracefully
  AC6: Edge cases — empty deviations, no-deviation markers, mixed agents
"""

import textwrap
from pathlib import Path

import pytest

from pf.findings.pr_body import generate_pr_body

# ─── Fixtures ────────────────────────────────────────────────────────────

SESSION_WITH_DEVIATIONS = textwrap.dedent("""\
    ---
    story_id: "150-2"
    jira_key: "MSSCI-16494"
    title: "PR body template generation"
    points: 2
    status: in_progress
    workflow: "tdd"
    phase: review
    branch: "feat/150-2-pr-body-template"
    ---

    # 150-2: PR body template generation

    **Jira:** MSSCI-16494
    **Workflow:** tdd

    ## Acceptance Criteria

    1. Design Deviations appear in PR body
    2. Jargon translated in deviation headers

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Used property-based tests instead of example list**
      - Spec source: context-story-150-2.md, AC-1
      - Spec text: "validate with three example sessions"
      - Implementation: Tests use property-based generation for broader coverage
      - Rationale: Catches more edge cases than enumerated examples
      - Severity: minor
      - Forward impact: none

    ### Dev (implementation)
    - **Used Jinja2 instead of string formatting**
      - Spec source: context-story-150-2.md, AC-2
      - Spec text: "use Python f-strings for template rendering"
      - Implementation: Jinja2 templates for maintainability and extensibility
      - Rationale: f-strings become unwieldy with complex conditional sections
      - Severity: major
      - Forward impact: minor — Story 150-3 assumes string-based templates

    ### Architect (reconcile)
    - No deviations from spec.

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (non-blocking): Template edge cases not covered. Affects `pennyfarthing-dist/src/pf/findings/pr_body.py` (add template tests). *Found by TEA during test design.*

    ## Impact Summary

    **Upstream Effects:** 1 finding (1 Gap, 0 Conflict, 0 Question, 0 Improvement)
    **Blocking:** None

    - **Gap:** Template edge cases not covered. Affects `pennyfarthing-dist/src/pf/findings/pr_body.py`.

    ## TEA Assessment

    **Tests Required:** Yes
    **Tests Written:** 10 tests covering 2 ACs
    **Status:** RED confirmed

    ## Dev Assessment

    **Implementation complete.** Added Jinja2-based template rendering.
    Used template inheritance for section customization.

    ## Reviewer Assessment

    **Approved.** Clean template implementation, good separation of concerns.
""")

SESSION_NO_DEVIATIONS_SECTION = textwrap.dedent("""\
    ---
    story_id: "80-3"
    jira_key: "MSSCI-8003"
    title: "Refactor config loader"
    points: 2
    status: in_progress
    workflow: "trivial"
    phase: review
    branch: "feat/80-3-config-loader"
    ---

    # 80-3: Refactor config loader

    **Jira:** MSSCI-8003
    **Workflow:** trivial

    ## Dev Assessment

    **Implementation complete.** Swapped yaml.load for yaml.safe_load.

    ## Reviewer Assessment

    **Approved.** Simple, clean refactor.
""")

SESSION_EMPTY_DEVIATIONS = textwrap.dedent("""\
    ---
    story_id: "101-1"
    jira_key: "MSSCI-10101"
    title: "Add status endpoint"
    points: 1
    status: in_progress
    workflow: "tdd"
    phase: review
    branch: "feat/101-1-status-endpoint"
    ---

    # 101-1: Add status endpoint

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No deviations from spec.

    ### Dev (implementation)
    - No deviations from spec.

    ## Dev Assessment

    **Implementation complete.** Added /status endpoint.

    ## Reviewer Assessment

    **Approved.** Straightforward addition.
""")

SESSION_DEVIATIONS_WITH_BREAKING = textwrap.dedent("""\
    ---
    story_id: "105-3"
    jira_key: "MSSCI-10503"
    title: "Add filter expressions"
    points: 5
    status: in_progress
    workflow: "tdd"
    phase: review
    branch: "feat/105-3-filter-expressions"
    ---

    # 105-3: Add filter expressions

    ## Design Deviations

    <!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No deviations from spec.

    ### Dev (implementation)
    - **No ! as NOT alternative**
      - Spec source: context-story-5-2.md, AC-1
      - Spec text: "Support ! prefix for boolean negation"
      - Implementation: Only 'not' keyword supported, no ! operator
      - Rationale: Ambiguity with shell history expansion in CLI context
      - Severity: major
      - Forward impact: breaking — Story 5-3 assumes ! is available for filter expressions

    ## Dev Assessment

    **Implementation complete.** Added filter expression parser.

    ## Reviewer Assessment

    **Approved with conditions.** Breaking deviation needs tracking.
""")


@pytest.fixture
def session_with_deviations(tmp_path: Path) -> Path:
    p = tmp_path / "150-2-session.md"
    p.write_text(SESSION_WITH_DEVIATIONS)
    return p


@pytest.fixture
def session_no_deviations(tmp_path: Path) -> Path:
    p = tmp_path / "80-3-session.md"
    p.write_text(SESSION_NO_DEVIATIONS_SECTION)
    return p


@pytest.fixture
def session_empty_deviations(tmp_path: Path) -> Path:
    p = tmp_path / "101-1-session.md"
    p.write_text(SESSION_EMPTY_DEVIATIONS)
    return p


@pytest.fixture
def session_breaking_deviation(tmp_path: Path) -> Path:
    p = tmp_path / "105-3-session.md"
    p.write_text(SESSION_DEVIATIONS_WITH_BREAKING)
    return p


# ─── AC1: Design Deviations section present ─────────────────────────────


class TestDeviationsSectionPresent:
    """AC1: PR body includes a Design Deviations section when session has deviations."""

    def test_has_design_deviations_section(self, session_with_deviations: Path):
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "## Design Deviations" in md

    def test_deviations_section_after_details(self, session_with_deviations: Path):
        """Deviations appear after Details section in the PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        details_pos = md.index("## Details")
        deviations_pos = md.index("## Design Deviations")
        assert deviations_pos > details_pos

    def test_still_has_all_original_sections(self, session_with_deviations: Path):
        """Adding Deviations doesn't remove any existing sections."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "## Summary" in md
        assert "## What Was Done" in md
        assert "## What This Work Revealed (Impact Summary)" in md
        assert "## Docs That May Need Updating" in md
        assert "## Details" in md
        assert "## Design Deviations" in md


# ─── AC2: Deviation content correctly extracted ──────────────────────────


class TestDeviationContent:
    """AC2: Deviation entries are extracted and formatted in the PR body."""

    def test_deviation_descriptions_included(self, session_with_deviations: Path):
        """Deviation short descriptions appear in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "property-based tests" in md.lower() or "property-based" in md
        assert "Jinja2" in md or "jinja2" in md.lower()

    def test_severity_included(self, session_with_deviations: Path):
        """Severity levels from deviations appear in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "minor" in deviations_section.lower() or "major" in deviations_section.lower()

    def test_forward_impact_included(self, session_with_deviations: Path):
        """Forward impact from deviations appears in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        # Should show forward impact info
        assert "forward impact" in deviations_section.lower() or "impact" in deviations_section.lower()

    def test_breaking_deviation_highlighted(self, session_breaking_deviation: Path):
        """Breaking deviations are surfaced prominently."""
        result = generate_pr_body(session_breaking_deviation)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "breaking" in deviations_section.lower()

    def test_rationale_included(self, session_with_deviations: Path):
        """Deviation rationale appears in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        # At least one rationale should appear
        assert "edge cases" in deviations_section.lower() or "unwieldy" in deviations_section.lower()


# ─── AC3: Jargon translation in deviations ───────────────────────────────


class TestDeviationJargon:
    """AC3: Framework jargon in deviation headers is translated."""

    def test_no_tea_subsection_header_in_deviations(self, session_with_deviations: Path):
        """### TEA (test design) should be translated in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "### TEA" not in deviations_section

    def test_no_dev_subsection_header_in_deviations(self, session_with_deviations: Path):
        """### Dev (implementation) should be translated in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "### Dev" not in deviations_section

    def test_no_architect_subsection_header_in_deviations(self, session_with_deviations: Path):
        """### Architect (reconcile) should be translated in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "### Architect" not in deviations_section

    def test_no_spec_source_framework_refs(self, session_with_deviations: Path):
        """context-story-* spec source refs should not leak as framework jargon."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        # "Spec source" is an internal term — should be translated or omitted
        # The external audience doesn't know what "context-story" files are
        assert "context-story-" not in deviations_section


# ─── AC4: Section ordering ───────────────────────────────────────────────


class TestSectionOrdering:
    """AC4: Full section ordering with Design Deviations included."""

    def test_full_ordering_with_deviations(self, session_with_deviations: Path):
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        summary_pos = md.index("## Summary")
        done_pos = md.index("## What Was Done")
        impact_pos = md.index("## What This Work Revealed")
        docs_pos = md.index("## Docs That May Need Updating")
        details_pos = md.index("## Details")
        deviations_pos = md.index("## Design Deviations")
        assert summary_pos < done_pos < impact_pos < docs_pos < details_pos < deviations_pos


# ─── AC5: Backward compat — no deviations ────────────────────────────────


class TestDeviationsBackwardCompat:
    """AC5: Sessions without Design Deviations section degrade gracefully."""

    def test_no_deviations_section_still_succeeds(self, session_no_deviations: Path):
        result = generate_pr_body(session_no_deviations)
        assert result["success"] is True

    def test_no_deviations_section_omits_heading(self, session_no_deviations: Path):
        """When session has no Design Deviations, PR body should omit the section entirely."""
        result = generate_pr_body(session_no_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "## Design Deviations" not in md

    def test_empty_deviations_omits_heading(self, session_empty_deviations: Path):
        """When all agents wrote 'No deviations from spec', omit the section."""
        result = generate_pr_body(session_empty_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "## Design Deviations" not in md


# ─── AC6: Edge cases ─────────────────────────────────────────────────────


class TestDeviationEdgeCases:
    """AC6: Edge cases for deviation handling."""

    def test_single_agent_with_deviation(self, session_breaking_deviation: Path):
        """Session with only one agent having deviations."""
        result = generate_pr_body(session_breaking_deviation)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]
        assert "## Design Deviations" in md
        # The actual deviation content should be present
        assert "NOT alternative" in md or "not keyword" in md.lower()

    def test_no_deviation_markers_filtered(self, session_with_deviations: Path):
        """'No deviations from spec' markers should not appear in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "No deviations from spec" not in md

    def test_deviation_html_comment_filtered(self, session_with_deviations: Path):
        """HTML comments from session template should not appear in PR body."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        assert "<!-- Agents:" not in md

    def test_deviations_count_summary(self, session_with_deviations: Path):
        """Deviations section should include a count summary."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        # Should indicate how many deviations (2 real ones in this session)
        assert "2" in deviations_section or "two" in deviations_section.lower()

    def test_major_deviation_count(self, session_with_deviations: Path):
        """Should indicate how many major deviations exist."""
        result = generate_pr_body(session_with_deviations)
        md = result["data"]["pr_body_markdown"]
        deviations_start = md.index("## Design Deviations")
        deviations_section = md[deviations_start:]
        assert "major" in deviations_section.lower()
