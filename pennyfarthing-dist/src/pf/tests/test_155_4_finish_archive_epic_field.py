"""RED tests for 155-4: finish-archive writes the real epic id, not ``epic: ''``.

Bug (gh pennyfarthing#16): when ``pf sprint story finish`` archives a completed
story, the row appended to ``sprint/archive/sprint-{N}-completed.yaml`` carries
``epic: ''`` (empty string) instead of the story's real parent epic id.

Root cause (``pf/sprint/story_finish.py``):
  * ``finish_story`` calls ``find_story_in_data(data, story_id)`` which returns
    the *containing epic* as its first element — but discards it as ``_epic``.
  * ``_add_story_to_completed`` then builds the completed row with
    ``story.get("jira_epic", story.get("epic", ""))``. Sprint story dicts do not
    carry an ``epic`` key (the story→epic relationship is structural: the story
    lives inside the epic's ``stories`` list), so this resolves to ``""``.
  * The whole helper is wrapped in ``except Exception: pass``. Even though
    ``_write_archive_file`` now *raises* ValueError on an empty ``epic`` (the
    151-2 guard), that failure is silently swallowed and the row is dropped —
    a SOUL #10 "no silent fallbacks" violation either way.

Pinned contract (TEA, RED phase):
  AC1 — For a story following the ``{epic}-{seq}`` convention whose parent epic
        exists in sprint data, the archived row's ``epic`` must equal the real
        parent epic id (``"35"`` for ``"35-11"``) and the row must be written.
  AC2 — When the parent epic genuinely cannot be resolved from sprint data, the
        archive-write must FAIL LOUD — surfacing the error (raised exception,
        matching the existing ``_write_archive_file`` ValueError convention, or
        a ``{"success": False, "error": ...}`` result per SOUL #10) — rather
        than silently swallowing it or emitting an empty / fabricated ``epic``.

These tests exercise the buggy seam (``_add_story_to_completed``) directly and
must be RED until Dev sources the epic from authoritative sprint data instead of
from the story dict, and removes the blanket exception swallow.
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.story_finish import _add_story_to_completed
from pf.sprint.yaml_io import _write_yaml_file

ARCHIVE_NAME = "sprint-155-completed.yaml"


@pytest.fixture
def sprint_tree(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Minimal sprint tree: epic ``35`` containing story ``35-11`` plus an
    archive directory. Epic ``35`` has no jira key, so its only sensible
    reference is the numeric id ``"35"`` — pinning the issue's exact example."""
    # Defensively isolate from any ambient project root so resolution uses our
    # tmp tree, not the live orchestrator sprint.
    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)

    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()

    index: dict[str, Any] = {
        "sprint": {
            "name": "Sprint 155",
            "number": 155,
            "status": "active",
        },
        "epics": [
            {
                "id": "35",
                "status": "in_progress",
                "stories": [
                    # Note: the story dict carries NO `epic` field — exactly as
                    # real sprint YAML stores it. The epic is structural.
                    {"id": "35-11", "title": "A completed story", "points": 2},
                ],
            },
        ],
        "stories": [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    return tmp_path


def _completed_rows(archive_path: Path) -> list[dict[str, Any]]:
    """Load completed_stories rows from the archive file (tolerant of absence)."""
    if not archive_path.exists():
        return []
    from pf.sprint.archive_epic import _load_archive_file

    return list(_load_archive_file(archive_path).get("completed_stories") or [])


# --- AC1: real epic id is written, row is not silently dropped ----------------


def test_finish_archive_writes_real_epic_id_not_empty(sprint_tree: Path) -> None:
    """Archiving story ``35-11`` must record ``epic: '35'`` — never ``''`` and
    never a dropped row."""
    root = sprint_tree
    archive_path = root / "sprint" / "archive" / ARCHIVE_NAME

    # Story dict as it lives in sprint YAML: no `epic` key of its own.
    story = {"id": "35-11", "title": "A completed story", "points": 2}
    _add_story_to_completed(root, "35-11", story)

    rows = _completed_rows(archive_path)
    row = next((r for r in rows if r.get("id") == "35-11"), None)

    assert row is not None, (
        "completed row for 35-11 was never written — the empty-epic write was "
        "silently swallowed (story_finish.py `except Exception: pass`)"
    )
    epic = row.get("epic")
    assert epic not in (None, ""), (
        f"archive row for 35-11 has blank epic {epic!r} (gh #16) — expected the "
        "real parent epic id '35'"
    )
    assert str(epic) == "35", f"expected epic '35' for story 35-11, got {epic!r}"


def test_finish_archive_never_emits_empty_epic_on_disk(sprint_tree: Path) -> None:
    """Belt-and-suspenders: the serialized archive file must not contain an
    empty ``epic:`` value for the finished story."""
    root = sprint_tree
    archive_path = root / "sprint" / "archive" / ARCHIVE_NAME

    story = {"id": "35-11", "title": "A completed story", "points": 2}
    _add_story_to_completed(root, "35-11", story)

    assert archive_path.exists(), "archive file should exist after finish-archive"
    content = archive_path.read_text()
    assert "epic: ''" not in content and 'epic: ""' not in content, (
        "archive file contains an empty epic field (gh #16 regression)"
    )
    # And the story must actually be present (not dropped to dodge the guard).
    assert "35-11" in content, "finished story 35-11 missing from archive file"


# --- AC2: fail loud when the epic genuinely cannot be determined --------------


def test_finish_archive_fails_loud_when_epic_undeterminable(sprint_tree: Path) -> None:
    """A story absent from sprint data has no resolvable parent epic. The write
    must fail loud (raise, or return a falsy/``success: False`` result) rather
    than silently swallowing the error or fabricating/emitting a blank epic."""
    root = sprint_tree
    archive_path = root / "sprint" / "archive" / ARCHIVE_NAME

    # `ghost-99` exists nowhere in the sprint tree — its epic is undeterminable
    # by any authoritative lookup.
    story = {"id": "ghost-99", "title": "Not in any epic", "points": 1}

    raised = False
    result: Any = None
    try:
        result = _add_story_to_completed(root, "ghost-99", story)
    except Exception:
        raised = True

    if not raised:
        # No exception → the helper MUST return an explicit failure result.
        # Returning None (the current behaviour) is the silent fallback we forbid.
        assert isinstance(result, dict), (
            "epic-undeterminable archive write must signal failure, not silently "
            f"return {result!r} (SOUL #10: return results, don't swallow)"
        )
        assert result.get("success") is False, (
            f"expected a fail-loud {{success: False}} result, got {result!r}"
        )

    # Regardless of the failure signal, no malformed row may reach disk.
    if archive_path.exists():
        content = archive_path.read_text()
        assert "epic: ''" not in content and 'epic: ""' not in content, (
            "fabricated/blank epic was written for an unresolvable story"
        )
    rows = _completed_rows(archive_path)
    ghost = next((r for r in rows if r.get("id") == "ghost-99"), None)
    assert ghost is None or str(ghost.get("epic") or "").strip(), (
        "unresolvable story 'ghost-99' was archived with a blank/fabricated epic"
    )
