"""Tests for story 164-1: partial session archive on dialogue-copy OSError + misattributed step.

Bug source: story 155-15 review findings in story_finish.py (~lines 1587-1616).

The archive step (Step 1 / 1b) runs after the merge is verified. Both operations —
copying the session file (Step 1) and optionally copying the dialogue file (Step 1b) —
live inside a SINGLE try/except OSError block:

    try:
        shutil.copy2(session_path, archive_dest)        # Step 1
        steps.append({"step": 1, "action": "archive_session", ...})

        if dialogue_path.exists():
            shutil.copy2(dialogue_path, dialogue_dest)  # Step 1b
            steps.append({"step": "1b", "action": "archive_dialogue", ...})
    except OSError as exc:
        steps.append({"step": 1, "action": "archive_session", "success": False, ...})
        return {success: False, ...}

This creates two bugs when the dialogue copy raises (Step 1b failure):

    Bug A — Stray archive: The session copy (Step 1) already succeeded, writing
    ``sprint/archive/{id}-session.md``. The except handler then returns without
    removing it. On retry the stray archive blocks progress and lies about completion
    (epic 155: finish must not archive what it did not finish; SOUL #14).

    Bug B — Misattributed step: The handler always records ``step: 1`` and
    ``action: archive_session`` regardless of which copy failed. A Step 1b failure
    is indistinguishable from a Step 1 failure in the error report — an operator
    cannot tell which file was partially archived or which operation to retry.

Contract this story pins:

    AC2/AC3 — When ``shutil.copy2(dialogue_path, ...)`` raises OSError, no
    ``*-session.md`` remains in ``sprint/archive/`` (cleanup happens).

    AC2 — When ``shutil.copy2(dialogue_path, ...)`` raises OSError, the failure
    step entry in the result reports ``step: "1b"`` and ``action: "archive_dialogue"``,
    not ``step: 1`` / ``action: "archive_session"``.

    AC1/AC4 — When ``shutil.copy2(session_path, ...)`` raises OSError (Step 1), the
    result still correctly reports ``step: 1`` and ``action: "archive_session"``
    (regression guard) and finish does not transition the story to done.

Mocking mirrors test_155_15: ``_run`` is patched with a command-dispatching fake
modelling a clean, verified merge so the archive step is reached. ``shutil.copy2``
is selectively patched so only the dialogue copy raises (Bug A/B tests) or the
session copy raises (AC1 regression guard).
"""

import json
import shutil as _real_shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import finish_story

# Capture the real shutil.copy2 function object at module-load time, before any
# test-level patches can replace it on the shutil module. `patch(
# "pf.sprint.story_finish.shutil.copy2")` replaces the *attribute* on the shared
# shutil module object, so any attribute lookup of shutil.copy2 inside a patch
# context (including `_real_shutil.copy2`) will find the mock.  Binding the
# function object here ensures _copy_real always calls the genuine implementation.
_copy2_real: Callable[[Any, Any], None] = _real_shutil.copy2

# =============================================================================
# Fixtures
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Test164"
  jira_sprint_id: 164
  jira_sprint_name: "Test164"
  goal: Test partial archive cleanup
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
title: "finish hardening — 155-15 review findings"
priority: p1
status: in_progress
stories:
  - id: 164-1
    title: finish partial session archive left on dialogue-copy OSError
    points: 2
    priority: p1
    status: in_review
    workflow: tdd
"""

SESSION_WITH_PR = """\
---
story_id: "164-1"
jira_key: ""
epic: "164"
workflow: "tdd"
---

# Story 164-1: partial archive cleanup

## Story Details
- **ID:** 164-1
- **Workflow:** tdd
- **Branch:** feat/164-1-partial-session-archive-oserror
- **PR:** #401 - finish: partial session archive OSError
"""


def _make_project(tmp_path: Path, *, with_dialogue: bool) -> Path:
    """Build a project layout (sprint/ + .session/) for finish_story tests.

    ``with_dialogue=True`` writes ``.session/164-1-dialogue.md`` so the
    Step 1b (archive_dialogue) path is exercised.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML, encoding="utf-8")
    (sprint_dir / "epic-164.yaml").write_text(SHARD_YAML, encoding="utf-8")
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "164-1-session.md").write_text(SESSION_WITH_PR, encoding="utf-8")
    if with_dialogue:
        (session_dir / "164-1-dialogue.md").write_text(
            "# Dialogue for 164-1\n", encoding="utf-8"
        )
    return tmp_path


