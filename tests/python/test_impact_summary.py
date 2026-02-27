"""
Tests for Story 134-1: Add Impact Summary compilation to SM finish flow.

Tests the pf.findings.summary module — compile_impact_summary() and
write_impact_summary_to_session(). Validates all 7 ACs (FR1-FR7, FR15, R5, R6).

Run with: python -m pytest tests/python/test_impact_summary.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.findings.summary import compile_impact_summary, write_impact_summary_to_session

AGENTS_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "agents"

# ---------------------------------------------------------------------------
# Fixtures: parsed findings (output of parse_delivery_findings)
# ---------------------------------------------------------------------------

MIXED_FINDINGS = [
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing validation for empty input",
        "path": "src/parser.py",
        "what_changes": "add input guard",
        "agent": "TEA",
        "phase": "test design",
    },
    {
        "type": "Conflict",
        "urgency": "non-blocking",
        "description": "API contract differs from spec",
        "path": "docs/api.md",
        "what_changes": "update spec",
        "agent": "Reviewer",
        "phase": "code review",
    },
    {
        "type": "Improvement",
        "urgency": "non-blocking",
        "description": "Could extract helper for reuse",
        "path": "src/utils.py",
        "what_changes": "extract shared logic",
        "agent": "Dev",
        "phase": "implementation",
    },
]

BLOCKING_ONLY = [
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing auth middleware",
        "path": "src/auth.py",
        "what_changes": "add middleware",
        "agent": "TEA",
        "phase": "test design",
    },
    {
        "type": "Conflict",
        "urgency": "blocking",
        "description": "Schema version mismatch",
        "path": "migrations/v2.sql",
        "what_changes": "align versions",
        "agent": "Reviewer",
        "phase": "code review",
    },
]

MULTIPLE_SAME_TYPE = [
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing error handler",
        "path": "src/handler.py",
        "what_changes": "add handler",
        "agent": "TEA",
        "phase": "test design",
    },
    {
        "type": "Gap",
        "urgency": "non-blocking",
        "description": "Missing docs for public API",
        "path": "docs/public-api.md",
        "what_changes": "write docs",
        "agent": "Dev",
        "phase": "implementation",
    },
    {
        "type": "Gap",
        "urgency": "blocking",
        "description": "Missing retry logic",
        "path": "src/client.py",
        "what_changes": "add retry",
        "agent": "Reviewer",
        "phase": "code review",
    },
]

ALL_NO_FINDINGS = [
    {"type": "none", "agent": "TEA"},
    {"type": "none", "agent": "Dev"},
    {"type": "none", "agent": "Reviewer"},
]

# ---------------------------------------------------------------------------
# Fixtures: session file content
# ---------------------------------------------------------------------------

SESSION_WITH_MIXED_FINDINGS = textwrap.dedent("""\
    # Story 99-1: Test Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Delivery Findings

    Agents record upstream observations discovered during their phase.
    Each finding is one list item. Use "No upstream findings" if none.

    **Types:** Gap, Conflict, Question, Improvement
    **Urgency:** blocking, non-blocking

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing validation for empty input. Affects `src/parser.py` (add input guard). *Found by TEA during test design.*

    ### Dev (implementation)
    - No upstream findings.

    ### Reviewer (code review)
    - **Conflict** (non-blocking): API contract differs from spec. Affects `docs/api.md` (update spec). *Found by Reviewer during code review.*
    - **Improvement** (non-blocking): Could extract helper for reuse. Affects `src/utils.py` (extract shared logic). *Found by Dev during implementation.*

    ## TEA Assessment

    **Tests Required:** Yes

    ## Dev Assessment

    **Implementation:** Complete
""")

SESSION_ALL_NO_FINDINGS = textwrap.dedent("""\
    # Story 99-2: Chore Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Delivery Findings

    Agents record upstream observations discovered during their phase.

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - No upstream findings.

    ### Dev (implementation)
    - No upstream findings.

    ## TEA Assessment

    **Tests Required:** No
""")

SESSION_NO_DELIVERY_SECTION = textwrap.dedent("""\
    # Story 88-1: Legacy Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## TEA Assessment

    **Tests Required:** Yes
