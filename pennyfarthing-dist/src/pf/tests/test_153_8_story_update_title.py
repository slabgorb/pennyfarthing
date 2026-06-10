"""Tests for story 153-8 item 1: ``pf sprint story update <id> --title <new>``.

Story: 153-8 (DX bundle) — the story title is currently *not* updatable via
the ``story update`` CLI/API. Every other scalar field (status, points,
priority, workflow, description, …) is, but ``title`` has no parameter and no
``--title`` flag. This forces hand-editing the sharded YAML, which the project
rules forbid ("Never edit sprint YAML directly — use pf sprint story commands").

RED phase: these tests describe the intended behavior. They fail on HEAD
because ``update_story`` has no ``title`` keyword (TypeError) and the Click
command has no ``--title`` option (exit 2 / "No such option").

The fix (Dev, GREEN) adds a ``title`` keyword to ``update_story`` that sets
``story["title"]`` and re-validates, plus a ``--title`` Click option wired
through. Because ``title`` is a REQUIRED, validated story field
(see validator.REQUIRED_STORY_FIELDS / REQUIRED_SHARD_STORY_FIELDS), the write
must go through the shard-aware loader/writer so the new title persists to the
correct epic-*.yaml shard, exactly like status/points already do.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.loader import find_story_in_data
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint: current-sprint.yaml index + one epic-153.yaml shard
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Sharded153-8"
  goal: title update coverage
  start_date: 2026-06-01
  end_date: 2026-06-14
  status: active
  number: 1
epics:
  - "153"
"""

SHARD_YAML = """\
id: "153"
type: epic
title: "DX bundle epic"
priority: p3
status: backlog
repos: pennyfarthing
stories:
  - id: 153-8
    title: "old title — should be replaced"
    points: 3
    priority: p3
    status: in_progress
    workflow: tdd
  - id: 153-9
    title: "sibling story untouched"
    points: 2
    priority: p3
    status: backlog
    workflow: tdd
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sprint dir with a current-sprint.yaml index + one epic-153.yaml shard."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-153.yaml").write_text(SHARD_YAML)
    return sprint_dir


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


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
# AC1 — function-level: update_story(..., title=...) sets and persists the title
# =============================================================================


class TestUpdateTitleFunction:
    """``update_story`` must accept a ``title`` keyword that overwrites the
    story's title and persists it through the shard-aware write path.
    """

    def test_title_update_succeeds(self, sharded_sprint_dir: Path) -> None:
        """AC1: passing title= returns success."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            title="brand new title",
        )
        assert result["success"] is True, f"title update must succeed; got: {result}"

    def test_title_update_persists_to_shard(self, sharded_sprint_dir: Path) -> None:
        """AC1: the new title is written back to the epic shard on disk."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            title="brand new title",
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-153.yaml", "153-8")
        assert story["title"] == "brand new title"

    def test_title_update_does_not_disturb_other_fields(
        self, sharded_sprint_dir: Path
    ) -> None:
        """AC1: updating only the title leaves status/points/workflow intact."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            title="brand new title",
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-153.yaml", "153-8")
        assert story["status"] == "in_progress"
        assert story["points"] == 3
        assert story["workflow"] == "tdd"

    def test_title_update_leaves_sibling_untouched(self, sharded_sprint_dir: Path) -> None:
        """AC1: a title change on 153-8 must not touch 153-9."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            title="brand new title",
        )
        assert result["success"] is True, result

        sibling = _read_shard_story(sharded_sprint_dir, "epic-153.yaml", "153-9")
        assert sibling["title"] == "sibling story untouched"

    def test_merged_view_reflects_title_update(self, sharded_sprint_dir: Path) -> None:
        """AC1: the merged view (what `story show` reads) reflects the new title."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            title="brand new title",
        )
        assert result["success"] is True, result

        merged = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        _epic, story, _loc = find_story_in_data(merged, "153-8")
        assert story is not None, "merged view must still resolve 153-8"
        assert story["title"] == "brand new title"


# =============================================================================
# AC1 — CLI: `pf sprint story update <id> --title <new>`
# =============================================================================


class TestUpdateTitleCLI:
    """The Click command must expose a ``--title`` option wired to update_story."""

    def test_cli_title_option_exists(self, runner: CliRunner, sharded_sprint_dir: Path) -> None:
        """AC1: `--title` is a recognized option (not 'No such option')."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "153-8",
                "--title",
                "cli new title",
            ],
        )
        assert result.exit_code == 0, (
            f"`--title` must be accepted and succeed; output: {result.output}"
        )

    def test_cli_title_update_persists(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """AC1 end-to-end: CLI `--title` writes the new title to the shard."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "153-8",
                "--title",
                "cli new title",
            ],
        )
        assert result.exit_code == 0, result.output

        story = _read_shard_story(sharded_sprint_dir, "epic-153.yaml", "153-8")
        assert story["title"] == "cli new title"

    def test_cli_title_help_lists_option(self, runner: CliRunner) -> None:
        """AC1: `--help` advertises the new option so it's discoverable."""
        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0
        assert "--title" in result.output


# =============================================================================
# Default-behavior guard — omitting --title must not blank the title
# =============================================================================


class TestTitleDefaultUnchanged:
    """When ``title`` is not provided, the existing title must be preserved
    (the parameter defaults to None and is a no-op, like every other field)."""

    def test_other_field_update_preserves_title(self, sharded_sprint_dir: Path) -> None:
        """Updating only points must leave the title exactly as it was."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="153-8",
            points=5,
        )
        assert result["success"] is True, result

        story = _read_shard_story(sharded_sprint_dir, "epic-153.yaml", "153-8")
        assert story["title"] == "old title — should be replaced"
        assert story["points"] == 5
