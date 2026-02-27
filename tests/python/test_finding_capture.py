"""
Tests for Story 133-2: Add finding-capture to agent exit behaviors.

Tests the pf.findings.capture module — format, parse, and append delivery
findings in R1 format to session files.

Also validates agent markdown files contain finding-capture exit behavior
and reviewer-preflight allows optional PR_NUMBER.

Run with: python -m pytest tests/python/test_finding_capture.py -v
"""

from __future__ import annotations

import re
import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.findings.capture import (
    PHASE_NAMES,
    VALID_TYPES,
    VALID_URGENCIES,
    append_findings_to_session,
    format_finding,
    parse_delivery_findings,
)

AGENTS_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "agents"

# R1 format regex — must match:
# - **{Type}** ({urgency}): {description}. Affects `{path}` ({what}). *Found by {Agent} during {phase}.*
R1_PATTERN = re.compile(
    r"^- \*\*(?P<type>Gap|Conflict|Question|Improvement)\*\* "
    r"\((?P<urgency>blocking|non-blocking)\): "
    r"(?P<description>.+?)\. "
    r"Affects `(?P<path>[^`]+)` \((?P<what>[^)]+)\)\. "
    r"\*Found by (?P<agent>\w+) during (?P<phase>[^.]+)\.\*$"
)

# Session template with Delivery Findings section (matches 133-1 template)
SESSION_WITH_FINDINGS_SECTION = textwrap.dedent("""\
    # Story 99-1: Test Story

    **Jira:** MSSCI-99999
    **Status:** in-progress
    **Workflow:** tdd
    **Phase:** green
    **Repos:** pennyfarthing
    **Branch:** feat/99-1-test

    ---

    ## Delivery Findings

    Agents record upstream observations discovered during their phase.
    Each finding is one list item. Use "No upstream findings" if none.

    **Types:** Gap, Conflict, Question, Improvement
    **Urgency:** blocking, non-blocking

    <!-- Agents: append findings below this line. Do not edit other agents' entries. -->

    ## TEA Assessment

    **Tests Required:** Yes
""")

SESSION_WITH_EXISTING_FINDINGS = textwrap.dedent("""\
    # Story 99-1: Test Story

    **Jira:** MSSCI-99999
    **Status:** in-progress
    **Workflow:** tdd
    **Phase:** review
    **Repos:** pennyfarthing
    **Branch:** feat/99-1-test

    ---

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

    ## TEA Assessment

    **Tests Required:** Yes
""")

SESSION_WITHOUT_FINDINGS_SECTION = textwrap.dedent("""\
    # Story 99-1: Test Story

    **Jira:** MSSCI-99999
    **Status:** in-progress
    **Workflow:** tdd
    **Phase:** green

    ---

    ## TEA Assessment

    **Tests Required:** Yes
""")


# =============================================================================
# format_finding() tests
# =============================================================================


