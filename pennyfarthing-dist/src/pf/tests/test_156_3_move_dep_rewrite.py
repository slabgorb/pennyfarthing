"""Tests for story 156-3: dependency-rewrite on ``pf sprint story move`` (gh #13).

``move_story`` already relocates a story to a target epic and RENUMBERS it from
its old id to the target epic's next sequential id (``story_move.py:109-114``).
What it does NOT do — the gap #13 demands — is rewrite ``depends_on`` references
elsewhere in the sprint. Any OTHER story whose ``depends_on`` pointed at the
moved story's OLD id is left dangling at a dead id after the move.

These tests are written RED first: they assert the post-move ``depends_on``
rewrite that does not yet exist. They fail because the stale ``old_id`` is left
behind in dependents — the correct "feature missing" RED signal — NOT because of
import errors (``move_story`` already exists).

Data model note (confirmed against ``validator.py`` / ``story_add.py`` /
``story_split.py`` / ``yaml_io.py``): ``depends_on`` is a SINGLE story-id STRING
(scalar), e.g. ``depends_on: "10-1"`` — NOT a list. The validator
(``_validate_depends_on``) coerces it with ``str(dep)`` and ``story_add`` /
``story_split`` always write a single string. Fixtures and assertions therefore
treat ``depends_on`` as a scalar string.

Renumbering is deterministic (``generate_story_id``): the moved story gets
``{target_epic}-{max_existing_seq + 1}``. Target epic 20 already holds ``20-1``,
so moving ``10-1`` into epic 20 renames it ``10-1`` -> ``20-2``. Dependents that
referenced ``10-1`` must be rewritten to ``20-2``.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.sprint.story_move import move_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint exercising every dependent LOCATION:
#   - dependent in ANOTHER epic shard      (epic 30, story 30-1 -> 10-1)
#   - dependent in standalone_stories      (SA-1 -> 10-1)
#   - dependent in top-level `stories`     (TL-1 -> 10-1)
#   - substring-trap dependent             (30-2 -> 10-10, must NOT be touched)
#   - cross-reference to a DIFFERENT story (30-3 -> 10-2, must NOT be touched)
#
# Story to move: 10-1 (epic 10). It carries its OWN depends_on -> 10-2 (a
# sibling that does NOT move) which must be preserved verbatim (AC2).
# Target epic 20 already holds 20-1, so 10-1 renumbers to 20-2 on move.
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Sprint156-3"
  goal: move dependency-rewrite coverage
  start_date: 2026-06-01
  end_date: 2026-06-14
  status: active
  number: 1
epics:
  - "10"
  - "20"
  - "30"
stories:
  - id: TL-1
    title: top-level dependent
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on: "10-1"
standalone_stories:
  - id: SA-1
    title: standalone dependent
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on: "10-1"
"""

# Source epic (holds the story being moved + its dependency target 10-2).
SHARD_SOURCE_YAML = """\
id: "10"
type: epic
title: "Source epic"
priority: p0
status: in_progress
stories:
  - id: 10-1
    title: story to be moved
    points: 3
    priority: p0
    status: in_progress
    workflow: tdd
    depends_on: "10-2"
  - id: 10-2
    title: dependency target that stays
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
  - id: 10-10
    title: substring decoy
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
"""

# Target epic — already holds 20-1, so the moved story becomes 20-2.
SHARD_TARGET_YAML = """\
id: "20"
type: epic
title: "Target epic"
priority: p1
status: in_progress
stories:
  - id: 20-1
    title: pre-existing target story
    points: 2
    priority: p1
    status: in_progress
    workflow: trivial
"""

# A third epic holding dependents: one points at the moved story (30-1 -> 10-1),
# one points at the substring decoy (30-2 -> 10-10, MUST survive), one points at
# a different unmoved story (30-3 -> 10-2, MUST survive).
SHARD_OTHER_YAML = """\
id: "30"
type: epic
title: "Other epic with dependents"
priority: p1
status: in_progress
stories:
  - id: 30-1
    title: epic-shard dependent on moved story
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
    depends_on: "10-1"
  - id: 30-2
    title: dependent on substring decoy
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on: "10-10"
  - id: 30-3
    title: dependent on a different unmoved story
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on: "10-2"
"""

