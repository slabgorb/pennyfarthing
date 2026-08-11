"""Tests for story 162-18: the MERGED bypass in story_finish must corroborate
PR state with a non-null ``mergedAt`` field before trusting any of the three
bypass paths.

Root cause
----------
``_view_is_merged`` checks only ``state == "MERGED"`` — it never reads
``mergedAt``. Because ``mergedAt`` is also absent from ``_PR_VIEW_FIELDS``,
the ``gh pr view`` probe snapshot never includes it. As a result, any response
where GitHub set ``state=MERGED`` but ``mergedAt`` is absent or null is
trusted identically to a fully-corroborated merge.

The three bypass paths all flow through ``_view_is_merged``:

  1. **Conflict-gate exemption** (``_pr_block_reason``): a MERGED PR is exempt
     from the hard CONFLICTING/DIRTY block. A state==MERGED/mergedAt=None
     snapshot must NOT receive that exemption — the gate must be allowed to
     speak.
  2. **Already-merged short-circuit** (``finish_story`` step 2): a pre-merge
     snapshot reporting state==MERGED causes ``gh pr merge`` to be skipped
     entirely. Without ``mergedAt`` corroboration a ghost snapshot can silently
     skip the real merge.
  3. **Post-merge re-verification** (``_pr_merge_verification`` /
     ``_view_is_merged``): the last guard before the story is marked done. A
     null ``mergedAt`` must fail verification even when ``state`` says MERGED.

Dev interface (what must change to make these tests green)
-----------------------------------------------------------
- Add ``mergedAt`` to ``_PR_VIEW_FIELDS`` so every ``gh pr view`` probe
  includes the field.
- In ``_view_is_merged``: require ``state == "MERGED"`` **AND** ``mergedAt``
  present and non-null. Do NOT change the case-fold on ``mergeable`` /
  ``mergeStateStatus`` inside ``_pr_block_reason`` — that is out of scope
  (opposite risk profile, filed separately in 162-3).
- All existing 162-3 tests and the green-on-arrival tests below must remain
  green.

True-RED tests (fail until Dev satisfies the corroboration predicate)
----------------------------------------------------------------------
- ``test_pr_view_fields_includes_mergedat``
- ``TestViewIsMergedRequiresMergedAt.test_merged_state_with_null_mergedat_is_not_merged``
- ``TestViewIsMergedRequiresMergedAt.test_merged_state_with_absent_mergedat_is_not_merged``
- ``TestConflictGateExemptionRequiresMergedAt.*``
- ``TestShortCircuitRequiresMergedAt.test_merged_state_without_mergedat_still_attempts_merge``
- ``TestPostMergeVerificationRequiresMergedAt.*``

Green-on-arrival (must stay green before and after the fix)
------------------------------------------------------------
- ``TestViewIsMergedRequiresMergedAt.test_canonical_mergedat_is_still_merged``
- ``TestViewIsMergedRequiresMergedAt.test_open_state_is_not_merged``
- ``TestViewIsMergedRequiresMergedAt.test_null_view_is_not_merged``
- ``TestShortCircuitRequiresMergedAt.test_merged_state_with_mergedat_still_short_circuits``
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import (
    _PR_VIEW_FIELDS,
    _pr_block_reason,
    _pr_is_merged,
    _view_is_merged,
    finish_story,
)

# =============================================================================
# Project fixture — minimal sprint/.session tree for finish_story integration
# =============================================================================

_INDEX_YAML = """\
sprint:
  name: "Test16218"
  jira_sprint_id: 999
  jira_sprint_name: "Test16218"
  goal: Test mergedAt corroboration in the finish flow
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
stories: []
standalone_stories: []
"""

_SHARD_YAML = """\
id: "162"
type: epic
title: "Finish flow gate ordering"
priority: p1
status: in_progress
stories:
  - id: 162-18
    title: Add mergedAt corroboration to MERGED bypass in story_finish
    points: 1
    priority: p1
    status: in_review
    workflow: tdd
"""

_SESSION_WITH_PR = """\
---
story_id: "162-18"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-18: Add mergedAt corroboration to MERGED bypass

