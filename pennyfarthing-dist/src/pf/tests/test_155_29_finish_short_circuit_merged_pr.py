"""Tests for story 155-29: make post-merge aborts retryable — short-circuit
Step 2 when ``_pr_is_merged()`` is already true (from the 155-16 review).

The bug (why post-merge aborts are NOT retryable today)
-------------------------------------------------------
``finish_story`` has several loud-abort paths that run AFTER the merge has
landed but BEFORE the story is marked done (all of them deliberately keep the
session and skip irreversible cleanup):

- the archive ``OSError`` abort (Step 1 runs post-merge since 155-15),
- the status-transition read guard (155-16),
- the transition/yaml-update failure abort.

After any of those, the operator fixes the underlying problem and re-runs
``pf sprint story finish``. The re-run reaches Step 2 and calls
``gh pr merge`` on a PR that is ALREADY MERGED — gh exits non-zero
("already merged"), the rc!=0 abort branch fires, and finish is permanently
wedged: every retry fails at the merge it does not need to perform.

Acceptance criteria (from the session file — authoritative)
-----------------------------------------------------------
- AC-1: Step 2 (auto merge mode, PR present) calls ``_pr_is_merged()`` BEFORE
  attempting ``gh pr merge``.
- AC-2: if the PR is already MERGED, the merge attempt is short-circuited and
  finish proceeds to Step 3+ (the ceremony completes on retry).
- AC-3: test coverage for the short-circuit path (already-merged PR after a
  post-merge abort).

Designed interface (for Dev — tests bind only to the essentials)
----------------------------------------------------------------
In the auto-mode ``elif pr_number:`` branch of ``finish_story``, before the
``gh pr merge`` invocation::

    if _pr_is_merged(pr_number):
        steps.append({"step": 2, "action": "merge_pr", "pr": pr_number,
                      "merged": True, "already_merged": True})
    else:
        ... existing merge + verify ...

The step entry must record the PR as merged (``merged: True`` and/or
``already_merged: True``) — NOT ``skipped`` (the PR exists and its code
landed; "skipped" is the no-PR wording and would make the finish report lie,
which is this epic's whole subject).

RED tests (fail on HEAD, for the right reason):
  - ``TestAlreadyMergedShortCircuit`` — merge not invoked when the PR is
    already MERGED; finish completes; the retry-after-post-merge-abort
    end-to-end scenario; the step-2 record is truthful.

Green-on-arrival guards (over-reach protection — must stay green):
  - ``TestUnmergedPathUnchanged`` — an OPEN PR still gets merged (the
    short-circuit must not fire early); a genuine merge failure still aborts;
    a pre-check probe error must FALL THROUGH to the real merge attempt,
    never be treated as "already merged" (lang-review python #1 — no silent
    swallow opening a false-done hole); human merge mode is untouched.

Harness mirrors ``test_155_12_finish_conflicting_pr.py`` (command-dispatching
fake for ``story_finish._run`` + patched ``transition_story``), extended with
a STATEFUL fake whose ``gh pr view`` state flips to MERGED only after a
successful ``gh pr merge`` — required so the clean unmerged path is drivable
once the pre-check exists (a stateless MERGED fake would short-circuit).

Sibling pre-adjustment (same commit): four ``test_155_1`` abort tests used
``merge_rc=1`` with the fake's default ``pr_state="MERGED"`` — an inconsistent
world that the 155-29 pre-check legitimately turns into a short-circuit
success. They now pin ``pr_state="OPEN"`` (green on HEAD and post-fix), and
``test_merges_pr_resolved_by_branch`` uses a stateful fake for the same
reason. See the 155-29 session Design Deviations.
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures — minimal sprint/.session project (mirrors test_155_12)
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test15529"
  jira_sprint_id: 999
  jira_sprint_name: "Test15529"
  goal: Test finish short-circuit on an already-merged PR
  start_date: 2026-07-01
  end_date: 2026-07-14
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
  - id: 155-29
    title: finish_story short-circuits Step 2 on an already-merged PR
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "155-29"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-29: finish short-circuits the merge for an already-merged PR

## Story Details
- **ID:** 155-29
- **Workflow:** tdd
- **Branch:** feat/155-29-post-merge-abort-retryable
- **PR:** #999 - short-circuit already-merged PR
"""


def _make_project(tmp_path: Path) -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-29-session.md").write_text(SESSION_WITH_PR)
    return tmp_path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return _make_project(tmp_path)


# =============================================================================
# Fakes
# =============================================================================


