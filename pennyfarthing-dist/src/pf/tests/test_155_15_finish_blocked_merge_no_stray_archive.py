"""Tests for story 155-15: a blocked/denied auto-merge must not archive.

Story: 155-15 — "finish marks story done + archives when auto-merge is
blocked/denied (e.g. review-required guardrail) instead of aborting or holding
in_review."

Sibling 155-1 (``test_155_1_finish_verifies_merge.py``) already made the merge
load-bearing: a non-zero ``gh pr merge`` OR a merge that does not land in the
``MERGED`` state aborts finish *before* the ``done`` transition and *before*
session removal. So the "marks story done" half of this bug — flipping the
story to ``done`` on a blocked merge — is covered there.

TDD RED phase: these tests pin the REMAINING half — "**+ archives**". In
``finish_story`` the ordering is:

    Step 1  archive_session   (shutil.copy2 → sprint/archive/{id}-session.md)  # L396-398
    Step 2  gh pr merge       (+ post-merge _pr_is_merged verification)         # L423-472

The pre-merge gate (``_pr_block_reason``) only hard-blocks a *definitively
CONFLICTING / DIRTY* PR before Step 1. A **review-required guardrail** reports
``mergeable=MERGEABLE`` with ``mergeStateStatus=BLOCKED`` — neither CONFLICTING
nor DIRTY — so it falls THROUGH the gate, Step 1 copies the session into
``sprint/archive/``, and only then does Step 2 discover the merge is blocked and
abort. The story is correctly left un-``done`` and its ``.session`` file intact,
but a **stray archived copy** is left behind in ``sprint/archive/`` — a
half-finished on-disk state that lies about completion (epic 155: finish must
not archive what it did not finish; SOUL #14).

Contract this story pins (behaviour, not mechanism — Dev may move archive after
merge verification, or clean up the copy on abort):

- A blocked/denied merge (``gh pr merge`` non-zero) leaves **no** file in
  ``sprint/archive/`` and keeps the ``.session`` file.
- A merge that returns 0 but leaves the PR un-``MERGED`` (guardrail no-op) is the
  same abort path and likewise leaves **no** stray archive.
- The abort is distinguishable from the *no-PR* case: a story with no resolvable
  PR still finishes cleanly and archives (over-reach guard). A blocked merge does
  not.
- The clean, verified-merge path is unchanged: it archives, marks done, and
  removes the ``.session`` file.

Mocking mirrors sibling 155-1: ``_run`` is patched with a command-dispatching
fake. Unlike 155-1, the fake distinguishes the two ``gh pr view`` shapes — the
pre-merge gate view (``--json mergeable,mergeStateStatus,baseRefName``) vs the
post-merge state view (``--json state``) — so a review-required BLOCKED state can
be modelled independently of the final PR state.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Fixtures
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test155"
  jira_sprint_id: 999
  jira_sprint_name: "Test155"
  goal: Test finish blocked-merge archiving
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
  - id: 155-15
    title: finish marks story done + archives when auto-merge is blocked/denied
    points: 3
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "155-15"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-15: blocked-merge must not archive

## Story Details
- **ID:** 155-15
- **Workflow:** tdd
- **Branch:** feat/155-15
- **PR:** #315 - finish blocked-merge archiving
"""

