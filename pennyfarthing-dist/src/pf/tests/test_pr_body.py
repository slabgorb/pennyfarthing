"""
Tests for pf.findings.pr_body — Boss-readable PR body generation.

Story 134-2: Generate boss-readable PR body from session file.

Tests cover:
  AC1: Return shape ({success, data: {pr_body_markdown}, error?})
  AC2: Six sections present (Summary, What Was Done, Impact Summary, Docs, Details)
  AC3: Framework jargon translation
  AC4: Backward compat (sessions without Impact Summary or Delivery Findings)
  AC5: Edge cases (missing file, empty, special chars, long content)
"""

import textwrap
from pathlib import Path

import pytest

from pf.findings.pr_body import generate_pr_body

# ─── Fixtures ────────────────────────────────────────────────────────────

MINIMAL_SESSION = textwrap.dedent("""\
    ---
    story_id: "99-1"
    jira_key: "MSSCI-99999"
    title: "Add widget caching"
    points: 3
    status: in_progress
    workflow: "tdd"
    phase: review
    branch: "feat/99-1-widget-caching"
    ---

    # 99-1: Add widget caching

    **Jira:** MSSCI-99999
    **Workflow:** tdd

    ## Acceptance Criteria

    1. Widget cache reduces DB queries by 50%
    2. Cache invalidation on widget update

    ## TEA Assessment

    **Tests Required:** Yes
    **Tests Written:** 8 tests covering 2 ACs
    **Status:** RED confirmed

    ## Dev Assessment

    **Implementation complete.** Added LRU cache with TTL-based expiry.
    Used adapter pattern for cache backend flexibility.

    ## Reviewer Assessment

    **Approved.** Clean implementation, good test coverage.
    Minor suggestion: add cache hit/miss metrics.
""")

SESSION_WITH_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "100-2"
    jira_key: "MSSCI-10002"
    title: "Implement event broadcast"
    points: 5
    status: in_progress
    workflow: "tdd"
    phase: review
    branch: "feat/100-2-event-broadcast"
    ---

    # 100-2: Implement event broadcast

    **Jira:** MSSCI-10002
    **Workflow:** tdd

    ## Acceptance Criteria

    1. Events broadcast to all connected clients
    2. Event batching reduces network traffic by 60%
    3. Graceful degradation when WebSocket unavailable

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (non-blocking): WebSocket reconnection not covered by test suite. Affects `packages/core/src/ws/reconnect.ts` (add reconnection integration test). *Found by TEA during test design.*

    ### Dev (implementation)
    - **Improvement** (blocking): Event batching should use requestAnimationFrame for browser clients. Affects `packages/core/src/events/batcher.ts` (switch from setTimeout to rAF). *Found by Dev during implementation.*
    - **Question** (non-blocking): Should we support SSE fallback or just WebSocket? Affects `packages/core/src/events/transport.ts` (add SSE adapter if needed). *Found by Dev during implementation.*

    ## Impact Summary

    **Upstream Effects:** 3 findings (1 Gap, 0 Conflict, 1 Question, 1 Improvement)
    **Blocking:** 1 BLOCKING items — see below

    **BLOCKING:**
    - **Improvement:** Event batching should use requestAnimationFrame for browser clients. Affects `packages/core/src/events/batcher.ts`.

    - **Gap:** WebSocket reconnection not covered by test suite. Affects `packages/core/src/ws/reconnect.ts`.
    - **Question:** Should we support SSE fallback or just WebSocket? Affects `packages/core/src/events/transport.ts`.

    ## TEA Assessment

    **Tests Required:** Yes
    **Tests Written:** 12 tests covering 3 ACs
    **Status:** RED confirmed
    **Handoff:** To Dev for implementation

    ## Dev Assessment

    **Implementation complete.** Added WebSocket broadcast with event batching.
    Used observer pattern for client subscription management.
    Trade-off: chose setTimeout over rAF for Node.js server compat.

    ## Reviewer Assessment

    **Approved with conditions.** Implementation is solid but blocking finding
    about rAF should be tracked. Test coverage comprehensive.
""")

SESSION_WITHOUT_IMPACT_SUMMARY = textwrap.dedent("""\
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

    ## Acceptance Criteria

    1. Config loader uses YAML 1.2 parser
    2. Backward compat with existing config files

    ## Dev Assessment

    **Implementation complete.** Swapped yaml.load for yaml.safe_load.
    No breaking changes to config format.

    ## Reviewer Assessment

    **Approved.** Simple, clean refactor.
