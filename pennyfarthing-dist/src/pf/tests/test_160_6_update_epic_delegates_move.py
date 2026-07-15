"""Tests for story 160-6: ``pf sprint story update --epic`` (delegate to move_story).

Story: 160-6 — Add ``--epic`` to ``pf sprint story update`` (delegate to
``move_story``) + group/clarify update flags in ``--help``. From gh #13
(deferred from 156-3): ``--epic`` is the "minimum viable fallback" for moving a
story between epics without hand-editing shard YAML.

``pf sprint story move --to-epic`` already exists (shipped in 153-3) and owns
the atomic remove/insert/renumber/dependency-rewrite logic. This story does NOT
reimplement any of that — it adds an ``--epic`` convenience flag on ``update``
that **delegates to ``move_story``** (SOUL #2: one truth, one place).

RED strategy
------------
* CLI tests invoke ``story update ... --epic 152`` and assert the *success*
  contract (exit 0 + story relocated). Today Click rejects ``--epic`` with
  "No such option" (exit 2), so ``assert exit_code == 0`` fails cleanly.
* API tests call ``update_story(..., epic="152")``. Today ``update_story`` has
  no ``epic`` parameter, so the call raises ``TypeError`` — the "implementation
  missing" RED signal (same class as the ``ModuleNotFoundError`` RED that 153-3
  embraced for the not-yet-created ``story_move`` module).
* A source-scan test pins the delegation itself (``move_story`` must be
  referenced from ``story_update.py``), the same cheap one-truth enforcer 153-3
  used for shard-aware IO.

Pinned design decisions (logged as TEA Design Deviations in the session file):
  1. ``--epic`` inherits ``move_story``'s renumber semantics (``151-3`` →
     ``152-2``, the target epic's next sequential id) and its dependency
     rewrite. The story says "delegate to move_story", so these are contract,
     not TEA invention. Tests match the relocated story by **title** (stable
     across renumbering) except where the renumber value is the assertion.
  2. **No silent drop** (epic-160 charter is silent-drop / dry-run
     false-positive hardening): ``update --epic X --status done`` must NOT
     silently discard the ``--status`` change. The invariant test accepts
     EITHER a fail-loud rejection OR both-applied — it fails only on the
     silent-drop path (success + relocated + status unchanged). Fix-agnostic
     between the two valid designs.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint: source epic (jira-keyed) + target epic
# (shape reused from 153-3; extended with a dependent to prove dep-rewrite
#  delegation).
# =============================================================================

SHARDED_INDEX_YAML = """\
sprint:
  name: "Sharded160-6"
  goal: update --epic delegation coverage
  start_date: 2026-07-01
  end_date: 2026-07-14
  status: active
  number: 1
epics:
  - PROJ-17079
  - "152"
"""

# Source epic shard (jira-keyed) — file name == epic-PROJ-17079.yaml.
# 151-4 depends_on 151-3 so we can assert the dependency rewrite that only
# happens if update --epic really delegates to move_story.
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
    title: sibling that depends on the moved story
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
    depends_on: 151-3
"""

