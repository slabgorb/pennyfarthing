"""Tests for pf sprint story split — Story 150-15.

Verifies that `split_story()` decomposes a parent story into child sub-stories
with dependency tracking, point redistribution, and parent status transition.

RED state: Tests will fail until split_story() and story_split_command are
implemented in pf/sprint/story_split.py.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

from pf.sprint.validator import VALID_STORY_STATUSES
from pf.sprint.yaml_io import STORY_KEY_ORDER, read_sprint


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_sprint_yaml(path: Path, data: dict[str, Any]) -> None:
    """Write sprint YAML data to file."""
    yaml = YAML()
    yaml.default_flow_style = False
    with open(path, "w") as f:
        yaml.dump(data, f)


def _minimal_sprint(epic_id: str = "150", story_id: str = "150-5") -> dict:
    """Create a minimal sprint structure with one epic and one story."""
    return {
        "sprint": {"name": "Test Sprint", "number": 2610},
        "epics": [
            {
                "id": f"epic-{epic_id}",
                "jira": f"MSSCI-{epic_id}00",
                "title": "Test Epic",
                "status": "active",
                "stories": [
                    {
                        "id": story_id,
                        "title": "Original big story",
                        "points": 8,
                        "priority": "p1",
                        "status": "backlog",
                        "workflow": "tdd",
                        "repos": "pennyfarthing",
                    },
                ],
            },
        ],
    }


def _sprint_file(tmp_path: Path, data: dict | None = None) -> Path:
    """Write a sprint YAML file and return its path."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(exist_ok=True)
    sprint_path = sprint_dir / "current-sprint.yaml"
    _write_sprint_yaml(sprint_path, data or _minimal_sprint())
    return sprint_path


# ---------------------------------------------------------------------------
# AC1: split_story() function exists and creates sub-stories
# ---------------------------------------------------------------------------


class TestAC1SplitFunctionExists:
    """split_story() must exist and return a result dict."""

    def test_import_split_story(self):
        """split_story must be importable from pf.sprint.story_split."""
        from pf.sprint.story_split import split_story  # noqa: F401

    def test_import_story_split_command(self):
        """story_split_command must be importable for CLI registration."""
        from pf.sprint.story_split import story_split_command  # noqa: F401

    def test_split_returns_result_dict(self, tmp_path: Path):
        """split_story must return {success, ...} result dict."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert isinstance(result, dict)
        assert "success" in result

    def test_split_creates_sub_stories(self, tmp_path: Path):
        """Splitting must create child stories under the same epic."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert result["success"] is True

        # Read back and verify sub-stories exist
        data = read_sprint(sprint_path)
        epic = data["epics"][0]
        stories = epic["stories"]
        # Original + 2 children = 3 stories
        assert len(stories) >= 3

    def test_sub_stories_have_correct_titles(self, tmp_path: Path):
        """Each sub-story must have the title provided in the split plan."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        titles = [s["title"] for s in data["epics"][0]["stories"]]
        assert "Part A" in titles
        assert "Part B" in titles


# ---------------------------------------------------------------------------
# AC2: Sub-story IDs are generated correctly
# ---------------------------------------------------------------------------


class TestAC2SubStoryIds:
    """Sub-stories must get proper sequential IDs under the epic."""

    def test_sub_story_ids_follow_epic_sequence(self, tmp_path: Path):
        """Sub-story IDs must follow the epic's numbering sequence."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert result["success"] is True
        child_ids = result.get("child_ids", [])
        assert len(child_ids) == 2
        # Should be 150-6 and 150-7 (next after 150-5)
        assert child_ids[0] == "150-6"
        assert child_ids[1] == "150-7"

    def test_sub_story_ids_account_for_existing(self, tmp_path: Path):
        """IDs must skip over existing stories in the epic."""
        data = _minimal_sprint()
        # Add another story so the next ID is 150-7
        data["epics"][0]["stories"].append({
            "id": "150-6",
            "title": "Existing story",
            "points": 2,
            "status": "done",
        })
        sprint_path = _sprint_file(tmp_path, data)
        from pf.sprint.story_split import split_story

        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        child_ids = result.get("child_ids", [])
        assert child_ids[0] == "150-7"
        assert child_ids[1] == "150-8"


# ---------------------------------------------------------------------------
# AC3: depends_on linking
# ---------------------------------------------------------------------------


class TestAC3DependsOn:
    """Sub-stories must have depends_on linking to the parent."""

    def test_sub_stories_depend_on_parent(self, tmp_path: Path):
        """Each sub-story must have depends_on pointing to the parent story."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        children = [
            s for s in data["epics"][0]["stories"]
            if s["id"] != "150-5"
        ]
        for child in children:
            assert child.get("depends_on") == "150-5", (
                f"Child {child['id']} missing depends_on: 150-5"
            )

    def test_sub_stories_in_same_epic(self, tmp_path: Path):
        """Sub-stories must be in the same epic as the parent."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        epic_stories = data["epics"][0]["stories"]
        child_ids = [s["id"] for s in epic_stories if s["id"] != "150-5"]
        assert len(child_ids) == 2