class TestFormatFinding:
    """Test R1 format string generation."""

    def test_gap_blocking_format(self):
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="Missing validation for empty input",
            path="src/parser.py",
            what_changes="add input guard",
            agent="TEA",
            phase="red",
        )
        assert result.startswith("- **Gap** (blocking):")
        assert "Affects `src/parser.py`" in result
        assert "*Found by TEA during test design.*" in result

    def test_improvement_nonblocking_format(self):
        result = format_finding(
            finding_type="Improvement",
            urgency="non-blocking",
            description="Could extract helper for reuse",
            path="src/utils.py",
            what_changes="extract shared logic",
            agent="Dev",
            phase="green",
        )
        assert result.startswith("- **Improvement** (non-blocking):")
        assert "*Found by Dev during implementation.*" in result

    def test_conflict_format(self):
        result = format_finding(
            finding_type="Conflict",
            urgency="blocking",
            description="API contract differs from spec",
            path="docs/api.md",
            what_changes="update spec to match implementation",
            agent="Reviewer",
            phase="review",
        )
        assert result.startswith("- **Conflict** (blocking):")
        assert "*Found by Reviewer during code review.*" in result

    def test_question_format(self):
        result = format_finding(
            finding_type="Question",
            urgency="non-blocking",
            description="Should retry logic use exponential backoff",
            path="src/client.py",
            what_changes="decide retry strategy",
            agent="TEA",
            phase="red",
        )
        assert result.startswith("- **Question** (non-blocking):")

    def test_all_types_produce_valid_r1(self):
        """Every valid type + urgency combo must produce R1-parseable output."""
        for ftype in VALID_TYPES:
            for urgency in VALID_URGENCIES:
                result = format_finding(
                    finding_type=ftype,
                    urgency=urgency,
                    description="Test description",
                    path="src/test.py",
                    what_changes="fix it",
                    agent="TEA",
                    phase="red",
                )
                assert R1_PATTERN.match(result), (
                    f"format_finding({ftype}, {urgency}) produced non-R1 output: {result!r}"
                )

    def test_invalid_type_raises(self):
        with pytest.raises(ValueError, match="type"):
            format_finding(
                finding_type="Bug",
                urgency="blocking",
                description="desc",
                path="p",
                what_changes="w",
                agent="TEA",
                phase="red",
            )

    def test_invalid_urgency_raises(self):
        with pytest.raises(ValueError, match="urgency"):
            format_finding(
                finding_type="Gap",
                urgency="critical",
                description="desc",
                path="p",
                what_changes="w",
                agent="TEA",
                phase="red",
            )

    def test_empty_description_raises(self):
        with pytest.raises(ValueError, match="description"):
            format_finding(
                finding_type="Gap",
                urgency="blocking",
                description="",
                path="p",
                what_changes="w",
                agent="TEA",
                phase="red",
            )

    def test_phase_mapped_to_human_name(self):
        """Phase 'red' should become 'test design' in output."""
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="Missing test",
            path="src/test.py",
            what_changes="add test",
            agent="TEA",
            phase="red",
        )
        assert "test design" in result
        assert "red" not in result.split("Found by")[1]

    def test_phase_green_mapped(self):
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="desc",
            path="p",
            what_changes="w",
            agent="Dev",
            phase="green",
        )
        assert "implementation" in result

    def test_phase_review_mapped(self):
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="desc",
            path="p",
            what_changes="w",
            agent="Reviewer",
            phase="review",
        )
        assert "code review" in result

    def test_unknown_phase_passes_through(self):
        """Phase not in PHASE_NAMES should pass through as-is."""
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="desc",
            path="p",
            what_changes="w",
            agent="SM",
            phase="setup",
        )
        assert "during setup.*" in result

    def test_description_with_backticks(self):
        """Backticks in description should not break R1 format."""
        result = format_finding(
            finding_type="Gap",
            urgency="blocking",
            description="Missing `validate()` call",
            path="src/parser.py",
            what_changes="add call",
            agent="TEA",
            phase="red",
        )
        assert "`validate()`" in result
        assert "Affects `src/parser.py`" in result

    def test_whitespace_only_description_raises(self):
        with pytest.raises(ValueError, match="description"):
            format_finding(
                finding_type="Gap",
                urgency="blocking",
                description="   ",
                path="p",
                what_changes="w",
                agent="TEA",
                phase="red",
            )


# =============================================================================
# parse_delivery_findings() tests
# =============================================================================


class TestParseDeliveryFindings:
    """Test extraction of findings from session markdown."""

    def test_parse_single_finding(self):
        content = SESSION_WITH_EXISTING_FINDINGS
        findings = parse_delivery_findings(content)
        structured = [f for f in findings if f.get("type") != "none"]
        assert len(structured) >= 1
        first = structured[0]
        assert first["type"] == "Gap"
        assert first["urgency"] == "blocking"
        assert first["agent"] == "TEA"

    def test_parse_no_findings_entry(self):
        content = SESSION_WITH_EXISTING_FINDINGS
        findings = parse_delivery_findings(content)
        none_entries = [f for f in findings if f.get("type") == "none"]
        assert len(none_entries) >= 1
        assert none_entries[0]["agent"] == "Dev"

    def test_parse_missing_section_returns_empty(self):
        findings = parse_delivery_findings(SESSION_WITHOUT_FINDINGS_SECTION)
        assert findings == []

    def test_parse_empty_section(self):
        findings = parse_delivery_findings(SESSION_WITH_FINDINGS_SECTION)
        assert findings == []

    def test_parse_multiple_agents(self):
        """Findings from different agents are all captured."""
        content = SESSION_WITH_EXISTING_FINDINGS
        findings = parse_delivery_findings(content)
        agents = {f["agent"] for f in findings}
        assert "TEA" in agents
        assert "Dev" in agents

    def test_parse_preserves_path(self):
        content = SESSION_WITH_EXISTING_FINDINGS
        findings = parse_delivery_findings(content)
        structured = [f for f in findings if f.get("type") != "none"]
        assert structured[0]["path"] == "src/parser.py"

    def test_parse_skips_malformed_findings(self):
        """Malformed R1 entries should be silently skipped."""
        content = SESSION_WITH_FINDINGS_SECTION.replace(
            "<!-- Agents: append findings below this line. Do not edit other agents' entries. -->",
            "<!-- Agents: append findings below this line. Do not edit other agents' entries. -->\n\n"
            "### TEA (test design)\n"
            "- **Gap** (blocking): valid finding. Affects `src/a.py` (fix). *Found by TEA during test design.*\n"
            "- This is not a valid R1 finding\n"
            "- **NotAType** (blocking): invalid type. Affects `src/b.py` (fix). *Found by TEA during test design.*\n",
        )
        findings = parse_delivery_findings(content)
        # Only the valid R1 finding should be parsed
        structured = [f for f in findings if f.get("type") != "none"]
        assert len(structured) == 1
        assert structured[0]["type"] == "Gap"


