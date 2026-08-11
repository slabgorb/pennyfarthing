"""Tests for story 164-9: finish dry-run preview polish.

Three acceptance criteria:

AC1 (pin): Human-mode dry-run shows a clear already-merged message.
  - Human mode: step 2 says "waiting for human review and merge" (no probe).
  - Auto mode, MERGED PR: step 2 says "already merged — will skip merge".
  - Both are already implemented in the production code at lines 1227–1252;
    these tests PIN the behavior so a future refactor cannot regress it.

AC2 (red): Step-6 guard — "Delete local branch: None" must never render.
  - When branch is None, step 6 must NOT contain the literal string "None".
  - When branch is a real name, step 6 must show "Delete local branch: <name>".
  - Current code (line 1270): ``f"Delete local branch: {branch}"`` — with
    branch=None the f-string renders "Delete local branch: None".
  - AC2a (None guard) FAILS on HEAD; AC2b (real branch) is a pin.

AC3 (red): Dry-run no-PR path must predict abort worlds (155-34 parity).
  - Branch set + unmerged: step 2 must carry ``success: False`` / ``error``.
  - Empty / no branch: step 2 must carry ``success: False`` / ``error``.
  - Branch="none" sentinel: step 2 must NOT carry ``success: False`` (accepted
    skip — green guard; not an abort world).
  - Current code (lines 1259–1260): appends ``{"step": 2, "action": "No PR
    to merge"}`` unconditionally — no error flag, no abort prediction.
  - AC3a (unmerged-branch abort) and AC3b (empty-fields abort) FAIL on HEAD;
    AC3c (sentinel green guard) passes on HEAD and must keep passing post-fix.

RED tests (genuinely failing on HEAD):
  - TestStep6BranchGuard::test_step6_branch_none_does_not_render_literal_none
  - TestNoPrDryRunAbortPrediction::test_dry_run_no_pr_unmerged_branch_predicts_abort
  - TestNoPrDryRunAbortPrediction::test_dry_run_no_pr_empty_fields_predicts_abort

Pin / green-guard tests (pass on HEAD and post-fix):
  - TestHumanModeAlreadyMergedMessage::test_human_mode_shows_waiting_not_merged_message
  - TestHumanModeAlreadyMergedMessage::test_auto_mode_merged_pr_shows_already_merged_skip
  - TestStep6BranchGuard::test_step6_with_real_branch_shows_branch_name
  - TestNoPrDryRunAbortPrediction::test_dry_run_no_pr_sentinel_branch_not_abort
"""

import json
import re
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# =============================================================================
# Constants
# =============================================================================

STORY_ID = "164-9"
STORY_BRANCH = "feat/164-9-finish-dry-run-preview-polish"
PR_PLACEHOLDER = "(none yet — recorded when the PR is created)"

# =============================================================================
# Sprint / session fixture bodies
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test1649"
  jira_sprint_id: 999
  jira_sprint_name: "Test1649"
  goal: Finish dry-run preview polish tests
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "164"
stories: []
standalone_stories: []
"""

SHARD_YAML = """\
id: "164"
type: epic
title: "Finish dry-run preview polish"
priority: p1
status: in_progress
stories:
  - id: 164-9
    title: finish dry-run preview polish
    points: 1
    priority: p1
    status: in_progress
    workflow: tdd
"""

FRONTMATTER = """\
---
story_id: "164-9"
jira_key: ""
epic: "164"
workflow: "tdd"
---

# Story 164-9: finish dry-run preview polish

"""

# AC1 — PR #999 is present, branch is set (used for already-merged probe tests)
SESSION_WITH_PR = (
    FRONTMATTER
    + f"""\
## Story Details
- **ID:** 164-9
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
- **PR:** #999 - finish dry-run preview polish
"""
)

# AC2b / AC3a — branch set, no PR (gh pr list will return empty → pr_number=None)
SESSION_BRANCH_NO_PR = (
    FRONTMATTER
    + f"""\
## Story Details
- **ID:** 164-9
- **Workflow:** tdd
- **Branch:** {STORY_BRANCH}
- **PR:** {PR_PLACEHOLDER}
"""
)

# AC2a / AC3b — no branch field, no PR (branch=None, pr_number=None)
SESSION_NO_BRANCH = (
    FRONTMATTER
    + f"""\
## Story Details
- **ID:** 164-9
- **Workflow:** tdd
- **Branch:**
- **PR:** {PR_PLACEHOLDER}
"""
)

# AC3c — affirmative no-branch sentinel ("none")
SESSION_SENTINEL = (
    FRONTMATTER
    + """\
## Story Details
- **ID:** 164-9
- **Workflow:** tdd
- **Branch:** none
- **PR:** none
"""
)


# =============================================================================
# Fixture helpers
# =============================================================================


def _make_project(tmp_path: Path, *, session_body: str) -> Path:
    """Build a minimal hermetic project layout under tmp_path."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-164.yaml").write_text(SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(session_body, encoding="utf-8")
    return tmp_path


@pytest.fixture
def project_with_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, session_body=SESSION_WITH_PR)


