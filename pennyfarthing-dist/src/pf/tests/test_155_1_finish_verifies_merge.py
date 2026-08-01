"""Tests for story 155-1: finish must verify the PR merged before marking done.

Story: 155-1 — "Finish flow marks story done while PR stays open — merge_pr
no-op" (gh #71 / #60).

TDD RED phase: these tests describe the *correct* behavior. They fail against
the current ``finish_story`` because Step 2 ("Merge PR") only appends a
``warning`` step on a failed/no-op merge and then plows straight on to
``transition_story(..., "done")`` (L287-288), archiving and removing the session
even though the code never landed on the base branch.

Two reported failure modes, one root cause — *no guard that the merge actually
happened before the ``done`` transition*:

1. **gh #60** — ``gh pr merge`` is invoked but does not merge (or returns a
   non-zero status); finish still flips the story to ``done``. The merge step
   must be treated as load-bearing: a non-zero merge result must abort finish.

2. **gh #71** — the PR is created out-of-band so ``pr_number`` is unresolved, or
   the merge silently no-ops; finish still marks ``done``. After the merge step,
   finish must *verify* the PR is actually ``MERGED`` (``gh pr view <n> --json
   state``) and abort — without archiving/removing the session or transitioning
   to ``done`` — if it is not.

Verification contract for Dev (GREEN phase):
- In ``auto`` merge mode with a resolvable PR, after the ``gh pr merge`` call,
  finish must query ``gh pr view <pr> --json state`` and treat any state other
  than ``MERGED`` as a hard failure.
- A failed merge or an unverified merge returns ``{"success": False, "error": ...}``
  and runs **no** irreversible cleanup (no ``done`` transition, no session
  removal).
- The clean path (merge succeeds AND ``state == MERGED``) is unchanged: ``done``
  transition runs and the session file is removed.

Mocking mirrors the sibling story 151-3 test
(``test_151_3_sharded_update_and_finish_loud.py``): ``_run`` is patched with a
command-dispatching fake so ``gh pr merge`` / ``gh pr view`` / ``gh pr list``
outcomes are controlled per-test, and ``transition_story`` is patched so the
``done`` request can be asserted on (or its absence asserted).
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures
# =============================================================================

# Index file: one epic shard ref. Story 155-1 lives in the shard below.
INDEX_YAML = """\
sprint:
  name: "Test155"
  jira_sprint_id: 999
  jira_sprint_name: "Test155"
  goal: Test finish merge verification
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
  - id: 155-1
    title: Finish flow marks story done while PR stays open
    points: 3
    priority: p1
    status: in_review
    workflow: tdd
"""

# Session WITH an explicit PR number (the common case: finish recorded the PR).
SESSION_WITH_PR = """\
---
story_id: "155-1"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-1: finish must verify the PR merged before marking done

## Story Details
- **ID:** 155-1
- **Workflow:** tdd
- **Branch:** feat/155-1-finish-flow-merge-pr-noop
- **PR:** #288 - finish flow merge verification
"""

# Session WITHOUT a PR number (gh #71: PR created out-of-band). finish must
# resolve it by head branch via ``gh pr list --head``.
SESSION_NO_PR = """\
---
story_id: "155-1"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-1: finish must verify the PR merged before marking done

## Story Details
- **ID:** 155-1
- **Workflow:** tdd
- **Branch:** feat/155-1-finish-flow-merge-pr-noop
"""

# Session with the none-sentinel branch (155-34 pre-adjustment): the affirmed
# no-branch world, which stays on the accepted no-PR arm before and after the
# 155-34 unmerged-branch guard. The over-reach guard below uses this shape;
# the real-branch-with-no-resolvable-PR world it previously occupied is now
# owned (and aborted) by test_155_34_finish_no_pr_unmerged_branch.py, closing
# the "no PR at all" open question this file's Delivery Findings recorded.
SESSION_NO_PR_SENTINEL = """\
---
story_id: "155-1"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-1: finish must verify the PR merged before marking done

## Story Details
- **ID:** 155-1
- **Workflow:** tdd
- **Branch:** none
"""


def _make_project(tmp_path: Path, session_text: str) -> Path:
    """Build a project layout (sprint/ + .session/) for finish_story tests."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "155-1-session.md").write_text(session_text)
    return tmp_path


@pytest.fixture
def project_with_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, SESSION_WITH_PR)