# =============================================================================
# append_findings_to_session() tests
# =============================================================================


class TestAppendFindings:
    """Test atomic session file finding appends."""

    def test_append_basic(self, tmp_path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_FINDINGS_SECTION)

        finding = (
            "- **Gap** (blocking): Missing test. "
            "Affects `src/test.py` (add test). "
            "*Found by TEA during test design.*"
        )
        result = append_findings_to_session(session, "TEA", "red", [finding])
        assert result["success"] is True

        updated = session.read_text()
        assert "### TEA (test design)" in updated
        assert finding in updated

    def test_append_preserves_existing(self, tmp_path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_EXISTING_FINDINGS)

        finding = (
            "- **Improvement** (non-blocking): Could use constants. "
            "Affects `src/config.py` (extract constants). "
            "*Found by Reviewer during code review.*"
        )
        result = append_findings_to_session(session, "Reviewer", "review", [finding])
        assert result["success"] is True

        updated = session.read_text()
        # R2 guardrail: existing TEA and Dev findings must be preserved
        assert "### TEA (test design)" in updated
        assert "Missing validation for empty input" in updated
        assert "### Dev (implementation)" in updated
        assert "No upstream findings" in updated
        # New reviewer findings appended
        assert "### Reviewer (code review)" in updated
        assert finding in updated

    def test_append_no_findings_explicit(self, tmp_path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_FINDINGS_SECTION)

        result = append_findings_to_session(session, "Dev", "green", [])
        assert result["success"] is True

        updated = session.read_text()
        assert "### Dev (implementation)" in updated
        assert "No upstream findings" in updated

    def test_append_missing_section_fails(self, tmp_path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITHOUT_FINDINGS_SECTION)

        result = append_findings_to_session(session, "TEA", "red", [])
        assert result["success"] is False
        assert "Delivery Findings" in result.get("error", "")

    def test_append_multiple_findings(self, tmp_path):
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_FINDINGS_SECTION)

        findings = [
            "- **Gap** (blocking): Missing input validation. Affects `src/parser.py` (add guard). *Found by TEA during test design.*",
            "- **Question** (non-blocking): Should we support nested inputs. Affects `src/parser.py` (decide nesting). *Found by TEA during test design.*",
        ]
        result = append_findings_to_session(session, "TEA", "red", findings)
        assert result["success"] is True

        updated = session.read_text()
        assert updated.count("*Found by TEA during test design.*") == 2

    def test_append_after_marker_comment(self, tmp_path):
        """Findings must appear after the HTML comment marker."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_FINDINGS_SECTION)

        finding = "- **Gap** (blocking): Test. Affects `p` (w). *Found by TEA during test design.*"
        append_findings_to_session(session, "TEA", "red", [finding])

        updated = session.read_text()
        marker_pos = updated.find("<!-- Agents: append findings below this line.")
        finding_pos = updated.find("### TEA (test design)")
        assert finding_pos > marker_pos, "Findings must appear after the marker comment"

    def test_append_nonexistent_file(self, tmp_path):
        """Appending to a non-existent file should return error."""
        session = tmp_path / "does-not-exist.md"
        result = append_findings_to_session(session, "TEA", "red", [])
        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_append_duplicate_agent_allowed(self, tmp_path):
        """Appending twice for same agent should create two blocks (no dedup)."""
        session = tmp_path / "session.md"
        session.write_text(SESSION_WITH_FINDINGS_SECTION)

        finding1 = "- **Gap** (blocking): First. Affects `a.py` (fix). *Found by TEA during test design.*"
        finding2 = "- **Gap** (blocking): Second. Affects `b.py` (fix). *Found by TEA during test design.*"

        append_findings_to_session(session, "TEA", "red", [finding1])
        append_findings_to_session(session, "TEA", "red", [finding2])

        updated = session.read_text()
        assert updated.count("### TEA (test design)") == 2
        assert "First" in updated
        assert "Second" in updated


# =============================================================================
# Agent markdown structure tests
# =============================================================================


class TestAgentFindingCaptureSections:
    """Validate agent markdown files contain finding-capture exit behavior."""

    def test_tea_md_has_finding_capture(self):
        tea_md = (AGENTS_DIR / "tea.md").read_text()
        assert "<finding-capture>" in tea_md or "finding-capture" in tea_md.lower(), (
            "tea.md must contain finding-capture instructions in exit behavior"
        )

    def test_dev_md_has_finding_capture(self):
        dev_md = (AGENTS_DIR / "dev.md").read_text()
        assert "<finding-capture>" in dev_md or "finding-capture" in dev_md.lower(), (
            "dev.md must contain finding-capture instructions in exit behavior"
        )

    def test_reviewer_md_has_finding_capture(self):
        reviewer_md = (AGENTS_DIR / "reviewer.md").read_text()
        assert "<finding-capture>" in reviewer_md or "finding-capture" in reviewer_md.lower(), (
            "reviewer.md must contain finding-capture instructions in exit behavior"
        )

    def test_tea_md_references_r1_format(self):
        tea_md = (AGENTS_DIR / "tea.md").read_text()
        assert "R1" in tea_md or "Delivery Findings" in tea_md, (
            "tea.md must reference R1 format or Delivery Findings section"
        )

    def test_dev_md_references_r1_format(self):
        dev_md = (AGENTS_DIR / "dev.md").read_text()
        assert "R1" in dev_md or "Delivery Findings" in dev_md, (
            "dev.md must reference R1 format or Delivery Findings section"
        )

    def test_reviewer_md_references_r1_format(self):
        reviewer_md = (AGENTS_DIR / "reviewer.md").read_text()
        assert "R1" in reviewer_md or "Delivery Findings" in reviewer_md, (
            "reviewer.md must reference R1 format or Delivery Findings section"
        )

    def test_agents_mention_valid_types(self):
        """At least one agent file must list the valid finding types."""
        found = False
        for name in ("tea.md", "dev.md", "reviewer.md"):
            content = (AGENTS_DIR / name).read_text()
            if all(t in content for t in ("Gap", "Conflict", "Question", "Improvement")):
                found = True
                break
        assert found, "At least one agent must list valid finding types"

    def test_agents_mention_no_findings_requirement(self):
        """At least one agent file must mention explicit 'no findings' requirement."""
        found = False
        for name in ("tea.md", "dev.md", "reviewer.md"):
            content = (AGENTS_DIR / name).read_text()
            if "no upstream findings" in content.lower() or "no findings" in content.lower():
                found = True
                break
        assert found, "At least one agent must mention explicit no-findings requirement"


class TestReviewerPreflightOptionalPr:
    """Validate PR_NUMBER is optional in reviewer-preflight.md."""

    def test_pr_number_marked_optional(self):
        preflight_md = (AGENTS_DIR / "reviewer-preflight.md").read_text()
        # PR_NUMBER should be marked optional, not required
        # Look for patterns like "PR_NUMBER (optional)" or "PR_NUMBER: optional"
        # or absence of "required" next to PR_NUMBER
        pr_lines = [
            line for line in preflight_md.split("\n")
            if "PR_NUMBER" in line
        ]
        assert any("optional" in line.lower() for line in pr_lines), (
            "reviewer-preflight.md must mark PR_NUMBER as optional. "
            f"Found PR_NUMBER lines: {pr_lines}"
        )
