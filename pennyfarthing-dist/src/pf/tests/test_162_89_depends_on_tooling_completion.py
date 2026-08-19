"""Tests for story 162-89: depends_on & story-tooling completion.

TDD RED phase. This 5-point consolidation folds eight granular epic-162 tails,
all touching ``story_update.py`` / ``story_add.py`` / ``validator.py`` /
``story_move.py`` and the stack-ready gate. Each AC below maps to one folded
tail; the class docstrings name the tail.

Honest-RED classification (stated up front so the ``tests-fail`` gate reads on
the true-RED ACs, and the reviewer isn't misled — SM Assessment + 162-87/88
green-on-arrival discipline):

  TRUE RED (must fail against develop):
    * 162-45  multi-parent stack-ready consumer + machine-readable emission
              (new module ``pf.sprint.stack_ready``; the scalar-only pin in
              test_162_13 is rewritten to assert multi-parent resolution)
    * 162-80  ``--clear-depends-on`` flag on ``story update``
    * 162-81  cycle/dangling detection on the SHARD validation route
              (``validate_epic_shard`` never calls ``_validate_depends_on``)
    * 162-82  parity guards in ``add_story`` (self-ref + target-existence,
              same message shape as ``update_story``, rejected BEFORE insert)
    * 162-83  CANCELED depends_on target -> WARNING (Client decision)
    * 162-85  VALID_STORY_TYPES / VALID_STORY_STATUSES are frozensets

  GREEN-ON-ARRIVAL (documented, asserted as regression pins, not RED):
    * 162-83  DONE / ARCHIVED target -> satisfied (already true; pinned here)
    * 162-46  int-entry rewrite ``str(entry) == old_id`` is DEFENSIVE — real
              story ids are dashed ("162-1"), so no int can stringify-match an
              old_id; behavior is already correct. Pinned as a regression guard.
    * 162-84  word-boundary ``--type`` help test (help already lists every
              type as a whole word). Pinned; scope-comment parity is comment-
              only (no behavioral test).

Client decision recorded verbatim (162-83):
    DONE (not yet archived) -> SATISFIED
    ARCHIVED                -> SATISFIED (existing, gh #90)
    CANCELED                -> WARNING (surface abandoned dep; do NOT hard-fail)
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
import yaml
from click.testing import CliRunner

from pf.sprint.loader import find_story_in_data
from pf.sprint.story_add import add_story, story_add_command
from pf.sprint.story_move import move_story
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.validator import (
    VALID_STORY_STATUSES,
    VALID_STORY_TYPES,
    ValidationSeverity,
    validate_epic_shard,
    validate_full_sprint,
)
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures / builders (mirror test_162_13 / test_160_8 conventions)
# =============================================================================


def _sprint_header() -> dict[str, Any]:
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
    """Minimal valid story dict. depends_on may be scalar OR list."""
    story: dict[str, Any] = {
        "id": sid,
        "title": f"Story {sid}",
        "points": points,
        "status": status,
        "priority": "p1",
        "workflow": "tdd",
    }
    if depends_on is not None:
        story["depends_on"] = depends_on
    return story


def _merged_sprint(stories: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "sprint": _sprint_header(),
        "epics": [
            {
                "id": "epic-162",
                "type": "epic",
                "title": "Epic: story-tooling completion",
                "priority": "P1",
                "status": "in_progress",
                "stories": stories,
            }
        ],
    }


def _epic_shard(stories: list[dict[str, Any]]) -> dict[str, Any]:
    """A raw epic-shard document (no top-level ``sprint:`` wrapper)."""
    return {
        "id": "162",
        "type": "epic",
        "title": "Epic: story-tooling completion",
        "status": "active",
        "stories": stories,
    }


def _write_archive(archive_dir: Path, completed_ids: list[str]) -> None:
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive = {
        "sprint": {"name": "TO Sprint 2632", "number": 2632},
        "completed_stories": [
            {"id": sid, "points": 2, "status": "done", "title": f"Done {sid}"}
            for sid in completed_ids
        ],
    }
    with open(archive_dir / "sprint-2632-completed.yaml", "w") as f:
        yaml.dump(archive, f)


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def project_root(tmp_path: Path):
    """A tmp project root with sprint/ + sprint/archive/ scaffolding.

    Patches ``get_project_root`` everywhere the archive loader resolves it so
    validator / stack-ready archive lookups resolve into this isolated tree.
    """
    (tmp_path / "sprint").mkdir(parents=True, exist_ok=True)
    with patch("pf.sprint.loader.get_project_root", return_value=tmp_path), patch(
        "pf.common.config.get_project_root", return_value=tmp_path
    ):
        yield tmp_path


@pytest.fixture
def sprint_file(tmp_path: Path) -> Path:
    """Write a full merged sprint to disk and return the path.

    Two backlog stories (162-1, 162-2) plus a done story (162-3) so tests can
    exercise CLI mutations against a real file.
    """
    path = tmp_path / "current-sprint.yaml"
    data = _merged_sprint(
        [
            _story("162-1"),
            _story("162-2", depends_on="162-1"),
            _story("162-3", status="done"),
        ]
    )
    with open(path, "w") as f:
        yaml.dump(data, f)
    return path


def _warnings(result: Any) -> list[Any]:
    return [e for e in result.errors if e.severity == ValidationSeverity.WARNING]


def _errors(result: Any) -> list[Any]:
    return [e for e in result.errors if e.severity == ValidationSeverity.ERROR]


# =============================================================================
# 162-45 — multi-parent depends_on consumer (stack-ready) + machine-readable
#
# The stack-ready gate resolves the parent via a scalar shell capture and
# cannot express a list (pinned in test_162_13). This AC adds a Python
# consumer, ``pf.sprint.stack_ready.evaluate_stack_ready``, that resolves
# scalar OR list depends_on into a machine-readable per-parent verdict. Dev
# wires the gate to it. RED: the module does not exist yet.
# =============================================================================


class TestStackReadyConsumerMultiParent:
    def _eval(self, data: dict[str, Any], story_id: str) -> dict[str, Any]:
        from pf.sprint.stack_ready import evaluate_stack_ready

        return evaluate_stack_ready(data, story_id)

    def test_no_depends_on_is_root_and_ready(self) -> None:
        data = _merged_sprint([_story("162-1")])
        verdict = self._eval(data, "162-1")
        assert verdict["ready"] is True, "a stack root (no depends_on) is ready"
        assert verdict["is_root"] is True
        assert verdict["parents"] == [], "root has no parents to report"

    def test_scalar_parent_done_is_ready(self) -> None:
        data = _merged_sprint(
            [_story("162-1", status="done"), _story("162-2", depends_on="162-1")]
        )
        verdict = self._eval(data, "162-2")
        assert verdict["ready"] is True
        assert verdict["parents"] == [
            {"id": "162-1", "status": "done", "satisfied": True}
        ], f"machine-readable per-parent verdict expected; got {verdict['parents']!r}"

    def test_scalar_parent_not_done_blocks(self) -> None:
        data = _merged_sprint(
            [
                _story("162-1", status="in_progress"),
                _story("162-2", depends_on="162-1"),
            ]
        )
        verdict = self._eval(data, "162-2")
        assert verdict["ready"] is False, "an unmerged parent blocks the child"
        assert "162-1" in verdict["blocking"]

    def test_multi_parent_all_done_is_ready(self) -> None:
        data = _merged_sprint(
            [
                _story("162-1", status="done"),
                _story("162-2", status="done"),
                _story("162-3", depends_on=["162-1", "162-2"]),
            ]
        )
        verdict = self._eval(data, "162-3")
        assert verdict["ready"] is True, "all parents done -> ready (multi-parent)"
        assert {p["id"] for p in verdict["parents"]} == {"162-1", "162-2"}
        assert all(p["satisfied"] for p in verdict["parents"])

    def test_multi_parent_one_pending_blocks_and_names_it(self) -> None:
        data = _merged_sprint(
            [
                _story("162-1", status="done"),
                _story("162-2", status="backlog"),
                _story("162-3", depends_on=["162-1", "162-2"]),
            ]
        )
        verdict = self._eval(data, "162-3")
        assert verdict["ready"] is False, "one pending parent blocks the stack"
        assert verdict["blocking"] == ["162-2"], (
            "only the unsatisfied parent is named as blocking; "
            f"got {verdict['blocking']!r}"
        )

    def test_archived_parent_counts_as_satisfied(self, project_root: Path) -> None:
        """A parent that has been finished & archived is satisfied (gh #90)."""
        _write_archive(project_root / "sprint" / "archive", ["162-1"])
        data = _merged_sprint([_story("162-2", depends_on="162-1")])
        verdict = self._eval(data, "162-2")
        assert verdict["ready"] is True, "archived (completed) parent is satisfied"


# =============================================================================
# 162-80 — ``--clear-depends-on`` on ``story update``
#
# Remove a dependency without hand-editing YAML. RED: no such flag/param.
# =============================================================================


class TestClearDependsOn:
    def test_cli_flag_exists_in_help(self, runner: CliRunner) -> None:
        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0
        assert "--clear-depends-on" in result.output, (
            "`--clear-depends-on` must be advertised in help so it's discoverable"
        )

    def test_clear_removes_depends_on_key(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["--sprint-file", str(sprint_file), "162-2", "--clear-depends-on"],
        )
        assert result.exit_code == 0, f"clear must succeed; output: {result.output}"
        merged = read_sprint(sprint_file)
        _epic, story, _loc = find_story_in_data(merged, "162-2")
        assert story is not None
        assert "depends_on" not in story, (
            "--clear-depends-on must DELETE the key, not blank it; "
            f"story still has depends_on={story.get('depends_on')!r}"
        )

    def test_clear_is_idempotent_on_story_without_dep(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """Clearing a story that has no dep is a no-op success, not an error."""
        result = runner.invoke(
            story_update_command,
            ["--sprint-file", str(sprint_file), "162-1", "--clear-depends-on"],
        )
        assert result.exit_code == 0, f"idempotent clear; output: {result.output}"

    def test_clear_and_set_together_is_rejected(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """No-silent-drop: setting and clearing the same field is contradictory."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sprint_file),
                "162-2", "--clear-depends-on", "--depends-on", "162-1",
            ],
        )
        assert result.exit_code != 0, (
            "--clear-depends-on + --depends-on is contradictory and must be rejected"
        )

    def test_update_story_clear_param_behavior(self, sprint_file: Path) -> None:
        """Direct API: clear_depends_on=True removes the key (RED: no such kwarg)."""
        result = update_story(
            sprint_path=sprint_file, story_id="162-2", clear_depends_on=True
        )
        assert result["success"] is True
        merged = read_sprint(sprint_file)
        _epic, story, _loc = find_story_in_data(merged, "162-2")
        assert "depends_on" not in story


# =============================================================================
# 162-81 — transitive / 2-hop cycle detection on the SHARD validation route
#
# ``validate_full_sprint`` calls ``_validate_depends_on`` (cycles + dangling),
# but ``validate_epic_shard`` does NOT. A raw epic shard (validated via
# ``--sprint-file sprint/epic-*.yaml``) can therefore smuggle in a 2-hop cycle
# or a dangling ref undetected. RED: the shard route ignores depends_on.
# =============================================================================


class TestShardRouteCycleDetection:
    def test_shard_route_detects_two_hop_cycle(self) -> None:
        shard = _epic_shard(
            [
                _story("162-1", depends_on="162-2"),
                _story("162-2", depends_on="162-1"),
            ]
        )
        result = validate_epic_shard(shard)
        assert not result.valid, "a 2-hop cycle A->B->A must fail shard validation"
        assert any(
            "circular" in e.message.lower() for e in _errors(result)
        ), f"expected a circular-dependency error; got {[e.message for e in result.errors]!r}"

    def test_shard_route_detects_dangling_ref(self) -> None:
        shard = _epic_shard([_story("162-1", depends_on="162-999")])
        result = validate_epic_shard(shard)
        assert not result.valid, "a dangling depends_on must fail shard validation"
        assert any(
            "162-999" in e.message for e in _errors(result)
        ), "the dangling ref must be named in the error"

    def test_shard_route_accepts_acyclic_intra_shard_chain(self) -> None:
        """Regression: a legitimate A->B chain within a shard still validates."""
        shard = _epic_shard(
            [_story("162-1"), _story("162-2", depends_on="162-1")]
        )
        result = validate_epic_shard(shard)
        assert result.valid, (
            f"acyclic intra-shard chain must pass; got {[e.message for e in result.errors]!r}"
        )

    def test_update_via_shard_file_rejects_introduced_cycle(
        self, tmp_path: Path
    ) -> None:
        """CLI: introducing a 2-hop cycle through a shard file is rejected."""
        shard_path = tmp_path / "epic-162.yaml"
        shard = _epic_shard(
            [_story("162-1", depends_on="162-2"), _story("162-2")]
        )
        with open(shard_path, "w") as f:
            yaml.dump(shard, f)
        # 162-2 -> 162-1 closes the loop (162-1 already -> 162-2).
        result = update_story(
            sprint_path=shard_path, story_id="162-2", depends_on="162-1"
        )
        assert result["success"] is False, (
            "closing a 2-hop cycle via --depends-on on a shard must be rejected"
        )
        assert "circular" in result["error"].lower()


# =============================================================================
# 162-82 — ``story add`` depends_on validation parity with ``story update``
#
# ``update_story`` rejects a self-dependency ("cannot depend on itself") and a
# dangling target ("does not resolve to a known story") BEFORE writing.
# ``add_story`` currently sets depends_on blindly and only fails post-insert
# with the generic validator wording. This AC brings add to parity. RED: the
# parity message shape is absent at add time.
# =============================================================================


class TestAddStoryDependsOnParity:
    def _sprint_dir(self, tmp_path: Path) -> Path:
        path = tmp_path / "current-sprint.yaml"
        data = _merged_sprint([_story("162-1"), _story("162-2")])
        with open(path, "w") as f:
            yaml.dump(data, f)
        return path

    def test_add_dangling_depends_on_uses_parity_message(
        self, tmp_path: Path
    ) -> None:
        path = self._sprint_dir(tmp_path)
        result = add_story(
            sprint_path=path,
            epic_id="162",
            title="new",
            points=1,
            depends_on="162-999",
        )
        assert result["success"] is False
        assert "does not resolve to a known story" in result["error"], (
            "parity with update_story's dangling-target message; "
            f"got {result['error']!r}"
        )

    def test_add_self_reference_is_rejected(self, tmp_path: Path) -> None:
        """The generated id is 162-3 (next in epic); depending on it is self-ref."""
        path = self._sprint_dir(tmp_path)
        result = add_story(
            sprint_path=path,
            epic_id="162",
            title="new",
            points=1,
            depends_on="162-3",
        )
        assert result["success"] is False
        assert "itself" in result["error"], (
            "a story added with a self-referential depends_on must be rejected "
            f"with a self-dependency message; got {result['error']!r}"
        )

    def test_add_valid_depends_on_still_succeeds(self, tmp_path: Path) -> None:
        """Regression: a real target still adds cleanly."""
        path = self._sprint_dir(tmp_path)
        result = add_story(
            sprint_path=path,
            epic_id="162",
            title="new",
            points=1,
            depends_on="162-1",
        )
        assert result["success"] is True
        merged = read_sprint(path)
        _epic, story, _loc = find_story_in_data(merged, result["story_id"])
        assert story["depends_on"] == "162-1"

    def test_cli_add_dangling_depends_on_fails(
        self, runner: CliRunner, tmp_path: Path
    ) -> None:
        path = self._sprint_dir(tmp_path)
        result = runner.invoke(
            story_add_command,
            ["--sprint-file", str(path), "162", "new", "1", "--depends-on", "162-999"],
        )
        assert result.exit_code != 0, "CLI add with a dangling dep must fail"


# =============================================================================
# 162-83 — terminal-state depends_on semantics (CLIENT DECISION)
#   DONE (not archived) -> SATISFIED
#   ARCHIVED            -> SATISFIED (existing, gh #90)
#   CANCELED            -> WARNING (surface abandoned dep; do NOT hard-fail)
# =============================================================================


class TestTerminalStateDependsOnSemantics:
    def test_done_target_is_satisfied_no_error_no_warning(self) -> None:
        """GREEN-ON-ARRIVAL pin: a DONE (active, not archived) target satisfies."""
        data = _merged_sprint(
            [_story("162-1", status="done"), _story("162-2", depends_on="162-1")]
        )
        result = validate_full_sprint(data)
        assert result.valid, "a done target must not error"
        assert _warnings(result) == [], "a done target must not warn either"

    def test_archived_target_is_satisfied(self, project_root: Path) -> None:
        """GREEN-ON-ARRIVAL pin (gh #90): an archived target satisfies."""
        _write_archive(project_root / "sprint" / "archive", ["162-1"])
        data = _merged_sprint([_story("162-2", depends_on="162-1")])
        result = validate_full_sprint(data)
        assert result.valid, "an archived target must not error"
        assert _warnings(result) == []

    def test_canceled_target_emits_warning_not_error(self) -> None:
        """RED: a CANCELED target surfaces a WARNING but does NOT fail validation."""
        data = _merged_sprint(
            [
                _story("162-1", status="canceled"),
                _story("162-2", depends_on="162-1"),
            ]
        )
        result = validate_full_sprint(data)
        assert result.valid, (
            "a canceled dependency must NOT hard-fail merged-sprint validation "
            "(Client decision: warn, don't block)"
        )
        warns = _warnings(result)
        assert len(warns) == 1, f"exactly one canceled-dep warning expected; got {warns!r}"
        assert "162-1" in warns[0].message, "the canceled target must be named"
        assert "cancel" in warns[0].message.lower(), (
            f"the warning must explain the target is canceled; got {warns[0].message!r}"
        )

    def test_canceled_dep_does_not_block_unrelated_update(
        self, project_root: Path
    ) -> None:
        """Regression: a canceled dep must not block a sprint-wide update."""
        path = project_root / "sprint" / "current-sprint.yaml"
        data = _merged_sprint(
            [
                _story("162-1", status="canceled"),
                _story("162-2", depends_on="162-1"),
                _story("162-3"),
            ]
        )
        with open(path, "w") as f:
            yaml.dump(data, f)
        # Updating unrelated 162-3 must succeed despite the canceled dep on 162-2.
        result = update_story(sprint_path=path, story_id="162-3", points=3)
        assert result["success"] is True, (
            f"canceled dep must not block unrelated update; got {result.get('error')!r}"
        )


# =============================================================================
# 162-85 — harden VALID_STORY_TYPES / VALID_STORY_STATUSES as frozenset
#
# Immutable module-level constants can't be mutated by a caller. RED: both are
# plain ``set``. (The paired ``Literal`` typing is a static-check concern
# verified by the type checker, not asserted at runtime.)
# =============================================================================


class TestValidSetsAreFrozen:
    def test_valid_story_types_is_frozenset(self) -> None:
        assert isinstance(VALID_STORY_TYPES, frozenset), (
            f"VALID_STORY_TYPES must be a frozenset; got {type(VALID_STORY_TYPES).__name__}"
        )

    def test_valid_story_statuses_is_frozenset(self) -> None:
        assert isinstance(VALID_STORY_STATUSES, frozenset), (
            f"VALID_STORY_STATUSES must be a frozenset; got {type(VALID_STORY_STATUSES).__name__}"
        )

    def test_membership_semantics_preserved(self) -> None:
        """Regression: freezing must not drop any known value."""
        assert "feature" in VALID_STORY_TYPES
        assert "chore" in VALID_STORY_TYPES
        assert "canceled" in VALID_STORY_STATUSES
        assert "done" in VALID_STORY_STATUSES


# =============================================================================
# 162-84 — ``--type`` help polish (GREEN-ON-ARRIVAL; word-boundary help test)
#
# The scope-comment parity part of this tail is comment-only (no behavioral
# test). The testable artifact is a word-boundary help assertion: `--help` must
# advertise every valid type as a WHOLE word (not merely as a substring), so a
# future help-string refactor that drops a type breaks a test.
# =============================================================================


class TestTypeHelpWordBoundary:
    def test_type_help_lists_every_type_as_whole_word(
        self, runner: CliRunner
    ) -> None:
        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0
        # Click may wrap/indent help; collapse whitespace before word-boundary match.
        collapsed = re.sub(r"\s+", " ", result.output)
        for story_type in sorted(VALID_STORY_TYPES):
            assert re.search(rf"\b{re.escape(story_type)}\b", collapsed), (
                f"--type help must advertise '{story_type}' as a whole word; "
                "help must stay in sync with VALID_STORY_TYPES"
            )


# =============================================================================
# 162-46 — validator / story_move polish (GREEN-ON-ARRIVAL regression pins)
#
# The int-entry rewrite (``str(entry) == old_id``) is DEFENSIVE: real story ids
# are dashed ("162-1"), so no int stringify-matches an old_id and the current
# ``entry == old_id`` already behaves correctly for every reachable input.
# These pins guard the dependency-rewrite behavior so the refactor can't
# silently regress it.
# =============================================================================


class TestMoveRewritesDependenciesPin:
    def _two_epic_sprint(self, tmp_path: Path) -> Path:
        path = tmp_path / "current-sprint.yaml"
        data = {
            "sprint": _sprint_header(),
            "epics": [
                {
                    "id": "epic-162",
                    "type": "epic",
                    "title": "Source",
                    "priority": "P1",
                    "status": "in_progress",
                    "stories": [_story("162-1")],
                },
                {
                    "id": "epic-200",
                    "type": "epic",
                    "title": "Target",
                    "priority": "P1",
                    "status": "in_progress",
                    "stories": [_story("200-1", depends_on="162-1")],
                },
            ],
        }
        with open(path, "w") as f:
            yaml.dump(data, f)
        return path

    def test_move_rewrites_scalar_dependent(self, tmp_path: Path) -> None:
        path = self._two_epic_sprint(tmp_path)
        result = move_story(path, "162-1", to_epic="200")
        assert result["success"] is True
        new_id = result["story"]["new_id"]
        merged = read_sprint(path)
        _epic, dependent, _loc = find_story_in_data(merged, "200-1")
        assert dependent["depends_on"] == new_id, (
            "a dependent's scalar depends_on must be rewritten to the moved id"
        )

    def test_move_rewrites_entry_within_list(self, tmp_path: Path) -> None:
        path = tmp_path / "current-sprint.yaml"
        data = {
            "sprint": _sprint_header(),
            "epics": [
                {
                    "id": "epic-162",
                    "type": "epic",
                    "title": "Source",
                    "priority": "P1",
                    "status": "in_progress",
                    "stories": [_story("162-1"), _story("162-5")],
                },
                {
                    "id": "epic-200",
                    "type": "epic",
                    "title": "Target",
                    "priority": "P1",
                    "status": "in_progress",
                    "stories": [_story("200-1", depends_on=["162-1", "162-5"])],
                },
            ],
        }
        with open(path, "w") as f:
            yaml.dump(data, f)
        result = move_story(path, "162-1", to_epic="200")
        assert result["success"] is True
        new_id = result["story"]["new_id"]
        merged = read_sprint(path)
        _epic, dependent, _loc = find_story_in_data(merged, "200-1")
        assert new_id in dependent["depends_on"], "moved id rewritten inside the list"
        assert "162-5" in dependent["depends_on"], "the untouched entry is preserved"
        assert "162-1" not in dependent["depends_on"], "the old id is gone"
