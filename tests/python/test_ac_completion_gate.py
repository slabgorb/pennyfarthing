"""Tests for AC-completion gate.

Story: 144-3 (Create AC-completion gate)

Tests validate_ac_completion() against all 8 ACs from story context.
Each AC maps to a test class. Tests are in RED state — stub raises NotImplementedError.

Run with: python -m pytest tests/python/test_ac_completion_gate.py -v
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.gates.ac_completion import (  # noqa: E402
    VALID_STATUSES,
    validate_ac_completion,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def tmp_context(tmp_path):
    """Factory: write context document content to a temp file."""

    def _write(content: str) -> Path:
        p = tmp_path / "context-story-5-1.md"
        p.write_text(textwrap.dedent(content))
        return p

    return _write


@pytest.fixture
def tmp_session(tmp_path):
    """Factory: write session file content to a temp file."""

    def _write(content: str) -> Path:
        p = tmp_path / "session.md"
        p.write_text(textwrap.dedent(content))
        return p

    return _write


def _make_ac_section(*acs: str) -> str:
    """Build a ## AC Context section with numbered ACs."""
    lines = ["## AC Context", ""]
    for i, ac in enumerate(acs, start=1):
        lines.append(f"### AC-{i}: {ac}")
        lines.append("")
        lines.append(f"**Given** a precondition for AC-{i}")
        lines.append(f"**When** the action for AC-{i}")
        lines.append(f"**Then** the expected result for AC-{i}")
        lines.append("")
    return "\n".join(lines)


def _make_session_with_statuses(statuses: dict[str, str]) -> str:
    """Build a session file with AC status markers.

    statuses: {"AC-1": "DONE", "AC-2": "DEFERRED reason here", ...}
    """
    lines = [
        "# Story 5-1: Test",
        "",
        "**Phase:** green",
        "",
        "## AC Status",
        "",
    ]
    for ac_id, status in statuses.items():
        lines.append(f"- {ac_id}: {status}")
    lines.append("")
    return "\n".join(lines)


# A prompt_fn that always approves
APPROVE_ALL = MagicMock(return_value=True)

# A prompt_fn that always rejects
REJECT_ALL = MagicMock(return_value=False)


# =============================================================================
# AC-1: Gate reads AC list from story context document
# =============================================================================


