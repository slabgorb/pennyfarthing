"""RED tests for story 156-4 (gh #50).

Bug: pf/frame/ws_push.py:fetch_sprint() is shard-only. For each epic ref it
computes jira_key (string ref, or ref.get("jira","") for dicts) and reads
epic-{jira_key}.yaml, silently `continue`-ing when the shard file is missing.

Inline-dict epics (keyed by `id`, no `jira`) yield jira_key="" -> it looks for
epic-.yaml -> missing -> silent drop. Result: the TUI Sprint panel renders an
EMPTY active-epics section for legacy monolithic current-sprint.yaml files,
while the CLI (which routes through sprint/loader.load_sprint ->
shard_merge.merge_epic_shards) shows them fine.

Approved fix (Option A): route fetch_sprint through the canonical loader so
inline-dict AND shard epics arrive as fully-merged dicts.

fetch_sprint() takes NO args; it resolves the project dir via
_get_project_dir() (FRAME_PROJECT_DIR -> PF_PROJECT_DIR -> cwd). These tests
point that env var at a tmp project and assert on the returned payload:
    {"type": "init", "sprint": {...}, "epics": [...], "completedEpics": [...]}
Each epic entry is {id, title, jiraKey, status, stories}.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.frame.ws_push import fetch_sprint


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so fetch_sprint() reads from it.

    fetch_sprint resolves the project dir via FRAME_PROJECT_DIR ->
    PF_PROJECT_DIR -> cwd. Set FRAME_PROJECT_DIR and clear the others so the
    fetch is fully isolated to the tmp tree.
    """
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    (tmp_path / "sprint").mkdir()
    return tmp_path


SPRINT_HEADER = {
    "name": "Test Sprint",
    "goal": "exercise fetch_sprint",
    "status": "active",
    "number": 9001,
}


def _inline_active_epic() -> dict:
    """Legacy monolithic format: epic is an INLINE DICT keyed by id (no jira)."""
    return {
        "id": "156",
        "type": "epic",
        "title": "TUI sprint panel inline epics",
        "status": "in_progress",
        "stories": [
            {"id": "156-4", "title": "fetch_sprint inline epics", "points": 3, "status": "in_progress"},
            {"id": "156-5", "title": "follow-up", "points": 2, "status": "backlog"},
        ],
    }


def _inline_done_epic() -> dict:
    return {
        "id": "150",
        "type": "epic",
        "title": "Finished work",
        "status": "done",
        "stories": [
            {"id": "150-1", "title": "shipped", "points": 5, "status": "done"},
        ],
    }


# ---------------------------------------------------------------------------
# AC1 — inline-dict active epics must appear in `epics` (THE RED TEST)
# ---------------------------------------------------------------------------


def test_ac1_inline_active_epic_appears_in_epics(project_dir):
    """An active inline-dict epic must land in `epics`, fully populated.

    Today fetch_sprint computes jira_key="" for inline dicts, looks for
    epic-.yaml, fails to find it, and silently drops the epic -> epics == [].
    """
    sprint_data = {
        "sprint": SPRINT_HEADER,
        "epics": [_inline_active_epic()],
        "stories": [],
    }
    _write_yaml(project_dir / "sprint" / "current-sprint.yaml", sprint_data)

    result = fetch_sprint()

    epics = result["epics"]
    # The epic must not be dropped.
    assert epics, f"inline-dict active epic was dropped; epics={epics!r}"

    ids = [e.get("id") for e in epics]
    assert "156" in ids, f"epic id 156 missing from epics; got ids={ids!r}"

    epic = next(e for e in epics if e.get("id") == "156")
    assert epic["title"] == "TUI sprint panel inline epics"
    assert epic["status"] == "in_progress"
    assert isinstance(epic["stories"], list) and len(epic["stories"]) == 2
    story_ids = [s.get("id") for s in epic["stories"]]
    assert "156-4" in story_ids and "156-5" in story_ids


# ---------------------------------------------------------------------------
# AC2 — done/completed inline epics route to completedEpics, not epics
# ---------------------------------------------------------------------------


def test_ac2_inline_done_epic_routes_to_completed(project_dir):
    """A done inline-dict epic belongs in completedEpics, not active epics."""
    sprint_data = {
        "sprint": SPRINT_HEADER,
        "epics": [_inline_active_epic(), _inline_done_epic()],
        "stories": [],
    }
    _write_yaml(project_dir / "sprint" / "current-sprint.yaml", sprint_data)

    result = fetch_sprint()

    active_ids = [e.get("id") for e in result["epics"]]
    completed_ids = [e.get("id") for e in result["completedEpics"]]

    assert "150" in completed_ids, f"done inline epic missing from completedEpics; got {completed_ids!r}"
    assert "150" not in active_ids, "done inline epic must not appear in active epics"
    # And the active one is still active.
    assert "156" in active_ids, f"active inline epic missing; got {active_ids!r}"


# ---------------------------------------------------------------------------
# AC3 — regression: SHARD-format epics still render
# ---------------------------------------------------------------------------


def test_ac3_shard_format_epics_still_render(project_dir):
    """String epic refs + matching epic-{ref}.yaml shards must still work."""
    sprint_data = {
        "sprint": SPRINT_HEADER,
        "epics": ["157", "151"],
        "stories": [],
    }
    _write_yaml(project_dir / "sprint" / "current-sprint.yaml", sprint_data)

    _write_yaml(
        project_dir / "sprint" / "epic-157.yaml",
        {
            "id": "157",
            "type": "epic",
            "title": "Sharded active epic",
            "status": "backlog",
            "stories": [{"id": "157-1", "title": "shard story", "points": 2, "status": "backlog"}],
        },
    )
    _write_yaml(
        project_dir / "sprint" / "epic-151.yaml",
        {
            "id": "151",
            "type": "epic",
            "title": "Sharded done epic",
            "status": "done",
            "stories": [{"id": "151-1", "title": "shard done", "points": 1, "status": "done"}],
        },
    )

    result = fetch_sprint()

    active_ids = [e.get("id") for e in result["epics"]]
    completed_ids = [e.get("id") for e in result["completedEpics"]]

    assert "157" in active_ids, f"sharded active epic dropped; got {active_ids!r}"
    assert "151" in completed_ids, f"sharded done epic missing from completed; got {completed_ids!r}"

    epic = next(e for e in result["epics"] if e.get("id") == "157")
    assert epic["title"] == "Sharded active epic"
    assert [s.get("id") for s in epic["stories"]] == ["157-1"]


# ---------------------------------------------------------------------------
# AC5 — standalone_stories still surface as the standalone pseudo-epic
# ---------------------------------------------------------------------------


def test_ac5_standalone_stories_pseudo_epic_preserved(project_dir):
    """standalone_stories must still render as the 'standalone' pseudo-epic."""
    sprint_data = {
        "sprint": SPRINT_HEADER,
        "epics": [_inline_active_epic()],
        "stories": [],
        "standalone_stories": [
            {"id": "PROJ-1", "title": "loose story", "points": 1, "status": "backlog"},
        ],
    }
    _write_yaml(project_dir / "sprint" / "current-sprint.yaml", sprint_data)

    result = fetch_sprint()

    by_id = {e.get("id"): e for e in result["epics"]}
    assert "standalone" in by_id, f"standalone pseudo-epic missing; epics={list(by_id)!r}"
    standalone = by_id["standalone"]
    assert standalone["title"] == "Standalone Stories"
    assert [s.get("id") for s in standalone["stories"]] == ["PROJ-1"]