""")

SESSION_EMPTY_FINDINGS = textwrap.dedent("""\
    ---
    story_id: "101-1"
    jira_key: "MSSCI-10101"
    title: "Add status endpoint"
    points: 1
    status: in_progress
    workflow: "trivial"
    phase: review
    branch: "feat/101-1-status-endpoint"
    ---

    # 101-1: Add status endpoint

    **Jira:** MSSCI-10101
    **Workflow:** trivial

    ## Acceptance Criteria

    1. GET /status returns 200 with version info

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### Dev (implementation)
    - No upstream findings.

    ## Impact Summary

    **Upstream Effects:** No upstream effects noted
    **Blocking:** None

    ## Dev Assessment

    **Implementation complete.** Added /status endpoint with version from package.json.

    ## Reviewer Assessment

    **Approved.** Straightforward addition.
""")


@pytest.fixture
def session_file(tmp_path: Path) -> Path:
    """Create a minimal session file."""
    p = tmp_path / "99-1-session.md"
    p.write_text(MINIMAL_SESSION)
    return p


@pytest.fixture
def session_with_findings(tmp_path: Path) -> Path:
    """Create a session file with Delivery Findings and Impact Summary."""
    p = tmp_path / "100-2-session.md"
    p.write_text(SESSION_WITH_FINDINGS)
    return p


@pytest.fixture
def session_without_impact(tmp_path: Path) -> Path:
    """Create a pre-134-1 session without Impact Summary."""
    p = tmp_path / "80-3-session.md"
    p.write_text(SESSION_WITHOUT_IMPACT_SUMMARY)
    return p


@pytest.fixture
def session_empty_findings(tmp_path: Path) -> Path:
    """Create a session with empty findings (no upstream effects)."""
    p = tmp_path / "101-1-session.md"
    p.write_text(SESSION_EMPTY_FINDINGS)
    return p


# ─── AC1: Return shape ──────────────────────────────────────────────────


class TestReturnShape:
    """AC1: generate_pr_body returns {success, data/error} result dict."""

    def test_success_returns_dict_with_success_true(self, session_file: Path):
        result = generate_pr_body(session_file)
        assert isinstance(result, dict)
        assert result["success"] is True

    def test_success_has_data_with_pr_body_markdown(self, session_file: Path):
        result = generate_pr_body(session_file)
        assert "data" in result
        assert "pr_body_markdown" in result["data"]
        assert isinstance(result["data"]["pr_body_markdown"], str)

    def test_pr_body_markdown_is_nonempty(self, session_file: Path):
        result = generate_pr_body(session_file)
        assert len(result["data"]["pr_body_markdown"].strip()) > 0

    def test_missing_file_returns_success_false(self, tmp_path: Path):
        missing = tmp_path / "nonexistent-session.md"
        result = generate_pr_body(missing)
        assert result["success"] is False
        assert "error" in result
        assert isinstance(result["error"], str)

    def test_error_result_has_no_data(self, tmp_path: Path):
        missing = tmp_path / "nonexistent-session.md"
        result = generate_pr_body(missing)
        assert result.get("data") is None


# ─── AC2: Six sections present ──────────────────────────────────────────


class TestSixSections:
    """AC2: PR body includes all six mandatory sections."""

    def test_has_summary_section(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "## Summary" in md

    def test_has_what_was_done_section(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "## What Was Done" in md

    def test_has_impact_summary_section(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "## What This Work Revealed (Impact Summary)" in md

    def test_has_docs_section(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "## Docs That May Need Updating" in md

    def test_has_details_section(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "## Details" in md

    def test_details_has_test_design_subsection(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "### Test Design" in md

    def test_details_has_implementation_subsection(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "### Implementation" in md

    def test_details_has_code_review_subsection(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        assert "### Code Review" in md

    def test_details_has_full_findings_subsection(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        assert "### Full Findings" in md

    def test_sections_in_correct_order(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        summary_pos = md.index("## Summary")
        done_pos = md.index("## What Was Done")
        impact_pos = md.index("## What This Work Revealed")
        docs_pos = md.index("## Docs That May Need Updating")
        details_pos = md.index("## Details")
        assert summary_pos < done_pos < impact_pos < docs_pos < details_pos


# ─── AC2: Section content ───────────────────────────────────────────────


class TestSectionContent:
    """AC2: Sections contain correct data extracted from session."""

    def test_summary_includes_story_title(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        # Title is "Add widget caching"
        assert "widget caching" in md.lower() or "Add widget caching" in md

    def test_impact_section_includes_findings_from_session(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # Should include content from Impact Summary
        assert "BLOCKING" in md or "blocking" in md.lower()

    def test_impact_section_fallback_when_no_summary(self, session_without_impact: Path):
        result = generate_pr_body(session_without_impact)
        md = result["data"]["pr_body_markdown"]
        # Should have a graceful fallback message
        assert "no upstream effects" in md.lower() or "none" in md.lower()

    def test_details_test_design_from_tea_assessment(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        # TEA assessment mentions "8 tests covering 2 ACs"
        test_design_start = md.index("### Test Design")
        impl_start = md.index("### Implementation")
        test_design_section = md[test_design_start:impl_start]
        assert "8 tests" in test_design_section or "test" in test_design_section.lower()

    def test_details_implementation_from_dev_assessment(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        # Dev assessment mentions "LRU cache" or "adapter pattern"
        impl_start = md.index("### Implementation")
        review_start = md.index("### Code Review")
        impl_section = md[impl_start:review_start]
        assert "cache" in impl_section.lower() or "adapter" in impl_section.lower()

    def test_details_code_review_from_reviewer_assessment(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        # Reviewer says "Approved"
        review_start = md.index("### Code Review")
        review_section = md[review_start:]
        assert "approved" in review_section.lower()


# ─── AC3: Jargon translation ────────────────────────────────────────────


class TestJargonTranslation:
    """AC3: Framework jargon is translated to plain language."""

    def test_no_tea_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # "TEA" as an agent reference should not appear (but "Test Design" should)
        # Check that TEA doesn't appear outside the Details subsections where it might be quoted
        summary_to_details = md[: md.index("## Details")]
        assert "TEA" not in summary_to_details

    def test_no_dev_agent_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        summary_to_details = md[: md.index("## Details")]
        # "Dev" as an agent name should be translated to "Implementation"
        # "Dev Assessment" should not appear in the summary-level sections
        assert "Dev Assessment" not in summary_to_details

    def test_no_reviewer_agent_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        summary_to_details = md[: md.index("## Details")]
        assert "Reviewer Assessment" not in summary_to_details

    def test_no_red_green_phase_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # "RED" and "GREEN" as phase names should not appear
        # Be careful: "red" could appear in normal english text
        assert "RED phase" not in md
        assert "GREEN phase" not in md
        assert "Red Phase" not in md
        assert "Green Phase" not in md

    def test_no_sm_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # "SM" as agent should not appear (can appear in other contexts)
        assert "SM Assessment" not in md
        assert "SM agent" not in md

    def test_subsection_headers_use_plain_language(self, session_file: Path):
        result = generate_pr_body(session_file)
        md = result["data"]["pr_body_markdown"]
        # Subsection headers should use translated names
        assert "### Test Design" in md
        assert "### Implementation" in md
        assert "### Code Review" in md
        # Should NOT use framework terms
        assert "### TEA" not in md
        assert "### Dev" not in md
        assert "### Reviewer" not in md

    def test_no_workflow_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # "tdd" workflow name should not leak into PR body
        assert "tdd" not in md.lower().split("## details")[0]

    def test_no_phase_log_references(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        assert "Phase Log" not in md


# ─── AC4: Backward compatibility ────────────────────────────────────────


class TestBackwardCompat:
    """AC4: Handles sessions from before Impact Summary (pre-134-1)."""

    def test_session_without_impact_summary_succeeds(self, session_without_impact: Path):
        result = generate_pr_body(session_without_impact)
        assert result["success"] is True

    def test_session_without_impact_summary_has_all_sections(self, session_without_impact: Path):
        result = generate_pr_body(session_without_impact)
        md = result["data"]["pr_body_markdown"]
        assert "## Summary" in md
        assert "## What Was Done" in md
        assert "## What This Work Revealed (Impact Summary)" in md
        assert "## Details" in md

    def test_session_without_findings_succeeds(self, session_without_impact: Path):
        result = generate_pr_body(session_without_impact)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]
        assert "no upstream effects" in md.lower() or "none" in md.lower()

    def test_session_with_empty_findings_succeeds(self, session_empty_findings: Path):
        result = generate_pr_body(session_empty_findings)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]
        assert "no upstream effects" in md.lower() or "none" in md.lower()

    def test_session_without_tea_assessment(self, tmp_path: Path):
        """Session from trivial workflow has no TEA assessment."""
        content = textwrap.dedent("""\
            ---
            story_id: "50-1"
            title: "Fix typo in README"
            points: 1
            workflow: "trivial"
            ---

            # 50-1: Fix typo in README

            ## Dev Assessment

            Fixed typo in README.md line 42.

            ## Reviewer Assessment

            Approved. Typo fix confirmed.
        """)
        p = tmp_path / "50-1-session.md"
        p.write_text(content)
        result = generate_pr_body(p)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]
        assert "## Summary" in md
        assert "## Details" in md

    def test_session_without_reviewer_assessment(self, tmp_path: Path):
        """Session where review hasn't happened yet."""
        content = textwrap.dedent("""\
            ---
            story_id: "50-2"
            title: "Add logging helper"
            points: 2
            workflow: "tdd"
            ---

            # 50-2: Add logging helper

            ## TEA Assessment

            **Tests Written:** 4 tests

            ## Dev Assessment

            Added structured logging utility.
        """)
        p = tmp_path / "50-2-session.md"
        p.write_text(content)
        result = generate_pr_body(p)
        assert result["success"] is True