SESSION_NO_PR = """\
---
story_id: "155-15"
jira_key: ""
epic: "155"
workflow: "tdd"
---

# Story 155-15: blocked-merge must not archive

## Story Details
- **ID:** 155-15
- **Workflow:** tdd
- **Branch:** feat/155-15
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
    (session_dir / "155-15-session.md").write_text(session_text)
    return tmp_path


@pytest.fixture
def project_with_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, SESSION_WITH_PR)


@pytest.fixture
def project_no_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, SESSION_NO_PR)


def _make_fake_run(
    *,
    merge_rc: int = 0,
    merge_stderr: str = "",
    pr_state: str = "MERGED",
    mergeable: str = "MERGEABLE",
    merge_state_status: str = "CLEAN",
    listed_pr: str = "",
):
    """Build a command-dispatching fake for ``story_finish._run``.

    Distinguishes the two ``gh pr view`` shapes by the ``--json`` field list:

    - ``gh pr view <n> --json mergeable,mergeStateStatus,baseRefName``
      → pre-merge gate view: ``{mergeable, mergeStateStatus, baseRefName}``
    - ``gh pr view <n> --json state``
      → post-merge state view: ``{state}``
    - ``gh pr merge ...`` → returncode=merge_rc, stderr=merge_stderr
    - ``gh pr list ...``  → stdout=listed_pr (resolved PR number)
    - anything else (git checkout/pull/branch, epic archive) → returncode=0
    """

    def _fake_run(cmd, **kwargs):
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            return MagicMock(returncode=merge_rc, stdout="", stderr=merge_stderr)
        if "view" in parts:
            json_fields = ""
            if "--json" in parts:
                json_fields = parts[parts.index("--json") + 1]
            if "mergeable" in json_fields or "mergeStateStatus" in json_fields:
                return MagicMock(
                    returncode=0,
                    stdout=json.dumps(
                        {
                            "mergeable": mergeable,
                            "mergeStateStatus": merge_state_status,
                            "baseRefName": "develop",
                        }
                    ),
                    stderr="",
                )
            return MagicMock(returncode=0, stdout=json.dumps({"state": pr_state}), stderr="")
        if "list" in parts:
            return MagicMock(returncode=0, stdout=listed_pr, stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake_run


def _archived_session_files(project_root: Path) -> list[Path]:
    """Every ``*-session.md`` copy present in ``sprint/archive/``."""
    return sorted((project_root / "sprint" / "archive").glob("*-session.md"))


def _requested_done(mock_transition: MagicMock) -> bool:
    """True if transition_story was ever asked to move the story to ``done``."""
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3 and call.args[2] == "done":
            return True
        if call.kwargs.get("to_status") == "done" or "done" in call.args:
            return True
    return False


# A realistic ``gh pr merge`` denial for a branch that requires review before
# merging (the "review-required guardrail" the story names).
REVIEW_REQUIRED_STDERR = (
    "failed to merge pull request: GraphQL: Base branch requires a pull "
    "request review before merging (mergePullRequest)"
)


# =============================================================================
# Core coverage — a blocked/denied merge must NOT leave a stray archive
# =============================================================================


class TestBlockedMergeLeavesNoStrayArchive:
    """Review-required guardrail: ``gh pr merge`` returns non-zero because the
    base branch requires review. finish must abort WITHOUT leaving an archived
    copy of the session behind (the "+ archives" half of the bug).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_session_copy_left_in_archive_when_merge_denied(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=1,
                merge_stderr=REVIEW_REQUIRED_STDERR,
                mergeable="MERGEABLE",
                merge_state_status="BLOCKED",
                pr_state="OPEN",
            ),
        ):
            finish_story(project_with_pr, "155-15")

        stray = _archived_session_files(project_with_pr)
        assert stray == [], (
            "Blocked merge left a stray session archive: "
            f"{[p.name for p in stray]} — finish must not archive a story whose "
            "merge was denied (epic 155: don't archive what you didn't finish)"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_result_is_failure_when_merge_denied(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=1,
                merge_stderr=REVIEW_REQUIRED_STDERR,
                merge_state_status="BLOCKED",
                pr_state="OPEN",
            ),
        ):
            result = finish_story(project_with_pr, "155-15")

        assert result["success"] is False, (
            f"A review-required blocked merge must abort finish, got: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_file_kept_when_merge_denied(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        session_path = project_with_pr / ".session" / "155-15-session.md"
        assert session_path.exists()  # precondition
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=1,
                merge_stderr=REVIEW_REQUIRED_STDERR,
                merge_state_status="BLOCKED",
                pr_state="OPEN",
            ),
        ):
            finish_story(project_with_pr, "155-15")

        assert session_path.exists(), (
            "Session file removed on a blocked merge — the story must stay active "
            "(held in_review) so a human can approve and re-run finish"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_does_not_transition_to_done_when_merge_denied(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=1,
                merge_stderr=REVIEW_REQUIRED_STDERR,
                merge_state_status="BLOCKED",
                pr_state="OPEN",
            ),
        ):
            finish_story(project_with_pr, "155-15")

        assert not _requested_done(mock_transition), (
            "finish requested the `done` transition on a blocked/denied merge"
        )


