"""Tests for sprint/ library package.

Story 63-9: Reorganize pennyfarthing_scripts into fan-out CLI pattern.

These tests verify the sprint/ package modules work correctly
after reorganization from flat modules.
"""

from pathlib import Path
from unittest.mock import patch


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
        from pennyfarthing_scripts.common.config import get_project_root
        from pennyfarthing_scripts.sprint.loader import load_sprint

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


class TestShardedSprint:
    """Tests for sharded per-epic sprint format."""

    def _create_sharded_sprint(self, tmp_path: Path) -> Path:
        """Create a sharded sprint structure in tmp_path."""
        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()

        # Index file with string refs
        index = """\
sprint:
  name: TO Sprint 2606
  jira_sprint_id: 309
  jira_sprint_name: TO Sprint 2606
  goal: Test sharding
  start_date: 2026-02-02
  end_date: 2026-02-15
  status: active
  number: 2606
epics:
  - MSSCI-14298
  - epic-40
stories: []
"""
        (sprint_dir / "current-sprint.yaml").write_text(index)

        # Shard file 1: Jira-style ID
        (sprint_dir / "epic-MSSCI-14298.yaml").write_text("""\
id: MSSCI-14298
type: epic
title: 'Epic: Stepped Workflow'
priority: P1
status: in_progress
stories:
  - id: MSSCI-14299
    title: Wire up stepped workflow
    points: 5
    priority: P0
    status: done
""")

        # Shard file 2: internal ID
        (sprint_dir / "epic-epic-40.yaml").write_text("""\
id: epic-40
type: epic
title: 'Epic: Scale Adaptation'
priority: P2
status: backlog
stories:
  - id: 40-1
    title: First story
    points: 3
    priority: P1
    status: backlog
  - id: 40-2
    title: Second story
    points: 2
    priority: P1
    status: ready
""")
        return tmp_path

    def test_load_sprint_merges_shards(self, tmp_path: Path) -> None:
        """load_sprint should merge sharded epic files into full dicts."""
        from pennyfarthing_scripts.sprint.loader import load_sprint

        root = self._create_sharded_sprint(tmp_path)
        data = load_sprint(project_root=root)

        assert data is not None
        assert len(data["epics"]) == 2
        assert isinstance(data["epics"][0], dict)
        assert data["epics"][0]["id"] == "MSSCI-14298"
        assert data["epics"][1]["id"] == "epic-40"

    def test_load_sprint_merges_stories(self, tmp_path: Path) -> None:
        """Merged epics should contain their stories."""
        from pennyfarthing_scripts.sprint.loader import load_sprint

        root = self._create_sharded_sprint(tmp_path)
        data = load_sprint(project_root=root)

        assert len(data["epics"][0]["stories"]) == 1
        assert len(data["epics"][1]["stories"]) == 2
        assert data["epics"][1]["stories"][0]["id"] == "40-1"

    def test_load_sprint_non_sharded_unchanged(self, tmp_path: Path) -> None:
        """load_sprint should pass through non-sharded data unchanged."""
        from pennyfarthing_scripts.sprint.loader import load_sprint

        sprint_dir = tmp_path / "sprint"
        sprint_dir.mkdir()
        (sprint_dir / "current-sprint.yaml").write_text("""\
sprint:
  name: Test
  jira_sprint_id: 1
  jira_sprint_name: Test
  goal: Test
  start_date: 2026-01-01
  end_date: 2026-01-15
  status: active
  number: 1
epics:
  - id: epic-1
    title: Inline Epic
    stories:
      - id: 1-1
        title: Story
        points: 1
        status: backlog
""")
        data = load_sprint(project_root=tmp_path)

        assert data is not None
        assert isinstance(data["epics"][0], dict)
        assert data["epics"][0]["id"] == "epic-1"

    def test_get_all_stories_with_shards(self, tmp_path: Path) -> None:
        """get_all_stories should return stories from merged shards."""
        from pennyfarthing_scripts.sprint.loader import get_all_stories

        root = self._create_sharded_sprint(tmp_path)

        with patch("pennyfarthing_scripts.sprint.loader.get_project_root", return_value=root):
            stories = get_all_stories()

        assert len(stories) == 3
        ids = {s["id"] for s in stories}
        assert "MSSCI-14299" in ids
        assert "40-1" in ids
        assert "40-2" in ids

    def test_find_epic_with_jira_id(self, tmp_path: Path) -> None:
        """find_epic should work with Jira-style epic IDs after merge."""
        from pennyfarthing_scripts.sprint.loader import find_epic, load_sprint

        root = self._create_sharded_sprint(tmp_path)
        data = load_sprint(project_root=root)

        epic = find_epic(data, "MSSCI-14298")
        assert epic is not None
        assert epic["title"] == "Epic: Stepped Workflow"

    def test_backlog_count_with_shards(self, tmp_path: Path) -> None:
        """get_backlog_count should count stories from merged shards."""
        from pennyfarthing_scripts.prime.workflow import get_backlog_count

        root = self._create_sharded_sprint(tmp_path)
        count = get_backlog_count(root)

        # 40-1 is backlog, 40-2 is ready -> 2 stories
        assert count == 2

    def test_backlog_count_defensive_on_strings(self) -> None:
        """get_backlog_count should not crash on string epics."""
        from pennyfarthing_scripts.prime.workflow import get_backlog_count

        fake_data = {"epics": ["MSSCI-14298", "MSSCI-14317"]}
        with patch("pennyfarthing_scripts.sprint.loader.load_sprint", return_value=fake_data):
            count = get_backlog_count(Path("/fake"))

        assert count == 0


class TestSprintArchive:
    """Tests for sprint/archive.py module."""

    def test_archive_story_validates_story(self) -> None:
        """archive_story should validate story exists."""
        from pennyfarthing_scripts.sprint.archive import archive_story

        result = archive_story("nonexistent-99", dry_run=True)

        assert isinstance(result, dict)
        # Should fail for nonexistent story
        assert result.get("success") is False or "error" in result
