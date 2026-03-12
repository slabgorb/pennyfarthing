"""Tests for deviation format validation gate.

Story: 144-1 (Deviation format spec and gate validation upgrade)

Tests validate_deviations() against all 7 ACs from story context.
Each AC maps to a test class. Tests are in RED state — stub returns wrong results.

Run with: python -m pytest tests/python/test_deviations_gate.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.deviations import (  # noqa: E402
    AGENT_SUBSECTIONS,
    REQUIRED_FIELDS,
    VALID_FORWARD_IMPACTS,
    VALID_SEVERITIES,
    validate_deviations,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_session(tmp_path):
    """Factory fixture: write session content to a temp file and return its path."""

    def _write(content: str) -> Path:
        p = tmp_path / "session.md"
        p.write_text(textwrap.dedent(content))
        return p

    return _write


# A well-formed deviation entry with all 6 fields
VALID_ENTRY = """\
- **Used property-based generation instead of example list**
  - Spec source: context-story-5-1.md, AC-3
  - Spec text: "reject invalid input with specific error messages"
  - Implementation: Tests use property-based generation to cover broader input space
  - Rationale: Catches more edge cases than enumerated examples
  - Severity: minor
  - Forward impact: none"""

VALID_ENTRY_BREAKING = """\
- **No ! as NOT alternative**
  - Spec source: context-story-5-2.md, AC-1
  - Spec text: "Support ! prefix for boolean negation"
  - Implementation: Only 'not' keyword supported, no ! operator
  - Rationale: Ambiguity with shell history expansion in CLI context
  - Severity: major
  - Forward impact: breaking — Story 5-3 assumes ! is available for filter expressions"""


# =============================================================================
# AC-1: Guide at deviation-format.md specifies 6 required fields
# =============================================================================


class TestGuideSpecifiesRequiredFields:
    """AC-1: The guide file exists and defines all 6 required fields."""

    GUIDE_PATH = (
        PROJECT_ROOT / "pennyfarthing-dist" / "guides" / "deviation-format.md"
    )

    def test_guide_file_exists(self):
        assert self.GUIDE_PATH.exists(), (
            f"Guide file not found at {self.GUIDE_PATH}"
        )

    def test_guide_contains_spec_source_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Spec source" in content

    def test_guide_contains_spec_text_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Spec text" in content

    def test_guide_contains_implementation_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Implementation" in content

    def test_guide_contains_rationale_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Rationale" in content

    def test_guide_contains_severity_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Severity" in content

    def test_guide_contains_forward_impact_field(self):
        content = self.GUIDE_PATH.read_text()
        assert "Forward impact" in content

    def test_guide_contains_worked_example(self):
        """Guide should include a worked example with all fields."""
        content = self.GUIDE_PATH.read_text()
        # A worked example would have all 6 fields in a code block or indented section
        for field in REQUIRED_FIELDS:
            assert content.count(field) >= 2, (
                f"Field '{field}' appears fewer than 2 times — "
                "expected at least once in definition and once in worked example"
            )

    def test_guide_shows_severity_values(self):
        """Guide must show minor | major as the severity enum."""
        content = self.GUIDE_PATH.read_text()
        assert "minor" in content
        assert "major" in content

    def test_guide_shows_forward_impact_values(self):
        """Guide must show none | minor | breaking as the forward impact enum."""
        content = self.GUIDE_PATH.read_text()
        assert "none" in content
        assert "breaking" in content

    def test_guide_shows_spec_text_quoted(self):
        """Guide should show Spec text with quotation marks."""
        content = self.GUIDE_PATH.read_text()
        # The worked example should have Spec text: "..." with quotes
        assert 'Spec text: "' in content or "Spec text: '" in content


# =============================================================================
# AC-2: Guide specifies three agent-specific subsections
# =============================================================================


class TestGuideSpecifiesAgentSubsections:
    """AC-2: Guide defines three agent subsection headings."""

    GUIDE_PATH = (
        PROJECT_ROOT / "pennyfarthing-dist" / "guides" / "deviation-format.md"
    )

    def test_guide_contains_tea_subsection(self):
        content = self.GUIDE_PATH.read_text()
        assert "### TEA (test design)" in content

    def test_guide_contains_dev_subsection(self):
        content = self.GUIDE_PATH.read_text()
        assert "### Dev (implementation)" in content

    def test_guide_contains_architect_subsection(self):
        content = self.GUIDE_PATH.read_text()
        assert "### Architect (reconcile)" in content

    def test_guide_specifies_subsections_under_design_deviations(self):
        """Subsections are under ## Design Deviations, not standalone."""
        content = self.GUIDE_PATH.read_text()
        assert "## Design Deviations" in content

    def test_guide_specifies_agent_owns_own_subsection(self):
        """Guide should state agents only write to their own subsection."""
        content = self.GUIDE_PATH.read_text().lower()
        # Should mention that agents populate only their own section
        assert "own" in content or "only" in content