# The id 10-1 renumbers to 20-2 in epic 20 (20-1 already present).
EXPECTED_NEW_ID = "20-2"
OLD_ID = "10-1"


@pytest.fixture
def sprint_dir(tmp_path: Path) -> Path:
    """Sharded sprint dir wiring index + four epic/standalone/top-level sources."""
    d = tmp_path / "sprint"
    d.mkdir()
    (d / "current-sprint.yaml").write_text(INDEX_YAML)
    (d / "epic-10.yaml").write_text(SHARD_SOURCE_YAML)
    (d / "epic-20.yaml").write_text(SHARD_TARGET_YAML)
    (d / "epic-30.yaml").write_text(SHARD_OTHER_YAML)
    (d / "archive").mkdir()
    return d


def _merged(sprint_dir: Path) -> dict:
    return read_sprint(sprint_dir / "current-sprint.yaml")


def _story(data: dict, story_id: str) -> dict:
    """Find a story by id across epics / standalone / top-level."""
    for epic in data.get("epics", []):
        if isinstance(epic, dict):
            for s in epic.get("stories", []):
                if isinstance(s, dict) and str(s.get("id")) == story_id:
                    return s
    for section in ("standalone_stories", "stories"):
        for s in data.get(section, []):
            if isinstance(s, dict) and str(s.get("id")) == story_id:
                return s
    raise AssertionError(f"story {story_id!r} not found in merged sprint")


def _dep(data: dict, story_id: str):
    return _story(data, story_id).get("depends_on")


def _do_move(sprint_dir: Path) -> dict:
    result = move_story(
        sprint_path=sprint_dir / "current-sprint.yaml",
        story_id=OLD_ID,
        to_epic="20",
    )
    assert result["success"] is True, result
    # Sanity: the move renumbers as predicted (anchors the rest of the suite).
    assert result["story"].get("new_id") == EXPECTED_NEW_ID, result
    return result


# =============================================================================
# AC1 — dependents pointing at the OLD id are rewritten to the NEW id,
#        across every location (epic shard / standalone / top-level).
# =============================================================================


class TestDependentsRewrittenToNewId:
    def test_epic_shard_dependent_rewritten(self, sprint_dir: Path) -> None:
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        # 30-1 depended on 10-1; after the move it must point at 20-2.
        assert _dep(data, "30-1") == EXPECTED_NEW_ID, (
            f"epic-shard dependent 30-1 should be rewritten {OLD_ID} -> "
            f"{EXPECTED_NEW_ID}; got {_dep(data, '30-1')!r}"
        )

    def test_standalone_dependent_rewritten(self, sprint_dir: Path) -> None:
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        assert _dep(data, "SA-1") == EXPECTED_NEW_ID, (
            f"standalone dependent SA-1 should be rewritten {OLD_ID} -> "
            f"{EXPECTED_NEW_ID}; got {_dep(data, 'SA-1')!r}"
        )

    def test_top_level_dependent_rewritten(self, sprint_dir: Path) -> None:
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        assert _dep(data, "TL-1") == EXPECTED_NEW_ID, (
            f"top-level dependent TL-1 should be rewritten {OLD_ID} -> "
            f"{EXPECTED_NEW_ID}; got {_dep(data, 'TL-1')!r}"
        )

    def test_no_stale_old_id_remains_anywhere(self, sprint_dir: Path) -> None:
        """After the move, NO depends_on anywhere may still equal the dead id."""
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        stale: list[str] = []
        for sid in ("30-1", "30-2", "30-3", "SA-1", "TL-1"):
            if _dep(data, sid) == OLD_ID:
                stale.append(sid)
        assert not stale, (
            f"stories still pointing at dead id {OLD_ID!r}: {stale} "
            f"— move must rewrite all dependents"
        )

    def test_moved_story_validates_clean(self, sprint_dir: Path) -> None:
        """A correct rewrite means the post-move sprint has no dangling deps."""
        from pf.sprint.validator import validate_sprint_document

        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        result = validate_sprint_document(data)
        # If dependents were NOT rewritten, the validator flags 10-1 as a
        # non-existent depends_on target.
        dangling = [e for e in result.errors if OLD_ID in str(e)]
        assert not dangling, (
            f"post-move sprint must not contain dangling references to "
            f"{OLD_ID!r}; validator errors: {dangling}"
        )


