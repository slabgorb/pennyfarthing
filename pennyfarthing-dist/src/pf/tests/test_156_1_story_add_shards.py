"""Tests for story 156-1 (Reviewer M1): `story add` on epic-*.yaml shards (gh #10).

Sibling coverage to ``test_156_1_story_update_shards.py``. The 156-1 refactor
routed ``story update`` / ``remove`` / ``move`` through the
``validate_sprint_document`` dispatcher so an epic shard handed in via
``--sprint-file sprint/epic-*.yaml`` validates against the epic-shard schema
rather than the full-sprint schema.

``story add`` was missed: ``add_story`` still called ``validate_full_sprint``
directly, so ``pf sprint story add <EPIC_ID> ... --sprint-file sprint/epic-*.yaml``
against a *raw* epic shard fails with the spurious
``Missing required 'sprint' section`` error — even though the shard is a
perfectly valid epic shard. This module pins the consistency the refactor
promised: add must route through the same dispatcher.

RED on HEAD (before routing through ``validate_sprint_document``); GREEN after.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.sprint.story_add import add_story
from pf.sprint.validator import validate_sprint_document
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — a raw epic shard (no top-level `sprint:` wrapper)
# =============================================================================

# Epic shard — a standalone file with NO top-level `sprint:` wrapper. This is
# exactly the shape that trips the full-sprint validator when handed via
# --sprint-file. ``id`` here is the numeric epic ID (ADR-0022).
SHARD_YAML = """\
id: "156"
type: epic
title: "Sharded sprint YAML CRUD"
priority: p2
status: backlog
repos: pennyfarthing
stories:
  - id: 156-1
    title: "story update fails for stories in epic-*.yaml shards (gh #10)"
    points: 3
    priority: p2
    status: in_progress
    workflow: tdd
"""


@pytest.fixture
def shard_path(tmp_path: Path) -> Path:
    """A raw epic-156.yaml shard file (no current-sprint.yaml index)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    path = sprint_dir / "epic-156.yaml"
    path.write_text(SHARD_YAML)
    return path


def _read_shard_story(shard_path: Path, story_id: str) -> dict:
    """Read a single story directly from a shard file (no index merging)."""
    shard = read_sprint(shard_path)
    for story in shard.get("stories", []):
        if story.get("id") == story_id:
            return story
    raise AssertionError(
        f"Story {story_id} not in shard; "
        f"available ids: {[s.get('id') for s in shard.get('stories', [])]}"
    )


# =============================================================================
# Reviewer M1 — `story add` against a raw epic shard via --sprint-file
# =============================================================================


class TestAddStoryToEpicShard:
    """``add_story`` pointed straight at an epic shard must succeed and persist —
    without spuriously failing validation because the shard has no top-level
    ``sprint:`` section. Mirrors the update-side fix.
    """

    def test_add_succeeds_on_epic_shard(self, shard_path: Path) -> None:
        """M1: adding a story to a raw epic shard succeeds."""
        result = add_story(
            sprint_path=shard_path,
            epic_id="156",
            title="new shard story",
            points=2,
        )
        assert result["success"] is True, (
            "add against an epic shard file must succeed; "
            f"got: {result}"
        )

    def test_no_missing_sprint_section_error(self, shard_path: Path) -> None:
        """M1: the failure must NOT be the spurious 'Missing required sprint section'."""
        result = add_story(
            sprint_path=shard_path,
            epic_id="156",
            title="new shard story",
            points=2,
        )
        assert "Missing required 'sprint' section" not in str(result.get("error", "")), (
            "Epic shards must validate against the epic-shard schema, not the "
            f"full-sprint schema; got: {result.get('error')!r}"
        )

    def test_added_story_persists_to_shard(self, shard_path: Path) -> None:
        """M1: the new story is written back to the shard file on disk."""
        result = add_story(
            sprint_path=shard_path,
            epic_id="156",
            title="new shard story",
            points=2,
        )
        assert result["success"] is True, result

        new_id = result["story_id"]
        story = _read_shard_story(shard_path, new_id)
        assert story["title"] == "new shard story"
        assert story["points"] == 2

    def test_shard_re_validates_clean_after_add(self, shard_path: Path) -> None:
        """M1: after the add, the shard re-validates clean as an epic shard."""
        result = add_story(
            sprint_path=shard_path,
            epic_id="156",
            title="new shard story",
            points=2,
        )
        assert result["success"] is True, result

        reloaded = read_sprint(shard_path)
        revalidation = validate_sprint_document(reloaded)
        assert revalidation.valid, (
            "shard must re-validate clean after add; "
            f"errors: {revalidation.errors}"
        )

    def test_existing_story_untouched_after_add(self, shard_path: Path) -> None:
        """Adding a story must not disturb the pre-existing 156-1."""
        result = add_story(
            sprint_path=shard_path,
            epic_id="156",
            title="new shard story",
            points=2,
        )
        assert result["success"] is True, result

        existing = _read_shard_story(shard_path, "156-1")
        assert existing["status"] == "in_progress"
        assert existing["points"] == 3