@pytest.fixture
def project_branch_no_pr(tmp_path: Path) -> Path:
    return _make_project(tmp_path, session_body=SESSION_BRANCH_NO_PR)


@pytest.fixture
def project_no_branch(tmp_path: Path) -> Path:
    return _make_project(tmp_path, session_body=SESSION_NO_BRANCH)


@pytest.fixture
def project_sentinel(tmp_path: Path) -> Path:
    return _make_project(tmp_path, session_body=SESSION_SENTINEL)


# =============================================================================
# Fake _run builders
# =============================================================================


def _make_merged_view_run() -> Any:
    """gh pr view → MERGED; gh pr list → empty; everything else → success."""

    def _fake(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "view" in parts:
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": "MERGED",
                        "mergedAt": "2026-08-01T00:00:00Z",
                        "mergeable": "UNKNOWN",
                        "mergeStateStatus": "UNKNOWN",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake


def _make_no_pr_run() -> Any:
    """gh pr list → empty (no PR resolves); view never called; git → success."""

    def _fake(cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return _fake


# =============================================================================
# Step-result helpers
# =============================================================================


def _step2_actions(result: dict[str, Any]) -> list[str]:
    """Action strings of every dry-run plan entry with step == 2."""
    return [
        str(s.get("action", ""))
        for s in result.get("steps", [])
        if s.get("step") == 2
    ]


def _step2_entry(result: dict[str, Any]) -> dict[str, Any]:
    """Return the first step-2 entry (raises if absent)."""
    entries = [s for s in result.get("steps", []) if s.get("step") == 2]
    assert entries, f"no step-2 entry in dry-run plan: {result.get('steps')}"
    return entries[0]


def _step6_actions(result: dict[str, Any]) -> list[str]:
    """Action strings of every dry-run plan entry with step == 6."""
    return [
        str(s.get("action", ""))
        for s in result.get("steps", [])
        if s.get("step") == 6
    ]


ALREADY_MERGED_RE = re.compile(r"already[\s—–-]*merged", re.IGNORECASE)
SKIP_RE = re.compile(r"skip", re.IGNORECASE)


# =============================================================================
# AC1 — PIN: human-mode and auto-mode already-merged messages
# =============================================================================


class TestHumanModeAlreadyMergedMessage:
    """AC1: dry-run already-merged message behavior is correctly implemented.

    Both tests are pins — they capture already-correct behavior at lines
    1227–1252 so a future refactor cannot silently regress them.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="human")
    def test_human_mode_shows_waiting_not_merged_message(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_pr: Path,
    ) -> None:
        """AC1 (pin — human-mode arm): when the merge mode is 'human', the
        dry-run step 2 says "waiting for human review" and must NOT promise
        an already-merged skip (human mode does not probe the PR state).
        """
        fake = MagicMock(side_effect=_make_merged_view_run())
        with patch("pf.sprint.story_finish._run", fake):
            result = finish_story(project_with_pr, STORY_ID, dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        action = actions[0]
        assert "waiting for human" in action.lower(), (
            f"human-mode dry-run step 2 must say 'waiting for human review': {action!r}"
        )
        assert not ALREADY_MERGED_RE.search(action), (
            f"human-mode step 2 must not say 'already merged' (no probe in human mode): "
            f"{action!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_auto_mode_merged_pr_shows_already_merged_skip(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_pr: Path,
    ) -> None:
        """AC1 (pin — auto-mode arm): when the PR is MERGED and mode is 'auto',
        the dry-run step 2 says "already merged — will skip merge" and must NOT
        promise a merge that the real run would never perform.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_merged_view_run(),
        ):
            result = finish_story(project_with_pr, STORY_ID, dry_run=True)

        actions = _step2_actions(result)
        assert actions, f"no step-2 entry in the dry-run plan: {result.get('steps')}"
        action = actions[0]
        assert ALREADY_MERGED_RE.search(action), (
            f"auto-mode dry-run step 2 for MERGED PR must say 'already merged': {action!r}"
        )
        assert SKIP_RE.search(action), (
            f"auto-mode dry-run step 2 for MERGED PR must say 'skip': {action!r}"
        )
        assert "Merge PR #" not in action, (
            f"auto-mode step 2 for MERGED PR must not promise a merge: {action!r}"
        )


# =============================================================================
# AC2 — step-6 branch guard
# =============================================================================


class TestStep6BranchGuard:
    """AC2: step 6 must never render 'Delete local branch: None'.

    test_step6_branch_none_does_not_render_literal_none is GENUINELY RED on
    HEAD (current line 1270 always f-strings branch, yielding the literal
    "None" when branch is None).

    test_step6_with_real_branch_shows_branch_name is a pin (already correct).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step6_branch_none_does_not_render_literal_none(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_no_branch: Path,
    ) -> None:
        """AC2a (RED): when the session has no branch (branch=None), step 6 of
        the dry-run preview must NOT contain the literal string "None".

        Current failure: line 1270 renders
            ``f"Delete local branch: {branch}"``
        which produces "Delete local branch: None" when branch is None.
        Expected: step 6 shows a sensible skip message or is omitted.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_no_pr_run(),
        ):
            result = finish_story(project_no_branch, STORY_ID, dry_run=True)

        step6s = _step6_actions(result)
        # If step 6 is omitted entirely (one valid fix), that is acceptable.
        for action in step6s:
            assert action != "Delete local branch: None", (
                "dry-run step 6 renders the literal string 'Delete local "
                "branch: None' when branch is None — this is the AC2 bug. "
                f"Got: {action!r}"
            )
            assert "None" not in action, (
                f"dry-run step 6 must not contain the literal 'None': {action!r}"
            )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step6_with_real_branch_shows_branch_name(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_branch_no_pr: Path,
    ) -> None:
        """AC2b (pin): when the session has a real branch name, step 6 of the
        dry-run preview must show "Delete local branch: <branch-name>".

        This is already correct on HEAD; pinned to prevent over-fixing.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_no_pr_run(),
        ):
            result = finish_story(project_branch_no_pr, STORY_ID, dry_run=True)

        step6s = _step6_actions(result)
        assert step6s, f"no step-6 entry in the dry-run plan: {result.get('steps')}"
        action = step6s[0]
        assert STORY_BRANCH in action, (
            f"dry-run step 6 must include the branch name {STORY_BRANCH!r} "
            f"when branch is set: {action!r}"
        )


# =============================================================================
# AC3 — no-PR dry-run predicts abort worlds (155-34 parity)
# =============================================================================


class TestNoPrDryRunAbortPrediction:
    """AC3: the dry-run no-PR step 2 must mirror the real-run abort logic.

    test_dry_run_no_pr_unmerged_branch_predicts_abort and
    test_dry_run_no_pr_empty_fields_predicts_abort are GENUINELY RED on HEAD
    (current code outputs ``{"step": 2, "action": "No PR to merge"}``
    with no error flag — promising a successful done when the real run would
    abort).

    test_dry_run_no_pr_sentinel_branch_not_abort is a GREEN GUARD: the
    accepted no-PR world (affirmative sentinel) must never show an abort.
    """

    @patch("pf.sprint.story_finish._branch_merge_state")
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dry_run_no_pr_unmerged_branch_predicts_abort(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        mock_merge_state: MagicMock,
        project_branch_no_pr: Path,
    ) -> None:
        """AC3a (RED): a session with a branch but no resolved PR, where the
        branch has unmerged commits, must have step 2 carrying
        ``"success": False`` (or an "error" key) — the dry-run must predict
        that the real finish would abort, not promise a successful done.

        Current failure: step 2 is ``{"step": 2, "action": "No PR to merge"}``
        with no error/success flag — the preview lies that the story will
        finish cleanly.

        _branch_merge_state is mocked to return "unmerged" (2 commits) so the
        test is hermetic (no real git repo required in the dry-run path).
        """
        mock_merge_state.return_value = {
            "state": "unmerged",
            "count": 2,
            "base": "develop",
        }
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_no_pr_run(),
        ):
            result = finish_story(project_branch_no_pr, STORY_ID, dry_run=True)

        step2 = _step2_entry(result)
        assert step2.get("success") is False, (
            "dry-run step 2 for an unmerged branch with no PR must carry "
            f"'success': False to predict the real-run abort. "
            f"Current code produces: {step2!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dry_run_no_pr_empty_fields_predicts_abort(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_no_branch: Path,
    ) -> None:
        """AC3b (RED): a session with no branch field resolved (branch=None,
        not a sentinel) and no PR must have step 2 carrying
        ``"success": False`` — the dry-run must predict the real-run abort
        ("No PR and no branch resolve from the session"), not a clean done.

        Current failure: step 2 is ``{"step": 2, "action": "No PR to merge"}``
        with no error/success flag — the preview promises a clean finish when
        the real run would abort for unresolvable fields.
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_no_pr_run(),
        ):
            result = finish_story(project_no_branch, STORY_ID, dry_run=True)

        step2 = _step2_entry(result)
        assert step2.get("success") is False, (
            "dry-run step 2 for empty/no-branch session must carry "
            f"'success': False to predict the real-run abort. "
            f"Current code produces: {step2!r}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_dry_run_no_pr_sentinel_branch_not_abort(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_sentinel: Path,
    ) -> None:
        """AC3c (green guard): a session with ``Branch: none`` (affirmative
        sentinel) and no PR is the accepted 155-1 no-PR world — the dry-run
        must NOT predict an abort for it. Step 2 must not carry
        ``"success": False``.

        This passes on HEAD (step 2 = "No PR to merge", no success: False)
        and must keep passing post-fix (step 2 = "merge_pr" + "skipped: True",
        still no success: False).
        """
        with patch(
            "pf.sprint.story_finish._run",
            side_effect=_make_no_pr_run(),
        ):
            result = finish_story(project_sentinel, STORY_ID, dry_run=True)

        step2 = _step2_entry(result)
        assert step2.get("success") is not False, (
            "dry-run step 2 for a sentinel branch must NOT predict an abort — "
            "Branch: none is the accepted no-PR world (155-1/155-33). "
            f"Got: {step2!r}"
        )
