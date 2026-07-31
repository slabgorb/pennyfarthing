"""Tests for story 155-16: wrap the remaining ``read_sprint`` call in the
finish path (SOUL #10) + 155-6 LOW test-polish deferrals.

The 155-6 fix guarded the PRIMARY ``read_sprint`` (story_finish.py ~299) and
155-9 guarded the STEP-4B re-read (~612, deliberate broad catch — post-merge
bookkeeping degrades gracefully). The one remaining unguarded site is the
STATUS-TRANSITION read (~532): today it hides behind a silent
``except Exception: current_status = "in_progress"`` fallback, so a sprint
index that becomes unreadable mid-finish is swallowed and the failure
surfaces — late and mislabeled — as a generic "yaml-update step failed"
transition error (or not at all).

AC record (from context-story-155-16; the step-4b half of AC-1 is
GREEN-ON-ARRIVAL via 155-9 and intentionally NOT re-pinned here — see the
session Design Deviations):

  AC-1  The status-transition read returns
        ``{"success": False, "story_id": ..., "error": ...}`` on
        FileNotFoundError/ValueError instead of proceeding on a swallowed
        default (``TestStatusReadGuard`` — genuinely RED).
  AC-2  The new guard uses a narrow ``(FileNotFoundError, ValueError)``
        catch, not a broad ``except Exception``
        (``test_status_read_guard_catch_is_narrow`` — AST pin, RED).
        The "0 rule-checker violations" half is owned by the Reviewer's
        rule-checker pass, not pytest.
  AC-3  Each new guard is mutation-verified: the RED tests here fail on
        exactly the guard-absent code (HEAD today), so deleting the guard
        post-fix re-fails them by construction.
  AC-4  Test-polish deferrals: the demo-hook 4b test asserts the epic value
        (strengthened in place in ``test_demo_finish_hook.py``); the positive
        jira-key finish path is pinned here
        (``TestJiraKeyedFinishPositivePath`` — green-on-arrival regression
        guard).

DESIGNED INTERFACE for Dev (fix-agnostic, but this is the expected shape):
mirror the 155-6 primary-read guard at the status-transition read —

    try:
        data = read_sprint(sprint_path)
        ...
    except (FileNotFoundError, ValueError) as exc:
        return {"success": False, "story_id": story_id,
                "error": f"...: {exc}", "steps": steps}
    except Exception:               # pre-existing fallback, unchanged scope
        current_status = "in_progress"

The trailing fallback (or an equivalent no-escape shape) is REQUIRED by
``test_status_read_other_exception_must_not_escape``: this read runs AFTER
the irreversible merge, so a non-(FileNotFoundError, ValueError) exception
escaping ``finish_story`` would strand a merged story with a raw traceback —
strictly worse than today (SOUL #10).

Harness mirrors ``test_155_9_finish_archive_epic_hardening.py`` /
``test_155_12_finish_conflicting_pr.py``: a command-dispatching fake for
``story_finish._run`` (clean-merge world) and a patched ``transition_story``.
The stateful pass-through-then-boom ``read_sprint`` fake targets call 2 (the
status-transition read): call 1 is the primary validation read and must
succeed to reach the seam.

Rule coverage (lang-review python.md):
  #1 no silent exception swallowing — the entire ``TestStatusReadGuard``
     class: the swallowed status read must fail loud on unreadable input.
  #6 test quality — the AC-4 polish items exist because prior asserts were
     error-absence-only; every assert here checks a concrete value.

155-30 polish: ``test_status_read_failure_returns_loud_result`` now pins the
``jira_key`` and ``steps`` keys outright in the guard's failure dict — the
original assertions probed via ``result.get("steps", [])`` only, so a
delete-key mutation on the return dict survived.
"""

import ast
import inspect
import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import pf.sprint.story_finish as story_finish_module
from pf.sprint.story_finish import finish_story
from pf.sprint.yaml_io import read_sprint as real_read_sprint

# =============================================================================
# Finish-flow harness (mirrors test_155_9 / test_155_12)
# =============================================================================