@pytest.fixture
def project_with_dialogue(tmp_path: Path) -> Path:
    return _make_project(tmp_path, with_dialogue=True)


@pytest.fixture
def project_no_dialogue(tmp_path: Path) -> Path:
    return _make_project(tmp_path, with_dialogue=False)


def _make_fake_run(*, merge_rc: int = 0, pr_state: str = "MERGED") -> Any:
    """Stateful command-dispatching fake for story_finish._run.

    Default is a clean verified merge (merge_rc=0, PR lands as MERGED). The
    ``state`` field is history-dependent: OPEN before a successful ``gh pr merge``
    is observed, ``pr_state`` afterwards — same contract as test_155_15.
    """
    landed = False

    def _fake_run(cmd: list[str], **kwargs: Any) -> MagicMock:
        nonlocal landed
        parts = [str(c) for c in cmd]
        if "merge" in parts:
            _fake_run.merge_calls.append(parts)
            if merge_rc == 0:
                landed = True
            return MagicMock(returncode=merge_rc, stdout="", stderr="")
        if "view" in parts:
            current_state = pr_state if landed else "OPEN"
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": current_state,
                        "mergedAt": "2026-08-04T00:00:00Z" if current_state == "MERGED" else None,
                        "mergeable": "MERGEABLE",
                        "mergeStateStatus": "CLEAN",
                        "baseRefName": "develop",
                    }
                ),
                stderr="",
            )
        if "list" in parts:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    _fake_run.merge_calls: list[list[str]] = []  # type: ignore[attr-defined]
    return _fake_run


def _archived_session_files(project_root: Path) -> list[Path]:
    """Every ``*-session.md`` copy present in ``sprint/archive/``."""
    return sorted((project_root / "sprint" / "archive").glob("*-session.md"))


def _requested_done(mock_transition: MagicMock) -> bool:
    """True if transition_story was ever called with ``"done"`` in positional args."""
    for call in mock_transition.call_args_list:
        if "done" in call.args:
            return True
    return False


def _failure_step_entry(result: dict[str, Any]) -> dict[str, Any] | None:
    """First step entry with ``success: False`` in the result steps list."""
    for entry in result.get("steps", []):
        if entry.get("success") is False:
            return entry
    return None


def _session_real_dialogue_raises() -> Callable[[Any, Any], None]:
    """Side-effect for ``shutil.copy2``: first call (session archive) does the
    real file copy; second call (dialogue archive) raises OSError(No space left
    on device).

    This simulates the partial-archive scenario: the session IS copied to
    ``sprint/archive/`` before the failure is detected, exactly as the bug
    describes.
    """
    _count = [0]

    def _side_effect(src: Any, dst: Any) -> None:
        _count[0] += 1
        if _count[0] == 1:
            _copy2_real(src, dst)  # real session copy — creates the stray archive
        else:
            raise OSError("No space left on device")

    return _side_effect


# =============================================================================
# Bug A: stray session archive left when dialogue copy raises (AC2/AC3)
# =============================================================================


class TestDialogueOsErrorLeavesNoStrayArchive:
    """Bug A: when the dialogue copy (Step 1b) raises OSError after the session copy
    (Step 1) already landed in ``sprint/archive/``, finish must clean up the partial
    session archive before returning.

    Current behavior: the single except block returns without removing the stray copy,
    leaving ``sprint/archive/164-1-session.md`` behind. These tests assert the DESIRED
    behavior and therefore FAIL on the unpatched code (RED).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_no_stray_session_archive_when_dialogue_copy_raises(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_dialogue: Path,
    ) -> None:
        """dialogue OSError → no session archive remains in sprint/archive/."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=_session_real_dialogue_raises(),
            ),
        ):
            finish_story(project_with_dialogue, "164-1")

        stray = _archived_session_files(project_with_dialogue)
        assert stray == [], (
            "Dialogue copy raised OSError after session was already archived — "
            f"stray session archive left behind: {[p.name for p in stray]}. "
            "finish must remove the partial archive before returning (SOUL #14: "
            "don't archive what you didn't finish)."
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_result_is_failure_when_dialogue_copy_raises(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_dialogue: Path,
    ) -> None:
        """dialogue OSError → result is ``{success: False, ...}``."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=_session_real_dialogue_raises(),
            ),
        ):
            result = finish_story(project_with_dialogue, "164-1")

        assert result["success"] is False, (
            f"A dialogue-copy OSError must abort finish with success=False: {result}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_does_not_transition_to_done_when_dialogue_copy_raises(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_dialogue: Path,
    ) -> None:
        """dialogue OSError → no ``done`` YAML transition is requested."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=_session_real_dialogue_raises(),
            ),
        ):
            finish_story(project_with_dialogue, "164-1")

        assert not _requested_done(mock_transition), (
            "finish requested the `done` transition even though dialogue archiving "
            "failed — the story must remain in_review, not be marked done with an "
            "incomplete archive"
        )


