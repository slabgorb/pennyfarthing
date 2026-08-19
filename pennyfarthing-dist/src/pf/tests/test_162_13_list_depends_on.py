"""Tests for list-form depends_on (story 162-13, gh #116).

The bug: ``_validate_depends_on`` in ``pf/sprint/validator.py`` treats
depends_on as scalar-only. It coerces the value with ``str(dep)``, so a
YAML list value becomes the literal text ``['162-1']`` which can never match
a story id -- every list-form dependency false-fails as "non-existent", and
cycle detection (a single-successor ``dict[str, str]`` walk) cannot see the
edges at all.

Canonical contract pinned by SM:

1. Scalar OR list depends_on are both valid; the value is normalized to a
   list internally.
2. Every referenced story id must exist -- active (epics + standalone_stories
   + top-level stories) OR archived/completed.
3. An unknown reference is reported by ITSELF, never as the stringified list.
4. Cycle detection runs over the expanded edge set (adjacency lists), and must
   not false-positive on a diamond (two distinct paths to one node).
5. Degenerate forms -- empty list, blank entries, blank scalar -- fail loudly
   rather than being silently skipped.
6. Consumers must agree with what the validator accepts: story_move's
   dependency rewrite is extended to list form here; the stack-ready gate
   reads depends_on through the ``pf sprint story field`` CLI, which renders
   values with ``str()`` and is therefore pinned as scalar-only (see the
   consumer-pin section at the bottom -- logged as a Delivery Finding).

Fixture conventions mirror test_160_2_depends_on_standalone_stories.py.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml

from pf.sprint.loader import get_story_field
from pf.sprint.story_move import move_story
from pf.sprint.validator import ValidationSeverity, validate_full_sprint
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures
# =============================================================================


def _write_archive(archive_dir: Path, completed_ids: list[str]) -> None:
    """Write a sprint-*-completed.yaml archive file with the given story IDs."""
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = {
        "sprint": {
            "name": "TO Sprint 2632",
            "number": 2632,
            "jira_sprint_id": 276,
            "jira_sprint_name": "TO Sprint 2632",
        },
        "completed_stories": [
            {"id": sid, "points": 2, "status": "done", "title": f"Done {sid}"}
            for sid in completed_ids
        ],
    }
    with open(archive_dir / "sprint-2632-completed.yaml", "w") as f:
        yaml.dump(archive, f)


def _sprint_header() -> dict[str, Any]:
    """A minimal valid sprint header."""
    return {
        "name": "TO Sprint 2632",
        "number": 2632,
        "jira_sprint_id": 276,
        "jira_sprint_name": "TO Sprint 2632",
        "goal": "Complete the sprint",
        "start_date": "2026-01-20",
        "end_date": "2026-02-02",
        "status": "active",
    }


def _story(
    sid: str,
    *,
    depends_on: Any = None,
    status: str = "backlog",
    points: int = 2,
) -> dict[str, Any]:
    """Build a minimal valid story dict. depends_on may be scalar OR list."""
    story: dict[str, Any] = {
        "id": sid,
        "title": f"Story {sid}",
        "points": points,
        "status": status,
    }
    if depends_on is not None:
        story["depends_on"] = depends_on
    return story


def _epic(stories: list[dict[str, Any]], eid: str = "epic-162") -> dict[str, Any]:
    """Wrap stories in a minimal valid epic."""
    return {
        "id": eid,
        "type": "epic",
        "title": "Epic: validator hardening",
        "priority": "P1",
        "status": "in_progress",
        "stories": stories,
    }


def _merged_sprint(
    *,
    epic_stories: list[dict[str, Any]] | None = None,
    standalone_stories: list[dict[str, Any]] | None = None,
    top_level_stories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a merged-sprint document spanning any of the three locations."""
    data: dict[str, Any] = {"sprint": _sprint_header()}
    if epic_stories is not None:
        data["epics"] = [_epic(epic_stories)]
    if standalone_stories is not None:
        data["standalone_stories"] = standalone_stories
    if top_level_stories is not None:
        data["stories"] = top_level_stories
    return data


def _dep_errors(result: Any) -> list[Any]:
    """Hard depends_on ERRORs from a ValidationResult."""
    return [
        e
        for e in result.errors
        if e.severity == ValidationSeverity.ERROR and "depends_on" in e.path
    ]


def _messages(result: Any) -> list[str]:
    return [e.message for e in _dep_errors(result)]