INDEX_YAML_TEMPLATE = """\
sprint:
  name: "Test15516"
  jira_sprint_id: 999
  jira_sprint_name: "Test15516"
  goal: Test finish status-read guard
  start_date: 2026-07-01
  end_date: 2026-07-14
  status: active
  number: 1
epics:
  - "155"
stories: []
standalone_stories: []
"""

SHARD_YAML_NO_JIRA = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
stories:
  - id: 155-88
    title: Status-read guard story
    points: 2
    priority: p3
    status: in_review
    workflow: tdd
"""

SHARD_YAML_JIRA = """\
id: "155"
type: epic
title: "Finish/merge/archive truthfulness"
priority: p1
status: in_progress
jira: PROJ-91600
stories:
  - id: 155-88
    title: Status-read guard story
    points: 2
    priority: p3
    status: in_review
    workflow: tdd
    jira: PROJ-91616
"""

SESSION_TEMPLATE = """\
---
story_id: "{story_id}"
jira_key: "{jira_key}"
epic: ""
workflow: "tdd"
---

# Story {story_id}: finish status-read guard

## Story Details
- **ID:** {story_id}
- **Workflow:** tdd
- **Branch:** feat/{story_id}-status-read
- **PR:** #999 - status-read guard
"""

STORY_ID = "155-88"
# get_archive_path names the file after the last sprint-name token.
FINISH_ARCHIVE_NAME = "sprint-Test15516-completed.yaml"


def _make_finish_project(tmp_path: Path, *, jira_key: str = "") -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML_TEMPLATE)
    shard = SHARD_YAML_JIRA if jira_key else SHARD_YAML_NO_JIRA
    (sprint_dir / "epic-155.yaml").write_text(shard)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / f"{STORY_ID}-session.md").write_text(
        SESSION_TEMPLATE.format(story_id=STORY_ID, jira_key=jira_key)
    )
    return tmp_path


def _clean_merge_run(cmd, **kwargs):
    """Command-dispatching fake for ``story_finish._run`` — clean-merge world:
    merge rc=0, ``gh pr view`` reports MERGED/MERGEABLE/CLEAN, all else rc=0."""
    parts = [str(c) for c in cmd]
    if "view" in parts:
        return MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "state": "MERGED",
                    "mergedAt": "2026-07-31T00:00:00Z",
                    "mergeable": "MERGEABLE",
                    "mergeStateStatus": "CLEAN",
                }
            ),
            stderr="",
        )
    return MagicMock(returncode=0, stdout="", stderr="")


def _boom_after_first_read(exc: Exception):
    """Call 1 passes through to the real ``read_sprint`` (the primary
    validation read must succeed to reach the seam); every later call raises
    ``exc``. Call 2 is the status-transition read under test — the guard (or
    today's silent swallow) sees the failure there first."""
    calls = {"n": 0}

    def fake(path):
        calls["n"] += 1
        if calls["n"] == 1:
            return real_read_sprint(path)
        raise exc

    return fake


def _step_actions(result: dict[str, Any]) -> set[str]:
    return {str(s.get("action")) for s in result.get("steps", [])}


def _transition_targets(mock_transition: MagicMock) -> set[str]:
    """Collect every target status ``transition_story`` was asked to reach."""
    targets: set[str] = set()
    for call in mock_transition.call_args_list:
        if len(call.args) >= 3:
            targets.add(str(call.args[2]))
        if "to_status" in call.kwargs:
            targets.add(str(call.kwargs["to_status"]))
    return targets


# =============================================================================
# AC-1 / AC-3 — the status-transition read guard (GENUINELY RED)
# =============================================================================


class TestStatusReadGuard:
    """A sprint index that becomes unreadable between the primary read and the
    status-transition read must abort finish with a loud result dict — not
    proceed on a silently assumed ``in_progress`` status. Today the broad
    ``except Exception`` fallback swallows the failure and the ceremony rolls
    on into transitions/bookkeeping against a sprint file we know is broken.

    Mutation verification (AC-3) is inherent: HEAD today IS the guard-deleted
    mutant, and these tests fail on it; deleting the guard post-fix restores
    exactly this failure."""

    @pytest.mark.parametrize(
        "exc",
        [
            FileNotFoundError("sprint index vanished mid-finish"),
            ValueError("malformed sprint YAML mid-finish"),
        ],
        ids=["filenotfound", "valueerror"],
    )
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_status_read_failure_returns_loud_result(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
        exc: Exception,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_finish_project(tmp_path)
        session_path = project / ".session" / f"{STORY_ID}-session.md"

        with (
            patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run),
            patch(
                "pf.sprint.story_finish.read_sprint",
                new=_boom_after_first_read(exc),
            ),
        ):
            try:
                result = finish_story(project, STORY_ID)
            except Exception as escaped:  # noqa: BLE001 — must not raise either way
                pytest.fail(
                    f"status-transition read failure ({escaped!r}) escaped "
                    "finish_story as a raw exception — the guard must return "
                    "a result dict (SOUL #10), never raise"
                )

        assert result.get("success") is False, (
            "an unreadable sprint index at the status-transition read must "
            f"abort finish with a loud failure, got {result!r}"
        )
        assert result.get("story_id") == STORY_ID, (
            f"the failure result must carry the story_id: {result!r}"
        )
        assert str(exc) in str(result.get("error", "")), (
            f"the error must surface the underlying read failure "
            f"{str(exc)!r}, got {result.get('error')!r}"
        )
        # 155-30 pins: the guard's failure dict must carry ``jira_key`` and
        # ``steps`` OUTRIGHT. The earlier probes here went through
        # ``result.get("steps", [])`` only, so a mutant that deletes either
        # key from the return dict survived (lang-review #6 — the report is
        # this epic's product; a failure result that silently drops its keys
        # lies by omission).
        assert "jira_key" in result, (
            f"the failure result must carry the jira_key key outright: {result!r}"
        )
        assert result["jira_key"] is None, (
            "no-Jira world: the carried jira_key must be None, got "
            f"{result['jira_key']!r}"
        )
        assert "steps" in result, (
            f"the failure result must carry the steps list outright: {result!r}"
        )
        assert "merge_pr" in _step_actions(result), (
            "the pre-abort step history (the landed step-2 merge) must survive "
            f"into the failure report: {result.get('steps')}"
        )
        # The guard fires BEFORE any status transition: a broken sprint index
        # must not be transitioned against, and the story must never be
        # flipped ``done`` on the strength of an assumed status.
        assert "done" not in _transition_targets(mock_transition), (
            "the done-transition must not run after a failed status read: "
            f"{mock_transition.call_args_list}"
        )
        # No irreversible cleanup after the abort: the session survives for a
        # retry, exactly like the transition-failure abort path.
        assert session_path.exists(), (
            "the session file must be kept when finish aborts at the "
            "status-transition read"
        )
        assert "remove_session" not in _step_actions(result), (
            f"step 7 must not run after the abort: {result.get('steps')}"
        )


# =============================================================================
# AC-2 — guard shape: narrow catch (AST pin) + no-escape backstop
# =============================================================================


def _find_status_read_try() -> ast.Try | None:
    """Locate the try statement in ``finish_story`` whose body assigns
    ``current_status`` — the status-transition read block."""
    tree = ast.parse(inspect.getsource(story_finish_module))
    fn = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "finish_story"
    )
    for node in ast.walk(fn):
        if not isinstance(node, ast.Try):
            continue
        for stmt in node.body:
            if isinstance(stmt, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "current_status"
                for t in stmt.targets
            ):
                return node
    return None


