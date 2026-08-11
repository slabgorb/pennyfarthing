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

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story
from pf.tests.helpers.gh_pr_fake import GhPrFake

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
            GhPrFake(merge_rc=1, pr_state="OPEN"),
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
            GhPrFake(merge_rc=1, pr_state="OPEN"),
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
            GhPrFake(merge_rc=1, pr_state="OPEN"),
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
            GhPrFake(merge_rc=1, pr_state="OPEN"),
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
            GhPrFake(merge_rc=0, pr_state="OPEN"),
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
            GhPrFake(merge_rc=0, pr_state="OPEN"),
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
            GhPrFake(merge_rc=0, pr_state="OPEN"),
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

        fake = GhPrFake(merge_rc=0, pr_state="MERGED", pre_merge_state="OPEN", list_stdout="288")
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project_no_pr, "155-1")

        assert len(fake.merge_calls) > 0, (
            "No `gh pr merge` was invoked — out-of-band PR resolved by branch "
            "was silently skipped (gh #71)"
        )
        assert any("288" in c for c in fake.merge_calls), (
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
            GhPrFake(merge_rc=0, pr_state="OPEN", list_stdout=""),
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

    162-22: this class's happy path used to stub a **fixed ``MERGED``** PR view.
    Because 155-29 added a pre-merge short-circuit that treats an
    already-``MERGED`` view as done, that world made finish skip ``gh pr merge``
    entirely — the test passed while asserting nothing about the merge that
    155-1 made load-bearing. The happy path now pins the stateful world
    (``pre_merge_state="OPEN"`` → ``pr_state="MERGED"``) and asserts the merge
    **invocation**, not just the final state.
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

        # Stateful world: OPEN until `gh pr merge` actually runs, then MERGED.
        # `pre_merge_state` is pinned explicitly rather than inherited from the
        # GhPrFake default so a future default change cannot silently re-arm
        # the 155-29 short-circuit and re-hollow this test.
        fake = GhPrFake(merge_rc=0, pr_state="MERGED", pre_merge_state="OPEN")
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project_with_pr, "155-1")

        assert len(fake.merge_calls) == 1, (
            "The clean happy path must invoke `gh pr merge` exactly once — "
            f"got {fake.merge_calls!r}. Zero calls means finish short-circuited "
            "and the merge 155-1 made load-bearing was never exercised."
        )
        assert "288" in fake.merge_calls[0], (
            "merge ran but not against the session's PR #288: "
            f"{fake.merge_calls[0]!r}"
        )
        assert result["success"] is True, result
        assert result["story_id"] == "155-1"
        assert _requested_done(mock_transition), (
            "Clean verified merge must still transition the story to `done`"
        )
        assert not session_path.exists(), (
            "Clean finish must still remove the session file"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_fixed_merged_view_short_circuits_and_never_merges(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project_with_pr: Path,
    ) -> None:
        """Vacuity sentinel (162-22).

        Pins *why* the clean-merge test must use the stateful fake: in a world
        where the PR already reads ``MERGED`` up front, the 155-29 pre-check
        legitimately declares success **without calling ``gh pr merge``**. That
        is correct behavior for a genuine already-merged PR — and exactly why a
        fixed-``MERGED`` stub can never stand in for a clean merge. If this
        assertion ever flips (merge called here), the short-circuit is gone and
        the sibling happy-path test above needs re-derivation.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}

        fake = GhPrFake(merge_rc=0, pr_state="MERGED", pre_merge_state="MERGED")
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project_with_pr, "155-1")

        assert result["success"] is True, result
        assert fake.merge_calls == [], (
            "An already-MERGED PR must take the 155-29 short-circuit, not "
            f"re-merge: {fake.merge_calls!r}"
        )