def _make_already_merged_run(*, merge_rc: int = 1):
    """World: the PR is ALREADY MERGED (a prior finish run landed it).

    - ``gh pr view`` → MERGED (mergeable UNKNOWN — GitHub stops computing
      mergeability once a PR merges, so the 155-12 pre-gate does not block).
    - ``gh pr merge`` → rc=1 "already merged" by default — what gh actually
      does on a merged PR, and exactly what wedges every retry today. A
      ``merge_rc=0`` variant lets tests pin that the merge is not even
      attempted when gh would happen to tolerate it.
    """

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr=""
                if merge_rc == 0
                else 'GraphQL: Pull request #999 is already merged (mergePullRequest)',
            )
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": "MERGED",
                        "mergedAt": "2026-07-30T00:00:00Z",
                        "mergeable": "UNKNOWN",
                        "mergeStateStatus": "UNKNOWN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _make_stateful_run(*, merge_rc: int = 0):
    """World: the PR starts OPEN/MERGEABLE and becomes MERGED only after a
    successful ``gh pr merge`` — the honest clean-path simulation. Required
    once the pre-check exists: a stateless always-MERGED fake would take the
    short-circuit and never exercise the real merge path.
    """
    state = {"merged": False}

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            if merge_rc == 0:
                state["merged"] = True
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr="" if merge_rc == 0 else "merge failed: pull request is not mergeable",
            )
        if "view" in parts:
            pr_state = "MERGED" if state["merged"] else "OPEN"
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": pr_state,
                        "mergedAt": "2026-07-31T00:00:00Z" if state["merged"] else None,
                        "mergeable": "MERGEABLE",
                        "mergeStateStatus": "CLEAN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _merge_invoked(fake: MagicMock) -> bool:
    """True if ``gh pr merge`` was ever called through the fake ``_run``."""
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
    return [
        s
        for s in result.get("steps", [])
        if s.get("step") == 2 and s.get("action") == "merge_pr"
    ]


# =============================================================================
# AC-1 / AC-2 — already-merged PR short-circuits Step 2 (GENUINELY RED)
# =============================================================================


class TestAlreadyMergedShortCircuit:
    """Retry world: a prior finish run merged the PR, then aborted on a later
    step (archive OSError / status-read guard / transition failure), leaving
    the session in place. The re-run must NOT re-attempt ``gh pr merge`` — it
    must detect MERGED up front and complete the remaining ceremony.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_already_merged_pr_skips_merge_attempt(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-1: ``_pr_is_merged()`` runs BEFORE ``gh pr merge`` — a MERGED PR
        never sees another merge attempt. ``merge_rc=0`` on purpose: even when
        gh would tolerate the redundant merge, issuing it is the bug (the
        step's success would come from a lie — gh no-opping — not from work).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_already_merged_run(merge_rc=0))
        with patch("pf.sprint.story_finish._run", fake):
            finish_story(project, "155-29")

        assert not _merge_invoked(fake), (
            "finish ran `gh pr merge` on a PR that is already MERGED — Step 2 "
            "must call _pr_is_merged() first and short-circuit (AC-1)"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_completes_when_pr_already_merged(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-2: the realistic retry — gh refuses to merge an already-merged
        PR (rc=1 "already merged"). Today that rc!=0 aborts finish and the
        story is permanently wedged; the short-circuit must complete the
        ceremony instead (done transition, session removed).
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        session_path = project / ".session" / "155-29-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_already_merged_run(merge_rc=1),
        ):
            result = finish_story(project, "155-29")

        assert result["success"] is True, (
            "finish must complete for an already-MERGED PR instead of aborting "
            f"on the redundant merge attempt: {result}"
        )
        assert _requested_done(mock_transition), (
            "already-merged retry must still transition the story to done"
        )
        assert not session_path.exists(), (
            "already-merged retry must complete cleanup (session removed)"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_retry_after_post_merge_abort_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """AC-2/AC-3 end-to-end: run 1 merges the PR for real (OPEN→MERGED)
        then aborts on a failed ``done`` transition (a genuine post-merge
        abort — session kept, story not done). Run 2 retries with the
        transition healthy: on HEAD it dies at the redundant merge
        ("already merged", rc=1); with the short-circuit it completes.
        """
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        session_path = project / ".session" / "155-29-session.md"

        # --- Run 1: merge lands, the done-transition fails → post-merge abort.
        def _fail_done(_root, _story_id, to_status, *args, **kwargs):
            if to_status == "done":
                return {"success": False, "error": "yaml update failed (simulated)"}
            return {"success": True, "to_status": to_status}

        mock_transition.side_effect = _fail_done
        run1_fake = MagicMock(side_effect=_make_stateful_run(merge_rc=0))
        with patch("pf.sprint.story_finish._run", run1_fake):
            run1 = finish_story(project, "155-29")

        # Post-merge abort state (155-1/155-16 behavior, precondition for the
        # retry): finish failed loudly, merge landed, session still in place.
        assert run1["success"] is False
        assert _merge_invoked(run1_fake)
        assert session_path.exists()

        # --- Run 2: transition healthy; the PR is already MERGED, and gh now
        # refuses the redundant merge exactly like the real CLI would.
        mock_transition.side_effect = None
        mock_transition.return_value = {"success": True, "to_status": "done"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_already_merged_run(merge_rc=1),
        ):
            run2 = finish_story(project, "155-29")

        assert run2["success"] is True, (
            "retry after a post-merge abort must complete the ceremony — "
            f"today it wedges on the redundant `gh pr merge`: {run2}"
        )
        assert not session_path.exists(), "retry must finish cleanup (session removed)"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_short_circuit_step_record_is_truthful(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """The step-2 report entry must record the PR as MERGED (``merged``
        and/or ``already_merged`` truthy) — not a failure, and not the no-PR
        ``skipped`` wording. The finish report is this epic's product; a
        short-circuit that reports "skipped" lies about a landed merge.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_already_merged_run(merge_rc=1),
        ):
            result = finish_story(project, "155-29")

        entries = _step2_entries(result)
        assert entries, f"no step-2 merge_pr entry in the report: {result.get('steps')}"
        entry = entries[0]
        assert entry.get("success") is not False, (
            f"step-2 entry reports failure for an already-merged PR: {entry!r}"
        )
        assert entry.get("pr") == "999", f"step-2 entry must name the PR: {entry!r}"
        assert (
            entry.get("merged") is True or entry.get("already_merged") is True
        ), (
            "step-2 entry must record the PR as merged (merged/already_merged "
            f"truthy), got: {entry!r}"
        )
        assert not entry.get("skipped"), (
            "'skipped' is the no-PR wording — an already-merged PR is MERGED, "
            f"not skipped: {entry!r}"
        )