def _handler_names(handler: ast.ExceptHandler) -> set[str]:
    if handler.type is None:
        return {"<bare>"}
    if isinstance(handler.type, ast.Tuple):
        return {ast.unparse(e) for e in handler.type.elts}
    return {ast.unparse(handler.type)}


class TestStatusReadGuardShape:
    def test_status_read_guard_catch_is_narrow(self) -> None:
        """AC-2: the guard must catch exactly ``(FileNotFoundError,
        ValueError)`` — the two documented ``read_sprint`` failure modes —
        matching the 155-6 primary-read guard. RED today: the only handler on
        the status-read try is a broad ``except Exception``. A fix that
        returns the result dict from a broad handler passes the behavioral
        tests above but still fails here.

        (This pins the narrow handler's PRESENCE. Whether an additional
        broad-fallback handler for exotic exceptions is acceptable is the
        rule-checker's and Reviewer's call — see the no-escape test below for
        why some no-raise shape must exist.)"""
        status_try = _find_status_read_try()
        assert status_try is not None, (
            "could not locate the status-transition read try-block in "
            "finish_story (body assigning current_status) — if this block "
            "was refactored, update this locator"
        )
        handler_sets = [_handler_names(h) for h in status_try.handlers]
        assert {"FileNotFoundError", "ValueError"} in handler_sets, (
            "the status-transition read must have a narrow "
            "(FileNotFoundError, ValueError) handler (lang-review #1); "
            f"found handlers: {handler_sets}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_status_read_other_exception_must_not_escape(
        self, mock_mode: MagicMock, mock_transition: MagicMock, tmp_path: Path
    ) -> None:
        """GREEN-on-arrival backstop (intentional — see Design Deviations):
        a non-(FileNotFoundError, ValueError) exception at the status read —
        here PermissionError — must not escape ``finish_story`` as a raw
        traceback. This read runs AFTER the irreversible merge; an escape
        strands a merged story mid-ceremony (SOUL #10). Today the broad
        swallow satisfies this; an over-narrowed fix that DELETES the
        fallback (leaving only the narrow handler) turns this test RED.
        Either outcome (loud failure result or degraded continue) is
        acceptable — raising is not."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_finish_project(tmp_path)

        with (
            patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run),
            patch(
                "pf.sprint.story_finish.read_sprint",
                new=_boom_after_first_read(
                    PermissionError("sprint index unreadable")
                ),
            ),
        ):
            try:
                result = finish_story(project, STORY_ID)
            except Exception as escaped:  # noqa: BLE001 — the regression under guard
                pytest.fail(
                    f"a PermissionError at the status-transition read escaped "
                    f"finish_story ({escaped!r}) — narrowing the catch must "
                    "not open a raw-traceback hole after the merge (SOUL #10)"
                )

        assert isinstance(result, dict) and "success" in result, (
            f"finish_story must return a result dict either way, got {result!r}"
        )


# =============================================================================
# AC-4 — positive jira-key finish path (GREEN-on-arrival regression pin)
# =============================================================================


class TestJiraKeyedFinishPositivePath:
    """155-6 LOW deferral: every existing jira-keyed finish test either mocks
    out step 4b (``test_finish_story_works_with_jira``) or asserts only the
    top-level ``jira_key`` — none pins the step-3 ``jira_done`` entry or the
    jira-keyed archive name through a real finish. GREEN-on-arrival by design
    (the behavior shipped long ago); this locks it against regression."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_jira_keyed_finish_records_jira_done_step_and_archive(
        self, mock_mode: MagicMock, mock_transition: MagicMock, tmp_path: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project = _make_finish_project(tmp_path, jira_key="PROJ-91616")

        with patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run):
            result = finish_story(project, STORY_ID)

        assert result.get("success") is True, f"clean jira-keyed finish: {result!r}"
        assert result.get("jira_key") == "PROJ-91616", (
            f"result must carry the resolved jira key: {result!r}"
        )
        jira_steps = [
            s for s in result.get("steps", []) if s.get("action") == "jira_done"
        ]
        assert len(jira_steps) == 1, (
            f"exactly one jira_done step expected: {result.get('steps')}"
        )
        assert jira_steps[0].get("key") == "PROJ-91616", (
            f"the jira_done step must record the key (not skip): {jira_steps[0]!r}"
        )
        assert "skipped" not in jira_steps[0], (
            f"a keyed story must not skip the jira step: {jira_steps[0]!r}"
        )
        # Archive copy is named after the jira key, and the 4b completed row
        # resolves the jira-keyed epic (155-9 priority: jira > numeric id).
        assert (project / "sprint" / "archive" / "PROJ-91616-session.md").exists(), (
            "jira-keyed finish must archive the session under the jira key"
        )
        step4b = [
            s
            for s in result.get("steps", [])
            if s.get("action") == "add_completed_story"
        ]
        assert step4b and step4b[0].get("epic") == "PROJ-91600", (
            f"the 4b entry must carry the jira-keyed epic value: {step4b!r}"
        )
        assert not (project / ".session" / f"{STORY_ID}-session.md").exists(), (
            "clean finish must remove the session file (step 7)"
        )
