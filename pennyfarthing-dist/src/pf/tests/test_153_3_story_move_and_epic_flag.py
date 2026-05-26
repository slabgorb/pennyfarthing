"""Tests for story 153-3: `pf sprint story move` + `story add --epic` flag.

Story: 153-3 — Add ``pf sprint story move`` and ``--epic`` flag; document the
full story-lifecycle CLI surface.

Two CLI surfaces are introduced/extended:

1. ``pf sprint story move <story-id> --to-epic <epic-id>`` — a NEW command
   (``story_move.move_story`` + ``story_move_command``). Mirrors the
   shard-aware contract already proven for ``story_remove`` in 153-4: locate
   the story via the merged ``read_sprint`` view, mutate, and persist via the
   shard-aware ``write_sprint``.
2. ``pf sprint story add ... --epic <epic-id>`` — a NEW option on the existing
   ``story_add_command`` that targets a specific epic, overriding the
   positional ``EPIC_ID``.

Plus AC4: the ``pf sprint story`` group help must document the full lifecycle
(add / move / remove / update / finish).

These tests are written RED first:

* The ``story_move`` module does not exist yet — API and shard-aware-io tests
  fail at import (``ModuleNotFoundError``), the correct "implementation
  missing" RED signal.
* ``move`` is not registered on the ``story`` group — CLI invocations fail with
  "No such command 'move'".
* ``--epic`` is not an option on ``story add`` — the flag is rejected.
* The ``story`` group docstring/help does not mention ``move``.

Spec ambiguities (logged as TEA deviations + a delivery Question in the session
file): the story does not specify whether ``move`` *renumbers* the story id
(``151-3`` → ``152-N``) when it changes epics. To avoid coupling the suite to
an unresolved decision, move-success assertions match the relocated story by
**title** (stable across any renumbering) and assert the *original* id is
absent from the source shard (true whether or not renumbering happens).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint with two populated epics (move source + target)
# =============================================================================

SHARDED_INDEX_YAML = """\
sprint:
  name: "Sharded153-3"
  goal: story move coverage
  start_date: 2026-05-01
  end_date: 2026-05-14
  status: active
  number: 1
epics:
  - PROJ-17079
  - "152"
"""

# Source epic shard (jira-keyed) — file name == epic-PROJ-17079.yaml
SHARD_SOURCE_YAML = """\
id: "151"
type: epic
title: "Source epic"
priority: p0
status: in_progress
jira: PROJ-17079
stories:
  - id: 151-3
    jira: PROJ-17082
    title: story to be moved
    points: 3
    priority: p0
    status: in_progress
    workflow: tdd
  - id: 151-4
    jira: PROJ-17083
    title: sibling that stays put
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
"""

# Target epic shard (numeric, no jira) — file name == epic-152.yaml
SHARD_TARGET_YAML = """\
id: "152"
type: epic
title: "Target epic"
priority: p1
status: in_progress
stories:
  - id: 152-1
    title: pre-existing target story
    points: 2
    priority: p1
    status: in_progress
    workflow: trivial
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sharded sprint dir with a source epic and a target epic."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_SOURCE_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_TARGET_YAML)
    (sprint_dir / "archive").mkdir()
    return sprint_dir


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# Helpers
# =============================================================================


def _read_shard_stories(sprint_dir: Path, shard_filename: str) -> list[dict]:
    """Read the raw stories list from a shard file (no index merging)."""
    shard = read_sprint(sprint_dir / shard_filename)
    return list(shard.get("stories", []))


def _ids_in_shard(sprint_dir: Path, shard_filename: str) -> list[str]:
    return [s.get("id") for s in _read_shard_stories(sprint_dir, shard_filename)]


def _titles_in_shard(sprint_dir: Path, shard_filename: str) -> list[str]:
    return [s.get("title") for s in _read_shard_stories(sprint_dir, shard_filename)]


def _story_by_title(sprint_dir: Path, shard_filename: str, title: str) -> dict:
    for story in _read_shard_stories(sprint_dir, shard_filename):
        if story.get("title") == title:
            return story
    raise AssertionError(
        f"No story titled {title!r} in {shard_filename}; "
        f"titles present: {_titles_in_shard(sprint_dir, shard_filename)}"
    )


# =============================================================================
# AC1/AC2 — move_story() API on sharded YAML
# =============================================================================


