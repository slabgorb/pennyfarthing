"""Tests for 150-14: Spec traceability audit for TEA workflow.

Verifies that acceptance criteria are parsed from session files,
test functions are mapped to criteria, and coverage audits produce
correct reports.

Story: 150-14
"""

from __future__ import annotations

import pytest

from pf.tea.spec_traceability import (
    audit_spec_traceability,
    map_tests_to_criteria,
    parse_acceptance_criteria,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def session_with_acs() -> str:
    """Session content with checkbox acceptance criteria."""
    return """\
# Story 150-14: TEA RED phase

## Acceptance Criteria
- [ ] Each subagent has a defined diff mode
- [ ] Audit function produces coverage report
- [ ] Uncovered ACs are clearly reported
"""


@pytest.fixture
def session_with_checked_acs() -> str:
    """Session content with checked acceptance criteria."""
    return """\
## Acceptance Criteria
- [x] Already done
- [ ] Still pending
"""


@pytest.fixture
def session_no_acs() -> str:
    """Session content with no acceptance criteria."""
    return """\
# Story 150-14

## Some Section
This is just narrative text with no checkboxes.
"""


@pytest.fixture
def session_mixed_content() -> str:
    """Session content with ACs among other markdown."""
    return """\
# Story 150-14

Some introductory text.

## Acceptance Criteria
- [ ] Parser extracts criteria from session file
- This is a regular list item, not an AC
- [ ] Coverage percentage is calculated correctly

## Notes
- More regular list items
- [ ] This AC is outside the criteria section but still a checkbox
"""


@pytest.fixture
def test_content_with_ac_docstring() -> str:
    """Test file where a function references an AC via docstring."""
    return '''\
def test_parser_extracts_criteria():
    """Verify parser extracts criteria from session file."""
    pass

def test_coverage_percentage():
    """Coverage percentage is calculated correctly."""
    pass
'''


@pytest.fixture
def test_content_with_ac_keyword_name() -> str:
    """Test file where function names contain AC keywords."""
    return """\
def test_diff_mode_defined_for_subagent():
    pass

def test_audit_produces_coverage_report():
    pass
"""


@pytest.fixture
def test_content_no_ac_reference() -> str:
    """Test file with no AC references."""
    return """\
def test_something_unrelated():
    pass

def test_another_unrelated():
    pass
"""


@pytest.fixture
def test_content_multiple_tests_same_ac() -> str:
    """Test file with multiple tests covering the same AC."""
    return '''\
def test_coverage_report_basic():
    """Audit function produces coverage report for basic case."""
    pass

def test_coverage_report_empty():
    """Audit function produces coverage report when empty."""
    pass

def test_unrelated():
    pass
'''


# =============================================================================
# AC Parser Tests
# =============================================================================


class TestParseAcceptanceCriteria:
    """Tests for parse_acceptance_criteria function."""

    def test_parse_checkbox_acs(self, session_with_acs: str):
        """Parse checkbox ACs: extracts the text after `- [ ]`."""
        result = parse_acceptance_criteria(session_with_acs)
        assert len(result) == 3
        assert "Each subagent has a defined diff mode" in result
        assert "Audit function produces coverage report" in result
        assert "Uncovered ACs are clearly reported" in result

    def test_parse_checked_acs(self, session_with_checked_acs: str):
        """Parse checked ACs: `- [x]` items are also extracted."""
        result = parse_acceptance_criteria(session_with_checked_acs)
        assert len(result) == 2
        assert "Already done" in result
        assert "Still pending" in result

    def test_no_acs_returns_empty(self, session_no_acs: str):
        """No ACs in session → empty list."""
        result = parse_acceptance_criteria(session_no_acs)
        assert result == []

    def test_mixed_content_extracts_only_checkboxes(self, session_mixed_content: str):
        """Mixed content: only checkbox items are extracted."""
        result = parse_acceptance_criteria(session_mixed_content)
        assert len(result) == 3
        assert "Parser extracts criteria from session file" in result
        assert "Coverage percentage is calculated correctly" in result
        assert "This AC is outside the criteria section but still a checkbox" in result
        # Regular list items should NOT appear
        assert "This is a regular list item, not an AC" not in result
        assert "More regular list items" not in result


# =============================================================================
# Test Mapper Tests
# =============================================================================


class TestMapTestsToCriteria:
    """Tests for map_tests_to_criteria function."""

    def test_ac_reference_in_docstring(self, test_content_with_ac_docstring: str):
        """Test function with AC reference in docstring → mapped."""
        criteria = ["Parser extracts criteria from session file"]
        result = map_tests_to_criteria(test_content_with_ac_docstring, criteria)
        assert "Parser extracts criteria from session file" in result
        assert "test_parser_extracts_criteria" in result["Parser extracts criteria from session file"]

    def test_ac_keyword_in_name(self, test_content_with_ac_keyword_name: str):
        """Test function with AC keyword in name → mapped."""
        criteria = ["Each subagent has a defined diff mode"]
        result = map_tests_to_criteria(test_content_with_ac_keyword_name, criteria)
        assert "Each subagent has a defined diff mode" in result
        assert "test_diff_mode_defined_for_subagent" in result["Each subagent has a defined diff mode"]

    def test_no_ac_reference(self, test_content_no_ac_reference: str):
        """Test function with no AC reference → not mapped."""
        criteria = ["Parser extracts criteria from session file"]
        result = map_tests_to_criteria(test_content_no_ac_reference, criteria)
        assert result["Parser extracts criteria from session file"] == []

    def test_multiple_tests_same_ac(self, test_content_multiple_tests_same_ac: str):
        """Multiple tests covering same AC → all listed."""
        criteria = ["Audit function produces coverage report"]
        result = map_tests_to_criteria(test_content_multiple_tests_same_ac, criteria)
        mapped = result["Audit function produces coverage report"]
        assert "test_coverage_report_basic" in mapped
        assert "test_coverage_report_empty" in mapped
        assert "test_unrelated" not in mapped


# =============================================================================
# Audit Function Tests
# =============================================================================


class TestAuditSpecTraceability:
    """Tests for audit_spec_traceability function."""

    def test_full_coverage(self):
        """Full coverage: all ACs have tests → coverage_pct: 100.0."""
        session = """\
- [ ] Widget is created
- [ ] Widget is deleted
"""
        tests = '''\
def test_widget_is_created():
    """Widget is created."""
    pass

def test_widget_is_deleted():
    """Widget is deleted."""
    pass
'''
        result = audit_spec_traceability(session, tests)
        assert result["coverage_pct"] == 100.0
        assert len(result["uncovered"]) == 0
        assert len(result["covered"]) == 2

    def test_partial_coverage(self):
        """Partial coverage → correct percentage and uncovered list."""
        session = """\
- [ ] Widget is created
- [ ] Widget is deleted
- [ ] Widget is updated
"""
        tests = '''\
def test_widget_is_created():
    """Widget is created."""
    pass
'''
        result = audit_spec_traceability(session, tests)
        assert len(result["covered"]) == 1
        assert len(result["uncovered"]) == 2
        assert "Widget is created" in result["covered"]
        assert "Widget is deleted" in result["uncovered"]
        assert "Widget is updated" in result["uncovered"]
        assert abs(result["coverage_pct"] - 33.33) < 0.1

    def test_no_coverage(self):
        """No coverage → coverage_pct: 0.0, all uncovered."""
        session = """\
- [ ] Widget is created
- [ ] Widget is deleted
"""
        tests = """\
def test_something_unrelated():
    pass
"""
        result = audit_spec_traceability(session, tests)
        assert result["coverage_pct"] == 0.0
        assert len(result["uncovered"]) == 2
        assert len(result["covered"]) == 0

    def test_no_acs_vacuously_true(self):
        """No ACs → coverage_pct: 100.0 (vacuously true)."""
        session = "# Just a title, no ACs"
        tests = """\
def test_something():
    pass
"""
        result = audit_spec_traceability(session, tests)
        assert result["coverage_pct"] == 100.0
        assert result["uncovered"] == []
        assert result["covered"] == []
