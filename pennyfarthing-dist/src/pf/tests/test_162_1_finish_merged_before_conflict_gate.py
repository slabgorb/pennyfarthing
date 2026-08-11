"""Tests for story 162-1: the already-merged short-circuit must be evaluated
BEFORE the conflict/mergeability gate (finding from the 155-32 review).

The bug
-------
155-32 consolidated the two pre-merge questions onto ONE ``gh pr view``
snapshot, but left them in the wrong order inside ``finish_story``::

    pr_view = _pr_view(pr_number)
    block_reason = _pr_block_reason(pr_number, pr_view)   # <-- conflict gate
    if block_reason:
        return {"success": False, "error": block_reason}  # rebase advice
    ...
    elif pr_number and _view_is_merged(pr_view):          # <-- 155-29 short-circuit

``_pr_block_reason`` only reads ``mergeable`` / ``mergeStateStatus``; it never
looks at ``state``. GitHub stops recomputing mergeability once a PR merges, so
a PR that merged while it was mid-recompute (or whose branch protection had
flagged it) can report ``state=MERGED`` alongside a STALE
``mergeable=CONFLICTING`` / ``mergeStateStatus=DIRTY``. On that snapshot the
conflict gate wins the race and finish aborts with::

    PR #999 is CONFLICTING — rebase on develop and resolve the conflicts
    before finishing

which is un-actionable: the PR is already merged, there is nothing to rebase,
and the retry path 155-29 exists to unwedge is wedged again. The abort also
breaks dry-run/real-run parity (155-31): ``--dry-run`` previews "already
merged — will skip merge" for the very same snapshot, because the preview
consults only ``_view_is_merged``.

Acceptance criteria (from the session file — authoritative)
-----------------------------------------------------------
- AC-1: MERGED + stale DIRTY/CONFLICTING mergeability → finish short-circuits
  as already-merged (no abort, no rebase advice).
- AC-2: OPEN + DIRTY/CONFLICTING → the conflict gate still aborts with rebase
  advice (155-12 behavior preserved).
- AC-3: story-scoped tests green.

Designed interface (for Dev — tests bind to behavior, not to a mechanism)
------------------------------------------------------------------------
Make "did it already land?" the FIRST question asked of the shared snapshot.
Either shape satisfies these tests:

1. at the call site — skip the gate for a landed PR::

       pr_view = _pr_view(pr_number)
       if not _view_is_merged(pr_view):
           block_reason = _pr_block_reason(pr_number, pr_view)
           ...

2. inside the helper — ``_pr_block_reason`` returns ``None`` when
   ``_view_is_merged(view)`` is true (a merged PR is never "definitively not
   cleanly mergeable"; its mergeability fields are stale by construction).

What must NOT change: the block must still fire for any PR that has not
landed. ``state`` is the only permitted discriminator — "not OPEN" is NOT a
substitute (a CLOSED-unmerged conflicting PR must still abort), and an
unreadable probe must still fall through to the real merge attempt.

RED tests (fail on HEAD, for the right reason — the abort at the conflict gate):
  - ``TestMergedPrIgnoresStaleMergeability``

Green-on-arrival guards (over-reach protection — must stay green):
  - ``TestConflictGateStillBlocksUnmergedPrs``

Harness mirrors ``test_155_29_finish_short_circuit_merged_pr.py`` (command
dispatching fake for ``story_finish._run`` + patched ``transition_story`` /
``_add_story_to_completed``), with the fake's ``mergeable`` /
``mergeStateStatus`` / ``state`` knobs made independent so the stale
combination is expressible.
"""

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story
from pf.tests.helpers.gh_pr_fake import GhPrFake

# =============================================================================
# Fixtures — minimal sprint/.session project
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test1621"
  jira_sprint_id: 999
  jira_sprint_name: "Test1621"
  goal: Test finish gate ordering for an already-merged PR
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
title: "Finish flow gate ordering"
priority: p1
status: in_progress
stories:
  - id: 162-1
    title: already-merged short-circuit precedes the conflict gate
    points: 1
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "162-1"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-1: already-merged short-circuit precedes the conflict gate

## Story Details
- **ID:** 162-1
- **Workflow:** tdd
- **Branch:** feat/162-1-finish-conflict-gate-order
- **PR:** #999 - gate ordering
"""

# Combo session: no PR line — finish must resolve #999 from the branch via
# ``gh pr list --head`` (the story_finish fallback).
SESSION_BRANCH_ONLY = """\
---
story_id: "162-1"
jira_key: ""
epic: "162"
workflow: "tdd"
---

# Story 162-1: already-merged short-circuit precedes the conflict gate

