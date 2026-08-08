"""Counter WRITER must replace-not-insert; READER must not prefer found over unreadable.

Story 162-50 (parent 162-28).

Two halves of one defect — each half was sufficient to let a corrupt counter
bypass the 162-59 unreadable-counter guard:

(a) WRITER: When the operative round-trip counter is UNREADABLE (present but
    unparseable), ``complete_phase`` falls into the absent branch and INSERTS a
    fresh ``**Round-Trip Count:** 1`` beside the corrupt line.  The resulting
    session now has TWO counter lines — one corrupt, one valid.

(b) READER: With both a readable and an unreadable line present,
    ``read_round_trip_count`` finds the valid match via
    ``find_operative_round_trip_line`` and returns ``found/1``, silently
    rendering 162-59's unreadable guard inert (measured:
    found/1 → ready / approval_rework / green / dev, budget reset).

Acceptance criteria under test:

- [W1] When the counter is UNREADABLE, ``complete_phase`` replaces it rather
       than inserting.  After the call the session has exactly ONE counter line
       and it is parseable.
- [W2] When the counter is ABSENT the existing insert behaviour is preserved.
- [W3] When the counter is readable the increment behaviour is preserved.
- [R1] ``read_round_trip_count`` returns ``unreadable`` when the preamble
       carries BOTH a readable and an unreadable counter line.
- [R2] The unreadable state propagates regardless of which order the two lines
       appear in the preamble.
- [E2E] The writer-fix and reader-fix together: after ``complete_phase`` runs on
        a corrupt counter the resulting session is readable (one parseable line).

Scope: NOT exercising resolve_gate — per the brief, resolve_gate now blocks
first on the rework route (162-59) and would mask the writer path.  These tests
drive ``complete_phase`` directly.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.handoff.complete_phase import complete_phase
from pf.handoff.gate_recovery import COUNTER_LINE_RE, read_round_trip_count
from pf.tests.test_162_21_resolve_gate_rejected_verdict import (
    STORY_ID,
    _load_real_tdd,
    _make_session,
    _setup_project,
)

# The preamble anchor the counter sits under in _make_session fixtures.
_ANCHOR = "**Phase Started:** 2026-08-06T13:00:00Z"


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------


def _session_with_corrupt_counter(corrupt_value: str = "one") -> str:
    """Review-phase session whose round-trip counter is unparseable."""
    session = _make_session(verdict="REJECTED")
    corrupt_line = f"**Round-Trip Count:** {corrupt_value}"
    return session.replace(_ANCHOR, f"{_ANCHOR}\n{corrupt_line}", 1)


def _session_absent_counter() -> str:
    """Review-phase session with no round-trip counter (first review)."""
    return _make_session(verdict="REJECTED")


def _session_readable_counter(count: int) -> str:
    """Review-phase session with a clean counter at ``count``."""
    return _make_session(verdict="REJECTED", round_trip_count=count)


def _session_with_dual_counter(readable: int = 1, corrupt: str = "one") -> str:
    """Session carrying BOTH a readable and an unreadable counter line.

    This is the post-writer-bug state: the writer inserted a fresh
    ``**Round-Trip Count:** 1`` alongside an existing corrupt line.
    """
    session = _make_session(verdict="REJECTED")
    dual_block = f"**Round-Trip Count:** {readable}\n**Round-Trip Count:** {corrupt}"
    return session.replace(_ANCHOR, f"{_ANCHOR}\n{dual_block}", 1)


def _setup(tmp_path: Path, session: str) -> Path:
    return _setup_project(tmp_path, _load_real_tdd(), session)


def _read_session(project: Path) -> str:
    return (project / ".session" / f"{STORY_ID}-session.md").read_text(encoding="utf-8")


def _counter_line_count(text: str) -> int:
    """Number of ``**Round-Trip Count:**`` lines visible in ``text``."""
    return len(COUNTER_LINE_RE.findall(text))


def _complete_rework(project: Path) -> dict:
    """Call complete_phase directly on the review→green rework path."""
    return complete_phase(STORY_ID, "tdd", "review", "green", "approval_rework", project)


# ---------------------------------------------------------------------------
# W1: WRITER replaces the corrupt counter instead of inserting beside it
# ---------------------------------------------------------------------------


# Every form that makes the counter unreadable — mirrors CORRUPTIONS in 162-59.
CORRUPT_VALUES = [
    pytest.param("one", id="spelled-out-word"),
    pytest.param("1 (after rework)", id="trailing-annotation"),
    pytest.param("1_000", id="underscored-digits"),
    pytest.param("3.", id="trailing-decimal-point"),
    pytest.param("-3", id="negative-value"),
    pytest.param("", id="empty-value"),
]


class TestWriterReplacesNotInserts:
    """[W1] After complete_phase on an unreadable counter the session has ONE
    counter line and that line is parseable."""

    @pytest.mark.parametrize("corrupt_value", CORRUPT_VALUES)
    def test_single_counter_line_after_rework_on_corrupt(
        self, tmp_path, corrupt_value
    ) -> None:
        """The defect: a second ``**Round-Trip Count:** 1`` is inserted beside the
        corrupt line instead of replacing it.  The fix must leave exactly one line.
        """
        project = _setup(tmp_path, _session_with_corrupt_counter(corrupt_value))
        result = _complete_rework(project)

        assert result["status"] == "success", (
            f"complete_phase failed before the counter was even reached: {result}"
        )
        session = _read_session(project)
        count = _counter_line_count(session)
        assert count == 1, (
            f"writer inserted a second counter beside the corrupt one "
            f"(corrupt_value={corrupt_value!r}): found {count} counter line(s). "
            "Fix: replace-not-insert."
        )

    @pytest.mark.parametrize("corrupt_value", CORRUPT_VALUES)
    def test_counter_is_parseable_after_rework_on_corrupt(
        self, tmp_path, corrupt_value
    ) -> None:
        """After the fix the single counter line must be a readable integer."""
        project = _setup(tmp_path, _session_with_corrupt_counter(corrupt_value))
        _complete_rework(project)

        session = _read_session(project)
        reading = read_round_trip_count(session)
        assert reading["status"] == "found", (
            f"counter is still unreadable after complete_phase replaced it "
            f"(corrupt_value={corrupt_value!r}): {reading}"
        )
        assert reading["count"] == 1, (
            f"replaced counter should be 1 for the first rework; got {reading['count']}"
        )


# ---------------------------------------------------------------------------
# W2 / W3: existing absent and readable paths are preserved
# ---------------------------------------------------------------------------


class TestWriterPreservesExistingBehaviours:
    def test_absent_counter_is_inserted(self, tmp_path) -> None:
        """[W2] A first rework from an absent counter must still insert one."""
        project = _setup(tmp_path, _session_absent_counter())
        result = _complete_rework(project)

        assert result["status"] == "success", result
        session = _read_session(project)
        reading = read_round_trip_count(session)
        assert reading == {"status": "found", "count": 1, "detail": ""}, (
            f"absent → insert did not produce a clean counter: {reading}"
        )

    def test_readable_counter_is_incremented(self, tmp_path) -> None:
        """[W3] A readable counter must still be incremented in-place."""
        project = _setup(tmp_path, _session_readable_counter(2))
        result = _complete_rework(project)

        assert result["status"] == "success", result
        session = _read_session(project)
        reading = read_round_trip_count(session)
        assert reading == {"status": "found", "count": 3, "detail": ""}, (
            f"readable counter was not incremented: {reading}"
        )
        count = _counter_line_count(session)
        assert count == 1, f"increment left {count} counter lines instead of 1"


# ---------------------------------------------------------------------------
# R1 / R2: READER returns unreadable when both kinds of counter line are present
# ---------------------------------------------------------------------------


# These are the VISIBLE corrupt forms — both lines appear unmasked in the
# preamble.  Hidden forms (backtick, HTML comment, fence) are NOT in this list:
# the reader fix is scoped to visible corruption only (masked-preamble
# comparison), so a backtick illustration alongside a valid counter reads as
# found/1, exactly as the 162-28 pinned tests require.
DUAL_COUNTER_VARIANTS = [
    pytest.param("**Round-Trip Count:** 1", "**Round-Trip Count:** one",
                 id="valid-first-corrupt-second"),
    pytest.param("**Round-Trip Count:** one", "**Round-Trip Count:** 1",
                 id="corrupt-first-valid-second"),
    pytest.param("**Round-Trip Count:** 1", "**Round-Trip Count:** 3.",
                 id="valid-first-decimal-second"),
    pytest.param("**Round-Trip Count:** 1", "**Round-Trip Count:** -3",
                 id="valid-first-negative-second"),
    pytest.param("**Round-Trip Count:** 2", "**Round-Trip Count:** 1 (after rework)",
                 id="valid-first-annotated-second"),
]


class TestReaderPrefersUnreadableOverFound:
    """[R1/R2] When the preamble carries BOTH a readable and an unreadable counter
    line, ``read_round_trip_count`` must return ``unreadable`` — not ``found``."""

    @pytest.mark.parametrize(("line_a", "line_b"), DUAL_COUNTER_VARIANTS)
    def test_dual_counter_reads_as_unreadable(self, line_a, line_b) -> None:
        """The post-writer-bug session must not silently read as found.

        162-59's guard is keyed on ``status == "unreadable"``.  A ``found``
        reading from a session carrying BOTH a valid and a corrupt line renders
        162-59 inert: the guard never fires, and the budget is silently reset.
        """
        # Build a preamble section with both lines present
        session = _make_session(verdict="REJECTED")
        dual_block = f"{line_a}\n{line_b}"
        session_with_dual = session.replace(_ANCHOR, f"{_ANCHOR}\n{dual_block}", 1)

        reading = read_round_trip_count(session_with_dual)

        assert reading["status"] == "unreadable", (
            f"read_round_trip_count returned {reading['status']!r} on a session "
            f"with both lines ({line_a!r} and {line_b!r}); expected 'unreadable'. "
            "A found/1 reading here resets the round-trip budget and disarms "
            "162-59's unreadable-counter guard."
        )

    def test_single_valid_counter_still_reads_found(self) -> None:
        """[R2] The fix must not over-block: a lone readable counter stays 'found'."""
        session = _session_readable_counter(2)
        reading = read_round_trip_count(session)

        assert reading == {"status": "found", "count": 2, "detail": ""}, (
            f"a lone readable counter no longer reads as found: {reading}"
        )


# ---------------------------------------------------------------------------
# E2E: after the writer fix the resulting session is also reader-clean
# ---------------------------------------------------------------------------


class TestWriterAndReaderTogether:
    @pytest.mark.parametrize("corrupt_value", CORRUPT_VALUES)
    def test_session_is_reader_clean_after_complete_phase(
        self, tmp_path, corrupt_value
    ) -> None:
        """[E2E] complete_phase on a corrupt counter must produce a session whose
        counter ``read_round_trip_count`` reads as ``found`` — not ``unreadable``
        (which would happen if the writer left two lines and the reader's
        dual-counter guard then kicked in)."""
        project = _setup(tmp_path, _session_with_corrupt_counter(corrupt_value))
        result = _complete_rework(project)

        assert result["status"] == "success", result
        session = _read_session(project)
        reading = read_round_trip_count(session)

        assert reading["status"] == "found", (
            f"session is still unreadable after complete_phase "
            f"(corrupt_value={corrupt_value!r}): {reading}"
        )
