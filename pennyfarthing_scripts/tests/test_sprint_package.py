"""Tests for sprint/ library package.

Story 63-9: Reorganize pennyfarthing_scripts into fan-out CLI pattern.

These tests verify the sprint/ package modules work correctly
after reorganization from flat modules.
"""

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


class TestSprintLoader:
    """Tests for sprint/loader.py module."""

    def test_load_sprint_returns_dict(self) -> None:
        """load_sprint should return sprint data as dict."""
        from pennyfarthing_scripts.sprint.loader import load_sprint

        result = load_sprint()

        # In a project with sprint data, should return dict
        # May return None if no sprint file exists
        assert result is None or isinstance(result, dict)

    def test_load_sprint_with_custom_root(self) -> None:
        """load_sprint should accept custom project root."""
        from pennyfarthing_scripts.sprint.loader import load_sprint
        from pennyfarthing_scripts.common.config import get_project_root

        root = get_project_root()
        result = load_sprint(project_root=root)

        assert result is None or isinstance(result, dict)

    def test_find_epic_by_number(self) -> None:
        """find_epic should find epic by number."""
        from pennyfarthing_scripts.sprint.loader import find_epic

        sprint_data = {
            "epics": [
                {"id": "epic-63", "title": "Test Epic"},
                {"id": "epic-64", "title": "Another Epic"},
            ]
        }

        # Find by full ID
        epic = find_epic(sprint_data, "epic-63")
        assert epic is not None
        assert epic["title"] == "Test Epic"

        # Find by number only
        epic = find_epic(sprint_data, "63")
        assert epic is not None
        assert epic["title"] == "Test Epic"

    def test_find_epic_returns_none_if_not_found(self) -> None:
        """find_epic should return None if epic not found."""
        from pennyfarthing_scripts.sprint.loader import find_epic

        sprint_data = {"epics": [{"id": "epic-63", "title": "Test Epic"}]}

        result = find_epic(sprint_data, "epic-99")
        assert result is None

    def test_find_epic_handles_empty_data(self) -> None:
        """find_epic should handle empty or None data."""
        from pennyfarthing_scripts.sprint.loader import find_epic

        assert find_epic(None, "63") is None
        assert find_epic({}, "63") is None
        assert find_epic({"epics": []}, "63") is None

    def test_find_story_in_epic(self) -> None:
        """find_story should find story within an epic."""
        from pennyfarthing_scripts.sprint.loader import find_story

        epic = {
            "id": "epic-63",
            "stories": [
                {"id": "63-1", "title": "First Story"},
                {"id": "63-2", "title": "Second Story"},
            ],
        }

        story = find_story(epic, "63-1")
        assert story is not None
        assert story["title"] == "First Story"

    def test_find_story_returns_none_if_not_found(self) -> None:
        """find_story should return None if story not found."""
        from pennyfarthing_scripts.sprint.loader import find_story

        epic = {"id": "epic-63", "stories": [{"id": "63-1", "title": "Story"}]}

        result = find_story(epic, "63-99")
        assert result is None

    def test_get_all_stories_returns_flat_list(self) -> None:
        """get_all_stories should return flat list from all epics."""
        from pennyfarthing_scripts.sprint.loader import get_all_stories

        # With actual sprint data loaded
        stories = get_all_stories()

        # Should be a list (may be empty if no sprint data)
        assert isinstance(stories, list)

    def test_get_story_by_id(self) -> None:
        """get_story_by_id should find story across all epics."""
        from pennyfarthing_scripts.sprint.loader import get_story_by_id

        # This relies on actual sprint data
        result = get_story_by_id("nonexistent-99")
        assert result is None  # Should not find nonexistent story

    def test_get_stories_by_status(self) -> None:
        """get_stories_by_status should filter by status."""
        from pennyfarthing_scripts.sprint.loader import get_stories_by_status

        result = get_stories_by_status("backlog")
        assert isinstance(result, list)

    def test_get_story_field(self) -> None:
        """get_story_field should extract field from story."""
        from pennyfarthing_scripts.sprint.loader import get_story_field

        sprint_data = {
            "epics": [
                {
                    "id": "epic-63",
                    "stories": [
                        {"id": "63-1", "status": "in_progress", "points": 3}
                    ],
                }
            ]
        }

        assert get_story_field(sprint_data, "63-1", "status") == "in_progress"
        assert get_story_field(sprint_data, "63-1", "points") == 3
        assert get_story_field(sprint_data, "63-1", "nonexistent") is None

    def test_load_current_sprint_alias(self) -> None:
        """load_current_sprint should be alias for load_sprint."""
        from pennyfarthing_scripts.sprint.loader import (
            load_current_sprint,
            load_sprint,
        )

        # Should be the same function
        assert load_current_sprint == load_sprint

    def test_get_sprint_info(self) -> None:
        """get_sprint_info should return sprint metadata."""
        from pennyfarthing_scripts.sprint.loader import get_sprint_info

        result = get_sprint_info()
        assert isinstance(result, dict)

    def test_get_epic_by_id(self) -> None:
        """get_epic_by_id should find epic by ID."""
        from pennyfarthing_scripts.sprint.loader import get_epic_by_id

        # Test with nonexistent ID
        result = get_epic_by_id("nonexistent-epic")
        assert result is None


class TestSprintStatus:
    """Tests for sprint/status.py module."""

    def test_get_sprint_status_returns_dict(self) -> None:
        """get_sprint_status should return status information."""
        from pennyfarthing_scripts.sprint.status import get_sprint_status

        result = get_sprint_status()

        assert isinstance(result, dict)
        # Should have expected keys
        assert "total_stories" in result or result == {}
        assert "completed" in result or result == {}

    def test_format_status(self) -> None:
        """format_status should return formatted string."""
        from pennyfarthing_scripts.sprint.status import format_status

        status = {
            "total_stories": 10,
            "completed": 3,
            "in_progress": 2,
            "backlog": 5,
        }
        result = format_status(status)

        assert isinstance(result, str)
        # Should contain numbers
        assert "10" in result or "3" in result


class TestSprintWork:
    """Tests for sprint/work.py module."""

    def test_check_story_returns_availability(self) -> None:
        """check_story should return story availability info."""
        from pennyfarthing_scripts.sprint.work import check_story

        result = check_story("nonexistent-99")

        assert isinstance(result, dict)
        assert "available" in result or "error" in result

    def test_start_work_validates_story(self) -> None:
        """start_work should validate story exists."""
        from pennyfarthing_scripts.sprint.work import start_work

        result = start_work("nonexistent-99", dry_run=True)

        assert isinstance(result, dict)
        assert result.get("success") is False or "error" in result


class TestSprintArchive:
    """Tests for sprint/archive.py module."""

    def test_archive_story_validates_story(self) -> None:
        """archive_story should validate story exists."""
        from pennyfarthing_scripts.sprint.archive import archive_story

        result = archive_story("nonexistent-99", dry_run=True)

        assert isinstance(result, dict)
        # Should fail for nonexistent story
        assert result.get("success") is False or "error" in result
