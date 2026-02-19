"""Tests for epic archiving — completed stories written to sprint completed file.

Story: 91-29 - Bug: archive_epic does not populate completed_stories
"""

from pathlib import Path
from typing import Any

import pytest

from pf.sprint.archive_epic import (
    _load_archive_file,
    _write_archive_file,
    archive_epic,
    is_epic_complete,
)
from pf.sprint.yaml_io import _make_yaml, _write_yaml_file


@pytest.fixture
def sprint_tree(tmp_path: Path) -> Path:
    """Create a minimal sprint directory structure with one completed epic."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()
    (sprint_dir / "context").mkdir()

    # current-sprint.yaml index referencing one epic
    _make_yaml()
    index = {
        "sprint": {
            "name": "TO Sprint 2699",
            "number": 2699,
            "jira_sprint_id": 999,
            "jira_sprint_name": "TO Sprint 2699",
            "goal": "Test sprint",
            "start_date": "2026-02-01",
            "end_date": "2026-02-15",
            "status": "active",
        },
        "epics": ["MSSCI-99999"],
        "stories": [],
    }
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_yaml_file(sprint_path, index)

    # Epic shard with 3 completed stories
    epic_data: dict[str, Any] = {
        "id": "epic-50",
        "type": "epic",
        "title": "Test Epic",
        "status": "backlog",
        "jira": "MSSCI-99999",
        "stories": [
            {
                "id": "50-1",
                "jira": "MSSCI-99901",
                "title": "First story",
                "points": 2,
                "status": "done",
                "completed": "2026-02-10",
            },
            {
                "id": "50-2",
                "jira": "MSSCI-99902",
                "title": "Second story",
                "points": 3,
                "status": "done",
                "completed": "2026-02-11",
            },
            {
                "id": "50-3",
                "jira": "MSSCI-99903",
                "title": "Third story",
                "points": 1,
                "status": "done",
                "completed": "2026-02-12",
            },
        ],
    }
    _write_yaml_file(sprint_dir / "epic-MSSCI-99999.yaml", epic_data)

    # Pre-create the completed file (ensure_archive_file needs load_sprint
    # which needs project root detection — easier to pre-create)
    completed = {
        "sprint": index["sprint"],
        "completed_epics": [],
        "completed_stories": [],
    }
    _write_archive_file(sprint_dir / "archive" / "sprint-2699-completed.yaml", completed)

    return tmp_path


def test_archive_epic_writes_completed_stories(sprint_tree: Path) -> None:
    """Archiving an epic should write all its stories to completed_stories."""
    result = archive_epic("epic-50", project_root=sprint_tree)

    assert result["success"] is True
    assert result["stories_archived"] == 3
    assert result["total_points"] == 6

    # Load the completed file and verify stories were written
    archive_path = sprint_tree / "sprint" / "archive" / "sprint-2699-completed.yaml"
    archive_data = _load_archive_file(archive_path)

    assert "MSSCI-99999" in archive_data["completed_epics"]

    story_ids = [s["id"] for s in archive_data["completed_stories"]]
    assert "50-1" in story_ids
    assert "50-2" in story_ids
    assert "50-3" in story_ids

    # Verify story fields
    story_1 = next(s for s in archive_data["completed_stories"] if s["id"] == "50-1")
    assert story_1["epic"] == "MSSCI-99999"
    assert story_1["title"] == "First story"
    assert story_1["points"] == 2
    assert story_1["completed"] == "2026-02-10"


def test_archive_epic_no_duplicate_stories(sprint_tree: Path) -> None:
    """If stories already exist in completed_stories, don't duplicate them."""
    # Pre-populate one story
    archive_path = sprint_tree / "sprint" / "archive" / "sprint-2699-completed.yaml"
    archive_data = _load_archive_file(archive_path)
    archive_data["completed_stories"].append({
        "id": "50-1",
        "epic": "MSSCI-99999",
        "title": "First story",
        "points": 2,
        "completed": "2026-02-10",
    })
    _write_archive_file(archive_path, archive_data)

    # Now archive the epic
    result = archive_epic("epic-50", project_root=sprint_tree)
    assert result["success"] is True

    # Reload and check — 50-1 should appear only once
    archive_data = _load_archive_file(archive_path)
    story_ids = [s["id"] for s in archive_data["completed_stories"]]
    assert story_ids.count("50-1") == 1
    assert len(story_ids) == 3  # 50-1, 50-2, 50-3


def test_is_epic_complete_all_done() -> None:
    """Epic with all stories done should be complete."""
    epic = {
        "status": "backlog",
        "stories": [
            {"id": "1-1", "status": "done"},
            {"id": "1-2", "status": "done"},
        ],
    }
    complete, incomplete = is_epic_complete(epic)
    assert complete is True
    assert incomplete == []


def test_is_epic_complete_with_canceled() -> None:
    """Canceled stories count as complete."""
    epic = {
        "status": "backlog",
        "stories": [
            {"id": "1-1", "status": "done"},
            {"id": "1-2", "status": "canceled"},
        ],
    }
    complete, incomplete = is_epic_complete(epic)
    assert complete is True


def test_is_epic_complete_with_remaining() -> None:
    """Epic with in_progress stories is not complete."""
    epic = {
        "status": "backlog",
        "stories": [
            {"id": "1-1", "status": "done"},
            {"id": "1-2", "status": "in_progress"},
        ],
    }
    complete, incomplete = is_epic_complete(epic)
    assert complete is False
    assert "1-2" in incomplete