""")

SESSION_WITH_BLOCKING = textwrap.dedent("""\
    # Story 99-3: Blocking Story

    ## Workflow Tracking
    **Workflow:** tdd
    **Phase:** finish

    ## Delivery Findings

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ### TEA (test design)
    - **Gap** (blocking): Missing auth middleware. Affects `src/auth.py` (add middleware). *Found by TEA during test design.*

    ### Reviewer (code review)
    - **Conflict** (blocking): Schema version mismatch. Affects `migrations/v2.sql` (align versions). *Found by Reviewer during code review.*
    - **Improvement** (non-blocking): Could use type hints. Affects `src/utils.py` (add types). *Found by Reviewer during code review.*

    ## TEA Assessment

    **Tests Required:** Yes
""")

# Only the no-findings marker, no agent subheadings
SESSION_BARE_NO_FINDINGS = textwrap.dedent("""\
    # Story 99-4: Bare Story

    ## Delivery Findings

    Agents record upstream observations discovered during their phase.

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    No upstream findings at story setup.

    ## SM Assessment

    Done.
""")


# =============================================================================
# AC1: Standard Compilation (FR1, FR2, FR4, FR5, FR15)
# =============================================================================


class TestStandardCompilation:
    """AC1: Given findings, compile Impact Summary with counts and descriptions."""

    def test_returns_success_result_object(self):
        """compile_impact_summary must return {success, data} result object."""
        result = compile_impact_summary(MIXED_FINDINGS)
        assert result["success"] is True
        assert "data" in result
        assert "markdown" in result["data"]

    def test_upstream_effects_count_line(self):
        """Impact Summary must contain count line: N findings (N Gap, N Conflict, ...)."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        assert "**Upstream Effects:** 3 findings (1 Gap, 1 Conflict, 0 Question, 1 Improvement)" in md

    def test_contains_section_header(self):
        """Output must start with ## Impact Summary."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        assert md.strip().startswith("## Impact Summary")

    def test_one_line_per_finding(self):
        """Each finding gets one line: - **{Type}:** {description}. Affects `{path}`."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        assert "- **Gap:** Missing validation for empty input. Affects `src/parser.py`." in md
        assert "- **Conflict:** API contract differs from spec. Affects `docs/api.md`." in md
        assert "- **Improvement:** Could extract helper for reuse. Affects `src/utils.py`." in md

    def test_findings_from_different_agents_all_included(self):
        """Findings from TEA, Reviewer, Dev must all appear in output."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        # All three findings present regardless of which agent reported them
        assert "Missing validation for empty input" in md
        assert "API contract differs from spec" in md
        assert "Could extract helper for reuse" in md

    def test_multiple_findings_same_type_counted_correctly(self):
        """3 Gaps (2 blocking, 1 non-blocking) must count as 3 Gap."""
        result = compile_impact_summary(MULTIPLE_SAME_TYPE)
        md = result["data"]["markdown"]
        assert "3 findings (3 Gap, 0 Conflict, 0 Question, 0 Improvement)" in md

    def test_long_descriptions_not_truncated(self):
        """Finding with a long description must appear in full, not truncated."""
        long_desc = "This is a very long description that explains in great detail what the issue is and why it matters for the system architecture and future maintainability of the codebase"
        findings = [
            {
                "type": "Gap",
                "urgency": "non-blocking",
                "description": long_desc,
                "path": "src/big.py",
                "what_changes": "fix it",
                "agent": "TEA",
                "phase": "test design",
            },
        ]
        result = compile_impact_summary(findings)
        md = result["data"]["markdown"]
        assert long_desc in md

    def test_finding_count_in_data(self):
        """Result data must include finding_count."""
        result = compile_impact_summary(MIXED_FINDINGS)
        assert result["data"]["finding_count"] == 3

    def test_none_type_entries_excluded_from_count(self):
        """Entries with type='none' (no-findings markers) are not counted."""
        mixed_with_none = MIXED_FINDINGS + [{"type": "none", "agent": "SM"}]
        result = compile_impact_summary(mixed_with_none)
        assert result["data"]["finding_count"] == 3


# =============================================================================
# AC2: Blocking Items (FR3)
# =============================================================================


class TestBlockingItems:
    """AC2: Blocking findings get BLOCKING prefix and are listed first."""

    def test_blocking_prefix_present(self):
        """When blocking findings exist, output must contain **BLOCKING:** line."""
        result = compile_impact_summary(MIXED_FINDINGS)  # 1 blocking
        md = result["data"]["markdown"]
        assert "**BLOCKING:**" in md

    def test_blocking_findings_listed_first(self):
        """Blocking findings must appear before non-blocking findings."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        # Find positions of blocking vs non-blocking findings
        blocking_pos = md.find("Missing validation for empty input")  # blocking
        nonblocking_pos = md.find("API contract differs from spec")  # non-blocking
        assert blocking_pos < nonblocking_pos, "Blocking findings must come before non-blocking"

    def test_multiple_blocking_items_all_listed(self):
        """Multiple blocking items must all appear under BLOCKING prefix."""
        result = compile_impact_summary(BLOCKING_ONLY)
        md = result["data"]["markdown"]
        assert "Missing auth middleware" in md
        assert "Schema version mismatch" in md

    def test_blocking_count_in_data(self):
        """Result data must include blocking_count."""
        result = compile_impact_summary(MIXED_FINDINGS)
        assert result["data"]["blocking_count"] == 1

    def test_blocking_count_with_multiple(self):
        result = compile_impact_summary(BLOCKING_ONLY)
        assert result["data"]["blocking_count"] == 2

    def test_mix_blocking_nonblocking_ordering(self):
        """With both blocking and non-blocking, all blocking come first."""
        findings = BLOCKING_ONLY + [
            {
                "type": "Improvement",
                "urgency": "non-blocking",
                "description": "Could use type hints",
                "path": "src/utils.py",
                "what_changes": "add types",
                "agent": "Reviewer",
                "phase": "code review",
            },
        ]
        result = compile_impact_summary(findings)
        md = result["data"]["markdown"]
        # Both blocking findings before the non-blocking one
        blocking1_pos = md.find("Missing auth middleware")
        blocking2_pos = md.find("Schema version mismatch")
        nonblocking_pos = md.find("Could use type hints")
        assert blocking1_pos < nonblocking_pos
        assert blocking2_pos < nonblocking_pos

    def test_no_blocking_findings_shows_none(self):
        """When no blocking findings, Blocking line should show None."""
        nonblocking_only = [
            {
                "type": "Improvement",
                "urgency": "non-blocking",
                "description": "Minor cleanup",
                "path": "src/a.py",
                "what_changes": "clean up",
                "agent": "Dev",
                "phase": "implementation",
            },
        ]
        result = compile_impact_summary(nonblocking_only)
        md = result["data"]["markdown"]
        assert "**Blocking:** None" in md
        assert "**BLOCKING:**" not in md