# =============================================================================
# AC-3: Gate passes for entries with all 6 fields
# =============================================================================


class TestGatePassesValidEntries:
    """AC-3: Session with well-formed entries passes."""

    def test_single_valid_entry_passes(self, tmp_session):
        path = tmp_session(f"""
# Story 5-1: Test

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_multiple_valid_entries_pass(self, tmp_session):
        path = tmp_session(f"""
# Story 5-1: Test

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
{VALID_ENTRY_BREAKING}
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"
        assert result["entries_count"] == 2

    def test_dev_agent_checks_dev_subsection(self, tmp_session):
        path = tmp_session(f"""
# Story 5-1: Test

## Design Deviations

### Dev (implementation)
{VALID_ENTRY}
        """)
        result = validate_deviations(path, agent="dev")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_architect_agent_checks_architect_subsection(self, tmp_session):
        path = tmp_session(f"""
# Story 5-1: Test

## Design Deviations

### Architect (reconcile)
{VALID_ENTRY}
        """)
        result = validate_deviations(path, agent="architect")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_does_not_validate_other_agents_subsection(self, tmp_session):
        """AGENT=tea should not validate Dev's subsection."""
        path = tmp_session("""
            # Story 5-1: Test

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.

            ### Dev (implementation)
            - This is a malformed entry with no fields at all
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_field_order_does_not_matter(self, tmp_session):
        """Fields in different order should still pass."""
        path = tmp_session("""
            # Story 5-1: Test

            ## Design Deviations

            ### TEA (test design)
            - **Reordered fields**
              - Rationale: Testing field order independence
              - Severity: minor
              - Spec source: context-story-5-1.md, AC-1
              - Forward impact: none
              - Implementation: Fields in non-standard order
              - Spec text: "Original spec text"
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_trailing_whitespace_does_not_cause_false_fail(self, tmp_session):
        """Minor formatting variations should not fail."""
        path = tmp_session(
            "# Story\n\n"
            "## Design Deviations\n\n"
            "### TEA (test design)\n"
            "- **Whitespace test**  \n"
            "  - Spec source: context-story-5-1.md, AC-1  \n"
            '  - Spec text: "original text"  \n'
            "  - Implementation: what was built  \n"
            "  - Rationale: why  \n"
            "  - Severity: minor  \n"
            "  - Forward impact: none  \n"
        )
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"


# =============================================================================
# AC-4: Gate fails with field-level recovery message for incomplete entries
# =============================================================================


class TestGateFailsMissingFields:
    """AC-4: Incomplete entries fail with specific recovery messages."""

    def test_missing_forward_impact_fails(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Missing forward impact**
              - Spec source: context-story-5-1.md, AC-3
              - Spec text: "some spec"
              - Implementation: what was built
              - Rationale: why
              - Severity: minor
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        error = result["errors"][0]
        assert "Forward impact" in error["missing_fields"]

    def test_missing_multiple_fields_reports_all(self, tmp_session):
        """All missing fields should be named, not just the first."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Missing several fields**
              - Spec source: context-story-5-1.md, AC-1
              - Rationale: why
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        error = result["errors"][0]
        missing = error["missing_fields"]
        assert "Spec text" in missing
        assert "Implementation" in missing
        assert "Severity" in missing
        assert "Forward impact" in missing

    def test_error_message_contains_entry_description(self, tmp_session):
        """Recovery message should include the entry's short description."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **No ! as NOT alternative**
              - Spec source: context-story-5-2.md, AC-1
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        error = result["errors"][0]
        assert "No ! as NOT alternative" in error["entry"]

    def test_error_message_format(self, tmp_session):
        """Message should follow: Entry '{description}' missing: {field list}."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Test entry**
              - Spec source: context-story-5-1.md, AC-1
              - Spec text: "spec"
              - Implementation: impl
              - Rationale: reason
              - Severity: minor
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        error = result["errors"][0]
        assert "Entry" in error["message"] or "entry" in error["message"].lower()
        assert "Test entry" in error["message"]
        assert "Forward impact" in error["message"]

    def test_one_valid_one_invalid_fails(self, tmp_session):
        """One valid entry and one invalid entry means gate fails."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
- **Incomplete entry**
  - Spec source: context-story-5-1.md, AC-2
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1

    def test_entry_with_no_fields_at_all_fails(self, tmp_session):
        """Entry that is just a bullet with description but zero fields."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Just a description with nothing else**
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        error = result["errors"][0]
        # Should report all 6 fields as missing
        assert len(error["missing_fields"]) == 6

    def test_malformed_bullet_falls_back_gracefully(self, tmp_session):
        """Entry without bold description should not crash."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - Some text without bold markers
              - Spec source: context-story-5-1.md, AC-1
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        # Should still produce a useful message without crashing
        assert len(result["errors"]) >= 1


# =============================================================================
# AC-5: Gate auto-passes for explicit "No deviations from spec."
# =============================================================================


class TestGateAutoPassesNoDeviations:
    """AC-5: Explicit no-deviation phrase passes without 6-field entries."""

    def test_canonical_phrase_passes(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_case_insensitive_match(self, tmp_session):
        """'no deviations from spec' (lowercase) should also pass."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - no deviations from spec.
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_no_deviations_without_period_passes(self, tmp_session):
        """'No deviations from spec' without trailing period should pass."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_no_deviations_plus_invalid_entry_still_validates(self, tmp_session):
        """The phrase does not suppress validation of other entries."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - No deviations from spec.
            - **Incomplete entry that should fail**
              - Spec source: context-story-5-1.md, AC-1
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1

    def test_empty_subsection_is_fail(self, tmp_session):
        """Subsection heading present but no content is NOT the same as no-deviations."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"

    def test_empty_subsection_with_only_whitespace_is_fail(self, tmp_session):
        """Subsection with only blank lines fails."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)


        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"


# =============================================================================
# AC-6: Gate fails with distinct message when section is absent
# =============================================================================


class TestGateFailsMissingSection:
    """AC-6: Missing ## Design Deviations section produces a distinct failure."""

    EXPECTED_MESSAGE = "Missing '## Design Deviations' section in session file"

    def test_no_design_deviations_section_fails(self, tmp_session):
        path = tmp_session("""
            # Story 5-1: Test

            ## SM Assessment

            Setup complete.

            ## TEA Assessment

            Tests written.
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        assert self.EXPECTED_MESSAGE in result["errors"][0]["message"]

    def test_empty_file_fails(self, tmp_session):
        path = tmp_session("")
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert self.EXPECTED_MESSAGE in result["errors"][0]["message"]

    def test_agent_argument_irrelevant_when_section_absent(self, tmp_session):
        """Same message regardless of AGENT=tea or AGENT=dev."""
        content = """
            # Story

            ## SM Assessment

            Done.
        """
        path_tea = tmp_session(content)
        result_tea = validate_deviations(path_tea, agent="tea")

        # Re-create for dev
        path_dev = tmp_session(content)
        result_dev = validate_deviations(path_dev, agent="dev")

        assert result_tea["errors"][0]["message"] == result_dev["errors"][0]["message"]
        assert self.EXPECTED_MESSAGE in result_tea["errors"][0]["message"]

    def test_distinct_from_field_level_error(self, tmp_session):
        """This message must be different from field-level recovery (AC-4)."""
        # AC-6 message
        path_absent = tmp_session("""
            # Story

            ## SM Assessment

            Done.
        """)
        result_absent = validate_deviations(path_absent, agent="tea")

        # AC-4 message (incomplete entry)
        path_incomplete = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Incomplete**
              - Spec source: context-story-5-1.md, AC-1
        """)
        result_incomplete = validate_deviations(path_incomplete, agent="tea")

        assert result_absent["errors"][0]["message"] != result_incomplete["errors"][0]["message"]

    def test_section_present_but_subsection_missing_is_separate_failure(self, tmp_session):
        """Section with wrong subsection is a different failure than section absent."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### Dev (implementation)
            - No deviations from spec.
        """)
        # Checking for tea, but only dev subsection exists
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        # This should NOT say "Missing ## Design Deviations section" —
        # section exists, just wrong subsection
        assert self.EXPECTED_MESSAGE not in result["errors"][0]["message"]

    def test_section_check_happens_before_subsection_check(self, tmp_session):
        """Absent section should be caught before looking for subsection."""
        path = tmp_session("""
            # Story

            ## Unrelated Section

            Content.
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
        assert self.EXPECTED_MESSAGE in result["errors"][0]["message"]


# =============================================================================
# AC-7: Gate is idempotent
# =============================================================================


class TestGateIsIdempotent:
    """AC-7: Running gate twice produces identical results, no side effects."""

    def test_passing_result_is_identical_on_repeat(self, tmp_session):
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
        """)
        result1 = validate_deviations(path, agent="tea")
        result2 = validate_deviations(path, agent="tea")
        assert result1 == result2

    def test_failing_result_is_identical_on_repeat(self, tmp_session):
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Incomplete**
              - Spec source: context-story-5-1.md, AC-1
        """)
        result1 = validate_deviations(path, agent="tea")
        result2 = validate_deviations(path, agent="tea")
        assert result1 == result2

    def test_session_file_not_modified(self, tmp_session):
        """Gate must not modify the session file."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
        """)
        content_before = path.read_text()
        mtime_before = path.stat().st_mtime
        validate_deviations(path, agent="tea")
        content_after = path.read_text()
        mtime_after = path.stat().st_mtime
        assert content_before == content_after
        assert mtime_before == mtime_after

    def test_no_side_effect_files(self, tmp_session):
        """Gate should not create any files in the directory."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
        """)
        files_before = set(path.parent.iterdir())
        validate_deviations(path, agent="tea")
        files_after = set(path.parent.iterdir())
        assert files_before == files_after


# =============================================================================
# Edge cases — the paranoid Caterpillar demands more
# =============================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_nonexistent_file_returns_fail(self):
        result = validate_deviations("/nonexistent/path/session.md", agent="tea")
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1

    def test_section_stops_at_next_h2(self, tmp_session):
        """Parser only reads content under ## Design Deviations, not beyond."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}

## SM Assessment

- **Incomplete entry** that should NOT be parsed
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_subsection_stops_at_next_h3(self, tmp_session):
        """TEA subsection stops at ### Dev subsection."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}

### Dev (implementation)
- This is a malformed entry with no fields
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"
        assert result["entries_count"] == 1

    def test_html_comments_ignored(self, tmp_session):
        """HTML comments in the section should be skipped."""
        path = tmp_session(f"""
# Story

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
{VALID_ENTRY}
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_constants_exposed(self):
        """Module exposes constants for external use."""
        assert len(REQUIRED_FIELDS) == 6
        assert "Spec source" in REQUIRED_FIELDS
        assert "Spec text" in REQUIRED_FIELDS
        assert "Implementation" in REQUIRED_FIELDS
        assert "Rationale" in REQUIRED_FIELDS
        assert "Severity" in REQUIRED_FIELDS
        assert "Forward impact" in REQUIRED_FIELDS
        assert VALID_SEVERITIES == {"minor", "major"}
        assert VALID_FORWARD_IMPACTS == {"none", "minor", "breaking"}

    def test_agent_subsections_mapping(self):
        """AGENT_SUBSECTIONS maps all three agents."""
        assert "tea" in AGENT_SUBSECTIONS
        assert "dev" in AGENT_SUBSECTIONS
        assert "architect" in AGENT_SUBSECTIONS
        assert AGENT_SUBSECTIONS["tea"] == "### TEA (test design)"
        assert AGENT_SUBSECTIONS["dev"] == "### Dev (implementation)"
        assert AGENT_SUBSECTIONS["architect"] == "### Architect (reconcile)"

    def test_forward_impact_none_is_complete(self, tmp_session):
        """'Forward impact: none' is complete — no story IDs needed."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY}
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_forward_impact_breaking_with_story_ids(self, tmp_session):
        """'Forward impact: breaking — Story 5-3 assumes ...' is valid."""
        path = tmp_session(f"""
# Story

## Design Deviations

### TEA (test design)
{VALID_ENTRY_BREAKING}
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "pass"

    def test_severity_invalid_value_fails(self, tmp_session):
        """Severity must be exactly 'minor' or 'major'."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Invalid severity**
              - Spec source: context-story-5-1.md, AC-1
              - Spec text: "some spec"
              - Implementation: what was built
              - Rationale: why
              - Severity: critical
              - Forward impact: none
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"

    def test_forward_impact_invalid_value_fails(self, tmp_session):
        """Forward impact must start with none, minor, or breaking."""
        path = tmp_session("""
            # Story

            ## Design Deviations

            ### TEA (test design)
            - **Invalid forward impact**
              - Spec source: context-story-5-1.md, AC-1
              - Spec text: "some spec"
              - Implementation: what was built
              - Rationale: why
              - Severity: minor
              - Forward impact: high
        """)
        result = validate_deviations(path, agent="tea")
        assert result["status"] == "fail"
