"""Tests for story 155-9: harden the finish-archive epic-field seam
(155-4 Reviewer deferrals, PR pennyfarthing#126).

155-4 fixed gh #16 (archive rows written with ``epic: ''``) by adding
``_resolve_epic_ref`` + fail-loud result objects in ``_add_story_to_completed``
and surfacing the step-4b result in ``finish_story``. Its tests, however, hit
only the happy/ghost paths of the ``_add_story_to_completed`` seam. This story
closes the deferred coverage gaps and adds ONE code change.

Coverage pins — GREEN-on-arrival by design (the 155-4 implementation already
shipped; these lock the uncovered branches so a refactor can't silently regress
them — logged as intentional-green Design Deviations in the session):

  1. Caller wiring: ``finish_story`` records step 4b with the resolved epic on
     success, and records (never swallows) the failure result while finish
     still completes — the documented non-fatal intent
     (``TestFinishStep4bWiring``).
  2. Jira-keyed-epic priority: an epic carrying a real Jira key archives the
     row with that key, not the numeric id; a jira *sentinel* ("none") falls
     back to the numeric id (``TestEpicRefPriorityBranches``).
  3. Standalone-story explicit fallback: a story living in top-level
     ``stories`` (no containing epic) resolves its epic from the explicit
     ``jira_epic``/``epic`` field, ``jira_epic`` winning
     (``TestStandaloneExplicitFallback``).
  4. The ``except ValueError`` branches: ``ensure_archive_file`` (unsafe
     sprint id, 155-7 CWE-22 guard) and ``_write_archive_file`` (151-2
     empty-epic guard tripped by a LEGACY row) are both surfaced as
     ``{"success": False}`` results — never raised, never silently dropped
     (``TestValueErrorBranchesSurfaceAsResults``).

Genuinely RED — the one code change this story drives:

  6. ``finish_story`` step 4b re-reads the sprint index with an UNWRAPPED
     ``read_sprint`` (story_finish.py, "--- Step 4b ---" block). An unexpected
     I/O error there escapes ``finish_story``'s no-throw contract (SOUL #10)
     AFTER the merge and done-transition already ran: steps 4c-7 are skipped,
     the session file is never removed, and the CLI gets a raw traceback.
     The fix is a graceful-degrade guard: record the 4b failure as a step
     (truthfulness epic — no silent skip) and continue with steps 4c-7
     (``TestStep4bReadSprintGuard``).

(Gap 5 — the vacuous ``ghost is None or ...`` assertion — is fixed in place in
``test_155_4_finish_archive_epic_field.py``, not here.)

Harness mirrors ``test_155_12_finish_conflicting_pr.py``: a command-dispatching
fake for ``story_finish._run`` (clean-merge defaults) and a patched
``transition_story``. Seam-level tests mirror the ``sprint_tree`` fixture of
``test_155_4_finish_archive_epic_field.py``.

Rule coverage (lang-review python.md):
  #1 no silent exception swallowing — TestStep4bReadSprintGuard /
     TestFinishStep4bWiring pin that failures are recorded, never hidden.
  #5 path handling (CWE-22) — the unsafe-sprint-id ValueError surface test.
  #6 test quality — this story also removes a vacuous assertion (gap 5).
"""

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.archive_epic import _load_archive_file
from pf.sprint.loader import find_story_in_data as real_find_story_in_data
from pf.sprint.story_finish import _add_story_to_completed, finish_story
from pf.sprint.yaml_io import _write_yaml_file
from pf.sprint.yaml_io import read_sprint as real_read_sprint

# =============================================================================
# Seam-level fixtures (mirror test_155_4_finish_archive_epic_field.py)
# =============================================================================

ARCHIVE_NAME = "sprint-155-completed.yaml"