# =============================================================================
# Green-on-arrival guards — the unmerged path is unchanged (over-reach
# protection; intentional-green, logged as Design Deviations)
# =============================================================================


class TestUnmergedPathUnchanged:
    """The short-circuit must fire ONLY for an already-MERGED PR. An OPEN PR
    still gets a real merge; a failed merge still aborts; a pre-check that
    cannot establish the PR state must fall through to the merge attempt —
    never silently assume "merged" (lang-review python #1). All green on HEAD
    and post-fix.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_open_pr_still_merges_and_completes(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Clean path with the honest stateful world (OPEN until merged):
        the merge MUST still be invoked — a short-circuit that skips the merge
        for a not-yet-merged PR would ship unmerged code as done."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        session_path = project / ".session" / "155-29-session.md"
        fake = MagicMock(side_effect=_make_stateful_run(merge_rc=0))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-29")

        assert _merge_invoked(fake), (
            "an OPEN PR must still get a real `gh pr merge` — the pre-check "
            "must not skip merges for unmerged PRs"
        )
        assert result["success"] is True, result
        assert not session_path.exists()

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_genuine_merge_failure_still_aborts(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """A PR that stays OPEN and whose merge fails rc!=0 must still abort
        loudly (155-1 contract) — the retryability fix must not soften the
        load-bearing merge."""
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-29-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_stateful_run(merge_rc=1),
        ):
            result = finish_story(project, "155-29")

        assert result["success"] is False, (
            f"a genuinely failed merge must still abort finish: {result}"
        )
        assert session_path.exists()
        assert not _requested_done(mock_transition)

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_precheck_probe_error_falls_through_to_merge(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project: Path
    ) -> None:
        """When ``gh pr view`` errors, ``_pr_is_merged`` returns False — the
        pre-check must treat that as NOT merged and fall through to the real
        merge attempt (then the 155-1 post-merge verify still aborts, since
        the state remains unverifiable). A pre-check that reads a probe error
        as "already merged" would silently skip the load-bearing merge and
        finish a story whose code never landed (python rule #1, SOUL #10).
        """
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project / ".session" / "155-29-session.md"

        def _view_errors(cmd, **kwargs):
            parts = [str(c) for c in cmd]
            if "view" in parts:
                return MagicMock(returncode=1, stdout="", stderr="could not resolve PR")
            if "merge" in parts:
                return MagicMock(returncode=0, stdout="", stderr="")
            return MagicMock(returncode=0, stdout="", stderr="")

        fake = MagicMock(side_effect=_view_errors)
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-29")

        assert _merge_invoked(fake), (
            "an unverifiable PR state must fall through to the merge attempt — "
            "never short-circuit as if the PR were merged"
        )
        assert result["success"] is False, (
            "unverifiable post-merge state must still abort (155-1 backstop): "
            f"{result}"
        )
        assert session_path.exists()
        assert not _requested_done(mock_transition)

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_untouched_no_merge_attempt(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Human merge mode never auto-merges and must stay that way — the
        short-circuit belongs to the auto-mode branch only, and a MERGED
        ``gh pr view`` answer must not flip a human-mode finish into the
        auto ``done`` path."""
        mock_add_completed.return_value = {"success": True, "epic": "155"}
        fake = MagicMock(side_effect=_make_already_merged_run(merge_rc=0))
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project, "155-29")

        assert not _merge_invoked(fake), "human mode must never invoke gh pr merge"
        assert result["success"] is True, result
        assert not _requested_done(mock_transition), (
            "human mode leaves the story in_review — never requests done"
        )