class TestUnverifiedMergeLeavesNoStrayArchive:
    """Guardrail no-op: ``gh pr merge`` returns 0 but the PR never reaches the
    ``MERGED`` state (e.g. an auto-merge queue that a required review blocks).
    155-1 already aborts here; 155-15 additionally forbids the stray archive.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_session_copy_left_in_archive_when_merge_unverified(
        self, mock_mode: MagicMock, mock_transition: MagicMock, project_with_pr: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "in_review"}
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=0,
                mergeable="MERGEABLE",
                merge_state_status="CLEAN",
                pr_state="OPEN",  # merge "succeeded" but PR still open
            ),
        ):
            result = finish_story(project_with_pr, "155-15")

        assert result["success"] is False, result
        stray = _archived_session_files(project_with_pr)
        assert stray == [], (
            "Merge returned 0 but the PR is still OPEN — finish aborted but left a "
            f"stray archive: {[p.name for p in stray]}"
        )


# =============================================================================
# Distinguish blocked-merge from no-PR (over-reach guard)
# =============================================================================


class TestBlockedDistinctFromNoPr:
    """The no-PR case is NOT a blocked merge: with no resolvable PR the story
    still finishes cleanly and archives. The blocked-merge fix must not
    over-reach and start blocking legitimate no-PR finishes.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_pr_finish_still_archives_and_marks_done(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project_no_pr: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        session_path = project_no_pr / ".session" / "155-15-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(merge_rc=0, pr_state="OPEN", listed_pr=""),
        ):
            result = finish_story(project_no_pr, "155-15")

        assert result["success"] is True, (
            f"no-PR finish must not be treated as a blocked merge: {result}"
        )
        assert _requested_done(mock_transition), (
            "no-PR auto finish should still transition to done (accepted behavior)"
        )
        assert _archived_session_files(project_no_pr), (
            "no-PR finish must still archive the session — the blocked-merge fix "
            "over-reached and skipped a legitimate archive"
        )
        assert not session_path.exists(), (
            "no-PR clean finish must still remove the .session file"
        )


# =============================================================================
# Regression guard — the clean, verified-merge path still archives + completes
# =============================================================================


class TestCleanMergeArchivesAndCompletes:
    """A verified merge (``gh pr merge`` returns 0 AND state == MERGED) must
    still archive the session, mark the story done, and remove the ``.session``
    file. Stops the "don't archive on abort" change from suppressing the
    legitimate archive on the happy path.
    """

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_clean_merge_archives_marks_done_and_removes_session(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        project_with_pr: Path,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        session_path = project_with_pr / ".session" / "155-15-session.md"
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_fake_run(
                merge_rc=0, mergeable="MERGEABLE", merge_state_status="CLEAN", pr_state="MERGED"
            ),
        ):
            result = finish_story(project_with_pr, "155-15")

        assert result["success"] is True, result
        assert _requested_done(mock_transition), (
            "Clean verified merge must still transition the story to `done`"
        )
        assert _archived_session_files(project_with_pr), (
            "Clean finish must still archive the session as the permanent record"
        )
        assert not session_path.exists(), (
            "Clean finish must still remove the .session file"
        )