def _cycle_errors(result: Any) -> list[Any]:
    return [e for e in _dep_errors(result) if "Circular" in e.message]


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """A tmp project root; patches archive-loader root resolution to it."""
    (tmp_path / "sprint").mkdir(parents=True, exist_ok=True)
    with patch("pf.sprint.loader.get_project_root", return_value=tmp_path), patch(
        "pf.common.config.get_project_root", return_value=tmp_path
    ):
        yield tmp_path


# =============================================================================
# AC1a -- list form with all-valid refs passes
# =============================================================================


class TestListFormAllValidRefsPasses:
    def test_two_valid_refs_in_same_epic(self, project_root: Path) -> None:
        """A list of two existing sibling ids must produce NO depends_on error.

        Today ``str(['162-1', '162-2'])`` matches nothing, so this false-fails.
        """
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2"),
                _story("162-3", depends_on=["162-1", "162-2"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "list-form depends_on with all-existing refs must validate clean; "
            f"got: {_messages(result)}"
        )

    def test_single_element_list_is_valid(self, project_root: Path) -> None:
        """A one-element list is the same dependency as the scalar form."""
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on=["162-1"])],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            f"single-element list must be valid; got: {_messages(result)}"
        )

    def test_refs_span_all_three_story_locations(self, project_root: Path) -> None:
        """List entries resolve against epic + standalone + top-level stories."""
        data = _merged_sprint(
            epic_stories=[_story("162-1")],
            standalone_stories=[_story("SA-1")],
            top_level_stories=[
                _story("TL-1", depends_on=["162-1", "SA-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "list entries must resolve across every story location; "
            f"got: {_messages(result)}"
        )

    def test_archived_ref_inside_list_is_satisfied(self, project_root: Path) -> None:
        """An archived/completed id inside a list is satisfied, not dangling (gh #90)."""
        _write_archive(project_root / "sprint" / "archive", ["162-9"])
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on=["162-1", "162-9"])],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "an archived id inside a list must resolve like a scalar archived "
            f"ref does; got: {_messages(result)}"
        )


# =============================================================================
# AC1b -- one bad ref in a list names THAT ref (and only that ref)
# =============================================================================


