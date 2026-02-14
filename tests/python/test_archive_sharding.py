"""
Tests for archive sharding (Story td-4).

The completed archive should follow the same index+shard pattern as the
active sprint. These tests verify:
  - Migration extracts inlined stories into per-epic shard files
  - Total story count is preserved through migration
  - Index retains only epic refs and orphan stories after migration
  - Archive loader merges shards back for reading
  - archive_epic() writes to shards, not inline

Run with: python -m pytest tests/python/test_archive_sharding.py -v
"""

from pathlib import Path
from typing import Any

import pytest

from pennyfarthing_scripts.sprint.archive_epic import (
    _load_archive_file,
    _write_archive_file,
    load_archive,
    migrate_completed_archive,
)
from pennyfarthing_scripts.sprint.yaml_io import _make_yaml, _read_yaml_file


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _write_yaml(path: Path, data: Any) -> None:
    """Helper: write a YAML file."""
    yml = _make_yaml()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        yml.dump(data, f)


def _make_archive_monolith(archive_dir: Path) -> Path:
    """Create a monolithic completed archive file with inlined stories.

    Returns the archive file path.
    """
    archive_file = archive_dir / "sprint-2606-completed.yaml"
    data = {
        "sprint": {
            "name": "TO Sprint 2606",
            "number": 2606,
            "jira_sprint_id": 309,
            "jira_sprint_name": "TO Sprint 2606",
            "goal": "Test sprint",
            "start_date": "2026-02-02",
            "end_date": "2026-02-15",
            "status": "active",
        },
        "completed_epics": [
            "MSSCI-14465",  # epic-83
            "MSSCI-14784",  # epic-87
        ],
        "completed_stories": [
            # Epic 83 stories (should go to shard)
            {"id": "83-1", "epic": "MSSCI-14465", "title": "Python complexity module", "points": 2, "completed": "2026-02-08"},
            {"id": "83-2", "epic": "MSSCI-14465", "title": "Python dependencies module", "points": 2, "completed": "2026-02-08"},
            {"id": "83-3", "epic": "MSSCI-14465", "title": "APIs + hooks + dialogs", "points": 2, "completed": "2026-02-09"},
            # Epic 87 stories (should go to shard)
            {"id": "87-1", "epic": "MSSCI-14784", "title": "Extend repos.yaml schema", "points": 2, "completed": "2026-02-11"},
            {"id": "87-2", "epic": "MSSCI-14784", "title": "Wire topology into prime", "points": 2, "completed": "2026-02-11"},
            # Orphan story (no matching epic ref — stays in index)
            {"id": "MSSCI-14394", "title": "Subagent spans never clear", "points": 2, "completed": "2026-02-06"},
            # Another orphan (technical debt, no epic ref)
            {"id": "td-3", "title": "BikeRack panel state persistence", "points": 2, "completed": "2026-02-12"},
        ],
    }
    _write_archive_file(archive_file, data)
    return archive_file


# ---------------------------------------------------------------------------
# AC1: Archive index uses same structure as current-sprint.yaml
# ---------------------------------------------------------------------------

class TestMigrationProducesIndexFormat:
    """After migration, the archive index should contain only epic refs
    and orphan stories — no inlined epic stories."""

    def test_index_has_only_epic_refs(self, tmp_path: Path) -> None:
        """completed_epics should be string refs, not dicts with stories."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        data = _load_archive_file(archive_file)
        for ref in data["completed_epics"]:
            assert isinstance(ref, str), f"Epic ref should be string, got {type(ref)}: {ref}"

    def test_index_completed_stories_has_only_orphans(self, tmp_path: Path) -> None:
        """After migration, completed_stories should only contain stories
        that don't belong to any completed epic."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        data = _load_archive_file(archive_file)
        epic_refs = set(data["completed_epics"])
        for story in data["completed_stories"]:
            epic = story.get("epic", "")
            assert epic not in epic_refs, (
                f"Story {story['id']} belongs to epic {epic} but is still inlined"
            )

    def test_orphan_stories_preserved_in_index(self, tmp_path: Path) -> None:
        """Stories without a matching epic ref stay in completed_stories."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        data = _load_archive_file(archive_file)
        orphan_ids = {s["id"] for s in data["completed_stories"]}
        assert "MSSCI-14394" in orphan_ids, "Orphan MSSCI-14394 should remain in index"
        assert "td-3" in orphan_ids, "Orphan td-3 should remain in index"


# ---------------------------------------------------------------------------
# AC2: Completed epics stored in sprint/archive/epic-{ref}.yaml
# ---------------------------------------------------------------------------

class TestMigrationCreatesShardsPerEpic:
    """Migration should write per-epic shard files in the archive directory."""

    def test_shard_files_created(self, tmp_path: Path) -> None:
        """Each epic in completed_epics should get a shard file."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        assert (archive_dir / "epic-MSSCI-14465.yaml").exists(), "Missing shard for MSSCI-14465"
        assert (archive_dir / "epic-MSSCI-14784.yaml").exists(), "Missing shard for MSSCI-14784"

    def test_shard_contains_correct_stories(self, tmp_path: Path) -> None:
        """Each shard should contain exactly the stories for that epic."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        shard_83 = _read_yaml_file(archive_dir / "epic-MSSCI-14465.yaml")
        story_ids = {s["id"] for s in shard_83["stories"]}
        assert story_ids == {"83-1", "83-2", "83-3"}, f"Wrong stories in epic-83 shard: {story_ids}"

        shard_87 = _read_yaml_file(archive_dir / "epic-MSSCI-14784.yaml")
        story_ids = {s["id"] for s in shard_87["stories"]}
        assert story_ids == {"87-1", "87-2"}, f"Wrong stories in epic-87 shard: {story_ids}"

    def test_shard_has_epic_metadata(self, tmp_path: Path) -> None:
        """Shard files should have status: done and the epic ref."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        shard = _read_yaml_file(archive_dir / "epic-MSSCI-14465.yaml")
        assert shard.get("jira") == "MSSCI-14465" or shard.get("id") is not None
        assert shard.get("status") == "done"

    def test_existing_shard_is_not_overwritten(self, tmp_path: Path) -> None:
        """If an epic shard already exists in archive, migration merges
        stories rather than clobbering the file."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)

        # Pre-existing shard with one story already
        existing_shard = {
            "jira": "MSSCI-14465",
            "status": "done",
            "stories": [
                {"id": "83-0", "title": "Pre-existing story", "points": 1},
            ],
        }
        _write_yaml(archive_dir / "epic-MSSCI-14465.yaml", existing_shard)

        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        shard = _read_yaml_file(archive_dir / "epic-MSSCI-14465.yaml")
        story_ids = {s["id"] for s in shard["stories"]}
        assert "83-0" in story_ids, "Pre-existing story lost during migration"
        assert "83-1" in story_ids, "Migrated story missing"


# ---------------------------------------------------------------------------
# AC3: No data duplication between active sprint and archive
# (Tested structurally — archive uses refs, not copies)
# ---------------------------------------------------------------------------

class TestNoDuplication:
    """The archive index should not contain story data that also exists
    in shard files."""

    def test_migrated_stories_removed_from_index(self, tmp_path: Path) -> None:
        """Stories moved to shards must not remain in completed_stories."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        data = _load_archive_file(archive_file)
        index_ids = {s["id"] for s in data["completed_stories"]}
        assert "83-1" not in index_ids, "83-1 still in index after migration"
        assert "87-1" not in index_ids, "87-1 still in index after migration"