# =============================================================================
# AC3: No Findings (FR6)
# =============================================================================


class TestNoFindings:
    """AC3: When all agents wrote 'No upstream findings'."""

    def test_empty_list_produces_no_effects(self):
        """Empty findings list → 'No upstream effects noted'."""
        result = compile_impact_summary([])
        md = result["data"]["markdown"]
        assert "**Upstream Effects:** No upstream effects noted" in md

    def test_all_none_entries_produces_no_effects(self):
        """List of only type='none' entries → 'No upstream effects noted'."""
        result = compile_impact_summary(ALL_NO_FINDINGS)
        md = result["data"]["markdown"]
        assert "**Upstream Effects:** No upstream effects noted" in md

    def test_no_findings_blocking_none(self):
        """No findings → '**Blocking:** None'."""
        result = compile_impact_summary([])
        md = result["data"]["markdown"]
        assert "**Blocking:** None" in md

    def test_no_findings_count_zero(self):
        result = compile_impact_summary([])
        assert result["data"]["finding_count"] == 0
        assert result["data"]["blocking_count"] == 0

    def test_no_findings_still_has_section_header(self):
        """Even with no findings, output must have ## Impact Summary header."""
        result = compile_impact_summary([])
        md = result["data"]["markdown"]
        assert "## Impact Summary" in md


# =============================================================================
# AC4: Missing Section Backward Compat
# =============================================================================


