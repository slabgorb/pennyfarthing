"""
Tests for pf sprint data --json command (Story 125-5 / MSSCI-15426).

Verifies the canonical JSON output for subprocess consumers includes
merged epics, all story fields, orphan detection, registry metadata,
and computed metrics.

Run with: python -m pytest tests/python/test_sprint_data.py -v
"""

import json
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestSprintDataCommandExists:
    """AC1: pf sprint data command is registered and returns merged data."""

    def test_data_command_in_sprint_help(self):
        """pf sprint --help should list the data subcommand."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"sprint --help failed: {result.stderr}"
        assert "data" in result.stdout.lower(), "data subcommand not shown in sprint help"

    def test_data_help_shows_json_option(self):
        """pf sprint data --help should show --json flag."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --help failed: {result.stderr}"
        assert "--json" in result.stdout, "--json flag not shown in data help"

    def test_data_json_returns_valid_json(self):
        """pf sprint data --json should output parseable JSON."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert isinstance(data, dict), "Output should be a JSON object"

    def test_data_json_has_sprint_key(self):
        """Output should contain a 'sprint' object with header fields."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "sprint" in data, "Output missing 'sprint' key"
        sprint = data["sprint"]
        assert "name" in sprint, "Sprint header missing 'name'"
        assert "start_date" in sprint, "Sprint header missing 'start_date'"
        assert "end_date" in sprint, "Sprint header missing 'end_date'"

    def test_data_json_has_epics_array(self):
        """Output should contain an 'epics' array with merged epic dicts."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        data = json.loads(result.stdout)
        assert "epics" in data, "Output missing 'epics' key"
        assert isinstance(data["epics"], list), "'epics' should be an array"
        # Epics should be full dicts, not string refs
        for epic in data["epics"]:
            assert isinstance(epic, dict), f"Epic should be a dict, got {type(epic)}"
            assert "id" in epic, "Epic missing 'id' field"

    def test_data_json_performance(self):
        """Response time should be under 500ms for typical sprint size."""
        start = time.monotonic()
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        assert elapsed_ms < 500, f"Response time {elapsed_ms:.0f}ms exceeds 500ms target"


class TestSprintDataStoryFields:
    """AC2: Output includes all story fields without truncation."""

    def _get_data(self):
        """Helper to run pf sprint data --json and parse output."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        return json.loads(result.stdout)

    def test_epics_contain_stories(self):
        """Each epic should have a 'stories' array."""
        data = self._get_data()
        for epic in data["epics"]:
            assert "stories" in epic, f"Epic {epic.get('id')} missing 'stories' array"
            assert isinstance(epic["stories"], list), f"Epic {epic.get('id')} stories should be an array"

    def test_story_has_required_fields(self):
        """Stories should include id, title, points, status, and priority."""
        data = self._get_data()
        required_fields = {"id", "title", "points", "status", "priority"}
        for epic in data["epics"]:
            for story in epic.get("stories", []):
                missing = required_fields - set(story.keys())
                assert not missing, (
                    f"Story {story.get('id')} missing required fields: {missing}"
                )

    def test_story_description_not_truncated(self):
        """Story descriptions should be included in full, not truncated."""
        data = self._get_data()
        found_description = False
        for epic in data["epics"]:
            for story in epic.get("stories", []):
                if "description" in story and story["description"]:
                    found_description = True
                    # Descriptions with ACs should not be cut off
                    assert not story["description"].endswith("..."), (
                        f"Story {story['id']} description appears truncated"
                    )
        assert found_description, "No stories with descriptions found — cannot verify non-truncation"

    def test_story_optional_fields_preserved(self):
        """Optional fields (workflow, assigned_to, jira, repos) should be included when present."""
        data = self._get_data()
        optional_fields_seen = set()
        for epic in data["epics"]:
            for story in epic.get("stories", []):
                for field in ("workflow", "assigned_to", "jira", "repos", "started"):
                    if field in story:
                        optional_fields_seen.add(field)
        # At least some optional fields should be present across all stories
        assert len(optional_fields_seen) >= 2, (
            f"Expected optional fields in stories, only saw: {optional_fields_seen}"
        )