class TestListFormBadRefNamesThatRef:
    def test_error_names_the_offending_ref(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2", depends_on=["162-1", "ghost-ref"]),
            ],
        )

        result = validate_full_sprint(data)

        assert not result.valid, "a dangling ref inside a list must fail validation"
        assert any(
            "ghost-ref" in m and "non-existent" in m for m in _messages(result)
        ), f"error must name the offending ref 'ghost-ref'; got: {_messages(result)}"

    def test_error_does_not_stringify_the_whole_list(self, project_root: Path) -> None:
        """The regression itself: the message must not contain the list repr."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2", depends_on=["162-1", "ghost-ref"]),
            ],
        )

        result = validate_full_sprint(data)

        for m in _messages(result):
            assert "['" not in m and "[\"" not in m, (
                f"depends_on error must name a single ref, not the stringified "
                f"list; got: {m!r}"
            )

    def test_valid_sibling_ref_is_not_flagged(self, project_root: Path) -> None:
        """Exactly one error: the good ref in the same list must not be reported."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2", depends_on=["162-1", "ghost-ref"]),
            ],
        )

        result = validate_full_sprint(data)

        assert len(_dep_errors(result)) == 1, (
            "only the dangling ref may error, not the valid sibling ref; "
            f"got: {_messages(result)}"
        )
        assert "162-1" not in _messages(result)[0], (
            f"the valid ref must not appear in the error; got: {_messages(result)}"
        )

    def test_two_bad_refs_are_reported_separately(self, project_root: Path) -> None:
        """Each unresolved ref gets its own error -- no first-failure short circuit."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2", depends_on=["ghost-a", "ghost-b"]),
            ],
        )

        result = validate_full_sprint(data)

        msgs = _messages(result)
        assert any("ghost-a" in m for m in msgs), f"ghost-a must be named; got {msgs}"
        assert any("ghost-b" in m for m in msgs), f"ghost-b must be named; got {msgs}"

    def test_error_path_identifies_the_declaring_story(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on=["ghost-ref"])],
        )

        result = validate_full_sprint(data)

        assert any(e.path == "162-2.depends_on" for e in _dep_errors(result)), (
            "error path must point at the story that declares the bad ref; "
            f"got paths: {[e.path for e in _dep_errors(result)]}"
        )


# =============================================================================
# AC1c -- scalar behavior unchanged (regression pins)
# =============================================================================


class TestScalarFormUnchanged:
    def test_valid_scalar_still_passes(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on="162-1")],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            f"valid scalar depends_on must stay valid; got: {_messages(result)}"
        )

    def test_dangling_scalar_still_errors_naming_the_ref(
        self, project_root: Path
    ) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on="ghost-scalar")],
        )

        result = validate_full_sprint(data)

        assert any(
            "ghost-scalar" in m and "non-existent" in m for m in _messages(result)
        ), f"dangling scalar must still be named; got: {_messages(result)}"

    def test_missing_depends_on_passes(self, project_root: Path) -> None:
        data = _merged_sprint(epic_stories=[_story("162-1"), _story("162-2")])

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            f"stories without depends_on must pass; got: {_messages(result)}"
        )

    def test_numeric_scalar_ref_is_coerced_not_crashed(
        self, project_root: Path
    ) -> None:
        """A YAML-unquoted numeric id must still be compared as a string."""
        data = _merged_sprint(
            epic_stories=[_story("162", depends_on=None), _story("162-2", depends_on=162)],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "an int depends_on matching a story id string must resolve; "
            f"got: {_messages(result)}"
        )


# =============================================================================
# AC1d -- degenerate forms fail loudly
# =============================================================================


class TestDegenerateFormsAreLoud:
    def test_empty_list_errors(self, project_root: Path) -> None:
        """depends_on: [] declares a dependency on nothing -- an authoring bug."""
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on=[])],
        )

        result = validate_full_sprint(data)

        errs = _dep_errors(result)
        assert errs, "an empty depends_on list must ERROR, not be silently skipped"
        assert any(
            "empty" in e.message.lower() or "blank" in e.message.lower() for e in errs
        ), f"the empty-list error must say so; got: {[e.message for e in errs]}"
        assert any(e.path == "162-2.depends_on" for e in errs), (
            f"error must name the declaring story; got: {[e.path for e in errs]}"
        )

    def test_blank_entry_in_list_errors(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on=["162-1", "  "])],
        )

        result = validate_full_sprint(data)

        errs = _dep_errors(result)
        assert errs, "a blank entry inside depends_on must ERROR"
        assert any(
            "empty" in e.message.lower() or "blank" in e.message.lower() for e in errs
        ), f"the blank-entry error must say so; got: {[e.message for e in errs]}"

    def test_blank_scalar_errors(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on="")],
        )

        result = validate_full_sprint(data)

        errs = _dep_errors(result)
        assert errs, "a blank scalar depends_on must ERROR, not be skipped"
        assert any(
            "empty" in e.message.lower() or "blank" in e.message.lower() for e in errs
        ), f"the blank-scalar error must say so; got: {[e.message for e in errs]}"

    def test_nested_container_entry_errors_without_crashing(
        self, project_root: Path
    ) -> None:
        """A malformed nested entry must be reported, never raise."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2", depends_on=["162-1", ["162-1"]]),
            ],
        )

        result = validate_full_sprint(data)  # must not raise

        assert _dep_errors(result), (
            "a nested list entry inside depends_on must be reported as invalid"
        )


# =============================================================================
# AC2 -- cycle detection across expanded (list) edges
# =============================================================================