# ─── AC5: Edge cases ────────────────────────────────────────────────────


class TestEdgeCases:
    """AC5: Edge cases — missing file, empty session, special chars."""

    def test_nonexistent_file(self, tmp_path: Path):
        result = generate_pr_body(tmp_path / "ghost.md")
        assert result["success"] is False
        assert "error" in result

    def test_empty_session_file(self, tmp_path: Path):
        p = tmp_path / "empty-session.md"
        p.write_text("")
        result = generate_pr_body(p)
        # Should either fail gracefully or produce minimal output
        assert isinstance(result, dict)
        assert "success" in result

    def test_session_with_no_frontmatter(self, tmp_path: Path):
        p = tmp_path / "no-fm-session.md"
        p.write_text("# Story: Something\n\nJust prose, no YAML frontmatter.\n")
        result = generate_pr_body(p)
        assert isinstance(result, dict)
        assert "success" in result

    def test_special_characters_in_title(self, tmp_path: Path):
        content = textwrap.dedent("""\
            ---
            story_id: "77-1"
            title: "Handle <script> tags & \"quotes\" in user input"
            points: 2
            workflow: "tdd"
            ---

            # 77-1: Handle <script> tags & "quotes" in user input

            ## Dev Assessment

            Sanitized HTML entities in user-facing strings.
        """)
        p = tmp_path / "77-1-session.md"
        p.write_text(content)
        result = generate_pr_body(p)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]
        assert "script" in md.lower() or "quotes" in md.lower()

    def test_very_long_assessment(self, tmp_path: Path):
        long_text = "This is a detailed finding. " * 200
        content = textwrap.dedent(f"""\
            ---
            story_id: "88-1"
            title: "Performance optimization"
            points: 5
            workflow: "tdd"
            ---

            # 88-1: Performance optimization

            ## Dev Assessment

            {long_text}
        """)
        p = tmp_path / "88-1-session.md"
        p.write_text(content)
        result = generate_pr_body(p)
        assert result["success"] is True
        assert len(result["data"]["pr_body_markdown"]) > 0

    def test_path_accepts_string(self, session_file: Path):
        """Should accept string path, not just Path objects."""
        result = generate_pr_body(str(session_file))
        assert isinstance(result, dict)
        assert "success" in result


