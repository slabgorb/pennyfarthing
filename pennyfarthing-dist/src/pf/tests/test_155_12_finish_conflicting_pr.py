"""Tests for story 155-12: finish must HARD-GATE on a non-mergeable PR.

Story: 155-12 — "Finish completes ceremony when merge_pr fails on a
CONFLICTING/DIRTY PR — done-but-unmerged" (gh #113).

Relationship to sibling 155-1 (gh #71/#60)
------------------------------------------
155-1 already made the merge *load-bearing* in ``finish_story``:
  - a non-zero ``gh pr merge`` aborts finish, and
  - after the merge, ``_pr_is_merged`` (``gh pr view --json state``) verifies the
    PR is ``MERGED`` before any ``done`` transition / session removal.
Those guards are covered by ``test_155_1_finish_verifies_merge.py`` and are
asserted here only as **green-on-arrival regression guards** (so this story's new
gate does not regress them) — see the ``TestPostMergeVerifyStillHolds`` and
``TestCleanPathNotOverBlocked`` classes, logged as intentional-green Design
Deviations in the session.

What 155-12 (gh #113) ADDS — the genuinely-RED contract
-------------------------------------------------------
The issue's suggested fix is a *pre-merge* hard gate. Two gaps remain post-155-1:

1. **No pre-merge mergeability check (AC1).** Today finish runs Step 1
   (``archive_session`` — copies the session into ``sprint/archive/``) *before*
   Step 2 (merge), and only reacts to a failed merge *after the fact*. On a
   CONFLICTING/DIRTY PR this means: ``gh pr merge`` is still attempted, a stray
   archived-session copy is left behind, and the abort message is the generic
   ``gh`` stderr — not the actionable "PR #N is CONFLICTING — rebase on develop
   and resolve" the issue calls for. The issue is explicit: "If not
   MERGEABLE/CLEAN, stop the ceremony ... **Do not archive/remove the session or
   touch the YAML.**"  ==> The gate must run BEFORE ``archive_session`` and BEFORE
   ``gh pr merge``.

2. **Preflight does not surface the conflict (AC3).** ``check_pr_status``
   already fetches ``mergeable`` into ``PRStatus.mergeable``, but
   ``aggregate_results`` never inspects it: a CONFLICTING (but OPEN) PR gets the
   generic "PR is still open (not merged)" / "Merge the PR before finishing" —
   misleading, because you cannot merge a conflicting PR, you must rebase first.

RED tests (fail against current code, for the right reason):
  - ``TestPreMergeGate`` (AC1): merge NOT attempted on a CONFLICTING PR; no stray
    archive copy; actionable (rebase/resolve) error message.
  - ``TestPreflightSurfacesConflict`` (AC3): a CONFLICTING PR yields an issue that
    names the conflict / tells the operator to rebase.

Green-on-arrival guards (must stay green — over-reach protection):
  - ``TestPostMergeVerifyStillHolds`` (AC2): merge rc=0 but PR OPEN still aborts.
  - ``TestCleanPathNotOverBlocked`` (AC4): a clean MERGEABLE→MERGED PR completes.
  - ``TestPreflightHealthyPrNotBlocked``: a clean MERGED PR stays ready_to_finish.

Mock harness mirrors ``test_155_1_finish_verifies_merge.py`` (a command-
dispatching fake for ``story_finish._run`` and a patched ``transition_story``);
the ``gh pr view`` fake is extended to carry ``mergeable``/``mergeStateStatus``
so a conflicting PR can be simulated. Preflight tests call the pure
``aggregate_results`` directly — no subprocess needed.
"""

import re
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.preflight.finish import (
    AcceptanceCriteria,
    JiraStatus,
    LintResult,
    PRStatus,
    aggregate_results,
)
from pf.sprint.story_finish import finish_story
from pf.tests.helpers.gh_pr_fake import GhPrFake

# =============================================================================
# Fixtures — a minimal sprint/.session project for finish_story (story 155-12)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15512"
  jira_sprint_id: 999
  jira_sprint_name: "Test15512"
  goal: Test finish conflicting-PR hard gate
  start_date: 2026-06-01
  end_date: 2026-06-14
  status: active
  number: 1
epics:
  - "155"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
stories:
  - id: 155-12
    title: Finish hard-gates on a non-mergeable PR
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

# Session carries an explicit PR number (#999) and feature branch.
SESSION_WITH_PR = """\
---
story_id: "155-12"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-12: finish must hard-gate on a non-mergeable PR

## Story Details
- **ID:** 155-12
- **Workflow:** tdd
- **Branch:** feat/155-12-finish-conflicting-pr
- **PR:** #999 - finish conflicting-pr hard gate
"""