class TestGateReadsAcList:
    """AC-1: Gate reads the AC list from the context document's ## AC Context."""

    def test_reads_all_acs_from_context(self, tmp_context, tmp_session):
        """Gate should identify all 10 ACs in the context document."""
        context = tmp_context(
            "# Story 5-1: Test\n\n"
            + _make_ac_section(*[f"Criterion {i}" for i in range(1, 11)])
        )
        session = tmp_session(
            _make_session_with_statuses(
                {f"AC-{i}": "DONE" for i in range(1, 11)}
            )
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"
        assert result["ac_count"] == 10

    def test_context_file_not_found(self, tmp_session, tmp_path):
        """Missing context file produces specific error message."""
        missing = tmp_path / "nonexistent.md"
        session = tmp_session("# Story\n")
        result = validate_ac_completion(missing, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        assert "not found" in result["errors"][0]["message"].lower()

    def test_no_ac_context_section(self, tmp_context, tmp_session):
        """Context document without ## AC Context section fails."""
        context = tmp_context(
            "# Story 5-1: Test\n\n## Business Context\n\nSome text.\n"
        )
        session = tmp_session("# Story\n")
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        assert len(result["errors"]) >= 1
        assert "ac context" in result["errors"][0]["message"].lower()

    def test_single_ac(self, tmp_context, tmp_session):
        """Gate works with just one AC."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("Single criterion")
        )
        session = tmp_session(_make_session_with_statuses({"AC-1": "DONE"}))
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"
        assert result["ac_count"] == 1


# =============================================================================
# AC-2: All DONE ACs pass without operator prompt
# =============================================================================


class TestAllDonePassesWithoutPrompt:
    """AC-2: When all ACs are DONE, gate passes with no operator interaction."""

    def test_all_done_passes(self, tmp_context, tmp_session):
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third")
        )
        session = tmp_session(
            _make_session_with_statuses(
                {"AC-1": "DONE", "AC-2": "DONE", "AC-3": "DONE"}
            )
        )
        mock_prompt = MagicMock(return_value=True)
        result = validate_ac_completion(context, session, prompt_fn=mock_prompt)
        assert result["status"] == "pass"
        mock_prompt.assert_not_called()

    def test_accountability_table_logged(self, tmp_context, tmp_session):
        """Pass result includes full accountability table."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE", "AC-2": "DONE"})
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"
        assert "accountability_table" in result
        table = result["accountability_table"]
        assert len(table) == 2
        assert all(entry["status"] == "DONE" for entry in table)

    def test_accountability_table_has_ac_identifiers(self, tmp_context, tmp_session):
        """Each table entry includes the AC identifier."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("Alpha", "Beta")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE", "AC-2": "DONE"})
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        ids = [entry["ac_id"] for entry in result["accountability_table"]]
        assert "AC-1" in ids
        assert "AC-2" in ids


# =============================================================================
# AC-3: DEFERRED ACs prompt operator in real-time
# =============================================================================


class TestDeferredPromptsOperator:
    """AC-3: DEFERRED ACs trigger a real-time operator prompt."""

    def test_deferred_ac_triggers_prompt(self, tmp_context, tmp_session):
        """Prompt is called for DEFERRED AC."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Requires config infrastructure from Story 1.20",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        validate_ac_completion(context, session, prompt_fn=mock_prompt)
        mock_prompt.assert_called_once()

    def test_prompt_includes_ac_identifier(self, tmp_context, tmp_session):
        """Prompt args include the AC identifier."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Deferred one")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Some reason",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        validate_ac_completion(context, session, prompt_fn=mock_prompt)
        args = mock_prompt.call_args
        assert "AC-2" in str(args)

    def test_prompt_includes_justification(self, tmp_context, tmp_session):
        """Prompt args include the deferral justification."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Deferred one")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Requires config infrastructure from Story 1.20",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        validate_ac_completion(context, session, prompt_fn=mock_prompt)
        args = mock_prompt.call_args
        assert "Requires config infrastructure from Story 1.20" in str(args)

    def test_done_acs_do_not_trigger_prompt(self, tmp_context, tmp_session):
        """DONE ACs should not trigger any prompt."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("Only done")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        mock_prompt = MagicMock(return_value=True)
        validate_ac_completion(context, session, prompt_fn=mock_prompt)
        mock_prompt.assert_not_called()


# =============================================================================
# AC-4: Operator-approved deferral is logged in session
# =============================================================================


class TestApprovedDeferralLogged:
    """AC-4: Approved deferrals are recorded in the accountability table."""

    def test_approved_deferral_passes(self, tmp_context, tmp_session):
        """Gate passes when operator approves the deferral."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Good reason",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=True)
        )
        assert result["status"] == "pass"

    def test_approved_deferral_in_accountability_table(self, tmp_context, tmp_session):
        """Accountability table shows DEFERRED with operator-approved flag."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Good reason",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=True)
        )
        table = result["accountability_table"]
        deferred_entry = [e for e in table if e["ac_id"] == "AC-2"][0]
        assert "DEFERRED" in deferred_entry["status"]
        assert deferred_entry.get("operator_approved") is True

    def test_approved_deferral_has_justification(self, tmp_context, tmp_session):
        """Accountability table entry includes the justification text."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Requires config infrastructure",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=True)
        )
        table = result["accountability_table"]
        deferred_entry = [e for e in table if e["ac_id"] == "AC-2"][0]
        assert "Requires config infrastructure" in deferred_entry.get("justification", "")

    def test_multiple_deferrals_all_approved(self, tmp_context, tmp_session):
        """Gate passes when all deferrals are approved."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Reason A",
                "AC-3": "DEFERRED Reason B",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        result = validate_ac_completion(context, session, prompt_fn=mock_prompt)
        assert result["status"] == "pass"
        assert mock_prompt.call_count == 2


# =============================================================================
# AC-5: Operator-rejected deferral fails the gate
# =============================================================================


class TestRejectedDeferralFails:
    """AC-5: Rejected deferral fails the gate immediately."""

    def test_rejected_deferral_fails(self, tmp_context, tmp_session):
        """Gate fails when operator rejects the deferral."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Weak reason",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=False)
        )
        assert result["status"] == "fail"

    def test_rejection_recovery_message(self, tmp_context, tmp_session):
        """Recovery message names the specific AC."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Weak reason",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=False)
        )
        assert any("AC-2" in e["message"] for e in result["errors"])

    def test_rejection_recovery_suggests_implement(self, tmp_context, tmp_session):
        """Recovery message tells Dev to implement or provide stronger justification."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Weak reason",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=False)
        )
        error_msg = result["errors"][0]["message"].lower()
        assert "implement" in error_msg or "justification" in error_msg

    def test_gate_is_idempotent_after_rejection(self, tmp_context, tmp_session):
        """Re-running after rejection produces same result (no cached state)."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Weak reason",
            })
        )
        reject = MagicMock(return_value=False)
        result1 = validate_ac_completion(context, session, prompt_fn=reject)
        result2 = validate_ac_completion(context, session, prompt_fn=reject)
        assert result1["status"] == result2["status"] == "fail"


# =============================================================================
# AC-6: DESCOPED ACs also prompt operator for approval
# =============================================================================


class TestDescopedPromptsOperator:
    """AC-6: DESCOPED is treated identically to DEFERRED for approval."""

    def test_descoped_triggers_prompt(self, tmp_context, tmp_session):
        """Prompt is called for DESCOPED AC."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DESCOPED Out of scope for MVP",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        validate_ac_completion(context, session, prompt_fn=mock_prompt)
        mock_prompt.assert_called_once()

    def test_approved_descoped_passes(self, tmp_context, tmp_session):
        """Gate passes when operator approves descoped AC."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DESCOPED Out of scope for MVP",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=True)
        )
        assert result["status"] == "pass"

    def test_rejected_descoped_fails(self, tmp_context, tmp_session):
        """Gate fails when operator rejects descoped AC."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DESCOPED Out of scope for MVP",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=False)
        )
        assert result["status"] == "fail"

    def test_descoped_in_accountability_table(self, tmp_context, tmp_session):
        """Approved DESCOPED shows correctly in accountability table."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DESCOPED Out of scope for MVP",
            })
        )
        result = validate_ac_completion(
            context, session, prompt_fn=MagicMock(return_value=True)
        )
        table = result["accountability_table"]
        descoped_entry = [e for e in table if e["ac_id"] == "AC-2"][0]
        assert "DESCOPED" in descoped_entry["status"]
        assert descoped_entry.get("operator_approved") is True

    def test_mixed_deferred_and_descoped(self, tmp_context, tmp_session):
        """Both DEFERRED and DESCOPED in same session both prompt."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Reason A",
                "AC-3": "DESCOPED Reason B",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        result = validate_ac_completion(context, session, prompt_fn=mock_prompt)
        assert result["status"] == "pass"
        assert mock_prompt.call_count == 2