def _make_sprint_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    sprint_name: str = "Sprint 155",
    epic: dict[str, Any] | None = None,
    stories: list[dict[str, Any]] | None = None,
) -> Path:
    """Minimal sprint tree with a configurable epic / top-level stories list."""
    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()

    index: dict[str, Any] = {
        "sprint": {"name": sprint_name, "number": 155, "status": "active"},
        "epics": [epic] if epic else [],
        "stories": stories or [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def _completed_rows(archive_path: Path) -> list[dict[str, Any]]:
    if not archive_path.exists():
        return []
    return list(_load_archive_file(archive_path).get("completed_stories") or [])


# =============================================================================
# Gap 2 — jira-keyed-epic priority branch (GREEN-on-arrival coverage pin)
# =============================================================================


class TestEpicRefPriorityBranches:
    """``_resolve_epic_ref`` delegates to the canonical ``_get_epic_ref``
    (155-8); these pin the *archived row on disk* through the
    ``_add_story_to_completed`` caller — the wiring 155-4's tests never hit."""

    def test_completed_row_uses_jira_key_when_epic_is_jira_keyed(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An epic with a real Jira key archives rows under that key (priority:
        jira > numeric id), matching the shard-filename convention."""
        root = _make_sprint_tree(
            tmp_path,
            monkeypatch,
            epic={
                "id": "35",
                "jira": "PROJ-14510",
                "status": "in_progress",
                "stories": [{"id": "35-11", "title": "Jira-keyed", "points": 2}],
            },
        )
        story = {"id": "35-11", "title": "Jira-keyed", "points": 2}
        result = _add_story_to_completed(root, "35-11", story)

        assert result.get("success") is True, f"expected success, got {result!r}"
        rows = _completed_rows(root / "sprint" / "archive" / ARCHIVE_NAME)
        row = next((r for r in rows if r.get("id") == "35-11"), None)
        assert row is not None, "completed row was not written"
        assert row.get("epic") == "PROJ-14510", (
            f"jira-keyed epic must archive under its Jira key, got {row.get('epic')!r}"
        )

    def test_completed_row_falls_back_to_numeric_id_on_jira_sentinel(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A truthy jira *sentinel* ("none") must NOT win the priority branch —
        the canonical resolver rejects it and falls back to the numeric id."""
        root = _make_sprint_tree(
            tmp_path,
            monkeypatch,
            epic={
                "id": "35",
                "jira": "none",
                "status": "in_progress",
                "stories": [{"id": "35-11", "title": "Sentinel", "points": 2}],
            },
        )
        story = {"id": "35-11", "title": "Sentinel", "points": 2}
        result = _add_story_to_completed(root, "35-11", story)

        assert result.get("success") is True, f"expected success, got {result!r}"
        rows = _completed_rows(root / "sprint" / "archive" / ARCHIVE_NAME)
        row = next((r for r in rows if r.get("id") == "35-11"), None)
        assert row is not None, "completed row was not written"
        assert row.get("epic") == "35", (
            f"jira sentinel 'none' must fall back to numeric id, got {row.get('epic')!r}"
        )


# =============================================================================
# Gap 3 — standalone-story explicit-fallback branch (GREEN-on-arrival pin)
# =============================================================================


class TestStandaloneExplicitFallback:
    """A story in top-level ``stories`` has no containing epic —
    ``find_story_in_data`` returns ``epic=None`` — so ``_resolve_epic_ref``
    falls back to the story's own explicit ``jira_epic``/``epic`` field."""

    def test_standalone_story_explicit_epic_field_is_archived(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        story = {"id": "77-1", "title": "Standalone", "points": 1, "epic": "42"}
        root = _make_sprint_tree(tmp_path, monkeypatch, stories=[story])

        result = _add_story_to_completed(root, "77-1", story)

        assert result.get("success") is True, f"expected success, got {result!r}"
        rows = _completed_rows(root / "sprint" / "archive" / ARCHIVE_NAME)
        row = next((r for r in rows if r.get("id") == "77-1"), None)
        assert row is not None, "completed row was not written"
        assert row.get("epic") == "42", (
            f"explicit story `epic` field must be honored, got {row.get('epic')!r}"
        )

    def test_standalone_story_jira_epic_takes_priority_over_epic(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        story = {
            "id": "77-2",
            "title": "Standalone jira_epic",
            "points": 1,
            "jira_epic": "PROJ-14999",
            "epic": "42",
        }
        root = _make_sprint_tree(tmp_path, monkeypatch, stories=[story])

        result = _add_story_to_completed(root, "77-2", story)

        assert result.get("success") is True, f"expected success, got {result!r}"
        rows = _completed_rows(root / "sprint" / "archive" / ARCHIVE_NAME)
        row = next((r for r in rows if r.get("id") == "77-2"), None)
        assert row is not None, "completed row was not written"
        assert row.get("epic") == "PROJ-14999", (
            f"`jira_epic` must win over `epic` in the explicit fallback, "
            f"got {row.get('epic')!r}"
        )


# =============================================================================
# Gap 4 — the two `except ValueError` result branches (GREEN-on-arrival pins)
# =============================================================================


class TestValueErrorBranchesSurfaceAsResults:
    """Both ValueError sources inside ``_add_story_to_completed`` must surface
    as ``{"success": False, "error": ...}`` — never raise past the helper
    (SOUL #10), never silently drop the row."""

    def test_unsafe_sprint_id_surfaces_ensure_archive_valueerror(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The 155-7 CWE-22 guard in ``get_archive_path`` raises on a
        filename-unsafe sprint id; the helper must return that as a result."""
        root = _make_sprint_tree(
            tmp_path,
            monkeypatch,
            sprint_name="Sprint ../evil",
            epic={
                "id": "35",
                "status": "in_progress",
                "stories": [{"id": "35-11", "title": "Unsafe sprint", "points": 2}],
            },
        )
        story = {"id": "35-11", "title": "Unsafe sprint", "points": 2}

        result = _add_story_to_completed(root, "35-11", story)  # must not raise

        assert isinstance(result, dict) and result.get("success") is False, (
            f"unsafe sprint id must yield a fail-loud result, got {result!r}"
        )
        assert "sprint id" in str(result.get("error", "")).lower(), (
            f"error should name the invalid sprint id guard: {result.get('error')!r}"
        )
        archive_dir = root / "sprint" / "archive"
        assert not list(archive_dir.glob("*completed*.yaml")), (
            "no archive file may be created when the sprint id is unsafe"
        )

    def test_legacy_empty_epic_row_surfaces_write_guard_valueerror(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A pre-existing LEGACY row with ``epic: ''`` trips the 151-2 guard in
        ``_write_archive_file`` on the next write. The helper must surface it —
        naming the offender and the backfill remedy — and leave the file
        untouched (the new row is not persisted)."""
        root = _make_sprint_tree(
            tmp_path,
            monkeypatch,
            epic={
                "id": "35",
                "status": "in_progress",
                "stories": [{"id": "35-11", "title": "Blocked by legacy", "points": 2}],
            },
        )
        archive_path = root / "sprint" / "archive" / ARCHIVE_NAME
        # Seed a legacy offender raw (bypassing the write guard, as 155-8 does).
        _write_yaml_file(
            archive_path,
            {
                "sprint": {"name": "Sprint 155", "number": 155, "status": "active"},
                "completed_epics": [],
                "completed_stories": [
                    {"id": "144-9", "epic": "", "title": "legacy", "points": 1,
                     "completed": "2026-01-01"},
                ],
            },
        )
        before = archive_path.read_text()
        story = {"id": "35-11", "title": "Blocked by legacy", "points": 2}

        result = _add_story_to_completed(root, "35-11", story)  # must not raise

        assert isinstance(result, dict) and result.get("success") is False, (
            f"legacy empty-epic row must yield a fail-loud result, got {result!r}"
        )
        err = str(result.get("error", ""))
        assert "144-9" in err, f"error must name the offending legacy row: {err!r}"
        assert "backfill" in err.lower(), f"error must point at the backfill remedy: {err!r}"
        assert archive_path.read_text() == before, (
            "refused write must leave the archive file byte-identical"
        )


# =============================================================================
# Finish-flow harness (mirrors test_155_12_finish_conflicting_pr.py)
# =============================================================================

INDEX_EPIC_YAML = """\
sprint:
  name: "Test1559"
  jira_sprint_id: 999
  jira_sprint_name: "Test1559"
  goal: Test finish step-4b wiring
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
  - id: 155-77
    title: Step-4b wiring story
    points: 2
    priority: p3
    status: in_review
    workflow: tdd
"""

# Standalone layout: the story lives in top-level `stories` with NO epic field,
# so step 4b's _add_story_to_completed fails ("cannot resolve parent epic").
INDEX_STANDALONE_YAML = """\
sprint:
  name: "Test1559"
  jira_sprint_id: 999
  jira_sprint_name: "Test1559"
  goal: Test finish step-4b failure wiring
  start_date: 2026-07-01
  end_date: 2026-07-14
  status: active
  number: 1
epics: []
stories:
  - id: 77-1
    title: Epicless standalone story
    points: 1
    priority: p3
    status: in_review
    workflow: tdd
standalone_stories: []
"""

SESSION_TEMPLATE = """\
---
story_id: "{story_id}"
jira_key: ""
epic: ""
workflow: "tdd"
---

# Story {story_id}: finish step-4b wiring

## Story Details
- **ID:** {story_id}
- **Workflow:** tdd
- **Branch:** feat/{story_id}-step4b
- **PR:** #999 - step-4b wiring
"""

FINISH_ARCHIVE_NAME = "sprint-Test1559-completed.yaml"  # name "Test1559".split()[-1]


def _make_finish_project(tmp_path: Path, *, standalone: bool = False) -> tuple[Path, str]:
    story_id = "77-1" if standalone else "155-77"
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    if standalone:
        (sprint_dir / "current-sprint.yaml").write_text(INDEX_STANDALONE_YAML)
    else:
        (sprint_dir / "current-sprint.yaml").write_text(INDEX_EPIC_YAML)
        (sprint_dir / "epic-155.yaml").write_text(SHARD_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / f"{story_id}-session.md").write_text(
        SESSION_TEMPLATE.format(story_id=story_id)
    )
    return tmp_path, story_id


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
                    "mergedAt": "2026-07-27T00:00:00Z",
                    "mergeable": "MERGEABLE",
                    "mergeStateStatus": "CLEAN",
                }
            ),
            stderr="",
        )
    return MagicMock(returncode=0, stdout="", stderr="")


def _step4b_entries(result: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for s in result.get("steps", []) if str(s.get("step")) == "4b"]


def _step_actions(result: dict[str, Any]) -> set[str]:
    return {str(s.get("action")) for s in result.get("steps", [])}


# =============================================================================
# Gap 1 — finish_story step-4b caller wiring (GREEN-on-arrival coverage pins)
# =============================================================================


class TestFinishStep4bWiring:
    """The de-swallowed step-4b block: success is recorded with the resolved
    epic; failure is recorded loud (never hidden) while finish still completes
    — the documented non-fatal intent (gh #16, the other half of 155-4)."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_records_step4b_success_with_resolved_epic(
        self, mock_mode: MagicMock, mock_transition: MagicMock, tmp_path: Path
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project, story_id = _make_finish_project(tmp_path)

        with patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run):
            result = finish_story(project, story_id)

        assert result["success"] is True, f"clean finish must succeed: {result}"
        entries = _step4b_entries(result)
        assert entries, f"finish must record a step-4b entry: {result.get('steps')}"
        assert entries[0].get("epic") == "155", (
            f"step-4b entry must carry the resolved epic '155': {entries[0]!r}"
        )
        rows = _completed_rows(project / "sprint" / "archive" / FINISH_ARCHIVE_NAME)
        row = next((r for r in rows if r.get("id") == story_id), None)
        assert row is not None and row.get("epic") == "155", (
            f"completed row must land on disk with the real epic, got {row!r}"
        )
        assert not (project / ".session" / f"{story_id}-session.md").exists(), (
            "clean finish must remove the session file (step 7)"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_surfaces_step4b_failure_and_still_completes(
        self, mock_mode: MagicMock, mock_transition: MagicMock, tmp_path: Path
    ) -> None:
        """An epicless standalone story makes _add_story_to_completed fail.
        The failure must be RECORDED in steps (de-swallow, gh #16) while finish
        itself still succeeds and runs steps 4c-7 (documented non-fatal)."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project, story_id = _make_finish_project(tmp_path, standalone=True)

        with patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run):
            result = finish_story(project, story_id)

        assert result["success"] is True, (
            f"step-4b failure is non-fatal by contract; finish must succeed: {result}"
        )
        entries = _step4b_entries(result)
        assert entries, f"the 4b failure was silently skipped: {result.get('steps')}"
        assert entries[0].get("success") is False, f"expected recorded failure: {entries[0]!r}"
        assert "epic" in str(entries[0].get("error", "")).lower(), (
            f"recorded 4b error should explain the unresolvable epic: {entries[0]!r}"
        )
        # Steps after 4b must have run (the non-fatal contract).
        actions = _step_actions(result)
        assert "remove_session" in actions, "step 7 must still run after a 4b failure"
        assert not (project / ".session" / f"{story_id}-session.md").exists()
        # And no malformed row reached disk.
        rows = _completed_rows(project / "sprint" / "archive" / FINISH_ARCHIVE_NAME)
        assert not any(r.get("id") == story_id for r in rows), (
            "a row must not be archived for an unresolvable epic"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_finish_records_step4b_when_story_vanishes_from_reread(
        self, mock_mode: MagicMock, mock_transition: MagicMock, tmp_path: Path
    ) -> None:
        """When the step-4b re-read succeeds but the story is gone from the
        sprint data, the skip must be RECORDED as a failed 4b step — the same
        no-silent-skip contract as the exception path (155-24 AC1; previously
        the ``if completed_story:`` block skipped with no 4b entry at all)."""
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project, story_id = _make_finish_project(tmp_path)

        calls = {"n": 0}

        def vanish_after_first(data: dict[str, Any], sid: str):
            calls["n"] += 1
            if calls["n"] == 1:
                return real_find_story_in_data(data, sid)
            return None, None, None

        with (
            patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run),
            patch(
                "pf.sprint.story_finish.find_story_in_data",
                side_effect=vanish_after_first,
            ),
        ):
            result = finish_story(project, story_id)

        assert result["success"] is True, (
            f"a vanished completed-row source is non-fatal bookkeeping: {result}"
        )
        entries = _step4b_entries(result)
        assert entries and entries[0].get("success") is False, (
            "the completed_story-None skip must be RECORDED as a failed 4b "
            f"step, not silently dropped: {result.get('steps')}"
        )
        assert "not found" in str(entries[0].get("error", "")), (
            f"the recorded 4b error must explain the vanished story: {entries[0]!r}"
        )
        actions = _step_actions(result)
        assert "remove_session" in actions, "step 7 must run after the recorded 4b skip"
        assert not (project / ".session" / f"{story_id}-session.md").exists()
        rows = _completed_rows(project / "sprint" / "archive" / FINISH_ARCHIVE_NAME)
        assert not any(r.get("id") == story_id for r in rows), (
            "no completed row must be archived when the story vanished mid-finish"
        )


# =============================================================================
# Gap 6 — step-4b read_sprint guard (GENUINELY RED: the story's code change)
# =============================================================================


def _read_sprint_then_boom(exc: Exception):
    """Calls 1-2 pass through to the real ``read_sprint`` (call 1 is the
    primary validation read, call 2 the status-transition read — guarded by
    155-16, where a failure now aborts finish loudly and would never reach
    step 4b); calls 3+ raise ``exc``. Call 3 is the step-4b re-read, so this
    simulates the sprint index becoming unreadable exactly there — after the
    merge and done-transition already happened."""
    calls = {"n": 0}

    def fake(path):
        calls["n"] += 1
        if calls["n"] <= 2:
            return real_read_sprint(path)
        raise exc

    return fake


class TestStep4bReadSprintGuard:
    """The step-4b ``read_sprint`` re-read is unwrapped. When it raises, the
    exception escapes ``finish_story`` AFTER the (irreversible) merge and done
    transition: steps 4c-7 are skipped, the session is never removed, and the
    CLI boundary gets a raw traceback — violating the no-throw contract
    (SOUL #10) at the worst possible moment. The guard must degrade gracefully:
    record the 4b failure as a step (no silent skip — truthfulness epic) and
    continue with steps 4c-7."""

    @pytest.mark.parametrize(
        "exc",
        [PermissionError("sprint index unreadable"), ValueError("malformed sprint YAML")],
        ids=["oserror", "valueerror"],
    )
    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    def test_step4b_read_sprint_crash_must_not_abort_finish(
        self,
        mock_mode: MagicMock,
        mock_transition: MagicMock,
        tmp_path: Path,
        exc: Exception,
    ) -> None:
        mock_transition.return_value = {"success": True, "to_status": "done"}
        project, story_id = _make_finish_project(tmp_path)
        session_path = project / ".session" / f"{story_id}-session.md"

        with (
            patch("pf.sprint.story_finish._run", side_effect=_clean_merge_run),
            patch("pf.sprint.story_finish.read_sprint", new=_read_sprint_then_boom(exc)),
        ):
            try:
                result = finish_story(project, story_id)
            except Exception as escaped:  # noqa: BLE001 — the defect under test
                pytest.fail(
                    f"step-4b read_sprint failure ({escaped!r}) escaped "
                    "finish_story AFTER the merge and done-transition — steps "
                    "4c-7 were skipped and the session was never removed "
                    "(no-throw contract, SOUL #10)"
                )

        assert result["success"] is True, (
            f"a post-transition bookkeeping failure must not fail finish: {result}"
        )
        entries = _step4b_entries(result)
        assert entries and entries[0].get("success") is False, (
            "the 4b read failure must be RECORDED as a failed step, not "
            f"silently skipped: {result.get('steps')}"
        )
        assert str(exc) in str(entries[0].get("error", "")), (
            f"the recorded 4b failure must carry the injected exception text "
            f"{str(exc)!r}, not a placeholder: {entries[0]!r}"
        )
        actions = _step_actions(result)
        assert "remove_session" in actions, "step 7 must run after the degraded 4b"
        assert not session_path.exists(), (
            "the session file must be removed — the story IS done (merge + "
            "transition landed); only the completed-row bookkeeping failed"
        )