ARCHIVE_COPY_NAME = "155-12-session.md"  # jira_key="" → archive uses bare story id


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-12-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)



def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


# =============================================================================
# AC1 — pre-merge hard gate (GENUINELY RED against current code)
# =============================================================================


class TestPreMergeGate:
    """A CONFLICTING/DIRTY PR must abort finish BEFORE any irreversible step —
    before ``gh pr merge`` is attempted and before ``archive_session`` copies the
    session. Today finish archives first, then attempts the merge, then reacts to
    the failure: the merge IS attempted and a stray archive copy is left behind.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_does_not_attempt_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """The gate must detect the conflict via ``gh pr view`` and STOP — never
        run ``gh pr merge`` on a PR it already knows is unmergeable (AC1)."""
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        fake = GhPrFake(merge_rc=1, pr_state="OPEN", pre_merge_state="OPEN", mergeable="CONFLICTING", merge_state_status="DIRTY")
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-12")

        assert result["success"] is False, f"CONFLICTING PR must abort finish: {result}"
        assert len(fake.merge_calls) == 0, (
            "finish ran `gh pr merge` on a CONFLICTING PR — it must pre-check "
            "mergeability (gh pr view --json mergeable,mergeStateStatus) and stop "
            "before attempting the merge"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_leaves_no_stray_archive(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """The issue is explicit: on an unmergeable PR, "Do not archive/remove the
        session." Today Step 1 copies the session to sprint/archive/ BEFORE the
        merge, so an aborted finish leaves a stray archived copy (AC1)."""
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        archive_copy = project / "sprint" / "archive" / ARCHIVE_COPY_NAME
        assert not archive_copy.exists()  # precondition

        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(merge_rc=1, pr_state="OPEN", pre_merge_state="OPEN", mergeable="CONFLICTING", merge_state_status="DIRTY"),
        ):
            finish_story(project, "155-12")

        assert not archive_copy.exists(), (
            "Aborted CONFLICTING-PR finish left a stray archived session copy at "
            f"{archive_copy} — the mergeability gate must run BEFORE archive_session"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_error_is_actionable(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """The abort message must tell the operator how to recover (rebase /
        resolve), not just echo a generic gh failure. Wording is illustrative —
        the assertion only requires an actionable remedy keyword (AC1)."""
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(merge_rc=1, pr_state="OPEN", pre_merge_state="OPEN", mergeable="CONFLICTING", merge_state_status="DIRTY"),
        ):
            result = finish_story(project, "155-12")

        assert result["success"] is False
        err = result.get("error", "")
        assert "999" in err, f"Error should name the PR (#999): {err!r}"
        assert re.search(r"rebase|resolve|conflict", err, re.IGNORECASE), (
            "Error should be actionable about the conflict (rebase/resolve), "
            f"not a generic merge failure: {err!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_conflicting_pr_keeps_session_and_does_not_mark_done(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """Belt-and-suspenders: the live session stays put and the story is never
        transitioned to done (the YAML is untouched). Pairs the new gate with the
        155-1 invariants so an over-eager gate fix can't regress them."""
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-12-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(merge_rc=1, pr_state="OPEN", pre_merge_state="OPEN", mergeable="CONFLICTING", merge_state_status="DIRTY"),
        ):
            finish_story(project, "155-12")

        assert session_path.exists(), "live session must remain after an aborted finish"
        assert not _requested_done(mock_transition), (
            "finish requested the `done` transition for a CONFLICTING PR"
        )


# =============================================================================
# AC2 — post-merge verification still holds (GREEN-on-arrival regression guard)
# =============================================================================


class TestPostMergeVerifyStillHolds:
    """155-1 already aborts when ``gh pr merge`` returns 0 but the PR is still
    OPEN. This is GREEN today; included so 155-12's pre-merge gate does not
    regress the post-merge verification. Logged as an intentional-green guard.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_zero_rc_but_open_pr_still_aborts(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-12-session.md"
        # mergeable so the pre-gate would pass, but the merge no-ops (state OPEN).
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                merge_rc=0, pr_state="OPEN", pre_merge_state="OPEN", mergeable="MERGEABLE", merge_state_status="CLEAN"
            ),
        ):
            result = finish_story(project, "155-12")

        assert result["success"] is False, (
            "merge rc=0 but PR OPEN must still abort (155-1 post-merge verify)"
        )
        assert session_path.exists()
        assert not _requested_done(mock_transition)


# =============================================================================
# AC4 — clean mergeable PR is NOT over-blocked (GREEN-on-arrival guard)
# =============================================================================


class TestCleanPathNotOverBlocked:
    """A MERGEABLE PR that merges cleanly and verifies MERGED must still complete
    the full ceremony. Guards against a pre-merge gate that wrongly blocks healthy
    finishes. GREEN today and after a correct fix.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_mergeable_pr_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        session_path = project / ".session" / "155-12-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                merge_rc=0, pr_state="MERGED", mergeable="MERGEABLE", merge_state_status="CLEAN"
            ),
        ):
            result = finish_story(project, "155-12")

        assert result["success"] is True, f"clean mergeable PR must finish: {result}"
        assert _requested_done(mock_transition), "clean finish must transition to done"
        assert not session_path.exists(), "clean finish must remove the session"