# =============================================================================
# AC2 — the MOVED story's OWN depends_on (pointing at an UNMOVED story) survives.
# =============================================================================


class TestMovedStoryOwnDependsOnPreserved:
    def test_moved_story_keeps_its_dependency(self, sprint_dir: Path) -> None:
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        # 10-1 -> (renumbered) 20-2 still depends on 10-2 (which did not move).
        assert _dep(data, EXPECTED_NEW_ID) == "10-2", (
            f"moved story {EXPECTED_NEW_ID} must keep its own depends_on '10-2'; "
            f"got {_dep(data, EXPECTED_NEW_ID)!r}"
        )


# =============================================================================
# AC3 / edge — no over-rewrite: a dependent on a DIFFERENT unmoved story is
#               untouched, and whole-id matching avoids the 10-1 / 10-10 trap.
# =============================================================================


class TestNoOverRewrite:
    def test_dependent_on_different_story_untouched(self, sprint_dir: Path) -> None:
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        # 30-3 depended on 10-2 (which did not move) — must be unchanged.
        assert _dep(data, "30-3") == "10-2", (
            f"30-3 depended on the unmoved 10-2 and must be untouched; "
            f"got {_dep(data, '30-3')!r}"
        )

    def test_substring_decoy_dependent_untouched(self, sprint_dir: Path) -> None:
        """Moving 10-1 must NOT corrupt a depends_on of '10-10' (substring trap)."""
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        assert _dep(data, "30-2") == "10-10", (
            f"30-2 depends on '10-10' and must NOT be partially rewritten when "
            f"moving '10-1'; got {_dep(data, '30-2')!r}"
        )

    def test_substring_decoy_story_id_intact(self, sprint_dir: Path) -> None:
        """The decoy story 10-10 itself must not be renumbered or disturbed."""
        _do_move(sprint_dir)
        data = _merged(sprint_dir)
        # 10-10 stays in epic 10 with its id intact.
        assert _story(data, "10-10")["title"] == "substring decoy"


# =============================================================================
# AC4 — atomicity / dry-run: dry-run reports without writing (no dep rewrite on
#        disk), and the existing "validation-failure writes nothing" contract
#        still holds after the rewrite feature is added.
# =============================================================================


class TestAtomicityAndDryRun:
    def test_dry_run_does_not_rewrite_dependents_on_disk(self, sprint_dir: Path) -> None:
        result = move_story(
            sprint_path=sprint_dir / "current-sprint.yaml",
            story_id=OLD_ID,
            to_epic="20",
            dry_run=True,
        )
        assert result["success"] is True
        assert result.get("dry_run") is True

        data = _merged(sprint_dir)
        # Nothing on disk changed: the moved story keeps its old id and every
        # dependent still points at the OLD id.
        assert _story(data, OLD_ID)["title"] == "story to be moved"
        for sid in ("30-1", "SA-1", "TL-1"):
            assert _dep(data, sid) == OLD_ID, (
                f"dry-run must not rewrite {sid} on disk; got {_dep(data, sid)!r}"
            )

    def test_dry_run_reports_planned_move(self, sprint_dir: Path) -> None:
        result = move_story(
            sprint_path=sprint_dir / "current-sprint.yaml",
            story_id=OLD_ID,
            to_epic="20",
            dry_run=True,
        )
        story = result.get("story", {})
        assert story.get("id") == OLD_ID
        assert story.get("to_epic") == "20"

    def test_failed_move_writes_nothing(self, sprint_dir: Path) -> None:
        """Unknown target epic => failure => no partial write, deps untouched.

        Guards that adding the dependency-rewrite step preserves the existing
        all-or-nothing contract: a move that cannot complete must not leave
        rewritten dependents (or a relocated story) on disk.
        """
        result = move_story(
            sprint_path=sprint_dir / "current-sprint.yaml",
            story_id=OLD_ID,
            to_epic="999",  # does not exist
        )
        assert result["success"] is False

        data = _merged(sprint_dir)
        assert _story(data, OLD_ID)["title"] == "story to be moved"
        for sid in ("30-1", "SA-1", "TL-1"):
            assert _dep(data, sid) == OLD_ID, (
                f"a failed move must not rewrite {sid}; got {_dep(data, sid)!r}"
            )
