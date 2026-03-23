"""Tests for 150-19: Quality ratchet enforcement.

Detects test quality regressions: removed assertions, added skips,
weakened assertions (specific → truthy), removed test functions.
The ratchet principle: test suite quality only tightens, never loosens.

Story: 150-19
"""

from __future__ import annotations

import pytest

from pf.quality.ratchet import detect_test_regressions, is_ratchet_violation


# =============================================================================
# Fixtures — old/new test content pairs
# =============================================================================

OLD_TEST_BASIC = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_REMOVED_ASSERTIONS = """\
def test_addition():
    result = add(2, 3)
    assert result == 5

def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_ADDED_IGNORE_RUST = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

#[ignore]
def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_ADDED_SKIP_PYTHON = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

@pytest.mark.skip
def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_ADDED_SKIP_WITH_ISSUE = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

@pytest.mark.skip(reason="JIRA-1234: flaky on CI, investigating")
def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_WEAKENED_ASSERTION = """\
def test_addition():
    result = add(2, 3)
    assert result
    assert isinstance(result, int)

def test_subtraction():
    result = subtract(10, 4)
    assert result
"""

NEW_TEST_REMOVED_FUNCTION = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)
"""

NEW_TEST_IDENTICAL = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_ADDED_TESTS = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

def test_subtraction():
    result = subtract(10, 4)
    assert result == 6

def test_multiplication():
    result = multiply(3, 4)
    assert result == 12
"""

NEW_TEST_REFACTORED_NOT_WEAKENED = """\
def test_addition():
    result = add(2, 3)
    assert result == 5
    assert type(result) is int

def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_SKIPIF_NO_ISSUE = """\
import sys

def test_addition():
    result = add(2, 3)
    assert result == 5
    assert isinstance(result, int)

@pytest.mark.skipIf(sys.platform == "win32")
def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""

NEW_TEST_MULTIPLE_REGRESSIONS = """\
def test_addition():
    result = add(2, 3)
    assert result

@pytest.mark.skip
def test_subtraction():
    result = subtract(10, 4)
    assert result == 6
"""


# =============================================================================
# detect_test_regressions — removed assertions
# =============================================================================


class TestRemovedAssertions:
    def test_detects_reduced_assertion_count(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_ASSERTIONS)
        types = [r["type"] for r in regressions]
        assert "removed_assertion" in types

    def test_regression_has_required_fields(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_ASSERTIONS)
        removed = [r for r in regressions if r["type"] == "removed_assertion"]
        assert len(removed) >= 1
        reg = removed[0]
        assert "type" in reg
        assert "detail" in reg
        assert "severity" in reg

    def test_severity_is_warning_or_error(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_ASSERTIONS)
        removed = [r for r in regressions if r["type"] == "removed_assertion"]
        assert removed[0]["severity"] in ("warning", "error")


# =============================================================================
# detect_test_regressions — added skip/ignore
# =============================================================================


class TestAddedSkipIgnore:
    def test_detects_rust_ignore(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_ADDED_IGNORE_RUST)
        types = [r["type"] for r in regressions]
        assert "added_skip" in types

    def test_detects_pytest_skip(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_ADDED_SKIP_PYTHON)
        types = [r["type"] for r in regressions]
        assert "added_skip" in types

    def test_skip_with_linked_issue_is_not_regression(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_ADDED_SKIP_WITH_ISSUE)
        types = [r["type"] for r in regressions]
        assert "added_skip" not in types

    def test_detects_skipif_without_issue(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_SKIPIF_NO_ISSUE)
        types = [r["type"] for r in regressions]
        assert "added_skip" in types

    def test_skip_detail_mentions_test_name(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_ADDED_SKIP_PYTHON)
        skip_regs = [r for r in regressions if r["type"] == "added_skip"]
        assert any("test_subtraction" in r["detail"] for r in skip_regs)


# =============================================================================
# detect_test_regressions — weakened assertions
# =============================================================================


class TestWeakenedAssertions:
    def test_detects_specific_to_truthy(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_WEAKENED_ASSERTION)
        types = [r["type"] for r in regressions]
        assert "weakened_assertion" in types

    def test_weakened_detail_includes_context(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_WEAKENED_ASSERTION)
        weakened = [r for r in regressions if r["type"] == "weakened_assertion"]
        assert len(weakened) >= 1
        # Detail should mention what changed
        assert any("assert result" in r["detail"] for r in weakened)

    def test_refactored_not_weakened_is_clean(self):
        """isinstance → type() is is a refactor, not a weakening."""
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REFACTORED_NOT_WEAKENED)
        types = [r["type"] for r in regressions]
        assert "weakened_assertion" not in types


# =============================================================================
# detect_test_regressions — removed test functions
# =============================================================================


class TestRemovedFunctions:
    def test_detects_removed_test_function(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_FUNCTION)
        types = [r["type"] for r in regressions]
        assert "removed_test" in types

    def test_removed_test_detail_names_function(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_FUNCTION)
        removed = [r for r in regressions if r["type"] == "removed_test"]
        assert any("test_subtraction" in r["detail"] for r in removed)

    def test_removed_test_severity(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_FUNCTION)
        removed = [r for r in regressions if r["type"] == "removed_test"]
        assert removed[0]["severity"] == "error"


# =============================================================================
# detect_test_regressions — no regressions
# =============================================================================


class TestNoRegressions:
    def test_identical_content_returns_empty(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_IDENTICAL)
        assert regressions == []

    def test_added_tests_returns_empty(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_ADDED_TESTS)
        assert regressions == []

    def test_empty_inputs_returns_empty(self):
        regressions = detect_test_regressions("", "")
        assert regressions == []


# =============================================================================
# detect_test_regressions — multiple regressions
# =============================================================================


class TestMultipleRegressions:
    def test_detects_all_regression_types(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_MULTIPLE_REGRESSIONS)
        types = {r["type"] for r in regressions}
        # Should detect both weakened assertion AND added skip
        assert "weakened_assertion" in types
        assert "added_skip" in types


# =============================================================================
# is_ratchet_violation
# =============================================================================


class TestIsRatchetViolation:
    def test_empty_list_is_not_violation(self):
        assert is_ratchet_violation([]) is False

    def test_single_regression_is_violation(self):
        regressions = [{"type": "removed_assertion", "detail": "test_foo", "severity": "warning"}]
        assert is_ratchet_violation(regressions) is True

    def test_multiple_regressions_is_violation(self):
        regressions = [
            {"type": "removed_assertion", "detail": "test_foo", "severity": "warning"},
            {"type": "added_skip", "detail": "test_bar", "severity": "error"},
        ]
        assert is_ratchet_violation(regressions) is True

    def test_uses_real_detection(self):
        """Integration: pipe detect output into is_ratchet_violation."""
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_REMOVED_FUNCTION)
        assert is_ratchet_violation(regressions) is True

    def test_clean_diff_is_not_violation(self):
        regressions = detect_test_regressions(OLD_TEST_BASIC, NEW_TEST_IDENTICAL)
        assert is_ratchet_violation(regressions) is False
