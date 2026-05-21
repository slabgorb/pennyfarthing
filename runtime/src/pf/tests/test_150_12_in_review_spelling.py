"""Tests for status normalization and transition gating.

Story: 150-12 — Audit in_review flow — spelling consistency and transition gating.

Tests:
1. normalize_status() converts variant spellings to canonical form
2. is_valid_transition() enforces the state machine
3. Normalization is applied before transition checks
"""

import pytest

from pf.sprint.status_normalize import (
    VALID_TRANSITIONS,
    is_valid_transition,
    normalize_status,
)


class TestNormalizeStatus:
    """normalize_status() should map all variant spellings to canonical form."""

    def test_already_canonical(self) -> None:
        """in_review (underscore) is already canonical — pass through."""
        assert normalize_status("in_review") == "in_review"

    def test_hyphen_variant(self) -> None:
        """in-review (hyphen) normalizes to in_review."""
        assert normalize_status("in-review") == "in_review"

    def test_space_variant(self) -> None:
        """'in review' (space) normalizes to in_review."""
        assert normalize_status("in review") == "in_review"

    def test_title_case(self) -> None:
        """'In Review' (title case) normalizes to in_review."""
        assert normalize_status("In Review") == "in_review"

    def test_upper_case(self) -> None:
        """'IN_REVIEW' (upper case) normalizes to in_review."""
        assert normalize_status("IN_REVIEW") == "in_review"

    def test_in_progress_passthrough(self) -> None:
        """Other statuses pass through unchanged."""
        assert normalize_status("in_progress") == "in_progress"

    def test_done_passthrough(self) -> None:
        """done passes through unchanged."""
        assert normalize_status("done") == "done"

    def test_backlog_passthrough(self) -> None:
        """backlog passes through unchanged."""
        assert normalize_status("backlog") == "backlog"

    def test_in_progress_hyphen_variant(self) -> None:
        """in-progress (hyphen) normalizes to in_progress."""
        assert normalize_status("in-progress") == "in_progress"

    def test_in_progress_title_case(self) -> None:
        """'In Progress' (title case) normalizes to in_progress."""
        assert normalize_status("In Progress") == "in_progress"


class TestValidTransitions:
    """VALID_TRANSITIONS defines the allowed state machine."""

    def test_backlog_to_in_progress(self) -> None:
        """backlog → in_progress is valid."""
        assert "in_progress" in VALID_TRANSITIONS["backlog"]

    def test_in_progress_to_in_review(self) -> None:
        """in_progress → in_review is valid."""
        assert "in_review" in VALID_TRANSITIONS["in_progress"]

    def test_in_review_to_done(self) -> None:
        """in_review → done is valid."""
        assert "done" in VALID_TRANSITIONS["in_review"]

    def test_in_progress_to_done_not_valid(self) -> None:
        """in_progress → done is NOT valid (must go through in_review)."""
        assert "done" not in VALID_TRANSITIONS["in_progress"]


class TestIsValidTransition:
    """is_valid_transition() checks the state machine with normalization."""

    def test_in_review_to_done(self) -> None:
        """in_review → done is valid."""
        assert is_valid_transition("in_review", "done") is True

    def test_in_progress_to_in_review(self) -> None:
        """in_progress → in_review is valid."""
        assert is_valid_transition("in_progress", "in_review") is True

    def test_in_progress_to_done_blocked(self) -> None:
        """in_progress → done must go through in_review."""
        assert is_valid_transition("in_progress", "done") is False

    def test_backlog_to_in_progress(self) -> None:
        """backlog → in_progress is valid."""
        assert is_valid_transition("backlog", "in_progress") is True

    def test_done_to_in_progress_blocked(self) -> None:
        """done → in_progress is NOT valid."""
        assert is_valid_transition("done", "in_progress") is False


class TestNormalizationBeforeTransition:
    """Variant spellings should be normalized before transition checks."""

    def test_hyphen_variant_to_done(self) -> None:
        """'in-review' → 'done' normalizes and succeeds."""
        assert is_valid_transition("in-review", "done") is True

    def test_title_case_to_done(self) -> None:
        """'In Review' → 'done' normalizes and succeeds."""
        assert is_valid_transition("In Review", "done") is True

    def test_hyphen_in_progress_to_in_review(self) -> None:
        """'in-progress' → 'in-review' normalizes both sides and succeeds."""
        assert is_valid_transition("in-progress", "in-review") is True

    def test_mixed_case_blocked(self) -> None:
        """'In Progress' → 'done' should still be blocked (normalization doesn't change rules)."""
        assert is_valid_transition("In Progress", "done") is False