# Target epic shard (numeric, no jira) — file name == epic-152.yaml.
# Has 152-1 already, so the moved story renumbers to 152-2 (max seq + 1).
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
def sprint_dir(tmp_path: Path) -> Path:
    """Sharded sprint dir with a source epic and a target epic."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_SOURCE_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_TARGET_YAML)
    (sprint_dir / "archive").mkdir()
    return sprint_dir


@pytest.fixture
def sprint_file(sprint_dir: Path) -> Path:
    return sprint_dir / "current-sprint.yaml"


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# Helpers — read raw shard contents (no index merging)
# =============================================================================


def _shard_stories(sprint_dir: Path, shard_filename: str) -> list[dict]:
    shard = read_sprint(sprint_dir / shard_filename)
    return list(shard.get("stories", []))


def _ids(sprint_dir: Path, shard_filename: str) -> list[str]:
    return [s.get("id") for s in _shard_stories(sprint_dir, shard_filename)]


def _titles(sprint_dir: Path, shard_filename: str) -> list[str]:
    return [s.get("title") for s in _shard_stories(sprint_dir, shard_filename)]


def _story_by_title(sprint_dir: Path, shard_filename: str, title: str) -> dict:
    for story in _shard_stories(sprint_dir, shard_filename):
        if story.get("title") == title:
            return story
    raise AssertionError(
        f"No story titled {title!r} in {shard_filename}; "
        f"titles present: {_titles(sprint_dir, shard_filename)}"
    )


SOURCE = "epic-PROJ-17079.yaml"
TARGET = "epic-152.yaml"
MOVED_TITLE = "story to be moved"


# =============================================================================
# AC1 — CLI: `story update --epic` relocates the story end-to-end
# =============================================================================


class TestCliUpdateEpicRelocates:
    def test_cli_update_epic_moves_story(
        self, runner: CliRunner, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["151-3", "--epic", "152", "--sprint-file", str(sprint_file)],
        )
        assert result.exit_code == 0, result.output

        # Gone from source, present in target (matched by title — renumber-safe).
        assert "151-3" not in _ids(sprint_dir, SOURCE), (
            f"151-3 should be gone from source; got {_ids(sprint_dir, SOURCE)}"
        )
        assert MOVED_TITLE in _titles(sprint_dir, TARGET), (
            f"moved story should be in target; titles {_titles(sprint_dir, TARGET)}"
        )

    def test_cli_update_epic_flag_documented_in_help(self, runner: CliRunner) -> None:
        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0, result.output
        assert "--epic" in result.output, (
            f"`--epic` must appear in `story update --help`; help was:\n{result.output}"
        )
        # The help text must actually explain what it does (not a bare flag).
        assert "epic" in result.output.lower()


# =============================================================================
# AC2 — delegation to move_story (behavioral equivalence + source-scan)
# =============================================================================


class TestUpdateEpicDelegatesToMoveStory:
    def test_update_epic_relocates_story_api(self, sprint_dir: Path, sprint_file: Path) -> None:
        result = update_story(sprint_path=sprint_file, story_id="151-3", epic="152")
        assert result["success"] is True, result

        assert "151-3" not in _ids(sprint_dir, SOURCE)
        assert MOVED_TITLE in _titles(sprint_dir, TARGET)

    def test_update_epic_renumbers_like_move(self, sprint_dir: Path, sprint_file: Path) -> None:
        """Inherited move_story semantics: renumber to the target epic's next
        sequential id (152 already has 152-1 → moved story becomes 152-2)."""
        update_story(sprint_path=sprint_file, story_id="151-3", epic="152")

        moved = _story_by_title(sprint_dir, TARGET, MOVED_TITLE)
        assert moved["id"] == "152-2", (
            f"moved story should renumber to 152-2 (target next seq); got {moved.get('id')!r}"
        )

    def test_update_epic_rewrites_dependencies(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """A dependent on the moved story's OLD id must be rewritten to the NEW
        id — pure move_story behavior. Impossible to satisfy without delegating
        (or wholesale copying move_story's dependency rewrite)."""
        update_story(sprint_path=sprint_file, story_id="151-3", epic="152")

        dependent = _story_by_title(
            sprint_dir, SOURCE, "sibling that depends on the moved story"
        )
        assert dependent["depends_on"] == "152-2", (
            f"depends_on should be rewritten to the renumbered id; "
            f"got {dependent.get('depends_on')!r}"
        )

    def test_update_preserves_moved_story_content(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        update_story(sprint_path=sprint_file, story_id="151-3", epic="152")
        moved = _story_by_title(sprint_dir, TARGET, MOVED_TITLE)
        assert moved["points"] == 3
        assert moved["status"] == "in_progress"
        assert moved["workflow"] == "tdd"

    def test_update_delegates_not_reimplemented(self) -> None:
        """Source-scan one-truth enforcer (mirrors 153-3's shard-aware-io scan):
        ``story_update.py`` must reference ``move_story`` rather than growing its
        own epic-move/renumber/dep-rewrite logic."""
        from pf.sprint import story_update

        src = Path(story_update.__file__).read_text(encoding="utf-8")
        assert "move_story" in src, (
            "story_update must delegate the --epic move to move_story (SOUL #2), "
            "not reimplement remove/insert/renumber/dep-rewrite"
        )


# =============================================================================
# AC3 — invalid epic / unknown story return result objects (SOUL #10), no raise
# =============================================================================


class TestUpdateEpicErrorPaths:
    def test_update_invalid_epic_returns_result_not_raises(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = update_story(sprint_path=sprint_file, story_id="151-3", epic="999")
        assert result["success"] is False
        assert "999" in result.get("error", ""), result

    def test_update_invalid_epic_does_not_mutate_source(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """A failed move must leave the source shard intact (no partial move)."""
        update_story(sprint_path=sprint_file, story_id="151-3", epic="999")
        assert "151-3" in _ids(sprint_dir, SOURCE)

    def test_update_epic_unknown_story_returns_failure(
        self, sprint_file: Path
    ) -> None:
        result = update_story(sprint_path=sprint_file, story_id="999-1", epic="152")
        assert result["success"] is False
        assert "999-1" in result.get("error", ""), result

    def test_cli_update_unknown_epic_exits_nonzero(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["151-3", "--epic", "999", "--sprint-file", str(sprint_file)],
        )
        assert result.exit_code != 0
        assert "999" in result.output


# =============================================================================
# AC4 — dry-run delegates and does NOT write
# =============================================================================


class TestUpdateEpicDryRun:
    def test_update_epic_dry_run_does_not_write(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = update_story(
            sprint_path=sprint_file, story_id="151-3", epic="152", dry_run=True
        )
        assert result["success"] is True
        # Neither shard may change under dry-run.
        assert "151-3" in _ids(sprint_dir, SOURCE)
        assert MOVED_TITLE not in _titles(sprint_dir, TARGET)

    def test_cli_update_epic_dry_run_does_not_write(
        self, runner: CliRunner, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["151-3", "--epic", "152", "--dry-run", "--sprint-file", str(sprint_file)],
        )
        assert result.exit_code == 0, result.output
        assert "151-3" in _ids(sprint_dir, SOURCE)
        assert MOVED_TITLE not in _titles(sprint_dir, TARGET)


# =============================================================================
# Anti-silent-drop (epic-160 charter) — --epic + field flag must not lose data
# =============================================================================


class TestUpdateEpicNoSilentDrop:
    def test_update_epic_plus_status_has_no_silent_drop(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """``update --epic 152 --status done`` must not silently discard the
        status change. Fix-agnostic: EITHER fail loud (success False) OR apply
        both (relocated AND status==done). The ONLY forbidden outcome is the
        silent drop — success True + relocated + status still 'in_progress'."""
        result = update_story(
            sprint_path=sprint_file, story_id="151-3", epic="152", status="done"
        )

        if result["success"]:
            # If it succeeded, the status change must have survived the move.
            moved = _story_by_title(sprint_dir, TARGET, MOVED_TITLE)
            assert moved["status"] == "done", (
                "silent drop: --epic move succeeded but --status was discarded"
            )
        else:
            # Fail-loud rejection is acceptable — but then nothing may have moved.
            assert "151-3" in _ids(sprint_dir, SOURCE), (
                "rejected combo must not have partially moved the story"
            )


# =============================================================================
# AC6 — regression: existing update flags still work when --epic is absent
# (GREEN on arrival — intentional guard, logged as a Design Deviation)
# =============================================================================


class TestExistingUpdateFlagsUnbroken:
    def test_update_status_without_epic_still_works(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = update_story(sprint_path=sprint_file, story_id="151-4", status="done")
        assert result["success"] is True, result

        # Story stays in its source epic; status is updated in place.
        stayed = _story_by_title(
            sprint_dir, SOURCE, "sibling that depends on the moved story"
        )
        assert stayed["status"] == "done"
        assert stayed["id"] == "151-4", "no-epic update must not renumber"