class TestMissingSectionBackwardCompat:
    """AC4: Legacy sessions without ## Delivery Findings must not error."""

    def test_no_delivery_section_still_succeeds(self, tmp_path):
        """write_impact_summary_to_session on legacy file → success, no error."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DELIVERY_SECTION)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True

    def test_no_delivery_section_generates_fallback(self, tmp_path):
        """Legacy file → 'No upstream effects noted' in Impact Summary."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DELIVERY_SECTION)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "## Impact Summary" in content
        assert "No upstream effects noted" in content

    def test_no_delivery_section_no_error_key(self, tmp_path):
        """Result must not have error set."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DELIVERY_SECTION)
        result = write_impact_summary_to_session(session)
        assert result.get("error") is None


# =============================================================================
# AC5: Section Placement (R5)
# =============================================================================


class TestSectionPlacement:
    """AC5: Impact Summary placed after Delivery Findings, before assessments."""

    def test_after_delivery_findings(self, tmp_path):
        """## Impact Summary must come after ## Delivery Findings."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        df_pos = content.find("## Delivery Findings")
        is_pos = content.find("## Impact Summary")
        assert is_pos > df_pos, "Impact Summary must be after Delivery Findings"

    def test_before_tea_assessment(self, tmp_path):
        """## Impact Summary must come before ## TEA Assessment."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        is_pos = content.find("## Impact Summary")
        tea_pos = content.find("## TEA Assessment")
        assert is_pos < tea_pos, "Impact Summary must be before TEA Assessment"

    def test_before_dev_assessment(self, tmp_path):
        """## Impact Summary must come before ## Dev Assessment."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        is_pos = content.find("## Impact Summary")
        dev_pos = content.find("## Dev Assessment")
        assert is_pos < dev_pos, "Impact Summary must be before Dev Assessment"

    def test_placement_with_no_findings_session(self, tmp_path):
        """Even in no-findings session, placement rule holds."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_ALL_NO_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        df_pos = content.find("## Delivery Findings")
        is_pos = content.find("## Impact Summary")
        tea_pos = content.find("## TEA Assessment")
        assert df_pos < is_pos < tea_pos

    def test_placement_with_legacy_session(self, tmp_path):
        """Legacy session: Impact Summary before any assessment section."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_NO_DELIVERY_SECTION)
        write_impact_summary_to_session(session)
        content = session.read_text()
        is_pos = content.find("## Impact Summary")
        tea_pos = content.find("## TEA Assessment")
        assert is_pos < tea_pos, "Impact Summary must be before assessments even in legacy sessions"


# =============================================================================
# AC6: Archive Preservation (FR7)
# =============================================================================


class TestArchivePreservation:
    """AC6: Impact Summary is standard markdown — no special tokens that break archiving."""

    def test_output_is_pure_markdown(self):
        """Compiled Impact Summary must be valid markdown with no HTML or special tokens."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        # No HTML comments or special processing instructions
        assert "<!--" not in md
        assert "<!" not in md
        # Standard markdown headings and bold
        assert "## Impact Summary" in md
        assert "**Upstream Effects:**" in md

    def test_section_survives_write_read_cycle(self, tmp_path):
        """Write Impact Summary, read it back — content identical."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content_after_write = session.read_text()
        # Simulate archive: read content, write to new file, read again
        archive = tmp_path / "archived-session.md"
        archive.write_text(content_after_write)
        archived_content = archive.read_text()
        # Impact Summary section must be identical
        assert "## Impact Summary" in archived_content
        is_start = archived_content.find("## Impact Summary")
        # Find end of Impact Summary section (next ## heading)
        rest = archived_content[is_start + len("## Impact Summary"):]
        next_heading = rest.find("\n## ")
        if next_heading >= 0:
            impact_section = archived_content[is_start:is_start + len("## Impact Summary") + next_heading]
        else:
            impact_section = archived_content[is_start:]
        # Same section in original
        orig_start = content_after_write.find("## Impact Summary")
        orig_rest = content_after_write[orig_start + len("## Impact Summary"):]
        orig_next = orig_rest.find("\n## ")
        if orig_next >= 0:
            orig_section = content_after_write[orig_start:orig_start + len("## Impact Summary") + orig_next]
        else:
            orig_section = content_after_write[orig_start:]
        assert impact_section == orig_section


# =============================================================================
# AC7: Verbatim Compilation (R6)
# =============================================================================