# =============================================================================
# Bug B: misattributed step when dialogue copy raises (AC2)
# =============================================================================


class TestDialogueOsErrorMisattributedStep:
    """Bug B: when the dialogue copy raises OSError, the failure step entry in the
    result must report ``step: "1b"`` and ``action: "archive_dialogue"`` — not the
    current ``step: 1`` / ``action: "archive_session"`` which the except block
    always emits.

    Current behavior: the handler appends step=1/action=archive_session regardless of
    which copy failed. These tests assert the correct attribution and therefore FAIL
    on the unpatched code (RED).
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_failure_step_is_1b_when_dialogue_copy_raises(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_dialogue: Path,
    ) -> None:
        """dialogue OSError → failure step entry has ``step: "1b"``."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=_session_real_dialogue_raises(),
            ),
        ):
            result = finish_story(project_with_dialogue, "164-1")

        entry = _failure_step_entry(result)
        assert entry is not None, (
            f"No failure step entry found in result steps: {result.get('steps')}"
        )
        assert entry.get("step") == "1b", (
            f"Dialogue-copy failure must be attributed to step '1b', "
            f"got step={entry.get('step')!r}. The except handler always reports "
            f"step=1 (archive_session) regardless of which copy failed: {entry}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_failure_action_is_archive_dialogue_when_dialogue_copy_raises(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_with_dialogue: Path,
    ) -> None:
        """dialogue OSError → failure step entry has ``action: "archive_dialogue"``."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=_session_real_dialogue_raises(),
            ),
        ):
            result = finish_story(project_with_dialogue, "164-1")

        entry = _failure_step_entry(result)
        assert entry is not None, (
            f"No failure step entry found in result steps: {result.get('steps')}"
        )
        assert entry.get("action") == "archive_dialogue", (
            f"Dialogue-copy failure must report action='archive_dialogue', "
            f"got action={entry.get('action')!r}. The except handler always reports "
            f"action='archive_session' regardless of which copy failed: {entry}"
        )


# =============================================================================
# Regression guard: session OSError still reports step=1 correctly (AC1/AC4)
# =============================================================================


class TestSessionOsErrorRegressionGuard:
    """AC1 + AC4: session copy (Step 1) OSError aborts with correct step attribution
    and no YAML transition. These guard the pre-existing correct behavior to ensure
    the 164-1 fix (splitting the try/except into two blocks) doesn't break the
    session-copy error path.
    """

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_oserror_reports_step_1_archive_session(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_no_dialogue: Path,
    ) -> None:
        """session copy OSError → failure step entry has step=1, action=archive_session."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=OSError("Permission denied"),
            ),
        ):
            result = finish_story(project_no_dialogue, "164-1")

        assert result["success"] is False, (
            f"Session-copy OSError must abort finish with success=False: {result}"
        )
        entry = _failure_step_entry(result)
        assert entry is not None, (
            f"No failure step entry found in result steps: {result.get('steps')}"
        )
        assert entry.get("step") == 1, (
            f"Session-copy failure must report step=1: {entry}"
        )
        assert entry.get("action") == "archive_session", (
            f"Session-copy failure must report action='archive_session': {entry}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_session_oserror_does_not_transition_to_done(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        project_no_dialogue: Path,
    ) -> None:
        """AC4: session copy OSError → no ``done`` YAML transition is requested."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        fake = _make_fake_run(merge_rc=0, pr_state="MERGED")
        with (
            patch("pf.sprint.story_finish._run", side_effect=fake),
            patch(
                "pf.sprint.story_finish.shutil.copy2",
                side_effect=OSError("Permission denied"),
            ),
        ):
            finish_story(project_no_dialogue, "164-1")

        assert not _requested_done(mock_transition), (
            "finish requested the `done` transition even though session archiving "
            "failed (step 1 OSError)"
        )