# =============================================================================
# AC-7: Unstatused ACs fail the gate with specific identifier
# =============================================================================


class TestUnstatusedAcFails:
    """AC-7: ACs with no status fail with the specific AC identifier."""

    def test_missing_status_fails(self, tmp_context, tmp_session):
        """AC without any status marker fails the gate."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-3": "DONE",
                # AC-2 intentionally missing
            })
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"

    def test_failure_names_specific_ac(self, tmp_context, tmp_session):
        """Error message names AC-5 specifically."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section(*[f"Criterion {i}" for i in range(1, 6)])
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DONE",
                "AC-3": "DONE",
                "AC-4": "DONE",
                # AC-5 intentionally missing
            })
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        assert any("AC-5" in e["message"] for e in result["errors"])

    def test_recovery_includes_valid_statuses(self, tmp_context, tmp_session):
        """Recovery message tells Dev the three valid status options."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First", "Second")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
            # AC-2 missing
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        error_msg = result["errors"][0]["message"]
        assert "DONE" in error_msg
        assert "DEFERRED" in error_msg
        assert "DESCOPED" in error_msg

    def test_ac_not_mentioned_in_session_at_all(self, tmp_context, tmp_session):
        """AC exists in context but has zero mentions in session file."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("Alpha", "Beta")
        )
        # Session has AC-1 but AC-2 is completely absent
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        assert any("AC-2" in e["message"] for e in result["errors"])

    def test_invalid_status_value_treated_as_unstatused(self, tmp_context, tmp_session):
        """A status value that is not DONE/DEFERRED/DESCOPED fails."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "WIP"})
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"


# =============================================================================
# AC-8: Gate is composable — works standalone from any workflow phase
# =============================================================================


class TestGateIsComposable:
    """AC-8: Gate accepts CONTEXT_FILE and SESSION_FILE, no hard-coded assumptions."""

    def test_works_with_arbitrary_file_paths(self, tmp_path):
        """Gate works with files at unusual paths."""
        context_dir = tmp_path / "deep" / "nested" / "context"
        context_dir.mkdir(parents=True)
        context_file = context_dir / "my-context.md"
        context_file.write_text(
            "# Story\n\n" + _make_ac_section("Only criterion")
        )

        session_dir = tmp_path / "other" / "place"
        session_dir.mkdir(parents=True)
        session_file = session_dir / "my-session.md"
        session_file.write_text(
            _make_session_with_statuses({"AC-1": "DONE"})
        )

        result = validate_ac_completion(
            context_file, session_file, prompt_fn=APPROVE_ALL
        )
        assert result["status"] == "pass"

    def test_no_phase_assumption(self, tmp_context, tmp_session):
        """Gate does not check or require a specific workflow phase."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        # Session with phase: review (not green)
        session = tmp_session(
            "# Story\n\n**Phase:** review\n\n"
            + "## AC Status\n\n- AC-1: DONE\n"
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"

    def test_no_agent_assumption(self, tmp_context, tmp_session):
        """Gate does not require or check agent identity."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        # No agent parameter needed — composable
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"

    def test_session_file_not_found(self, tmp_context, tmp_path):
        """Missing session file produces specific error."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        missing = tmp_path / "nonexistent-session.md"
        result = validate_ac_completion(context, missing, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"
        assert "not found" in result["errors"][0]["message"].lower()


# =============================================================================
# Edge cases — the mechanic stress-tests every weak point
# =============================================================================


class TestEdgeCases:
    """Boundary conditions and robustness checks."""

    def test_constants_exposed(self):
        """Module exposes VALID_STATUSES constant."""
        assert "DONE" in VALID_STATUSES
        assert "DEFERRED" in VALID_STATUSES
        assert "DESCOPED" in VALID_STATUSES
        assert len(VALID_STATUSES) == 3

    def test_empty_context_file(self, tmp_context, tmp_session):
        """Empty context file fails gracefully."""
        context = tmp_context("")
        session = tmp_session("# Story\n")
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"

    def test_empty_session_file(self, tmp_context, tmp_session):
        """Empty session file fails gracefully — ACs have no status."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        session = tmp_session("")
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "fail"

    def test_ac_section_stops_at_next_h2(self, tmp_context, tmp_session):
        """Parser only reads ACs under ## AC Context, not content after next ##."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("Real AC")
            + "\n## Assumptions\n\n### AC-99: Fake AC in wrong section\n"
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"
        assert result["ac_count"] == 1  # Only AC-1, not AC-99

    def test_idempotent_passing_run(self, tmp_context, tmp_session):
        """Running twice on same inputs produces same result."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        result1 = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        result2 = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result1["status"] == result2["status"]
        assert result1["ac_count"] == result2["ac_count"]

    def test_context_file_not_modified(self, tmp_context, tmp_session):
        """Gate must not modify the context document."""
        context = tmp_context(
            "# Story\n\n" + _make_ac_section("First")
        )
        session = tmp_session(
            _make_session_with_statuses({"AC-1": "DONE"})
        )
        content_before = context.read_text()
        validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert context.read_text() == content_before

    def test_many_acs_all_done(self, tmp_context, tmp_session):
        """Handles a large number of ACs (20) without issue."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section(*[f"Criterion {i}" for i in range(1, 21)])
        )
        session = tmp_session(
            _make_session_with_statuses(
                {f"AC-{i}": "DONE" for i in range(1, 21)}
            )
        )
        result = validate_ac_completion(context, session, prompt_fn=APPROVE_ALL)
        assert result["status"] == "pass"
        assert result["ac_count"] == 20

    def test_mixed_statuses_all_approved(self, tmp_context, tmp_session):
        """Mix of DONE, DEFERRED, DESCOPED — all approved — passes."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third", "Fourth")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Reason A",
                "AC-3": "DESCOPED Reason B",
                "AC-4": "DONE",
            })
        )
        mock_prompt = MagicMock(return_value=True)
        result = validate_ac_completion(context, session, prompt_fn=mock_prompt)
        assert result["status"] == "pass"
        assert mock_prompt.call_count == 2  # AC-2 and AC-3

    def test_first_rejected_fails_immediately(self, tmp_context, tmp_session):
        """Gate fails on first rejected deferral — doesn't continue to others."""
        context = tmp_context(
            "# Story\n\n"
            + _make_ac_section("First", "Second", "Third")
        )
        session = tmp_session(
            _make_session_with_statuses({
                "AC-1": "DONE",
                "AC-2": "DEFERRED Reason A",
                "AC-3": "DEFERRED Reason B",
            })
        )
        # First call rejects, second should not happen
        mock_prompt = MagicMock(return_value=False)
        result = validate_ac_completion(context, session, prompt_fn=mock_prompt)
        assert result["status"] == "fail"
        # Per AC-5: "Gate fails immediately on first rejected deferral"
        assert mock_prompt.call_count == 1