# =============================================================================
# AC3 — preflight surfaces a CONFLICTING PR (GENUINELY RED) + healthy guard
# =============================================================================


class TestPreflightSurfacesConflict:
    """``aggregate_results`` fetches ``mergeable`` (via check_pr_status) but never
    inspects it. A CONFLICTING (OPEN) PR is reported with the generic "PR is still
    open (not merged)" / "Merge the PR before finishing" — actively misleading,
    since a conflicting PR cannot be merged without a rebase first (AC3).
    """

    def _clean_inputs(self):
        return dict(
            lint=LintResult(clean=True),
            jira=JiraStatus(skipped=True),
            acceptance=AcceptanceCriteria(total=0, checked=0, unchecked=[]),
        )

    def test_conflicting_pr_blocks_finish(self) -> None:
        pr = PRStatus(state="OPEN", merged=False, mergeable="CONFLICTING")
        result = aggregate_results(story_id="155-12", pr=pr, **self._clean_inputs())
        # ready_to_finish False is GREEN today (PR is OPEN) — kept as a guard.
        assert result.ready_to_finish is False

    def test_conflicting_pr_issue_is_actionable(self) -> None:
        pr = PRStatus(state="OPEN", merged=False, mergeable="CONFLICTING")
        result = aggregate_results(story_id="155-12", pr=pr, **self._clean_inputs())

        blob = " ".join(f"{i.issue} {i.fix or ''}" for i in result.issues).lower()
        assert re.search(r"conflict|rebase|mergeable", blob), (
            "A CONFLICTING PR must be surfaced as a conflict (rebase/resolve), not "
            f"the generic 'still open / merge the PR'. issues={blob!r}"
        )


class TestPreflightHealthyPrNotBlocked:
    """A cleanly MERGED PR must remain ready_to_finish — the new conflict logic
    must not fire on healthy PRs. GREEN today and after a correct fix.
    """

    def test_merged_pr_is_ready(self) -> None:
        pr = PRStatus(state="MERGED", merged=True, mergeable="MERGEABLE")
        result = aggregate_results(
            story_id="155-12",
            pr=pr,
            lint=LintResult(clean=True),
            jira=JiraStatus(skipped=True),
            acceptance=AcceptanceCriteria(total=0, checked=0, unchecked=[]),
        )
        assert result.ready_to_finish is True, f"healthy MERGED PR must be ready: {result.issues}"
        blob = " ".join(f"{i.issue} {i.fix or ''}" for i in result.issues).lower()
        assert "conflict" not in blob, "must not invent a conflict on a healthy PR"


# =============================================================================
# Rule #1 (lang-review python.md — no silent exception swallowing)
# =============================================================================


class TestNoSilentSwallowOnProbeError:
    """The new pre-merge mergeability probe (``gh pr view --json mergeable``) must
    not SILENTLY swallow a probe failure and proceed to mark the story done. If
    the PR state cannot be established, finish must fail loud — never finish
    silently. GREEN today via 155-1's post-merge backstop (``_pr_is_merged``
    returns False on a non-zero ``gh pr view``); pinned so the new gate cannot
    open a silent-fallback hole that bypasses the backstop (python.md rule #1,
    SOUL #1/#10).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_probe_error_never_silently_finishes(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-12-session.md"

        def _all_view_errors(cmd, **kwargs):
            parts = [str(c) for c in cmd]
            if "view" in parts:  # both the new mergeability probe and _pr_is_merged
                return MagicMock(returncode=1, stdout="", stderr="could not resolve PR")
            if "merge" in parts:
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        with patch("pf.sprint.story_finish._run", side_effect=_all_view_errors):
            result = finish_story(project, "155-12")

        assert result["success"] is False, (
            "A PR whose state cannot be established must fail loud, never finish "
            f"silently: {result}"
        )
        assert session_path.exists(), "session removed despite an unverifiable PR state"
        assert not _requested_done(mock_transition), (
            "finish marked the story done despite being unable to verify the PR"
        )