# ---------------------------------------------------------------------------
# AC4: All existing completed stories preserved after refactor
# ---------------------------------------------------------------------------

class TestMigrationPreservesAllStories:
    """Total story count across index + shards must match original."""

    def test_total_story_count_preserved(self, tmp_path: Path) -> None:
        """Sum of stories in shards + orphans in index == original total."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        # Count stories before migration
        pre_data = _load_archive_file(archive_file)
        pre_count = len(pre_data["completed_stories"])
        assert pre_count == 7, f"Fixture should have 7 stories, got {pre_count}"

        migrate_completed_archive(archive_file)

        # Count stories after: load_archive merges shards + orphans
        post_data = load_archive(archive_file)
        post_count = len(post_data["completed_stories"])
        assert post_count == pre_count, (
            f"Story count changed: {pre_count} before, {post_count} after"
        )

    def test_story_data_fields_preserved(self, tmp_path: Path) -> None:
        """Individual story fields (title, points, completed) survive migration."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)

        shard = _read_yaml_file(archive_dir / "epic-MSSCI-14465.yaml")
        story_83_1 = next(s for s in shard["stories"] if s["id"] == "83-1")
        assert story_83_1["title"] == "Python complexity module"
        assert story_83_1["points"] == 2
        assert story_83_1["completed"] == "2026-02-08"


# ---------------------------------------------------------------------------
# AC5: Archive loader merges shards for reading
# ---------------------------------------------------------------------------

class TestLoadArchiveMergesShards:
    """load_archive() should read index + shard files and return a unified view."""

    def test_load_returns_all_stories(self, tmp_path: Path) -> None:
        """Merged view includes stories from shards AND orphans."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)
        migrate_completed_archive(archive_file)

        merged = load_archive(archive_file)
        story_ids = {s["id"] for s in merged["completed_stories"]}
        # All 7 stories should be present
        assert "83-1" in story_ids
        assert "87-1" in story_ids
        assert "MSSCI-14394" in story_ids
        assert "td-3" in story_ids

    def test_load_includes_sprint_metadata(self, tmp_path: Path) -> None:
        """Sprint header fields should survive the round-trip."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)
        migrate_completed_archive(archive_file)

        merged = load_archive(archive_file)
        assert merged["sprint"]["name"] == "TO Sprint 2606"
        assert merged["sprint"]["number"] == 2606

    def test_load_without_shards_still_works(self, tmp_path: Path) -> None:
        """Loading a pre-migration monolith should still return all stories."""
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        # Load WITHOUT migrating first
        merged = load_archive(archive_file)
        assert len(merged["completed_stories"]) == 7


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

class TestMigrationIdempotent:
    """Running migration twice should not duplicate or lose data."""

    def test_double_migration_same_result(self, tmp_path: Path) -> None:
        archive_dir = tmp_path / "sprint" / "archive"
        archive_dir.mkdir(parents=True)
        archive_file = _make_archive_monolith(archive_dir)

        migrate_completed_archive(archive_file)
        first = load_archive(archive_file)
        first_count = len(first["completed_stories"])

        migrate_completed_archive(archive_file)
        second = load_archive(archive_file)
        second_count = len(second["completed_stories"])

        assert first_count == second_count, (
            f"Idempotency failed: {first_count} after first, {second_count} after second"
        )