class TestCycleDetectionAcrossListEdges:
    def test_two_story_list_cycle_detected(self, project_root: Path) -> None:
        """A -> [B], B -> [A] is a cycle. The scalar dict walk cannot see it."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on=["162-2"]),
                _story("162-2", depends_on=["162-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _cycle_errors(result), (
            "a mutual list-form dependency must be reported as circular; "
            f"got: {_messages(result)}"
        )

    def test_self_dependency_in_list_detected(self, project_root: Path) -> None:
        data = _merged_sprint(epic_stories=[_story("162-1", depends_on=["162-1"])])

        result = validate_full_sprint(data)

        assert _cycle_errors(result), (
            f"a self-referencing list entry is a cycle; got: {_messages(result)}"
        )

    def test_cycle_via_second_list_element_detected(self, project_root: Path) -> None:
        """The cycle hides in element [1]: A -> [B, C], C -> [A].

        A single-successor walk only ever follows one edge per node, so the
        expanded edge set must be a real adjacency structure.
        """
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on=["162-2", "162-3"]),
                _story("162-2"),
                _story("162-3", depends_on=["162-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _cycle_errors(result), (
            "a cycle reachable only via a non-first list element must be "
            f"detected; got: {_messages(result)}"
        )

    def test_mixed_scalar_and_list_cycle_detected(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on="162-2"),
                _story("162-2", depends_on=["162-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _cycle_errors(result), (
            f"scalar-to-list cycles must be detected; got: {_messages(result)}"
        )

    def test_three_story_list_cycle_detected(self, project_root: Path) -> None:
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on=["162-2"]),
                _story("162-2", depends_on=["162-3"]),
                _story("162-3", depends_on=["162-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert _cycle_errors(result), (
            f"a three-node list cycle must be detected; got: {_messages(result)}"
        )

    def test_diamond_is_not_a_cycle(self, project_root: Path) -> None:
        """False-positive guard: two distinct paths to one node is legal.

        A -> [B, C], B -> [D], C -> [D]. A naive shared visited set across
        branches would call this circular.
        """
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on=["162-2", "162-3"]),
                _story("162-2", depends_on=["162-4"]),
                _story("162-3", depends_on=["162-4"]),
                _story("162-4"),
            ],
        )

        result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "a diamond dependency graph is acyclic and must validate clean; "
            f"got: {_messages(result)}"
        )

    def test_cycle_message_names_the_stories_involved(
        self, project_root: Path
    ) -> None:
        data = _merged_sprint(
            epic_stories=[
                _story("162-1", depends_on=["162-2"]),
                _story("162-2", depends_on=["162-1"]),
            ],
        )

        result = validate_full_sprint(data)

        assert any(
            "162-1" in e.message and "162-2" in e.message
            for e in _cycle_errors(result)
        ), (
            "the circular-dependency message must name both stories in the "
            f"cycle; got: {[e.message for e in _cycle_errors(result)]}"
        )


# =============================================================================
# AC3 -- consumer agreement
#
# story_move rewrites list-form entries (extended in scope: a rewrite that
# silently skips list form leaves a dangling ref that the validator -- now
# that it reads lists -- would fail on).
# =============================================================================

MOVE_INDEX_YAML = """\
sprint:
  name: "Sprint162-13"
  goal: list-form dependency rewrite coverage
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "10"
  - "20"
stories:
  - id: TL-1
    title: top-level dependent with a list depends_on
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on:
      - "10-1"
      - "10-2"
standalone_stories:
  - id: SA-1
    title: standalone dependent whose list holds the substring decoy only
    points: 1
    priority: p2
    status: backlog
    workflow: trivial
    depends_on:
      - "10-10"
"""

MOVE_SOURCE_YAML = """\
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
    depends_on:
      - "10-2"
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

