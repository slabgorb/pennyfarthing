"""Tests for ``archive_story(..., apply=True)`` removal coverage and truthful reporting.

Story 162-17: ``pf sprint archive --apply`` false-success. The removal step in
``pf.sprint.archive.archive_story`` filters only ``epics[].stories``:

1. A story living in the top-level ``standalone_stories`` list is archived but
   never removed from ``current-sprint.yaml``.
2. On a **sharded** index the ``epics`` entries are ID strings (the raw
   ``yaml.safe_load`` of the index is not shard-merged), so the
   ``isinstance(epic, dict)`` guard is False for every entry and the removal
   loop is a silent no-op.
3. In both cases the success message unconditionally appends
   ``" and removed from current-sprint.yaml"`` — it claims a removal that never
   happened.

These tests assert **behaviour**, not implementation: a story that is archived
with ``--apply`` must be gone from the live sprint data, and the reported
message must only claim removal when a removal actually occurred. They build a
real mini-project rooted at ``tmp_path`` and point the resolver at it via the
``PROJECT_ROOT`` env override (the highest-priority source in
``get_project_root`` — ``monkeypatch.chdir`` would be shadowed by it). All
assertions are against the ``{success, data?, error?}`` result object; no
exceptions are expected.
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive import archive_story
from pf.sprint.loader import load_sprint
from pf.sprint.yaml_io import _write_yaml_file

STORY_ID = "162-99"
CLAIM = "removed from"


def _story(story_id: str = STORY_ID, status: str = "done") -> dict[str, Any]:
    return {"id": story_id, "title": "Archive me", "points": 2, "status": status}


def _make_project(tmp_path: Path, index: dict[str, Any]) -> Path:
    """Write ``index`` as sprint/current-sprint.yaml plus an archive shard.

    Returns the project root. The archive file must pre-exist or
    ``archive_story`` short-circuits with an error before the removal step.
    """
    sprint_dir = tmp_path / "sprint"
    (sprint_dir / "archive").mkdir(parents=True)
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    (sprint_dir / "archive" / "sprint-162-completed.yaml").write_text("completed_stories:\n")
    return tmp_path


def _index(**extra: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"sprint": {"name": "Sprint 162", "status": "active"}}
    base.update(extra)
    return base


def _live_story_ids(root: Path) -> list[str]:
    """Every story id visible in the sprint data as it now sits on disk.

    Uses the shard-merging loader so a sharded index is read the same way the
    rest of the CLI reads it — a story "removed" only from the in-memory index
    but left in its shard still shows up here.
    """
    data = load_sprint(root) or {}
    ids: list[str] = []
    for epic in data.get("epics", []):
        if isinstance(epic, dict):
            ids.extend(str(s.get("id")) for s in epic.get("stories", []) or [])
    for key in ("standalone_stories", "stories"):
        ids.extend(str(s.get("id")) for s in data.get(key, []) or [])
    return ids


def _assert_report_is_truthful(result: dict[str, Any], root: Path) -> None:
    """The message may claim removal only if the story is really gone."""
    claimed = CLAIM in (result.get("message") or "")
    actually_removed = STORY_ID not in _live_story_ids(root)
    assert claimed == actually_removed, (
        f"report/reality mismatch: message={result.get('message')!r} "
        f"claims_removal={claimed} actually_removed={actually_removed} "
        f"live_ids={_live_story_ids(root)}"
    )


@pytest.fixture
def project_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    return tmp_path


# --- Facet 1: standalone_stories -------------------------------------------


def test_apply_removes_standalone_story(project_root: Path) -> None:
    """A story in top-level ``standalone_stories`` must be removed by --apply."""
    _make_project(project_root, _index(epics=[], standalone_stories=[_story()]))

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    assert STORY_ID not in _live_story_ids(project_root)


def test_apply_report_truthful_for_standalone_story(project_root: Path) -> None:
    """No false success: don't claim removal of a standalone story that stayed put."""
    _make_project(project_root, _index(epics=[], standalone_stories=[_story()]))

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    _assert_report_is_truthful(result, project_root)


# --- Facet 2: sharded index (epics are ID strings) -------------------------


def _make_sharded_project(tmp_path: Path) -> Path:
    root = _make_project(tmp_path, _index(epics=["162"]))
    _write_yaml_file(
        tmp_path / "sprint" / "epic-162.yaml",
        {"id": "162", "title": "Sharded Epic", "stories": [_story(), _story("162-98", "backlog")]},
    )
    return root


def test_apply_removes_story_from_sharded_index(project_root: Path) -> None:
    """--apply against a sharded index must not be a silent no-op."""
    _make_sharded_project(project_root)

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    assert STORY_ID not in _live_story_ids(project_root)
    # Sibling story must survive — removal is targeted, not a shard wipe.
    assert "162-98" in _live_story_ids(project_root)


def test_apply_report_truthful_on_sharded_index(project_root: Path) -> None:
    """The headline defect: sharded --apply removes nothing yet reports removal."""
    _make_sharded_project(project_root)

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    _assert_report_is_truthful(result, project_root)


# --- Facet 3: truthful reporting in general -------------------------------


def test_apply_report_truthful_for_toplevel_stories_list(project_root: Path) -> None:
    """Top-level ``stories``: either remove it, or don't claim you did."""
    _make_project(project_root, _index(epics=[], stories=[_story()]))

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    _assert_report_is_truthful(result, project_root)


# --- Preservation guards (green before and after the fix) -----------------


def test_apply_still_removes_inline_epic_story(project_root: Path) -> None:
    """Regression pin: the already-working inline-epic path keeps working."""
    _make_project(
        project_root,
        _index(epics=[{"id": "162", "title": "Inline Epic", "stories": [_story()]}]),
    )

    result = archive_story(STORY_ID, "500", apply=True)

    assert result["success"] is True, result.get("error")
    assert STORY_ID not in _live_story_ids(project_root)
    assert CLAIM in result["message"]


def test_without_apply_nothing_is_removed_and_nothing_is_claimed(project_root: Path) -> None:
    """Without --apply the story stays in the sprint and no removal is claimed."""
    _make_project(project_root, _index(epics=[], standalone_stories=[_story()]))

    result = archive_story(STORY_ID, "500")

    assert result["success"] is True, result.get("error")
    assert STORY_ID in _live_story_ids(project_root)
    assert CLAIM not in result["message"]
