"""Tests for sprint status including archived stories.

Story 136-15: Sprint status undercounts completed points — ignores archived epics.

The bug: get_sprint_status() only counts stories from load_sprint(), ignoring
stories that have been archived to sprint/archive/sprint-*-completed.yaml.
The metrics command already handles this correctly via get_archived_stories().
"""

from unittest.mock import patch

from pf.sprint.status import format_status, get_sprint_status


def _make_sprint_data(epics=None, standalone_stories=None, stories=None):
    """Build a minimal sprint data dict for testing."""
    data = {
        "sprint": {"name": "Test Sprint", "number": 9999, "status": "active"},
        "epics": epics or [],
    }
    if standalone_stories:
        data["standalone_stories"] = standalone_stories
    if stories:
        data["stories"] = stories
    return data


def _make_epic(epic_id, stories):
    return {"id": epic_id, "title": f"Epic {epic_id}", "stories": stories}


def _make_story(story_id, points, status="backlog"):
    return {"id": story_id, "title": f"Story {story_id}", "points": points, "status": status}


class TestSprintStatusIncludesArchivedStories:
    """get_sprint_status must include archived stories in point and count totals."""

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_completed_points_includes_archived_stories(self, mock_load, mock_info):
        """Archived stories' points must be included in completed_points."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                    _make_story("100-2", 2, "backlog"),
                ]),
            ],
        )

        # Archived stories that were completed and moved to archive
        archived = [
            {"id": "99-1", "points": 5, "status": "done", "title": "Archived A"},
            {"id": "99-2", "points": 3, "status": "done", "title": "Archived B"},
        ]

        with patch("pf.sprint.status.get_archived_stories", return_value=archived):
            result = get_sprint_status()

        # Active done: 3pts. Archived: 5+3=8pts. Total completed: 11pts.
        assert result["completed_points"] == 11

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_total_points_includes_archived_stories(self, mock_load, mock_info):
        """Archived stories' points must be included in total_points."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                    _make_story("100-2", 2, "backlog"),
                ]),
            ],
        )

        archived = [
            {"id": "99-1", "points": 5, "status": "done", "title": "Archived A"},
        ]

        with patch("pf.sprint.status.get_archived_stories", return_value=archived):
            result = get_sprint_status()

        # Active: 3+2=5pts. Archived: 5pts. Total: 10pts.
        assert result["total_points"] == 10

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_completed_count_includes_archived_stories(self, mock_load, mock_info):
        """Archived stories must be counted in the completed story count."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                    _make_story("100-2", 2, "in_progress"),
                ]),
            ],
        )

        archived = [
            {"id": "99-1", "points": 5, "status": "done", "title": "Archived A"},
            {"id": "99-2", "points": 3, "status": "done", "title": "Archived B"},
            {"id": "99-3", "points": 2, "status": "done", "title": "Archived C"},
        ]

        with patch("pf.sprint.status.get_archived_stories", return_value=archived):
            result = get_sprint_status()

        # 1 active done + 3 archived = 4 completed
        assert result["completed"] == 4

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_total_stories_includes_archived_stories(self, mock_load, mock_info):
        """Total story count must include archived stories."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                ]),
            ],
        )

        archived = [
            {"id": "99-1", "points": 5, "status": "done", "title": "Archived A"},
        ]

        with patch("pf.sprint.status.get_archived_stories", return_value=archived):
            result = get_sprint_status()

        # 1 active + 1 archived = 2 total
        assert result["total_stories"] == 2

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_no_archived_stories_still_works(self, mock_load, mock_info):
        """When no archived stories exist, counts should be unchanged."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                    _make_story("100-2", 2, "backlog"),
                ]),
            ],
        )

        with patch("pf.sprint.status.get_archived_stories", return_value=[]):
            result = get_sprint_status()

        assert result["completed_points"] == 3
        assert result["total_points"] == 5
        assert result["completed"] == 1
        assert result["total_stories"] == 2

    @patch("pf.sprint.status.get_sprint_info")
    @patch("pf.sprint.status.load_sprint")
    def test_format_status_shows_correct_points_with_archived(self, mock_load, mock_info):
        """format_status output must reflect archived story points."""
        mock_info.return_value = {"name": "Test Sprint", "number": 9999}
        mock_load.return_value = _make_sprint_data(
            epics=[
                _make_epic("100", [
                    _make_story("100-1", 3, "done"),
                    _make_story("100-2", 2, "backlog"),
                ]),
            ],
        )

        archived = [
            {"id": "99-1", "points": 8, "status": "done", "title": "Archived A"},
        ]

        with patch("pf.sprint.status.get_archived_stories", return_value=archived):
            result = get_sprint_status()

        output = format_status(result)
        # Should show 11/13 (3+8 completed out of 3+2+8 total), not 3/5
        assert "11/13" in output