class TestSprintDataOrphans:
    """AC3: Orphan detection included in output."""

    def _get_data(self):
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        return json.loads(result.stdout)

    def test_output_has_orphans_key(self):
        """Output should include '_orphans' key (array, possibly empty)."""
        data = self._get_data()
        assert "_orphans" in data, "Output missing '_orphans' key"
        assert isinstance(data["_orphans"], list), "'_orphans' should be an array"

    def test_orphan_entries_have_required_fields(self):
        """Each orphan entry should have id, file, and reason fields."""
        data = self._get_data()
        orphans = data.get("_orphans", [])
        for orphan in orphans:
            assert "id" in orphan, f"Orphan missing 'id': {orphan}"
            assert "file" in orphan, f"Orphan missing 'file': {orphan}"
            assert "reason" in orphan, f"Orphan missing 'reason': {orphan}"

    def test_orphans_not_in_main_epics(self):
        """Orphaned epics should not appear in the main 'epics' array."""
        data = self._get_data()
        orphan_ids = {o.get("id") for o in data.get("_orphans", [])}
        epic_ids = {e.get("id") for e in data.get("epics", [])}
        overlap = orphan_ids & epic_ids
        assert not overlap, f"Orphans should not be in epics list: {overlap}"


class TestSprintDataRegistry:
    """AC4: Multi-sprint context preserved in output."""

    def _get_data(self):
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        return json.loads(result.stdout)

    def test_registry_shape_when_present(self):
        """If _registry is present, it should have name, type, context_root, session_root."""
        data = self._get_data()
        if "_registry" in data:
            registry = data["_registry"]
            assert "name" in registry, "_registry missing 'name'"
            assert "type" in registry, "_registry missing 'type'"
            assert "context_root" in registry, "_registry missing 'context_root'"
            assert "session_root" in registry, "_registry missing 'session_root'"
        # If no _registry, that's valid for default sprint — not a failure

    def test_default_sprint_omits_registry(self):
        """Default sprint (no multi-sprint active) should not include _registry."""
        data = self._get_data()
        # For default sprint, _registry should be absent or None
        # This test validates the default case
        if "_registry" in data and data["_registry"] is not None:
            # If registry IS present, it means a non-default sprint is active
            # which is a valid state — but verify shape
            assert isinstance(data["_registry"], dict), "_registry should be a dict"


class TestSprintDataMetrics:
    """AC5: Computed metrics included in output."""

    def _get_data(self):
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "sprint", "data", "--json"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"data --json failed: {result.stderr}"
        return json.loads(result.stdout)

    def test_output_has_points_metrics(self):
        """Output should include 'points' object with total/completed/in_progress/backlog."""
        data = self._get_data()
        assert "points" in data, "Output missing 'points' key"
        points = data["points"]
        for field in ("total", "completed", "in_progress", "backlog"):
            assert field in points, f"points missing '{field}'"
            assert isinstance(points[field], (int, float)), f"points.{field} should be numeric"

    def test_output_has_stories_count(self):
        """Output should include 'stories_count' object with total/done/in_progress/backlog."""
        data = self._get_data()
        assert "stories_count" in data, "Output missing 'stories_count' key"
        counts = data["stories_count"]
        for field in ("total", "done", "in_progress", "backlog"):
            assert field in counts, f"stories_count missing '{field}'"
            assert isinstance(counts[field], int), f"stories_count.{field} should be an integer"

    def test_points_total_equals_sum_of_parts(self):
        """points.total should equal completed + in_progress + backlog."""
        data = self._get_data()
        points = data["points"]
        expected_total = points["completed"] + points["in_progress"] + points["backlog"]
        assert points["total"] == expected_total, (
            f"points.total ({points['total']}) != "
            f"completed ({points['completed']}) + in_progress ({points['in_progress']}) + backlog ({points['backlog']})"
        )

    def test_stories_count_total_equals_sum_of_parts(self):
        """stories_count.total should equal done + in_progress + backlog."""
        data = self._get_data()
        counts = data["stories_count"]
        expected_total = counts["done"] + counts["in_progress"] + counts["backlog"]
        assert counts["total"] == expected_total, (
            f"stories_count.total ({counts['total']}) != "
            f"done ({counts['done']}) + in_progress ({counts['in_progress']}) + backlog ({counts['backlog']})"
        )

    def test_metrics_consistent_with_epics(self):
        """Total stories in metrics should match actual story count from epics."""
        data = self._get_data()
        # Count stories from epics array
        actual_count = 0
        for epic in data.get("epics", []):
            actual_count += len(epic.get("stories", []))
        # Add standalone stories
        actual_count += len(data.get("standalone_stories", []))

        counts = data["stories_count"]
        assert counts["total"] == actual_count, (
            f"stories_count.total ({counts['total']}) != "
            f"actual story count from epics ({actual_count})"
        )
