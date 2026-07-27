"""Tests for ``archive_story`` archive-filename resolution (gh #28).

Story 155-3: ``pf sprint archive STORY_ID PR`` resolves the archive file to
``sprint-unknown-completed.yaml`` when ``current-sprint.yaml`` carries a
``number`` but no ``name``/``jira_sprint_name``. It should fall back to
``sprint.number`` (``sprint-{number}-completed.yaml``) and fail loud when
neither is set — never silently write to ``sprint-unknown-*.yaml``.

Story 151-1 already fixed the *epic*-archive resolver
(``archive_epic.get_archive_path``); ``archive_story`` carries its own buggy
regex resolver. The fix is expected to consolidate on ``get_archive_path``
(SOUL #2: One Truth, One Place) rather than re-implement the resolution.

These tests assert behaviour, not implementation. They build a real
mini-project rooted at ``tmp_path`` via the ``PROJECT_ROOT`` env override (the
highest-priority root source in ``get_project_root``), so they hold regardless
of how Dev resolves the path.
"""

from pathlib import Path
from typing import Any

from pf.sprint.archive import archive_story
from pf.sprint.yaml_io import _write_yaml_file


def _write_project(
    tmp_path: Path,
    sprint_info: dict[str, Any],
    *,
    story_id: str = "37-15",
    status: str = "done",
    archive_file: str | None = None,
) -> Path:
    """Build a minimal sprint tree at ``tmp_path`` with one done story.

    Returns the project root (``tmp_path``). Set ``archive_file`` to pre-create
    an archive shard (e.g. ``"sprint-2-completed.yaml"``) for the end-to-end
    append test; ``archive_story`` errors if the resolved file is absent.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    index = {
        "sprint": sprint_info,
        "epics": [
            {
                "id": "37",
                "title": "Test Epic",
                "stories": [
                    {
                        "id": story_id,
                        "title": "Test story",
                        "points": 3,
                        "status": status,
                    }
                ],
            }
        ],
        "stories": [],
    }
    _write_yaml_file(sprint_dir / "current-sprint.yaml", index)
    if archive_file:
        (sprint_dir / "archive" / archive_file).write_text("completed_stories:\n")
    return tmp_path


def test_falls_back_to_number_when_name_absent(tmp_path, monkeypatch):
    """AC1 (gh #28): number present, no name → resolve sprint-{number}, not unknown."""
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(tmp_path, {"number": 2, "status": "active"})

    result = archive_story("37-15", "477", dry_run=True)

    assert result["success"] is True, result.get("error")
    assert "sprint-2-completed.yaml" in result["message"]
    assert "unknown" not in result["message"]


def test_appends_to_number_resolved_archive_file(tmp_path, monkeypatch):
    """AC1 end-to-end: the real symptom — archive succeeds against the sprint-{number} file."""
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(
        tmp_path,
        {"number": 2, "status": "active"},
        archive_file="sprint-2-completed.yaml",
    )

    result = archive_story("37-15", "477")

    assert result["success"] is True, result.get("error")
    archived = (tmp_path / "sprint" / "archive" / "sprint-2-completed.yaml").read_text()
    assert "37-15" in archived
    # The buggy resolver would have targeted (and failed on) sprint-unknown-completed.yaml.
    assert not (tmp_path / "sprint" / "archive" / "sprint-unknown-completed.yaml").exists()


def test_uses_name_token_when_present(tmp_path, monkeypatch):
    """AC2 preservation guard: a present sprint name wins over number (regression pin).

    Green on HEAD and after the fix — guards against an over-broad fix that
    resolves to ``number`` unconditionally. ``number`` is set to a *different*
    value (2) to prove the name token (2618), not the number, is used.
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(
        tmp_path,
        {"jira_sprint_name": "TO Sprint 2618", "number": 2, "status": "active"},
    )

    result = archive_story("37-15", "477", dry_run=True)

    assert result["success"] is True, result.get("error")
    assert "sprint-2618-completed.yaml" in result["message"]


def test_fails_loud_when_name_and_number_missing(tmp_path, monkeypatch):
    """AC3: neither name nor number → must not silently resolve sprint-unknown.

    Accepts either a fail-loud exception or a returned failure result (SOUL #10),
    leaving that choice to Dev — but never a silent ``sprint-unknown`` target.
    """
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    _write_project(tmp_path, {"status": "active"})  # no name, no number

    try:
        result = archive_story("37-15", "477", dry_run=True)
    except ValueError:
        return  # fail-loud via exception is an acceptable outcome

    assert result["success"] is False
    assert "unknown" not in (result.get("message") or "")
    assert "unknown" not in (result.get("error") or "")