MOVE_TARGET_YAML = """\
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

MOVE_OLD_ID = "10-1"
MOVE_NEW_ID = "20-2"


@pytest.fixture
def move_sprint_dir(tmp_path: Path) -> Path:
    d = tmp_path / "sprint"
    d.mkdir()
    (d / "current-sprint.yaml").write_text(MOVE_INDEX_YAML)
    (d / "epic-10.yaml").write_text(MOVE_SOURCE_YAML)
    (d / "epic-20.yaml").write_text(MOVE_TARGET_YAML)
    (d / "archive").mkdir()
    return d


def _find_story(data: dict[str, Any], story_id: str) -> dict[str, Any]:
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


def _do_move(sprint_dir: Path) -> dict[str, Any]:
    result = move_story(
        sprint_path=sprint_dir / "current-sprint.yaml",
        story_id=MOVE_OLD_ID,
        to_epic="20",
    )
    assert result["success"] is True, result
    assert result["story"].get("new_id") == MOVE_NEW_ID, result
    return result


class TestStoryMoveRewritesListForm:
    def test_list_entry_pointing_at_moved_story_is_rewritten(
        self, move_sprint_dir: Path
    ) -> None:
        """TL-1 depends_on ['10-1', '10-2'] must become ['20-2', '10-2'].

        The rewrite compares the whole value to old_id, so a list value never
        matches and the reference silently goes dangling.
        """
        _do_move(move_sprint_dir)
        data = read_sprint(move_sprint_dir / "current-sprint.yaml")

        assert _find_story(data, "TL-1").get("depends_on") == [MOVE_NEW_ID, "10-2"], (
            "list-form depends_on must have the moved id rewritten in place, "
            f"order preserved; got {_find_story(data, 'TL-1').get('depends_on')!r}"
        )

    def test_moved_story_keeps_its_own_list_depends_on(
        self, move_sprint_dir: Path
    ) -> None:
        _do_move(move_sprint_dir)
        data = read_sprint(move_sprint_dir / "current-sprint.yaml")

        assert _find_story(data, MOVE_NEW_ID).get("depends_on") == ["10-2"], (
            "the moved story's own list depends_on on an unmoved story must "
            f"survive verbatim; got {_find_story(data, MOVE_NEW_ID).get('depends_on')!r}"
        )

    def test_substring_decoy_in_list_is_not_rewritten(
        self, move_sprint_dir: Path
    ) -> None:
        """Moving 10-1 must not touch a list entry of 10-10."""
        _do_move(move_sprint_dir)
        data = read_sprint(move_sprint_dir / "current-sprint.yaml")

        assert _find_story(data, "SA-1").get("depends_on") == ["10-10"], (
            "entry-wise matching must be whole-value, so 10-10 survives a "
            f"10-1 move; got {_find_story(data, 'SA-1').get('depends_on')!r}"
        )

    def test_sprint_validates_clean_after_the_move(
        self, move_sprint_dir: Path, tmp_path: Path
    ) -> None:
        """End-to-end: post-move, no dangling refs remain for the validator."""
        _do_move(move_sprint_dir)
        data = read_sprint(move_sprint_dir / "current-sprint.yaml")

        with patch("pf.sprint.loader.get_project_root", return_value=tmp_path), patch(
            "pf.common.config.get_project_root", return_value=tmp_path
        ):
            result = validate_full_sprint(data)

        assert _dep_errors(result) == [], (
            "a move must leave no dangling list-form references behind; "
            f"got: {_messages(result)}"
        )


# =============================================================================
# AC3 -- stack-ready consumer resolves multi-parent depends_on (UNPINNED)
#
# Previously the stack-ready gate read depends_on via a shell capture of
# `pf sprint story field <id> depends_on`, echoing str(value) and using the
# result as a single story id -- which could not express a list, so these
# tests PINNED the scalar-only limitation (Delivery Finding).
#
# Story 162-89 (folding 162-45) removes that limitation: the gate now resolves
# its parent(s) through the machine-readable Python consumer
# ``pf.sprint.stack_ready.evaluate_stack_ready``, which handles scalar OR list
# depends_on. These tests are UNPINNED accordingly -- the field read still
# hands back the raw value shape, and the consumer resolves a multi-parent list
# rather than choking on it.
# =============================================================================


class TestStackReadyConsumerResolvesMultiParent:
    def test_scalar_field_read_is_a_usable_story_id(self) -> None:
        data = _merged_sprint(
            epic_stories=[_story("162-1"), _story("162-2", depends_on="162-1")],
        )

        value = get_story_field(data, "162-2", "depends_on")

        assert value == "162-1", (
            "the field read must hand back exactly the parent story id; "
            f"got {value!r}"
        )
        assert str(value) == "162-1"

    def test_list_field_read_is_returned_as_a_list(self) -> None:
        """The field read hands back the list unmangled for the consumer."""
        data = _merged_sprint(
            epic_stories=[
                _story("162-1"),
                _story("162-2"),
                _story("162-3", depends_on=["162-1", "162-2"]),
            ],
        )

        value = get_story_field(data, "162-3", "depends_on")

        assert isinstance(value, list), (
            f"list-form depends_on must reach consumers as a list; got {value!r}"
        )
        assert value == ["162-1", "162-2"], (
            f"the field read must not mangle the list; got {value!r}"
        )

    def test_consumer_resolves_multi_parent_stack(self) -> None:
        """UNPIN: the stack-ready consumer resolves a multi-parent list.

        Replaces the old scalar-only pin: multi-parent stacking is now
        supported (162-89 / 162-45). All parents done -> ready.
        """
        from pf.sprint.stack_ready import evaluate_stack_ready

        data = _merged_sprint(
            epic_stories=[
                _story("162-1", status="done"),
                _story("162-2", status="done"),
                _story("162-3", depends_on=["162-1", "162-2"]),
            ],
        )

        verdict = evaluate_stack_ready(data, "162-3")

        assert verdict["ready"] is True, (
            "the stack-ready consumer must resolve a multi-parent depends_on "
            f"(all parents done -> ready); got {verdict!r}"
        )
        assert {p["id"] for p in verdict["parents"]} == {"162-1", "162-2"}
