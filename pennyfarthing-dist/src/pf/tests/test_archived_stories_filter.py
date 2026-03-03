"""Tests for get_archived_stories sprint filtering.

Story 137-7: Sprint status aggregates all archive files instead of filtering
by current sprint.

The bug: get_archived_stories(only_current=True) uses sprint.number for
matching, but the current sprint YAML and its archive file may not have a
number field. When number is missing, the filter is silently bypassed and
ALL archive files are included in the status output.

These tests verify:
- only_current=True returns only the current sprint's archived stories
- exclude_current=True excludes the current sprint's archived stories
- Filtering works even when the number field is absent (using name fallback)
"""

from pathlib import Path
from unittest.mock import patch

import pytest
import yaml

from pf.sprint.loader import get_archived_stories


@pytest.fixture
def archive_tree(tmp_path: Path):
    """Create a realistic sprint directory with multiple archive files.

    Mimics production layout:
    - sprint/current-sprint.yaml (active sprint, no number field)
    - sprint/archive/sprint-2610-completed.yaml (current, no number)
    - sprint/archive/sprint-2608-completed.yaml (previous, has number)
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir()

    # Current sprint YAML — no number field, matches production
    current_sprint = {
        "sprint": {
            "name": "TO Sprint 2610",
            "jira_sprint_id": 311,
            "jira_sprint_name": "TO Sprint 2610",
            "goal": "Installation, agents and workflows",
            "status": "active",
        },
        "epics": [],
    }
    with open(sprint_dir / "current-sprint.yaml", "w") as f:
        yaml.dump(current_sprint, f)

    # Current sprint archive — no number field
    current_archive = {
        "sprint": {
            "name": "TO Sprint 2610",
            "jira_sprint_id": 311,
            "jira_sprint_name": "TO Sprint 2610",
        },
        "completed_stories": [
            {"id": "136-12", "points": 3, "status": "done", "title": "Story A"},
            {"id": "136-15", "points": 2, "status": "done", "title": "Story B"},
        ],
    }
    with open(archive_dir / "sprint-2610-completed.yaml", "w") as f:
        yaml.dump(current_archive, f)

    # Previous sprint archive — has number field
    previous_archive = {
        "sprint": {
            "name": "TO Sprint 2608",
            "number": 2608,
            "jira_sprint_id": 310,
            "jira_sprint_name": "TO Sprint 2608",
        },
        "completed_stories": [
            {"id": "120-6", "points": 5, "status": "done", "title": "Old Story X"},
            {"id": "120-12", "points": 3, "status": "done", "title": "Old Story Y"},
            {"id": "120-13", "points": 2, "status": "done", "title": "Old Story Z"},
        ],
    }
    with open(archive_dir / "sprint-2608-completed.yaml", "w") as f:
        yaml.dump(previous_archive, f)

    return tmp_path


@pytest.fixture
def archive_tree_with_numbers(tmp_path: Path):
    """Create archive tree where all files have number fields.

    This tests the case where number-based matching works.
    """
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    archive_dir = sprint_dir / "archive"
    archive_dir.mkdir()

    current_sprint = {
        "sprint": {
            "name": "TO Sprint 2610",
            "number": 2610,
            "jira_sprint_id": 311,
            "jira_sprint_name": "TO Sprint 2610",
            "status": "active",
        },
        "epics": [],
    }
    with open(sprint_dir / "current-sprint.yaml", "w") as f:
        yaml.dump(current_sprint, f)

    current_archive = {
        "sprint": {
            "name": "TO Sprint 2610",
            "number": 2610,
            "jira_sprint_id": 311,
            "jira_sprint_name": "TO Sprint 2610",
        },
        "completed_stories": [
            {"id": "136-12", "points": 3, "status": "done", "title": "Current A"},
        ],
    }
    with open(archive_dir / "sprint-2610-completed.yaml", "w") as f:
        yaml.dump(current_archive, f)

    previous_archive = {
        "sprint": {
            "name": "TO Sprint 2608",
            "number": 2608,
            "jira_sprint_id": 310,
            "jira_sprint_name": "TO Sprint 2608",
        },
        "completed_stories": [
            {"id": "120-6", "points": 5, "status": "done", "title": "Previous A"},
        ],
    }
    with open(archive_dir / "sprint-2608-completed.yaml", "w") as f:
        yaml.dump(previous_archive, f)

    return tmp_path


class TestGetArchivedStoriesOnlyCurrent:
    """only_current=True must return ONLY stories from the current sprint's archive."""

    def test_only_current_excludes_previous_sprint_archives(self, archive_tree: Path):
        """When only_current=True, stories from previous sprints must NOT appear.

        This is the primary bug: without a number field, the filter is bypassed
        and all 5 stories (2 current + 3 previous) are returned.
        Expected: only the 2 current sprint stories.
        """
        with patch("pf.sprint.loader.get_project_root", return_value=archive_tree):
            stories = get_archived_stories(only_current=True)

        story_ids = {s["id"] for s in stories}

        # Must include current sprint stories
        assert "136-12" in story_ids
        assert "136-15" in story_ids

        # Must NOT include previous sprint stories
        assert "120-6" not in story_ids
        assert "120-12" not in story_ids
        assert "120-13" not in story_ids

        assert len(stories) == 2

    def test_only_current_works_without_number_field(self, archive_tree: Path):
        """Filtering must work when sprint YAML has no number field.

        Production current-sprint.yaml often lacks a number field. The filter
        should fall back to matching on name or jira_sprint_name.
        """
        with patch("pf.sprint.loader.get_project_root", return_value=archive_tree):
            stories = get_archived_stories(only_current=True)

        # Should return exactly the current sprint's stories
        assert len(stories) == 2
        assert all(s["id"].startswith("136-") for s in stories)

    def test_only_current_with_number_field_present(
        self, archive_tree_with_numbers: Path
    ):
        """When number field exists, only_current should still work correctly."""
        with patch(
            "pf.sprint.loader.get_project_root",
            return_value=archive_tree_with_numbers,
        ):
            stories = get_archived_stories(only_current=True)

        assert len(stories) == 1
        assert stories[0]["id"] == "136-12"


