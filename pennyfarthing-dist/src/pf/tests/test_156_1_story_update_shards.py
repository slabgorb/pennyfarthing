"""Tests for story 156-1: `story update` on epic-*.yaml shards (gh #10).

Story: 156-1 — ``pf sprint story update <ID>`` must work for stories that
live in a ``sprint/epic-*.yaml`` shard, including when the shard file itself
is handed to the command via ``--sprint-file``.

Two distinct failure modes from gh #10:

1. **Lookup gap** — ``story update`` only resolved stories through
   ``current-sprint.yaml``. (Largely fixed by 151-3 for *indexed* shards:
   the index references the shard, ``read_sprint`` merges it, and the
   mutation persists. Pinned here as a regression guard — AC3.)

2. **Validator mismatch (the live bug)** — when the command is pointed
   straight at an epic shard via ``--sprint-file sprint/epic-156.yaml``,
   ``read_sprint`` returns the *raw* epic shard (``{id, type, stories}``)
   which has no top-level ``sprint:`` wrapper. ``update_story`` then runs
   ``validate_full_sprint`` against it, which rejects it with
   ``Missing required 'sprint' section`` and the update fails even though
   the shard is perfectly valid as an epic shard.

The fix (Dev's job, GREEN phase) must route post-update validation to the
epic-shard schema when the loaded document is an epic shard, not the full
sprint schema.

RED phase: these tests describe the correct behavior. The ``ViaSprintFile``
and round-trip cases fail on HEAD with the validator-mismatch error; the
``ViaIndex`` regression guards already pass (151-3) and must keep passing.

Constraint: function-level API is preferred (precise failures); a couple of
Click-runner cases pin the end-to-end CLI surface.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.loader import find_story_in_data
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — a minimal sharded sprint: index + one epic shard (no sprint wrapper)
# =============================================================================

# Index references the epic shard by string ref (sharded format).
INDEX_YAML = """\
sprint:
  name: "Sharded156-1"
  goal: shard update coverage
  start_date: 2026-06-01
  end_date: 2026-06-14
  status: active
  number: 1
epics:
  - "156"
stories:
  - id: TOP-1
    title: top-level current-sprint story
    points: 1
    priority: p2
    status: in_progress
    workflow: trivial
"""

# Epic shard — a standalone file with NO top-level `sprint:` wrapper. This is
# exactly the shape that trips the validator when handed via --sprint-file.
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
  - id: 156-2
    title: sibling shard story used for no-collateral-damage checks
    points: 2
    priority: p2
    status: backlog
    workflow: tdd
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sprint dir with a current-sprint.yaml index + one epic-156.yaml shard."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-156.yaml").write_text(SHARD_YAML)
    return sprint_dir


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# Helpers
# =============================================================================


def _read_shard_story(sprint_dir: Path, shard_filename: str, story_id: str) -> dict:
    """Read a single story directly from a shard file (no index merging)."""
    shard = read_sprint(sprint_dir / shard_filename)
    for story in shard.get("stories", []):
        if story.get("id") == story_id:
            return story
    raise AssertionError(
        f"Story {story_id} not in shard {shard_filename}; "
        f"available ids: {[s.get('id') for s in shard.get('stories', [])]}"
    )


# =============================================================================
# AC1 + AC2 — `--sprint-file <epic>.yaml` direct path (THE live bug, RED)
# =============================================================================


class TestUpdateViaSprintFileEpicShard:
    """``update_story`` pointed straight at an epic shard via ``--sprint-file``
    must succeed and persist — without spuriously failing validation because
    the shard has no top-level ``sprint:`` section.
    """

    def test_status_update_succeeds_on_epic_shard(self, sharded_sprint_dir: Path) -> None:
        """AC1: status update on a shard story (shard file as sprint_path) succeeds."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert result["success"] is True, (
            "update against an epic shard file must succeed; "
            f"got: {result}"
        )

    def test_no_missing_sprint_section_error(self, sharded_sprint_dir: Path) -> None:
        """AC2: the failure must NOT be the spurious 'Missing required sprint section'.

        Pins the exact validator-mismatch bug from gh #10. Even if the call
        fails for some other reason later, it must never fail *this* way.
        """
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert "Missing required 'sprint' section" not in str(result.get("error", "")), (
            "Epic shards must validate against the epic-shard schema, not the "
            f"full-sprint schema; got: {result.get('error')!r}"
        )

    def test_status_update_persists_to_shard(self, sharded_sprint_dir: Path) -> None:
        """AC2: the new value must be written back to the shard file on disk."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-156.yaml", "156-1")
        assert story["status"] == "in_review"

    def test_points_update_persists_to_shard(self, sharded_sprint_dir: Path) -> None:
        """AC1: a non-status field (points) also persists via the shard path."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            points=8,
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-156.yaml", "156-1")
        assert story["points"] == 8
        assert isinstance(story["points"], int)

    def test_sibling_story_untouched_on_epic_shard(self, sharded_sprint_dir: Path) -> None:
        """Updating 156-1 via the shard path must not disturb 156-2."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert result["success"] is True, result

        sibling = _read_shard_story(sharded_sprint_dir, "epic-156.yaml", "156-2")
        assert sibling["status"] == "backlog"
        assert sibling["points"] == 2

    def test_cli_update_via_sprint_file_epic_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """AC1/AC2 end-to-end: `pf sprint story update --sprint-file epic-156.yaml`."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "epic-156.yaml"),
                "156-1",
                "--status",
                "in_review",
            ],
        )
        assert result.exit_code == 0, (
            f"CLI update against an epic shard must exit 0; output: {result.output}"
        )

        story = _read_shard_story(sharded_sprint_dir, "epic-156.yaml", "156-1")
        assert story["status"] == "in_review"


# =============================================================================
# AC4 — round-trip: the merged view (what `story show` reads) reflects the update
# =============================================================================


class TestRoundTripReflectsUpdate:
    """After updating a shard story, the merged sprint view that consumers
    like ``story show`` read (``read_sprint(index)`` → ``find_story_in_data``)
    must reflect the new value.
    """

    def test_merged_view_reflects_shard_update(self, sharded_sprint_dir: Path) -> None:
        """AC4: update via the shard file, then read through the index merge."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "epic-156.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert result["success"] is True, result

        merged = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        _epic, story, _loc = find_story_in_data(merged, "156-1")
        assert story is not None, "merged view must still resolve 156-1"
        assert story["status"] == "in_review", (
            "the merged sprint view (story show's source) must reflect the "
            f"shard update; got status={story.get('status')!r}"
        )


# =============================================================================
# AC3 — regression guards: the indexed-shard path (151-3) must keep working
# =============================================================================


class TestUpdateViaIndexRegressionGuard:
    """A story whose content lives only in the shard, updated through the
    ``current-sprint.yaml`` index with NO ``--sprint-file``, must continue to
    work and persist to the shard. These already pass on HEAD (151-3); they
    guard against the 156-1 fix regressing the indexed path.
    """

    def test_indexed_shard_story_update_persists(self, sharded_sprint_dir: Path) -> None:
        """Indexed-shard update (sprint_path = index) persists to the shard."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="156-1",
            status="in_review",
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-156.yaml", "156-1")
        assert story["status"] == "in_review"

    def test_top_level_current_sprint_story_still_updates(
        self, sharded_sprint_dir: Path
    ) -> None:
        """A plain top-level current-sprint story must still update cleanly."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="TOP-1",
            points=5,
        )
        assert result["success"] is True, result

        index = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        story = next(s for s in index["stories"] if s["id"] == "TOP-1")
        assert story["points"] == 5
