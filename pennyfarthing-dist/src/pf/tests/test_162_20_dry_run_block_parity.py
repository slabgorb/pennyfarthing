"""Tests for story 162-20: finish --dry-run parity with the real-run merge gate.

Root cause (exact divergence)
------------------------------
The dry-run ``elif pr_number:`` arm (line ~1191) calls ``_pr_view`` — the
PERMISSIVE wrapper — and checks only ``_view_is_merged``.

The real-run gate (line ~1250) calls ``_pr_view_probe`` (which surfaces the
timeout separately as a second tuple element) and then ``_pr_block_reason``
(which detects CONFLICTING/DIRTY before any irreversible step is taken).

Two code paths call a different function on the same PR, producing a different
answer for two PR states:

(a) OPEN+CONFLICTING PR:
    Real run  → ``_pr_view_probe`` → ``_pr_block_reason`` → ABORTS with conflict msg
    Dry-run   → ``_pr_view`` → ``_view_is_merged`` only → "Merge PR #N" (LIE)

(b) Hung/timed-out gate probe:
    Real run  → ``_pr_view_probe`` → sees (None, timeout_msg) → ABORTS
    Dry-run   → ``_pr_view`` → timeout swallowed as None → ``_view_is_merged(None)``
                = False → "Merge PR #N" (LIE)

Dev interface (how to fix)
--------------------------
In the dry-run ``elif pr_number:`` arm, replace ``_pr_view`` with
``_pr_view_probe``, check ``gate_timeout`` for the abort/block signal, then
evaluate ``_pr_block_reason`` before ``_view_is_merged`` — mirroring the
real-run gate flow in read-only form.

Acceptance criteria
-------------------
- AC-1: OPEN+CONFLICTING PR: dry-run step-2 does NOT promise ``"Merge PR #N"``
  and reflects the same conflict signal ``_pr_block_reason`` would return.
- AC-2: Hung probe: dry-run step-2 does NOT promise ``"Merge PR #N"`` and
  reflects the timeout/abort signal (``success: False`` OR timeout keyword in
  step-2 action).
- AC-3 (over-reach guard): OPEN+CLEAN PR still gets the merge promise.
- AC-4 (over-reach guard): MERGED PR still gets the 155-31 already-merged skip.

Parity pinning: AC-1 imports ``_pr_block_reason`` from the production module to
compute the expected block signal — assertion survives message tweaks without
hardcoding wording.

Harness mirrors ``test_155_31_finish_dry_run_merged_preview.py``:
command-dispatching fake for ``story_finish._run`` + patched
``transition_story`` + patched ``pf.common.pr_config.get_pr_merge_mode``.
No ``monkeypatch.chdir``; ``get_project_root()`` env not needed (session/sprint
fixtures live in ``tmp_path``).

RED tests (fail on HEAD — assertion-level):
  - ``TestConflictingPrDryRunBlockParity`` — merge promise fires where block must
  - ``TestTimeoutProbeDryRunBlockParity``  — merge promise fires where abort must

Green-on-arrival over-reach guards (must stay green; logged as intentional-green
Design Deviations in the session):
  - ``TestDryRunBlockParityOverReachGuards`` — CLEAN and MERGED paths unchanged
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import (
    _pr_block_reason,
    _TimedOutProcess,
    finish_story,
)

# =============================================================================
# Fixtures — minimal sprint/.session project (mirrors test_155_31)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test16220"
  jira_sprint_id: 999
  jira_sprint_name: "Test16220"
  goal: Test finish dry-run block parity
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "162"
type: epic
title: "Finish dry-run/reality parity"
priority: p1
status: in_progress
stories:
  - id: 162-20
    title: finish dry-run block parity
    points: 1
    priority: p1
    status: in_progress
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "162-20"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-20: finish --dry-run parity

## Story Details
- **ID:** 162-20
- **Workflow:** tdd
- **Branch:** feat/162-20-dry-run-block-parity
- **PR:** #42 - dry-run block parity
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-20-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# PR view data shared across fakes and parity computations
# =============================================================================

_CONFLICTING_VIEW: dict[str, Any] = {
    "state": "OPEN",
    "mergedAt": None,
    "mergeable": "CONFLICTING",
    "mergeStateStatus": "DIRTY",
    "baseRefName": "develop",
}

_CLEAN_VIEW: dict[str, Any] = {
    "state": "OPEN",
    "mergedAt": None,
    "mergeable": "MERGEABLE",
    "mergeStateStatus": "CLEAN",
    "baseRefName": "develop",
}

_MERGED_VIEW: dict[str, Any] = {
    "state": "MERGED",
    "mergedAt": "2026-08-01T00:00:00Z",
    "mergeable": "UNKNOWN",
    "mergeStateStatus": "UNKNOWN",
    "baseRefName": "develop",
}

# =============================================================================
# Fakes — command-dispatching _run replacements
# =============================================================================


def _make_conflicting_world_run():
    """World: PR #42 is OPEN and CONFLICTING (cannot be merged cleanly)."""

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(_CONFLICTING_VIEW),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_timeout_world_run():
    """World: ``gh pr view`` hangs and times out — returns a _TimedOutProcess.

    ``_timed_out`` checks ``isinstance(result, _TimedOutProcess)`` — a plain
    MagicMock would NOT trigger the timeout path, hence the real class here.
    """

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return _TimedOutProcess(
                list(cmd),
                124,
                "",
                "Command '['gh', 'pr', 'view', '42', ...]' timed out after 120 seconds",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_clean_world_run():
    """World: PR #42 is OPEN and cleanly mergeable."""

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(_CLEAN_VIEW),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_merged_world_run():
    """World: PR #42 is already MERGED."""

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(_MERGED_VIEW),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


# =============================================================================
# Helpers
# =============================================================================


def _step2_actions(result: dict[str, Any]) -> list[str]:
    """Action strings of every dry-run plan entry with ``step == 2``."""
    return [
        str(s.get("action", ""))
        for s in result.get("steps", [])
        if s.get("step") == 2
    ]


# =============================================================================
# AC-1 — OPEN+CONFLICTING PR: dry-run must NOT promise the merge (RED on HEAD)
# =============================================================================


class TestConflictingPrDryRunBlockParity:
    """The dry-run plan for a CONFLICTING PR must reflect the same block the
    real run produces — never promise a merge the real run will abort.

    Both tests in this class are GENUINELY RED on HEAD: the current dry-run
    arm calls ``_pr_view`` + ``_view_is_merged`` only and falls through to
    ``"Merge PR #42 (squash, delete branch)"`` for a CONFLICTING view."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_dry_run_does_not_promise_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-1 primary: OPEN+CONFLICTING PR step-2 must NOT contain the merge
        promise. Today it does — ``_pr_block_reason`` is never evaluated."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_conflicting_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in dry-run plan: {result.get('steps')}"
        action = actions[0]
        assert "Merge PR #" not in action, (
            "dry-run step 2 promises a merge for a CONFLICTING PR — the real "
            f"run would abort with _pr_block_reason (162-20). Got: {action!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_dry_run_reflects_block_reason(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-1 parity: the dry-run step-2 must surface the same conflict
        signal ``_pr_block_reason`` would return for this view.

        Parity is pinned by computing the expected block from the production
        function — assertion survives message tweaks without hardcoding wording.
        The keyword 'CONFLICTING' appears in _pr_block_reason's output for this
        view; a match proves the preview evaluated the block path.
        """
        # Compute the real-run block reason from the identical view data.
        expected_block = _pr_block_reason("42", _CONFLICTING_VIEW)
        assert expected_block is not None, (
            "_pr_block_reason must return a block for the CONFLICTING fixture "
            "(test setup error if this assertion fires)"
        )
        assert "CONFLICTING" in expected_block, (
            f"_pr_block_reason output must contain 'CONFLICTING': {expected_block!r}"
        )

        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_conflicting_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in dry-run plan: {result.get('steps')}"
        action = actions[0]
        # Parity keyword check: the dry-run must surface the block signal.
        assert "CONFLICTING" in action or "conflict" in action.lower(), (
            "dry-run step-2 for CONFLICTING PR must mention the conflict — "
            f"real run blocks with: {expected_block!r}. Got: {action!r}"
        )


# =============================================================================
# AC-2 — Hung gate probe: dry-run must NOT promise the merge (RED on HEAD)
# =============================================================================


class TestTimeoutProbeDryRunBlockParity:
    """The dry-run plan for a hung/timed-out gate probe must reflect the abort
    the real run produces — never promise a merge it cannot guarantee.

    Both tests in this class are GENUINELY RED on HEAD: the current dry-run
    arm calls ``_pr_view`` which swallows the _TimedOutProcess as None, then
    ``_view_is_merged(None)`` = False falls through to the merge promise.
    The real-run gate calls ``_pr_view_probe``, sees ``gate_timeout``, and
    aborts before any irreversible step (162-9)."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_timeout_probe_dry_run_does_not_promise_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-2 primary: when ``gh pr view`` returns a _TimedOutProcess, the
        dry-run step-2 must NOT contain the merge promise. Today it does —
        the permissive ``_pr_view`` wrapper swallows the timeout as None."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_timeout_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in dry-run plan: {result.get('steps')}"
        action = actions[0]
        assert "Merge PR #" not in action, (
            "dry-run step 2 promises a merge after a timed-out gate probe — the "
            f"real run would abort (162-20 / 162-9). Got: {action!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_timeout_probe_dry_run_reflects_abort(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-2 parity: a hung probe must produce an abort signal in the
        dry-run output — ``success: False`` OR a timeout/abort keyword in
        step-2. The real run refuses to attempt a merge without knowing PR
        state (162-9); the preview must say the same, not over-promise."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_timeout_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        action = actions[0] if actions else ""
        # Parity: real run aborts (success=False). Dry-run must signal the same.
        signals_abort = result.get("success") is False or any(
            kw in action.lower()
            for kw in ("timed out", "timeout", "hung", "abort", "refusing")
        )
        assert signals_abort, (
            "dry-run for a hung probe must signal the abort — either "
            "``success: False`` or a timeout/abort keyword in step-2 action. "
            f"Got result: {result!r}"
        )


# =============================================================================
# AC-3 / AC-4 — Over-reach guards (green-on-arrival; intentional-green logged)
# =============================================================================


class TestDryRunBlockParityOverReachGuards:
    """The CONFLICTING/timeout block must NOT fire for PRs the real run merges.
    All tests in this class are green on HEAD and must remain green post-fix.
    Logged as intentional-green Design Deviations in the session."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_open_pr_still_previews_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-3: OPEN+CLEAN PR must still get the merge promise — the fix must
        not over-block cleanly mergeable PRs."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_clean_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in dry-run plan: {result.get('steps')}"
        assert "Merge PR #42" in actions[0], (
            f"OPEN+CLEAN PR must still preview the merge: {actions[0]!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_still_previews_already_merged_skip(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """AC-4: MERGED PR must still get the 155-31 already-merged skip
        preview — the 162-20 fix must not regress the 155-31 path."""
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_merged_world_run(),
        ):
            result = finish_story(project, "162-20", dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in dry-run plan: {result.get('steps')}"
        action = actions[0]
        assert "already merged" in action.lower() and "skip" in action.lower(), (
            f"MERGED PR dry-run must preserve 155-31 already-merged/skip path: {action!r}"
        )
        assert "Merge PR #" not in action, (
            f"MERGED PR dry-run must not promise a merge: {action!r}"
        )