@pytest.fixture
def project_no_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, SESSION_NO_PR)


def _make_fake_run(*, merge_rc: int = 0, pr_state: str = "MERGED", listed_pr: str = ""):
    """Build a command-dispatching fake for ``story_finish._run``.

    - ``gh pr merge ...``  → returncode=merge_rc
    - ``gh pr view ...``   → stdout JSON ``{"state": pr_state, ...}``
    - ``gh pr list ...``   → stdout=listed_pr (the resolved PR number)
    - anything else (git checkout/pull/branch, epic archive) → returncode=0
    """

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(
                returncode=merge_rc,
                stdout="",
                stderr="" if merge_rc == 0 else "merge failed: pull request is not mergeable",
            )
        if "view" in parts:
            merged_at = "2026-06-04T00:00:00Z" if pr_state == "MERGED" else None
            return MagicMock(
                returncode=0,
                stdout=json.dumps({"state": pr_state, "mergedAt": merged_at}),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout=listed_pr, stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _requested_done(mock_transition: MagicMock) -> bool:
    """True if transition_story was ever asked to move the story to ``done``."""
    for call in mock_transition.call_args_list:
        # transition_story(project_root, story_id, "done")
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


# =============================================================================
# Failure mode 1 (gh #60) — a failed merge must abort finish
# =============================================================================


class TestFinishAbortsWhenMergeFails:
    """When ``gh pr merge`` returns non-zero, finish must NOT mark the story
    done. Today it only appends a ``warning`` step and continues.

    ``pr_state="OPEN"`` is pinned explicitly (155-29 pre-adjustment): these
    tests previously relied on the fake's default ``pr_state="MERGED"``, an
    inconsistent world (merge fails but the PR reports MERGED) that the
    155-29 pre-merge ``_pr_is_merged`` short-circuit legitimately turns into
    an already-merged success. A *genuinely failed* merge is one where the PR
    is still OPEN — which is what these tests always meant to simulate.
    Green on HEAD (the rc!=0 abort fires before any state read) and post-fix.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_returns_failure_when_gh_merge_returns_nonzero(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=1, pr_state="OPEN"),
        ):
            result = finish_story(project_with_pr, "155-1")

        assert result["success"] is False, (
            "A failed `gh pr merge` must abort finish (success: False), "
            f"got: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_failure_result_mentions_the_pr(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=1, pr_state="OPEN"),
        ):
            result = finish_story(project_with_pr, "155-1")

        assert "error" in result, f"Failure result missing 'error' key: {result}"
        err = result["error"].lower()
        assert "merge" in err or "288" in err or "pr" in err, (
            f"Error should explain the merge failure, got: {result['error']!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_not_removed_when_merge_fails(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project_with_pr / ".session" / "155-1-session.md"
        assert session_path.exists()  # precondition

        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=1, pr_state="OPEN"),
        ):
            finish_story(project_with_pr, "155-1")

        assert session_path.exists(), (
            "Session file was removed despite a failed merge — finish must abort "
            "cleanup when the PR did not merge"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_does_not_transition_to_done_when_merge_fails(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=1, pr_state="OPEN"),
        ):
            finish_story(project_with_pr, "155-1")

        assert not _requested_done(mock_transition), (
            "finish requested the `done` transition even though the merge failed"
        )


# =============================================================================
# Failure mode 2 (gh #71/#60) — merge "succeeds" but PR is still OPEN
# =============================================================================


class TestFinishVerifiesMergeLanded:
    """Even when ``gh pr merge`` returns 0, finish must verify the PR is
    actually ``MERGED`` before marking the story done. The reported bug is a
    silent no-op: the step prints as run, returns success-looking, yet the PR
    stays OPEN and the commits never reach the base branch.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_aborts_when_pr_state_is_not_merged(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="OPEN"),
        ):
            result = finish_story(project_with_pr, "155-1")

        assert result["success"] is False, (
            "merge returned 0 but PR state is OPEN — finish must verify the "
            f"merge landed and abort, got: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_kept_when_pr_not_merged(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project_with_pr / ".session" / "155-1-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="OPEN"),
        ):
            finish_story(project_with_pr, "155-1")

        assert session_path.exists(), (
            "Session removed while the PR was still OPEN — the worst failure "
            "mode: tracker says done, branch says otherwise"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_does_not_transition_to_done_when_pr_not_merged(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="OPEN"),
        ):
            finish_story(project_with_pr, "155-1")

        assert not _requested_done(mock_transition), (
            "finish flipped the story to `done` while the PR was still OPEN"
        )