## Story Details
- **ID:** 162-1
- **Workflow:** tdd
- **Branch:** feat/162-1-finish-conflict-gate-order
"""


def _make_project(tmp_path: Path, *, session_body: str = SESSION_WITH_PR) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "162-1-session.md").write_text(session_body)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fake — every PR-view field is an independent knob
# =============================================================================

#: The two stale shapes a landed PR can report. ``_pr_block_reason`` blocks on
#: EITHER field, so both must be pinned: fixing only one leaves the other
#: aborting the retry.
STALE_MERGEABILITY = [
    pytest.param("CONFLICTING", "DIRTY", id="conflicting+dirty"),
    pytest.param("CONFLICTING", "UNKNOWN", id="conflicting-only"),
    pytest.param("MERGEABLE", "DIRTY", id="dirty-only"),
]



def _requested_done(mock_transition: MagicMock) -> bool:
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


def _step2_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in result.get("steps", []) if s.get("step") == 2]


def _result_blob(result: dict[str, Any]) -> str:
    """Every operator-visible string in the result: the top-level error plus
    each step's error/action. The rebase advice must be absent from ALL of
    them — moving it from ``error`` into a step entry would still put
    un-actionable advice in front of the operator.
    """
    parts = [str(result.get("error") or "")]
    for step in result.get("steps", []):
        parts.append(str(step.get("error") or ""))
        parts.append(str(step.get("action") or ""))
    return " ".join(parts)


#: Words that only make sense for a PR that has NOT landed.
_REBASE_ADVICE = re.compile(r"rebase|CONFLICTING|resolve the conflicts", re.IGNORECASE)


# =============================================================================
# AC-1 — a MERGED PR ignores stale mergeability (GENUINELY RED)
# =============================================================================


class TestMergedPrIgnoresStaleMergeability:
    """Retry world, stale-snapshot variant: a prior finish run landed the merge
    and then aborted on a later step, and the PR's cached mergeability still
    says CONFLICTING/DIRTY because GitHub stopped recomputing it at merge time.
    The re-run must take the 155-29 short-circuit, not the 155-12 conflict
    abort — the PR is merged; "rebase and resolve the conflicts" is advice the
    operator cannot act on.
    """

    @pytest.mark.parametrize("mergeable,merge_state_status", STALE_MERGEABILITY)
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_with_stale_mergeability_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
        mergeable: str,
        merge_state_status: str,
    ) -> None:
        """AC-1: finish must SUCCEED and complete the ceremony (done
        transition, session removed). On HEAD the conflict gate is consulted
        first and returns ``success: False`` before anything runs.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        session_path = project / ".session" / "162-1-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                pr_state="MERGED",
                pre_merge_state="MERGED",
                mergeable=mergeable,
                merge_state_status=merge_state_status,
            ),
        ):
            result = finish_story(project, "162-1")

        assert result["success"] is True, (
            "a MERGED PR must short-circuit as already-merged regardless of "
            f"stale mergeability ({mergeable}/{merge_state_status}): {result}"
        )
        assert _requested_done(mock_transition), (
            "the already-merged retry must still transition the story to done"
        )
        assert not session_path.exists(), (
            "the already-merged retry must complete cleanup (session removed)"
        )

    @pytest.mark.parametrize("mergeable,merge_state_status", STALE_MERGEABILITY)
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_never_reports_rebase_advice(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
        mergeable: str,
        merge_state_status: str,
    ) -> None:
        """AC-1, the finding's actual complaint: the report must not tell the
        operator to rebase a branch that has already merged. Checks every
        operator-visible string (top-level ``error`` AND each step's
        ``error``/``action``), so relocating the message rather than
        suppressing it does not pass.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                pr_state="MERGED",
                pre_merge_state="MERGED",
                mergeable=mergeable,
                merge_state_status=merge_state_status,
            ),
        ):
            result = finish_story(project, "162-1")

        blob = _result_blob(result)
        assert not _REBASE_ADVICE.search(blob), (
            "finish reported conflict/rebase advice for an ALREADY MERGED PR — "
            f"un-actionable ({mergeable}/{merge_state_status}): {blob!r}"
        )
        assert result.get("error") is None or result.get("error") == "", (
            f"a merged-PR finish must carry no error: {result.get('error')!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_with_stale_mergeability_skips_merge_attempt(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The reordering must land on the 155-29 short-circuit, not merely
        stop blocking: no second ``gh pr merge`` on a PR already MERGED.
        ``merge_rc=0`` on purpose — even a gh that tolerates the redundant
        merge must not be asked (a success sourced from a no-op is a lie).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake = GhPrFake(
            pr_state="MERGED",
            pre_merge_state="MERGED",
            mergeable="CONFLICTING",
            merge_state_status="DIRTY",
            merge_rc=0,
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-1")

        assert len(fake.merge_calls) == 0, (
            "finish ran `gh pr merge` on a PR that is already MERGED — the "
            "short-circuit must own this path, not the merge branch"
        )
        assert result["success"] is True, result

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merged_pr_step2_record_is_truthful(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The step-2 entry for the stale-snapshot retry must be the
        already-merged record (155-29/155-30 contract), not a failure entry:
        ``merged`` and ``already_merged`` both True, PR named, not
        ``skipped``, and exactly ONE step-2 entry (a gate entry plus a merge
        entry would report the abort and the merge in the same run).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                pr_state="MERGED",
                pre_merge_state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            ),
        ):
            result = finish_story(project, "162-1")

        entries = _step2_entries(result)
        assert len(entries) == 1, f"expected exactly one step-2 entry, got {entries!r}"
        entry = entries[0]
        assert entry.get("success") is not False, (
            f"step-2 must not report failure for an already-merged PR: {entry!r}"
        )
        assert entry.get("pr") == "999", f"step-2 entry must name the PR: {entry!r}"
        assert entry.get("merged") is True, f"step-2 entry must record merged=True: {entry!r}"
        assert entry.get("already_merged") is True, (
            f"step-2 entry must record already_merged=True: {entry!r}"
        )
        assert not entry.get("skipped"), (
            f"'skipped' is the no-PR wording — this PR's code landed: {entry!r}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dry_run_preview_matches_real_run_on_stale_snapshot(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Preview/reality parity (155-31) on the SAME stale snapshot. The
        dry-run plan consults only ``_view_is_merged``, so it already promises
        "already merged — will skip merge"; on HEAD the real run then aborts
        with rebase advice. The plan must not lie about the run.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                pr_state="MERGED",
                pre_merge_state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            ),
        ):
            preview = finish_story(project, "162-1", dry_run=True)
        with patch(
            "pf.sprint.story_finish._run",
            GhPrFake(
                pr_state="MERGED",
                pre_merge_state="MERGED",
                mergeable="CONFLICTING",
                merge_state_status="DIRTY",
                merge_rc=1,
            ),
        ):
            real = finish_story(project, "162-1")

        preview_step2 = " ".join(
            str(s.get("action") or "") for s in preview.get("steps", []) if s.get("step") == 2
        )
        assert "already merged" in preview_step2.lower(), (
            "precondition: the dry-run plan previews the already-merged skip "
            f"for this snapshot: {preview_step2!r}"
        )
        assert real["success"] is True, (
            "the real run must do what the plan promised (skip the merge and "
            f"finish), not abort on stale mergeability: {real}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_branch_resolved_merged_pr_with_stale_mergeability_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Combo: the session records no PR, finish resolves #999 from the
        branch, and the resolved PR is MERGED with stale DIRTY mergeability.
        The reordering must hold for the branch-resolution entry point too —
        that is the path a post-merge abort strands when the PR line was never
        written.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        project = _make_project(tmp_path, session_body=SESSION_BRANCH_ONLY)
        session_path = project / ".session" / "162-1-session.md"
        fake = GhPrFake(
            pr_state="MERGED",
            pre_merge_state="MERGED",
            mergeable="CONFLICTING",
            merge_state_status="DIRTY",
            merge_rc=1,
            list_stdout="999\n",
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-1")

        assert result["success"] is True, (
            f"branch-resolved merged PR with stale mergeability must finish: {result}"
        )
        assert len(fake.merge_calls) == 0, (
            "branch-resolved merged PR must short-circuit the merge attempt"
        )
        assert not _REBASE_ADVICE.search(_result_blob(result)), (
            f"branch-resolved merged PR must not draw rebase advice: {_result_blob(result)!r}"
        )
        assert not session_path.exists(), "the retry must finish cleanup"


# =============================================================================
# AC-2 — the conflict gate still hard-blocks every UNMERGED PR
# (green-on-arrival guards; over-reach protection)
# =============================================================================


class TestConflictGateStillBlocksUnmergedPrs:
    """155-12's hard gate is load-bearing: a conflicting PR must abort finish
    before any irreversible step, with actionable rebase advice. The reordering
    may exempt exactly one thing — a PR gh reports MERGED. Everything below is
    green on HEAD and must stay green.
    """

    @pytest.mark.parametrize("mergeable,merge_state_status", STALE_MERGEABILITY)
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_conflicting_pr_still_aborts_with_rebase_advice(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
        mergeable: str,
        merge_state_status: str,
    ) -> None:
        """AC-2: OPEN + CONFLICTING/DIRTY aborts, names the PR and the base
        branch, and leaves the session, the archive and the ``done``
        transition untouched.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "162-1-session.md"
        archive_dir = project / "sprint" / "archive"
        fake = GhPrFake(
            pr_state="OPEN",
            pre_merge_state="OPEN",
            mergeable=mergeable,
            merge_state_status=merge_state_status,
            base_ref="develop",
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-1")

        assert result["success"] is False, (
            f"an OPEN conflicting PR must still abort finish: {result}"
        )
        error = str(result.get("error") or "")
        assert "#999" in error, f"the abort must name the PR: {error!r}"
        assert _REBASE_ADVICE.search(error), (
            f"the abort must keep its actionable rebase advice: {error!r}"
        )
        assert "develop" in error, f"the abort must name the base branch to rebase on: {error!r}"
        assert len(fake.merge_calls) == 0, (
            "the gate must abort BEFORE `gh pr merge` is attempted (155-12)"
        )
        assert session_path.exists(), "a blocked finish must keep the session"
        assert list(archive_dir.iterdir()) == [], (
            "a blocked finish must leave no stray archive copy (155-15)"
        )
        assert not _requested_done(mock_transition), (
            "a blocked finish must never request the done transition"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_closed_unmerged_conflicting_pr_still_aborts(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
    ) -> None:
        """The exemption must key off ``state == MERGED``, NOT off "state is
        not OPEN". A CLOSED-without-merging PR has conflicts that are still
        real and code that never landed — treating it as merged would finish a
        story whose work was thrown away.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "162-1-session.md"
        fake = GhPrFake(
            pr_state="CLOSED",
            pre_merge_state="CLOSED",
            mergeable="CONFLICTING",
            merge_state_status="DIRTY",
        )
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-1")

        assert result["success"] is False, (
            "a CLOSED-unmerged conflicting PR must still abort finish — only a "
            f"MERGED PR is exempt from the conflict gate: {result}"
        )
        assert fake.merge_calls == [], (
            "the conflict gate must abort before `gh pr merge` is attempted"
        )
        assert session_path.exists()
        assert not _requested_done(mock_transition)

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_unreadable_probe_conflicting_pr_falls_through_to_merge(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project: Path,
    ) -> None:
        """When ``gh pr view`` errors the snapshot is ``None``: neither gate
        may claim knowledge. The conflict gate must not block (indeterminate
        mergeability is permissive, 155-12) and the short-circuit must not
        fire (an unverifiable PR is not merged, 155-29) — so the run reaches
        the real merge and the post-merge verification aborts it.
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "162-1-session.md"

        def _view_errors(cmd, **kwargs):
            parts = [str(c) for c in cmd]
            if "view" in parts:
                return MagicMock(returncode=1, stdout="", stderr="could not resolve PR")
            if "merge" in parts:
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        with patch("pf.sprint.story_finish._run", side_effect=_view_errors) as fake:
            result = finish_story(project, "162-1")

        assert any(
            "merge" in [str(x) for x in c.args[0]]
            for c in fake.call_args_list
        ), (
            "an unreadable probe must fall through to the real merge attempt"
        )
        assert result["success"] is False, (
            f"an unverifiable post-merge state must still abort: {result}"
        )
        assert session_path.exists()
        assert not _requested_done(mock_transition)

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_merged_stale_snapshot_stays_advisory(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Human merge mode is probe-free and never auto-merges (155-32). A
        MERGED-with-stale-DIRTY snapshot must not pull the hard-blocking gate
        onto that deliberately advisory path, nor flip it into the auto
        ``done`` path.
        """
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        fake = GhPrFake(pr_state="MERGED", pre_merge_state="MERGED", merge_rc=0)
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "162-1")

        assert result["success"] is True, f"human mode must not be gated: {result}"
        assert len(fake.merge_calls) == 0, "human mode must never invoke gh pr merge"
        assert not _requested_done(mock_transition), (
            "human mode leaves the story in_review — never requests done"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_open_pr_still_merges(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The clean path is untouched: an OPEN/MERGEABLE PR gets a real merge
        and finish completes. Guards against a reordering that skips the
        load-bearing merge for anything other than a landed PR.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "162"}
        state = {"merged": False}

        def _stateful(cmd, **kwargs):
            parts = [str(c) for c in cmd]
            if "merge" in parts:
                state["merged"] = True
                return MagicMock(returncode=0, stdout="", stderr="")
            if "view" in parts:
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "state": "MERGED" if state["merged"] else "OPEN",
                            "mergedAt": "2026-08-04T00:00:00Z" if state["merged"] else None,
                            "mergeable": "MERGEABLE",
                            "mergeStateStatus": "CLEAN",
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            return MagicMock(returncode=0, stdout="", stderr="")

        with patch("pf.sprint.story_finish._run", side_effect=_stateful) as fake:
            result = finish_story(project, "162-1")

        assert any(
            "merge" in [str(x) for x in c.args[0]]
            for c in fake.call_args_list
        ), "a clean OPEN PR must still get a real merge"
        assert result["success"] is True, result
        assert not (project / ".session" / "162-1-session.md").exists()