class TestGetArchivedStoriesExcludeCurrent:
    """exclude_current=True must return stories from all sprints EXCEPT current."""

    def test_exclude_current_removes_current_sprint_stories(
        self, archive_tree: Path
    ):
        """When exclude_current=True, current sprint stories must be excluded.

        Same bug path: without number field, filter is bypassed and nothing
        is excluded.
        """
        with patch("pf.sprint.loader.get_project_root", return_value=archive_tree):
            stories = get_archived_stories(exclude_current=True)

        story_ids = {s["id"] for s in stories}

        # Must NOT include current sprint stories
        assert "136-12" not in story_ids
        assert "136-15" not in story_ids

        # Must include previous sprint stories
        assert "120-6" in story_ids
        assert "120-12" in story_ids
        assert "120-13" in story_ids

        assert len(stories) == 3

    def test_exclude_current_with_number_field_present(
        self, archive_tree_with_numbers: Path
    ):
        """When number field exists, exclude_current should still work."""
        with patch(
            "pf.sprint.loader.get_project_root",
            return_value=archive_tree_with_numbers,
        ):
            stories = get_archived_stories(exclude_current=True)

        assert len(stories) == 1
        assert stories[0]["id"] == "120-6"


class TestGetArchivedStoriesNoFilter:
    """Without filter flags, all archived stories should be returned."""

    def test_no_filter_returns_all_archives(self, archive_tree: Path):
        """Default call returns all stories from all archive files."""
        with patch("pf.sprint.loader.get_project_root", return_value=archive_tree):
            stories = get_archived_stories()

        assert len(stories) == 5

    def test_no_filter_returns_all_with_numbers(
        self, archive_tree_with_numbers: Path
    ):
        """Default call returns all stories regardless of number field presence."""
        with patch(
            "pf.sprint.loader.get_project_root",
            return_value=archive_tree_with_numbers,
        ):
            stories = get_archived_stories()

        assert len(stories) == 2


class TestGetArchivedStoriesEdgeCases:
    """Edge cases for archive filtering."""

    def test_empty_archive_dir(self, tmp_path: Path):
        """Empty archive directory returns empty list."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "archive").mkdir()

        current_sprint = {
            "sprint": {"name": "TO Sprint 2610", "status": "active"},
            "epics": [],
        }
        with open(sprint_dir / "current-sprint.yaml", "w") as f:
            yaml.dump(current_sprint, f)

        with patch("pf.sprint.loader.get_project_root", return_value=tmp_path):
            stories = get_archived_stories(only_current=True)

        assert stories == []

    def test_no_archive_dir(self, tmp_path: Path):
        """Missing archive directory returns empty list."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()

        current_sprint = {
            "sprint": {"name": "TO Sprint 2610", "status": "active"},
            "epics": [],
        }
        with open(sprint_dir / "current-sprint.yaml", "w") as f:
            yaml.dump(current_sprint, f)

        with patch("pf.sprint.loader.get_project_root", return_value=tmp_path):
            stories = get_archived_stories(only_current=True)

        assert stories == []

    def test_archive_file_without_completed_stories_key(self, tmp_path: Path):
        """Archive file missing completed_stories key is silently skipped."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        archive_dir = sprint_dir / "archive"
        archive_dir.mkdir()

        current_sprint = {
            "sprint": {"name": "TO Sprint 2610", "status": "active"},
            "epics": [],
        }
        with open(sprint_dir / "current-sprint.yaml", "w") as f:
            yaml.dump(current_sprint, f)

        # Malformed archive — has sprint metadata but no completed_stories
        malformed = {"sprint": {"name": "TO Sprint 2610"}}
        with open(archive_dir / "sprint-2610-completed.yaml", "w") as f:
            yaml.dump(malformed, f)

        with patch("pf.sprint.loader.get_project_root", return_value=tmp_path):
            stories = get_archived_stories(only_current=True)

        assert stories == []