# =============================================================================
# Failure mode 3 (gh #71) — out-of-band PR must be resolved by head branch
# =============================================================================


class TestFinishResolvesOutOfBandPr:
    """gh #71: the PR was created out-of-band, so ``pr_number`` is not in the
    session. finish must look it up by head branch (``gh pr list --head``) and
    merge it — not silently skip the merge and mark done.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_merges_pr_resolved_by_branch(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_no_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}

        # Stateful world (155-29 pre-adjustment): the resolved PR starts OPEN
        # and flips to MERGED only after `gh pr merge` runs. The previous
        # always-MERGED fake would take the 155-29 pre-merge short-circuit and
        # never exercise the merge this test exists to assert. Green on HEAD
        # (merge runs, verify reads MERGED) and post-fix (pre-check reads OPEN,
        # merge runs, verify reads MERGED).
        state = {"merged": False}
        base = _make_fake_run(merge_rc=0, pr_state="OPEN", listed_pr="288")

        def _stateful_run(cmd, **kwargs):
            parts = [str(c) for c in cmd]
            if "merge" in parts:
                state["merged"] = True
            if "view" in parts and state["merged"]:
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {"state": "MERGED", "mergedAt": "2026-06-04T00:00:00Z"}
                    ),
                    stderr="",
                )
            return base(cmd, **kwargs)

        fake = MagicMock(side_effect=_stateful_run)
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project_no_pr, "155-1")

        # The resolved PR (#288) must actually be merged — assert gh pr merge ran on it.
        merge_calls = [
            c for c in fake.call_args_list
            if "merge" in [str(x) for x in c.args[0]]
        ]
        assert merge_calls, (
            "No `gh pr merge` was invoked — out-of-band PR resolved by branch "
            "was silently skipped (gh #71)"
        )
        assert any("288" in [str(x) for x in c.args[0]] for c in merge_calls), (
            "merge ran but not against the branch-resolved PR #288"
        )
        assert result["success"] is True

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_finish_still_succeeds_verify_does_not_overreach(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        tmp_path: Path,
    ) -> None:
        """Affirmed-no-branch world (sentinel), in auto merge mode.

        Product decision (2026-06-04, Keith): the verify-merged guard applies
        **only when a PR exists**. This test is the over-reach guard: the
        ``gh pr view`` verification must not abort a legitimate no-PR finish.
        155-34 reinterpretation: the original real-branch-with-no-resolvable-PR
        world (the "no PR at all" open question in this file's Delivery
        Findings) is now owned by test_155_34_finish_no_pr_unmerged_branch.py,
        which ABORTS it when the branch holds unmerged commits. The accepted
        no-PR done path survives for worlds finish can trust without a PR —
        here, the agent's affirmative ``Branch: none`` sentinel.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project_sentinel = _make_project(tmp_path, SESSION_NO_PR_SENTINEL)
        # Sentinel branch → no gh pr list probe → no PR → merge step skipped.
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="OPEN", listed_pr=""),
        ):
            result = finish_story(project_sentinel, "155-1")

        assert result["success"] is True, (
            "verify-merged must not block a no-PR finish (over-reach guard): "
            f"{result}"
        )
        assert _requested_done(mock_transition), (
            "no-PR auto finish should still transition to done (accepted behavior)"
        )


# =============================================================================
# Regression guard — the clean, verified-merge path is unchanged
# =============================================================================


class TestFinishSuccessPathUnchanged:
    """When the merge succeeds AND the PR is verified ``MERGED``, finish behaves
    exactly as before: marks done and removes the session. Stops the
    verify-merge change from over-reaching and blocking healthy finishes.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_merge_marks_done_and_removes_session(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project_with_pr: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        session_path = project_with_pr / ".session" / "155-1-session.md"

        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="MERGED"),
        ):
            result = finish_story(project_with_pr, "155-1")

        assert result["success"] is True, result
        assert result["story_id"] == "155-1"
        assert _requested_done(mock_transition), (
            "Clean verified merge must still transition the story to `done`"
        )
        assert not session_path.exists(), (
            "Clean finish must still remove the session file"
        )