class TestVerbatimCompilation:
    """AC7: Finding descriptions taken verbatim from R1 entries."""

    def test_descriptions_match_input_exactly(self):
        """Each description in output must match the input finding exactly."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        for finding in MIXED_FINDINGS:
            assert finding["description"] in md, (
                f"Description not found verbatim in output: {finding['description']!r}"
            )

    def test_paths_match_input_exactly(self):
        """Each path in output must match the input finding exactly."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        for finding in MIXED_FINDINGS:
            assert f"`{finding['path']}`" in md, (
                f"Path not found verbatim in output: {finding['path']!r}"
            )

    def test_no_rewording(self):
        """Descriptions with specific technical terms must not be paraphrased."""
        findings = [
            {
                "type": "Gap",
                "urgency": "blocking",
                "description": "Missing `validate()` call in parse_input()",
                "path": "src/parser.py",
                "what_changes": "add call",
                "agent": "TEA",
                "phase": "test design",
            },
        ]
        result = compile_impact_summary(findings)
        md = result["data"]["markdown"]
        # Exact description must appear — not "validation missing" or "needs validate call"
        assert "Missing `validate()` call in parse_input()" in md

    def test_types_match_original(self):
        """Finding types in one-liner must match original type exactly."""
        result = compile_impact_summary(MIXED_FINDINGS)
        md = result["data"]["markdown"]
        assert "- **Gap:**" in md
        assert "- **Conflict:**" in md
        assert "- **Improvement:**" in md


# =============================================================================
# write_impact_summary_to_session() — general behavior
# =============================================================================


class TestWriteImpactSummary:
    """General behavior of write_impact_summary_to_session."""

    def test_returns_result_object(self, tmp_path):
        """Must return {success, data/error} result object."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert "success" in result

    def test_nonexistent_file_returns_error(self, tmp_path):
        """Non-existent file → {success: False, error: ...}."""
        session = tmp_path / "does-not-exist.md"
        result = write_impact_summary_to_session(session)
        assert result["success"] is False
        assert result["error"] is not None

    def test_writes_impact_summary_section(self, tmp_path):
        """After calling, session file must contain ## Impact Summary."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "## Impact Summary" in content

    def test_preserves_existing_content(self, tmp_path):
        """Existing session content (story header, assessments) must not be lost."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "# Story 99-1: Test Story" in content
        assert "## TEA Assessment" in content
        assert "## Dev Assessment" in content
        assert "## Delivery Findings" in content

    def test_preserves_existing_findings(self, tmp_path):
        """R1 findings in Delivery Findings section must not be modified."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert "### TEA (test design)" in content
        assert "Missing validation for empty input" in content

    def test_idempotent_no_duplicate_sections(self, tmp_path):
        """Calling twice must not create duplicate ## Impact Summary sections."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        write_impact_summary_to_session(session)
        write_impact_summary_to_session(session)
        content = session.read_text()
        assert content.count("## Impact Summary") == 1

    def test_data_includes_counts(self, tmp_path):
        """Result data must include finding_count and blocking_count."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_MIXED_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert result["data"]["finding_count"] >= 0
        assert result["data"]["blocking_count"] >= 0

    def test_bare_no_findings_session(self, tmp_path):
        """Session with just setup marker 'No upstream findings at story setup.' → no effects."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_BARE_NO_FINDINGS)
        result = write_impact_summary_to_session(session)
        assert result["success"] is True
        content = session.read_text()
        assert "No upstream effects noted" in content


# =============================================================================
# Agent markdown structural tests
# =============================================================================


class TestSmFinishMarkdown:
    """Validate sm-finish.md references Impact Summary compilation."""

    def test_sm_finish_mentions_impact_summary(self):
        """sm-finish.md must contain instructions for Impact Summary compilation."""
        sm_finish_md = (AGENTS_DIR / "sm-finish.md").read_text()
        assert "Impact Summary" in sm_finish_md, (
            "sm-finish.md must reference Impact Summary compilation"
        )

    def test_sm_finish_references_compile_function(self):
        """sm-finish.md must reference the compile function or module."""
        sm_finish_md = (AGENTS_DIR / "sm-finish.md").read_text()
        assert "compile_impact_summary" in sm_finish_md or "pf.findings.summary" in sm_finish_md, (
            "sm-finish.md must reference compile_impact_summary or pf.findings.summary module"
        )

    def test_sm_md_references_impact_summary(self):
        """sm.md must document Impact Summary in finish flow."""
        sm_md = (AGENTS_DIR / "sm.md").read_text()
        assert "Impact Summary" in sm_md, (
            "sm.md must reference Impact Summary in finish flow documentation"
        )