## Story Details
- **ID:** 162-18
- **Workflow:** tdd
- **Branch:** feat/162-18-mergedat-corroboration
- **PR:** #999 - mergedAt corroboration
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(_INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(_SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-18-session.md").write_text(_SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Helpers — view payloads with explicit mergedAt control
# =============================================================================


def _view_payload(
    *,
    state: str,
    mergedat: str | None,
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
    base_ref: str = "develop",
) -> str:
    """Build a ``gh pr view`` JSON payload.

    ``mergedat`` is explicit rather than derived from ``state`` — that
    derivation-via-case-fold is the AC1 defect in test_162_3 that this story
    exists to avoid repeating.
    """
    return json.dumps(
        {
            "state": state,
            "mergedAt": mergedat,
            "mergeable": mergeable,
            "mergeStateStatus": merge_state_status,
            "baseRefName": base_ref,
        }
    )


def _make_run(
    *,
    pre_state: str,
    pre_mergedat: str | None,
    post_state: str | None = None,
    post_mergedat: str | None = "2026-08-04T00:00:00Z",
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
    merge_rc: int = 0,
):
    """Dispatching fake for ``story_finish._run``.

    Pre-merge ``gh pr view`` returns ``(pre_state, pre_mergedat)``.  After
    ``gh pr merge`` runs it returns ``(post_state, post_mergedat)`` — the
    split lets a test isolate the short-circuit site (pre-merge) from the
    post-merge verification site.  ``post_state`` defaults to ``pre_state``;
    ``post_mergedat`` defaults to a non-null timestamp so post-merge
    verification succeeds when the test only cares about the pre-merge path.
    """
    merged_yet: dict[str, bool] = {"done": False}

    def _fake(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            merged_yet["done"] = True
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr="" if merge_rc == 0 else "gh pr merge failed",
            )
        if "view" in parts:
            state = (post_state if post_state is not None else pre_state) if merged_yet["done"] else pre_state
            mdat = post_mergedat if merged_yet["done"] else pre_mergedat
            return MagicMock(
                returncode=0,
                stdout=_view_payload(
                    state=state,
                    mergedat=mdat,
                    mergeable=mergeable,
                    merge_state_status=merge_state_status,
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake


def _merge_invoked(fake: MagicMock) -> bool:
    """True if ``gh pr merge`` was called through the fake ``_run``."""
    for call in fake.call_args_list:
        argv = [str(x) for x in call.args[0]]
        if "merge" in argv:
            return True
    return False


def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _step2_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in result.get("steps", []) if s.get("step") == 2]


# =============================================================================
# _PR_VIEW_FIELDS must include mergedAt (TRUE RED — field absent today)
# =============================================================================


def test_pr_view_fields_includes_mergedat() -> None:
    """``_PR_VIEW_FIELDS`` drives the ``--json`` argument of every
    ``gh pr view`` probe; ``mergedAt`` must be in it so the snapshot the rest
    of this story's tests exercise actually comes back from ``gh``.
    """
    fields = [f.strip() for f in _PR_VIEW_FIELDS.split(",")]
    assert "mergedAt" in fields, (
        f"'mergedAt' is absent from _PR_VIEW_FIELDS={_PR_VIEW_FIELDS!r}; "
        "add it so the gh probe snapshot includes the corroboration field"
    )


def test_pr_view_fields_retains_existing_required_fields() -> None:
    """Over-reach guard: the corroboration addition must not remove the fields
    the conflict gate and merge-state checks already depend on.
    """
    fields = {f.strip() for f in _PR_VIEW_FIELDS.split(",")}
    for required in ("state", "mergeable", "mergeStateStatus", "baseRefName"):
        assert required in fields, (
            f"pre-existing required field '{required}' was dropped from "
            f"_PR_VIEW_FIELDS={_PR_VIEW_FIELDS!r}"
        )


# =============================================================================
# _view_is_merged corroboration predicate (TRUE RED for the null cases)
# =============================================================================

#: Both shapes of "mergedAt absent / null" that the predicate must reject.
_NULL_MERGEDAT_CASES = [
    pytest.param({"state": "MERGED", "mergedAt": None}, id="explicit-null"),
    pytest.param({"state": "MERGED"}, id="key-absent"),
]


class TestViewIsMergedRequiresMergedAt:
    """``_view_is_merged`` is the single "did this land?" predicate used by all
    three bypass paths.  It must require BOTH ``state == "MERGED"`` AND a
    non-null ``mergedAt`` — state alone is not sufficient corroboration.
    """

    @pytest.mark.parametrize("view", _NULL_MERGEDAT_CASES)
    def test_merged_state_without_mergedat_is_not_merged(
        self, view: dict[str, Any]
    ) -> None:
        """TRUE RED: state==MERGED but mergedAt absent/null must read as NOT
        merged.  Today the predicate returns True from the state check alone.
        """
        assert _view_is_merged(view) is False, (
            f"view={view!r} was accepted as merged with no mergedAt — "
            "a state==MERGED snapshot without timestamp corroboration "
            "must not authorise the done transition or bypass safety gates"
        )

    def test_canonical_mergedat_is_still_merged(self) -> None:
        """GREEN: state==MERGED with a non-null mergedAt is a fully
        corroborated merge — the predicate must remain True.
        """
        assert _view_is_merged({"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z"}) is True

    def test_open_state_with_mergedat_is_not_merged(self) -> None:
        """GREEN over-reach guard: a non-MERGED state is not merged even if
        mergedAt happens to be present (shouldn't happen, but must not widen
        the predicate).
        """
        assert _view_is_merged({"state": "OPEN", "mergedAt": "2026-08-04T00:00:00Z"}) is False

    def test_null_view_is_not_merged(self) -> None:
        """GREEN: the ``view is None`` → False contract must survive the fix."""
        assert _view_is_merged(None) is False

    def test_open_state_without_mergedat_is_not_merged(self) -> None:
        """GREEN control: OPEN with no mergedAt is and must remain not-merged."""
        assert _view_is_merged({"state": "OPEN"}) is False


# =============================================================================
# Bypass path 1: conflict-gate exemption (TRUE RED)
# =============================================================================


class TestConflictGateExemptionRequiresMergedAt:
    """``_pr_block_reason`` exempts MERGED PRs from the hard conflict block
    because GitHub stops recomputing mergeability at merge time (162-1).  That
    exemption must require full corroboration — a state==MERGED/mergedAt=None
    snapshot is an untrustworthy signal and must not disarm the conflict gate.
    """

    @pytest.mark.parametrize("view", _NULL_MERGEDAT_CASES)
    def test_merged_state_without_mergedat_does_not_exempt_conflict_block(
        self, view: dict[str, Any]
    ) -> None:
        """TRUE RED: CONFLICTING/DIRTY plus state==MERGED/mergedAt=None must
        still hard-block with rebase advice.  Today the check calls
        ``_view_is_merged`` which returns True on state alone, granting the
        exemption and causing the gate to return None.
        """
        full_view = dict(view, mergeable="CONFLICTING", mergeStateStatus="DIRTY", baseRefName="develop")
        reason = _pr_block_reason("999", full_view)
        assert reason is not None, (
            f"view={view!r} bought the 162-1 conflict-gate exemption without "
            "a non-null mergedAt — the gate must speak for an unvouchable "
            "MERGED snapshot with CONFLICTING mergeability"
        )
        assert any(
            kw in reason for kw in ("rebase", "CONFLICTING", "conflict")
        ), f"block reason must contain actionable rebase advice: {reason!r}"

    def test_fully_corroborated_merged_still_exempt(self) -> None:
        """GREEN: 162-1's exemption is untouched when both state and mergedAt
        are present — a genuinely merged PR is never blocked on stale fields.
        """
        assert (
            _pr_block_reason(
                "999",
                {
                    "state": "MERGED",
                    "mergedAt": "2026-08-04T00:00:00Z",
                    "mergeable": "CONFLICTING",
                    "mergeStateStatus": "DIRTY",
                    "baseRefName": "develop",
                },
            )
            is None
        )

    @pytest.mark.parametrize("view", _NULL_MERGEDAT_CASES)
    def test_merged_state_without_mergedat_with_clean_mergeability_still_passes(
        self, view: dict[str, Any]
    ) -> None:
        """GREEN over-reach guard: removing the exemption for unvouchable
        snapshots must not accidentally turn a CLEAN PR into a block.  Only
        definitively-conflicting PRs are hard-blocked here.
        """
        full_view = dict(view, mergeable="MERGEABLE", mergeStateStatus="CLEAN", baseRefName="develop")
        assert _pr_block_reason("999", full_view) is None, (
            f"a CLEAN PR with view={view!r} must not be blocked — only "
            "CONFLICTING/DIRTY PRs are hard-blocked by this gate"
        )


# =============================================================================
# Bypass path 2: already-merged short-circuit (TRUE RED)
# =============================================================================


class TestShortCircuitRequiresMergedAt:
    """The 155-29 short-circuit skips ``gh pr merge`` when the pre-merge
    snapshot reports state==MERGED.  Without ``mergedAt`` corroboration a
    ghost snapshot can skip the real merge entirely, leaving the code never
    landed but the story marked done.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_state_without_mergedat_still_attempts_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """TRUE RED: a pre-merge snapshot with state==MERGED but mergedAt=None
        must NOT trigger the 155-29 short-circuit.  The real merge must be
        attempted.  Today the short-circuit fires on state alone, so
        ``gh pr merge`` is never called.

        The fake's post-merge view switches to a fully-corroborated MERGED so
        the post-merge verification passes — isolating this test to the
        short-circuit site only.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake = MagicMock(
            side_effect=_make_run(
                pre_state="MERGED",
                pre_mergedat=None,
                post_state="MERGED",
                post_mergedat="2026-08-04T00:00:00Z",
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-18")

        assert _merge_invoked(fake), (
            "finish skipped `gh pr merge` on state==MERGED with null mergedAt — "
            "the short-circuit must require the corroboration timestamp, "
            "otherwise a ghost snapshot silently skips the merge"
        )
        assert result["success"] is True, (
            f"the merge landed (post-merge verified), so finish must complete: {result}"
        )
        assert not any(s.get("already_merged") for s in _step2_entries(result)), (
            "step 2 must NOT report already_merged for a PR that required the "
            f"real merge: {_step2_entries(result)}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_state_with_mergedat_still_short_circuits(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """GREEN: 155-29's retry path is untouched for a fully-corroborated
        snapshot — state==MERGED with non-null mergedAt must still skip the
        merge and complete the ceremony.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        # merge_rc=1 would trip the rc!=0 abort if the short-circuit failed to fire.
        fake = MagicMock(
            side_effect=_make_run(
                pre_state="MERGED",
                pre_mergedat="2026-08-04T00:00:00Z",
                merge_rc=1,
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-18")

        assert not _merge_invoked(fake), (
            "finish ran `gh pr merge` on a fully-corroborated already-MERGED PR — "
            "the 155-29 short-circuit regressed"
        )
        assert result["success"] is True, result
        assert any(s.get("already_merged") for s in _step2_entries(result)), (
            f"step 2 must record the already_merged skip: {_step2_entries(result)}"
        )
        assert _requested_done(mock_transition)


# =============================================================================
# Bypass path 3: post-merge re-verification (TRUE RED)
# =============================================================================


class TestPostMergeVerificationRequiresMergedAt:
    """``_pr_is_merged`` (used by ``_pr_merge_verification``) re-fetches a
    fresh snapshot AFTER ``gh pr merge`` runs.  It is the last guard before
    the story is marked done.  A null ``mergedAt`` must fail verification even
    when ``state`` says MERGED, so that a merge that exits zero without
    actually landing still aborts the finish.
    """

    @pytest.mark.parametrize(
        "view",
        [
            pytest.param({"state": "MERGED", "mergedAt": None}, id="null-mergedat"),
            pytest.param({"state": "MERGED"}, id="absent-mergedat"),
        ],
    )
    def test_merged_state_without_mergedat_fails_verification(
        self, view: dict[str, Any]
    ) -> None:
        """TRUE RED at the helper boundary: a fresh post-merge snapshot with
        state==MERGED but no mergedAt must fail verification.  Today
        ``_pr_is_merged`` returns True from the state check alone.
        """
        with patch("pf.sprint.story_finish._pr_view", return_value=view):
            assert _pr_is_merged("999") is False, (
                f"post-merge verification accepted view={view!r} — "
                "state==MERGED without mergedAt is not confirmed-landed; "
                "this is the last guard before the story is marked done"
            )

    def test_fully_corroborated_state_passes_verification(self) -> None:
        """GREEN: a real merge still verifies."""
        with patch(
            "pf.sprint.story_finish._pr_view",
            return_value={"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z"},
        ):
            assert _pr_is_merged("999") is True

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merge_that_reports_merged_without_mergedat_aborts_finish(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """TRUE RED end-to-end through the post-merge site specifically: the
        PR is OPEN before the merge (so the short-circuit cannot fire),
        ``gh pr merge`` exits zero, but the post-merge snapshot comes back with
        state==MERGED and mergedAt=None.  Finish must abort before ``done``
        and before any irreversible step.

        Today ``_view_is_merged`` accepts the post-merge snapshot on state
        alone, so finish incorrectly marks the story done.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        session_path = project / ".session" / "162-18-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = MagicMock(
            side_effect=_make_run(
                pre_state="OPEN",
                pre_mergedat=None,
                post_state="MERGED",
                post_mergedat=None,  # the ghost: state says MERGED but no timestamp
            )
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-18")

        assert _merge_invoked(fake), "precondition: the merge must be attempted"
        assert result["success"] is False, (
            f"post-merge state==MERGED/mergedAt=None was accepted as landed: {result}"
        )
        assert not _requested_done(mock_transition), (
            "the story was transitioned to done without a verified merge"
        )
        assert session_path.exists(), (
            "the session must be kept so finish can be retried once the PR "
            "state is confirmed"
        )
        assert not list(archive_dir.iterdir()), (
            f"an aborted finish must leave no stray archive (155-15): "
            f"{list(archive_dir.iterdir())}"
        )
