"""Tests for finding format validation gate.

Story: 133-3 (Create finding format validation gate)

Tests validate_findings() against all 6 ACs from the PRD plus edge cases.
Each AC maps to a test class. Tests are in RED state — stub returns wrong results.

Run with: python -m pytest tests/python/test_findings_gate.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.findings import VALID_TYPES, VALID_URGENCIES, validate_findings


@pytest.fixture
def tmp_session(tmp_path):
    """Factory fixture: write session content to a temp file and return its path."""

    def _write(content: str) -> Path:
        p = tmp_path / "session.md"
        p.write_text(textwrap.dedent(content))
        return p

    return _write


# =============================================================================
# AC1: Valid findings → exit 0, reports finding count
# =============================================================================


class TestValidFindings:
    """Session with correctly formatted Delivery Findings passes validation."""

    VALID_FINDING = (
        '- **Gap** (blocking): Missing error handling for empty input. '
        'Affects `guides/session-artifacts.md` (add error cases section). '
        '*Found by TEA during test design.*'
    )

    def test_single_valid_finding_passes(self, tmp_session):
        path = tmp_session(f"""
            # Story 1-1: Test

            ## Delivery Findings

            {self.VALID_FINDING}
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 1

    def test_multiple_valid_findings_reports_count(self, tmp_session):
        path = tmp_session(f"""
            # Story 1-1: Test

            ## Delivery Findings

            {self.VALID_FINDING}
            - **Improvement** (non-blocking): Could simplify API surface. Affects `src/api.py` (reduce params). *Found by Dev during implementation.*
            - **Question** (non-blocking): Is retry logic needed? Affects `src/retry.py` (clarify requirements). *Found by Reviewer during code review.*
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 3

    def test_all_four_types_valid(self, tmp_session):
        lines = []
        for t in VALID_TYPES:
            lines.append(
                f"- **{t}** (blocking): Description. Affects `path/file.md` (action). "
                f"*Found by TEA during test design.*"
            )
        path = tmp_session(
            "# Story\n\n## Delivery Findings\n\n" + "\n".join(lines)
        )
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 4

    def test_both_urgencies_valid(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Desc. Affects `a.md` (fix). *Found by TEA during test design.*
            - **Gap** (non-blocking): Desc. Affects `b.md` (fix). *Found by Dev during implementation.*
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 2


# =============================================================================
# AC2: Finding missing type → exit 1, reports which finding and what's missing
# =============================================================================


class TestMissingType:
    """Finding without bold type marker fails validation."""

    def test_no_bold_type_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - Gap (blocking): Missing type bold. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        assert any("type" in e.get("field", "").lower() for e in result["errors"])

    def test_empty_type_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **** (blocking): Empty type. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"


# =============================================================================
# AC3: Invalid type (e.g., "Bug") → exit 1, reports invalid type value
# =============================================================================


class TestInvalidType:
    """Finding with type not in {Gap, Conflict, Question, Improvement} fails."""

    def test_bug_type_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Bug** (blocking): Wrong type. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        error = result["errors"][0]
        assert "Bug" in error.get("message", "") or "type" in error.get("field", "").lower()

    def test_warning_type_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Warning** (blocking): Wrong type. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"

    def test_lowercase_gap_fails(self, tmp_session):
        """Types are case-sensitive — 'gap' is not 'Gap'."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **gap** (blocking): Lowercase. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"


# =============================================================================
# AC4: Invalid urgency (e.g., "critical") → exit 1
# =============================================================================


class TestInvalidUrgency:
    """Finding with urgency not in {blocking, non-blocking} fails."""

    def test_critical_urgency_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (critical): Wrong urgency. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1

    def test_high_urgency_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (high): Wrong urgency. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"

    def test_missing_urgency_parens_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap**: No urgency parens. Affects `a.md` (fix). *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"


# =============================================================================
# AC5: Explicit "No upstream findings" → exit 0
# =============================================================================


class TestExplicitNoFindings:
    """Sessions where agents wrote 'No upstream findings' pass."""

    def test_single_no_findings_entry_passes(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - No upstream findings during test design.
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"

    def test_multiple_no_findings_entries_pass(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - No upstream findings during test design.
            - No upstream findings during implementation.
            - No upstream findings during code review.
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"

    def test_mixed_valid_finding_and_no_findings_passes(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Issue found. Affects `a.md` (fix). *Found by TEA during test design.*
            - No upstream findings during implementation.
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 1  # only real findings counted


# =============================================================================
# AC6: No Delivery Findings section (legacy) → exit 0
# =============================================================================


class TestMissingSection:
    """Legacy session files without Delivery Findings section pass."""

    def test_no_delivery_findings_section_passes(self, tmp_session):
        path = tmp_session("""
            # Story 1-1: Legacy story

            ## SM Assessment

            Setup complete.

            ## TEA Assessment

            Tests written.
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 0

    def test_empty_file_passes(self, tmp_session):
        path = tmp_session("")
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 0


# =============================================================================
# Edge cases — the paranoid supreme being demands more
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_missing_affects_path_fails(self, tmp_session):
        """Findings must have an Affects `path` field."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Missing affects. *Found by TEA during test design.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"

    def test_missing_attribution_fails(self, tmp_session):
        """Findings must have *Found by Agent during phase.* attribution."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Missing attribution. Affects `a.md` (fix).
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"

    def test_one_bad_finding_among_valid_fails(self, tmp_session):
        """One malformed finding in a list of valid ones fails the whole gate."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Valid one. Affects `a.md` (fix). *Found by TEA during test design.*
            - **Bug** (blocking): Invalid type. Affects `b.md` (fix). *Found by Dev during implementation.*
            - **Improvement** (non-blocking): Valid. Affects `c.md` (fix). *Found by Reviewer during code review.*
        """)
        result = validate_findings(path)
        assert result["status"] == "fail"
        # Should identify which finding failed
        assert len(result["errors"]) >= 1

    def test_section_with_only_html_comment_passes(self, tmp_session):
        """Section with just the append marker and no entries passes."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            <!-- Agents: append findings below this line. Do not edit other agents' entries. -->
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 0

    def test_nonexistent_file_returns_error(self):
        """Nonexistent session file returns fail with error."""
        result = validate_findings("/nonexistent/path/session.md")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1

    def test_delivery_findings_section_stops_at_next_h2(self, tmp_session):
        """Parser only reads content under ## Delivery Findings, not beyond."""
        path = tmp_session("""
            # Story

            ## Delivery Findings

            - **Gap** (blocking): Valid. Affects `a.md` (fix). *Found by TEA during test design.*

            ## SM Assessment

            - **Bug** (blocking): This is NOT a finding — it's in the wrong section.
        """)
        result = validate_findings(path)
        assert result["status"] == "pass"
        assert result["findings_count"] == 1  # only the one under Delivery Findings

    def test_constants_exposed(self):
        """Module exposes VALID_TYPES and VALID_URGENCIES for external use."""
        assert "Gap" in VALID_TYPES
        assert "Conflict" in VALID_TYPES
        assert "Question" in VALID_TYPES
        assert "Improvement" in VALID_TYPES
        assert len(VALID_TYPES) == 4
        assert "blocking" in VALID_URGENCIES
        assert "non-blocking" in VALID_URGENCIES
        assert len(VALID_URGENCIES) == 2