# ---------------------------------------------------------------------------
# AC4: Point redistribution
# ---------------------------------------------------------------------------


class TestAC4PointRedistribution:
    """Points must redistribute correctly across sub-stories."""

    def test_points_sum_equals_original(self, tmp_path: Path):
        """Total child points must equal the original story's points."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert result["success"] is True
        data = read_sprint(sprint_path)
        children = [
            s for s in data["epics"][0]["stories"]
            if s["id"] != "150-5"
        ]
        total = sum(s["points"] for s in children)
        assert total == 8  # original was 8 points

    def test_rejects_points_mismatch(self, tmp_path: Path):
        """Split must fail if child points don't sum to original."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 3},
            ],
        )
        # 3 + 3 = 6, but original is 8
        assert result["success"] is False
        assert "points" in result["error"].lower()

    def test_rejects_zero_points_child(self, tmp_path: Path):
        """No child story may have zero points."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 0},
                {"title": "Part B", "points": 8},
            ],
        )
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC5: Parent status transition
# ---------------------------------------------------------------------------


class TestAC5ParentStatusTransition:
    """Parent story must transition to split status with child references."""

    def test_parent_status_becomes_split(self, tmp_path: Path):
        """After split, parent status must be 'split'."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        parent = next(
            s for s in data["epics"][0]["stories"] if s["id"] == "150-5"
        )
        assert parent["status"] == "split"

    def test_parent_has_split_into_field(self, tmp_path: Path):
        """Parent must record which stories it was split into."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        parent = next(
            s for s in data["epics"][0]["stories"] if s["id"] == "150-5"
        )
        split_into = parent.get("split_into")
        assert split_into is not None
        assert set(split_into) == set(result["child_ids"])

    def test_split_status_is_valid(self):
        """'split' must be in VALID_STORY_STATUSES."""
        assert "split" in VALID_STORY_STATUSES


# ---------------------------------------------------------------------------
# AC6: Dry run
# ---------------------------------------------------------------------------


class TestAC6DryRun:
    """--dry-run must preview without making changes."""

    def test_dry_run_returns_success(self, tmp_path: Path):
        """Dry run must succeed and return preview data."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
            dry_run=True,
        )
        assert result["success"] is True
        assert "child_ids" in result

    def test_dry_run_does_not_modify_file(self, tmp_path: Path):
        """Dry run must not change the sprint YAML file."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        original_content = sprint_path.read_text()

        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
            dry_run=True,
        )

        assert sprint_path.read_text() == original_content


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------


class TestErrorCases:
    """Edge cases and error handling."""

    def test_story_not_found(self, tmp_path: Path):
        """Splitting a non-existent story must fail."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="999-99",
            sub_stories=[{"title": "Part A", "points": 3}],
        )
        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_empty_sub_stories_list(self, tmp_path: Path):
        """Must have at least 2 sub-stories to split."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[],
        )
        assert result["success"] is False

    def test_single_sub_story_rejected(self, tmp_path: Path):
        """Splitting into 1 story is pointless — must require at least 2."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[{"title": "Same thing", "points": 8}],
        )
        assert result["success"] is False

    def test_cannot_split_done_story(self, tmp_path: Path):
        """Cannot split a story that's already done."""
        from pf.sprint.story_split import split_story

        data = _minimal_sprint()
        data["epics"][0]["stories"][0]["status"] = "done"
        sprint_path = _sprint_file(tmp_path, data)

        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert result["success"] is False

    def test_cannot_split_already_split_story(self, tmp_path: Path):
        """Cannot split a story that's already been split."""
        from pf.sprint.story_split import split_story

        data = _minimal_sprint()
        data["epics"][0]["stories"][0]["status"] = "split"
        sprint_path = _sprint_file(tmp_path, data)

        result = split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        assert result["success"] is False

    def test_sub_story_inherits_parent_fields(self, tmp_path: Path):
        """Sub-stories should inherit repos and workflow from parent."""
        from pf.sprint.story_split import split_story

        sprint_path = _sprint_file(tmp_path)
        split_story(
            sprint_path=sprint_path,
            story_id="150-5",
            sub_stories=[
                {"title": "Part A", "points": 3},
                {"title": "Part B", "points": 5},
            ],
        )
        data = read_sprint(sprint_path)
        children = [
            s for s in data["epics"][0]["stories"]
            if s["id"] != "150-5"
        ]
        for child in children:
            assert child.get("repos") == "pennyfarthing"
            assert child.get("workflow") == "tdd"
            assert child.get("status") == "backlog"