class TestMoveStoryApiOnShardedYaml:
    """``move_story`` must relocate a story from the source epic shard to the
    target epic shard and persist both shard files. Mirrors the shard-aware
    contract proven for ``remove_story`` in 153-4.
    """

    def test_move_removes_from_source_shard(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
        )
        assert result["success"] is True, result

        # Original id must be gone from the source shard (true whether or not
        # the move renumbers the story id).
        assert "151-3" not in _ids_in_shard(sharded_sprint_dir, "epic-PROJ-17079.yaml"), (
            f"151-3 should be gone from source shard; "
            f"got: {_ids_in_shard(sharded_sprint_dir, 'epic-PROJ-17079.yaml')}"
        )

    def test_move_adds_to_target_shard(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
        )
        assert result["success"] is True, result

        # Match by title — stable regardless of any id renumbering decision.
        assert "story to be moved" in _titles_in_shard(sharded_sprint_dir, "epic-152.yaml"), (
            f"moved story should be in target shard; "
            f"titles: {_titles_in_shard(sharded_sprint_dir, 'epic-152.yaml')}"
        )

    def test_move_preserves_story_content(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
        )

        moved = _story_by_title(sharded_sprint_dir, "epic-152.yaml", "story to be moved")
        # Substantive fields must survive the move untouched.
        assert moved["points"] == 3
        assert moved["status"] == "in_progress"
        assert moved["workflow"] == "tdd"

    def test_move_does_not_disturb_source_sibling(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
        )

        siblings = _read_shard_stories(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        assert [s["id"] for s in siblings] == ["151-4"]
        assert siblings[0]["status"] == "backlog"
        assert siblings[0]["points"] == 2

    def test_move_does_not_disturb_target_existing(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
        )

        # The pre-existing target story must still be present and unchanged.
        existing = _story_by_title(
            sharded_sprint_dir, "epic-152.yaml", "pre-existing target story"
        )
        assert existing["id"] == "152-1"
        assert existing["status"] == "in_progress"

    def test_move_by_jira_key_locates_shard_story(self, sharded_sprint_dir: Path) -> None:
        """A story addressed by its Jira key (PROJ-17082) must be locatable —
        the same shard-lookup-by-jira contract 153-4 pinned for remove/update.
        """
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="PROJ-17082",
            to_epic="152",
        )
        assert result["success"] is True, (
            f"move_story should locate shard story via Jira key, got: {result}"
        )
        assert "story to be moved" in _titles_in_shard(sharded_sprint_dir, "epic-152.yaml")

    def test_move_dry_run_does_not_mutate(self, sharded_sprint_dir: Path) -> None:
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="152",
            dry_run=True,
        )
        assert result["success"] is True
        assert result.get("dry_run") is True

        # Neither shard may change under dry-run.
        assert "151-3" in _ids_in_shard(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        assert "story to be moved" not in _titles_in_shard(
            sharded_sprint_dir, "epic-152.yaml"
        )


# =============================================================================
# AC5 — unknown story returns an error that lists candidate story ids
# =============================================================================


class TestMoveUnknownStory:
    def test_move_unknown_story_returns_failure_with_candidates(
        self, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="999-1",
            to_epic="152",
        )
        assert result["success"] is False
        error = result.get("error", "")
        # Must name the bad id AND list real candidate ids to guide the caller.
        assert "999-1" in error
        assert "151-3" in error, f"error should list candidate story ids; got: {error!r}"

    def test_cli_move_unknown_story_exits_nonzero_with_candidates(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.cli import story

        result = runner.invoke(
            story,
            [
                "move",
                "999-1",
                "--to-epic",
                "152",
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
            ],
        )
        assert result.exit_code != 0
        assert "999-1" in result.output
        assert "151-3" in result.output


# =============================================================================
# AC6 — unknown target epic returns an error that lists available epic ids
# =============================================================================


class TestMoveUnknownTargetEpic:
    def test_move_unknown_epic_returns_failure_with_available(
        self, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.story_move import move_story

        result = move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="999",
        )
        assert result["success"] is False
        error = result.get("error", "")
        assert "999" in error
        # Must list a real available epic id so the caller can correct it.
        assert "152" in error, f"error should list available epic ids; got: {error!r}"

    def test_move_unknown_epic_does_not_mutate_source(
        self, sharded_sprint_dir: Path
    ) -> None:
        """A failed move must leave the source shard intact (no partial move)."""
        from pf.sprint.story_move import move_story

        move_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            to_epic="999",
        )
        assert "151-3" in _ids_in_shard(sharded_sprint_dir, "epic-PROJ-17079.yaml")

    def test_cli_move_unknown_epic_exits_nonzero_with_available(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.cli import story

        result = runner.invoke(
            story,
            [
                "move",
                "151-3",
                "--to-epic",
                "999",
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
            ],
        )
        assert result.exit_code != 0
        assert "999" in result.output
        assert "152" in result.output


# =============================================================================
# AC1 — `pf sprint story move` CLI happy path + registration
# =============================================================================


class TestStoryMoveCommandRegistered:
    def test_move_is_registered_on_story_group(self) -> None:
        from pf.sprint.cli import story

        # Click stores subcommands; "move" must be one of them.
        assert "move" in story.commands, (
            f"`move` must be registered on the story group; "
            f"registered: {sorted(story.commands)}"
        )

    def test_cli_move_persists_to_both_shards(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.cli import story

        result = runner.invoke(
            story,
            [
                "move",
                "151-3",
                "--to-epic",
                "152",
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
            ],
        )
        assert result.exit_code == 0, result.output

        assert "151-3" not in _ids_in_shard(sharded_sprint_dir, "epic-PROJ-17079.yaml")
        assert "story to be moved" in _titles_in_shard(sharded_sprint_dir, "epic-152.yaml")


# =============================================================================
# AC3 — `story add --epic` overrides the target epic
# =============================================================================


class TestStoryAddEpicFlag:
    """``--epic`` targets a specific epic for the new story, overriding the
    positional EPIC_ID.

    NOTE (spec ambiguity, see session deviations): the story text describing
    ``--epic`` ("default to create-new-epic if omitted") contradicts how
    ``story add`` works today (positional EPIC_ID, append-to-existing). This
    test pins the *override* interpretation: when ``--epic`` is given, the new
    story lands in that epic. Flagged as a delivery Question for Dev/Architect.
    """

    def test_add_epic_flag_routes_story_to_named_epic(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        from pf.sprint.story_add import story_add_command

        # Positional epic is the source epic (151/PROJ-17079); --epic redirects
        # the new story into epic 152.
        result = runner.invoke(
            story_add_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "--epic",
                "152",
                "PROJ-17079",
                "added via epic flag",
                "1",
            ],
        )
        assert result.exit_code == 0, result.output

        # The new story must appear in epic 152, not in the positional epic.
        assert "added via epic flag" in _titles_in_shard(sharded_sprint_dir, "epic-152.yaml")
        assert "added via epic flag" not in _titles_in_shard(
            sharded_sprint_dir, "epic-PROJ-17079.yaml"
        )


# =============================================================================
# AC4 — story group help documents the full lifecycle
# =============================================================================


class TestStoryGroupHelpDocumentsLifecycle:
    def test_help_lists_all_lifecycle_operations(self, runner: CliRunner) -> None:
        from pf.sprint.cli import story

        result = runner.invoke(story, ["--help"])
        assert result.exit_code == 0, result.output

        out = result.output
        # Word-boundary match so "move" is NOT satisfied by the "move" inside
        # "remove" — each verb must be documented as its own command/word.
        for verb in ("add", "move", "remove", "update", "finish"):
            assert re.search(rf"\b{verb}\b", out), (
                f"story group help must document '{verb}' as a distinct command; "
                f"help was:\n{out}"
            )


# =============================================================================
# AC2/AC7 — shard-aware IO contract (anti-regression)
# =============================================================================


class TestStoryMoveUsesShardAwareIo:
    """``story_move`` must use ``read_sprint`` / ``write_sprint`` (which merge &
    write shards) and not reach for the raw ``_read_yaml_file`` /
    ``_write_yaml_file`` helpers — the exact failure mode 153-4 fixed for the
    other mutation commands.
    """

    def test_story_move_uses_shard_aware_io(self) -> None:
        from pf.sprint import story_move

        src = Path(story_move.__file__).read_text()
        assert "read_sprint" in src, "story_move must use read_sprint"
        assert "write_sprint" in src, "story_move must use write_sprint"
        assert "_read_yaml_file" not in src, (
            "story_move must not bypass shard merging via _read_yaml_file"
        )
        assert "_write_yaml_file" not in src, (
            "story_move must not bypass shard writes via _write_yaml_file"
        )