# ─── Integration: Full PR body structure ─────────────────────────────────


class TestFullPRBody:
    """Integration tests: validate complete PR body output."""

    def test_full_session_produces_valid_markdown(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        assert result["success"] is True
        md = result["data"]["pr_body_markdown"]

        # Valid markdown: all ## headers present
        h2_headers = [line for line in md.split("\n") if line.startswith("## ")]
        assert len(h2_headers) >= 5

    def test_full_session_includes_story_id_context(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # Should reference the story in some way (title, not internal ID)
        assert "event broadcast" in md.lower()

    def test_findings_preserved_in_impact_section(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # The blocking improvement about rAF should appear
        assert "requestAnimationFrame" in md or "rAF" in md

    def test_docs_section_extracted_from_findings(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        docs_start = md.index("## Docs That May Need Updating")
        details_start = md.index("## Details")
        docs_section = md[docs_start:details_start]
        # Should mention affected files from findings
        assert (
            "batcher" in docs_section.lower()
            or "reconnect" in docs_section.lower()
            or "transport" in docs_section.lower()
            or "None" in docs_section
        )

    def test_no_session_frontmatter_leaks(self, session_with_findings: Path):
        result = generate_pr_body(session_with_findings)
        md = result["data"]["pr_body_markdown"]
        # YAML frontmatter should not appear in PR body
        assert "---\nstory_id:" not in md
        assert 'workflow: "tdd"' not in md
        assert "phase: review" not in md
