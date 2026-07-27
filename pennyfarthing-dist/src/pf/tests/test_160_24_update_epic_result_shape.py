"""Tests for story 160-24: harden ``update --epic`` (160-6 reviewer follow-ups).

Story: 160-24 — Harden update --epic: uniform result shape (story_id) +
docstring, tighten 2 weak tests, add same-epic/dry-run+field/empty-epic edge
tests, move_story same-epic no-op.

Companion changes in ``test_160_6_update_epic_delegates_move.py`` (same story):
``test_cli_update_epic_flag_documented_in_help`` now asserts the
distinguishing "delegates" help text, and ``test_update_delegates_not_
reimplemented`` is an AST call-site check instead of a substring scan.

RED strategy
------------
* **Uniform result shape (AC1):** ``update_story(..., epic=...)`` currently
  returns ``move_story``'s shape verbatim — ``{"success": True, "story":
  {...}}`` with NO top-level ``story_id`` — while every field-update path
  returns ``{"success": True, "story_id": ...}``. Tests pin ``story_id`` on
  the epic path (post-move: the NEW id, per the AC's ``move_result.story.
  new_id`` example; dry-run: old or computed-new id, fix-agnostic) and pin
  that the ``Returns:`` docstring section documents both shapes.
* **Same-epic no-op (AC4/AC5):** ``move_story(151-3, to_epic="151")`` today
  removes the story, renumbers it to the source epic's next free id (151-5)
  and rewrites dependents — a silent renumber with zero user intent. Tests
  accept EITHER a success no-op/report OR a fail-loud rejection; the ONLY
  forbidden outcome is the renumber. A ``to_epic="epic-151"`` variant forces
  the detection through ``find_epic``'s prefix normalization (a naive
  ``to_epic == source_epic["id"]`` string compare would miss it).
* **Edge guards (AC4):** ``--epic + --dry-run + --status`` rejection and
  ``--epic ''`` fail-loud are GREEN on arrival (the conflict check precedes
  dry-run handling; ``find_epic`` finds no epic id ``""``) — intentional
  regression guards, logged as Design Deviations, pinning that AC1's shape
  refactor cannot open a dry-run bypass or an empty-target crash.

Fixtures mirror ``test_160_6_update_epic_delegates_move.py``: sharded sprint,
jira-keyed source epic (151, shard file ``epic-PROJ-17079.yaml``) with a
dependent sibling, numeric target epic (152) with one existing story so a
cross-epic move renumbers to 152-2.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.story_move import move_story
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint: source epic (jira-keyed) + target epic
# =============================================================================

SHARDED_INDEX_YAML = """\
sprint:
  name: "Sharded160-24"
  goal: update --epic result-shape and same-epic hardening
  start_date: 2026-07-01
  end_date: 2026-07-14
  status: active
  number: 1
epics:
  - PROJ-17079
  - "152"
"""

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


def _story_by_title(sprint_dir: Path, shard_filename: str, title: str) -> dict:
    for story in _shard_stories(sprint_dir, shard_filename):
        if story.get("title") == title:
            return story
    raise AssertionError(
        f"No story titled {title!r} in {shard_filename}; "
        f"ids present: {_ids(sprint_dir, shard_filename)}"
    )


SOURCE = "epic-PROJ-17079.yaml"
TARGET = "epic-152.yaml"
MOVED_TITLE = "story to be moved"
DEPENDENT_TITLE = "sibling that depends on the moved story"


def _assert_source_untouched(sprint_dir: Path) -> None:
    """The same-epic / failed-move invariant: nothing renumbered, no dep
    rewrite, story still under its original id."""
    ids = _ids(sprint_dir, SOURCE)
    assert "151-3" in ids, f"151-3 must keep its id; source ids: {ids}"
    assert "151-5" not in ids, (
        f"silent renumber detected (151-3 -> 151-5); source ids: {ids}"
    )
    moved = _story_by_title(sprint_dir, SOURCE, MOVED_TITLE)
    assert moved["id"] == "151-3"
    dependent = _story_by_title(sprint_dir, SOURCE, DEPENDENT_TITLE)
    assert dependent["depends_on"] == "151-3", (
        f"depends_on must not be rewritten; got {dependent.get('depends_on')!r}"
    )


# =============================================================================
# AC1 — uniform result shape: epic path returns story_id; docstring documents
# both shapes
# =============================================================================


class TestUpdateEpicResultShape:
    def test_update_epic_result_includes_story_id(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """The --epic path must return the same top-level ``story_id`` key the
        field-update path returns — set to the story's post-move (NEW) id, per
        the AC's ``move_result.story.new_id`` example."""
        result = update_story(sprint_path=sprint_file, story_id="151-3", epic="152")
        assert result["success"] is True, result
        assert result.get("story_id") == "152-2", (
            f"epic path must return uniform shape with story_id == the "
            f"renumbered id; got {result!r}"
        )

    def test_update_epic_dry_run_result_includes_story_id(
        self, sprint_file: Path
    ) -> None:
        """Dry-run epic path must carry story_id too. Fix-agnostic on value:
        the input id (151-3) or the computed post-move id (152-2) are both
        acceptable; absence is not."""
        result = update_story(
            sprint_path=sprint_file, story_id="151-3", epic="152", dry_run=True
        )
        assert result["success"] is True, result
        assert result.get("dry_run") is True, result
        assert result.get("story_id") in ("151-3", "152-2"), (
            f"dry-run epic path must include story_id; got {result!r}"
        )

    def test_returns_docstring_documents_both_shapes(self) -> None:
        """The AC: 'Returns docstring documents both shapes'. Pin that the
        ``Returns:`` section names ``story_id`` and distinguishes the
        epic/move-delegated shape. Wording beyond those anchors is Dev's."""
        doc = update_story.__doc__
        assert doc, "update_story must have a docstring"
        assert "Returns:" in doc, "docstring must keep a Returns: section"
        returns_text = doc.split("Returns:")[-1]
        assert "story_id" in returns_text, (
            "Returns: section must document the uniform story_id key; "
            f"currently: {returns_text.strip()!r}"
        )
        assert re.search(r"(?i)epic|move", returns_text), (
            "Returns: section must document the --epic/move-delegated shape "
            f"as well; currently: {returns_text.strip()!r}"
        )

    def test_cli_update_epic_output_names_ids(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """GREEN-on-arrival guard: the CLI success message renders real ids
        from the move result ('Moved story 151-3 to epic 152 as 152-2'). If
        AC1's shape refactor drops the keys the CLI reads, this catches the
        'Moved story None to epic None as None' regression."""
        result = runner.invoke(
            story_update_command,
            ["151-3", "--epic", "152", "--sprint-file", str(sprint_file)],
        )
        assert result.exit_code == 0, result.output
        assert "151-3" in result.output
        assert "152-2" in result.output
        assert "None" not in result.output, (
            f"CLI output lost move details: {result.output!r}"
        )


# =============================================================================
# AC4/AC5 — same-epic move must no-op or report, never silently renumber
# =============================================================================


class TestSameEpicMove:
    def test_move_story_same_epic_does_not_renumber(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """AC5 (move_story): to_epic == source epic. Acceptable: success no-op
        /report OR fail-loud rejection. Forbidden: today's behavior — remove,
        renumber to 151-5, rewrite the sibling's depends_on."""
        result = move_story(sprint_file, "151-3", to_epic="151")
        _assert_source_untouched(sprint_dir)
        if not result["success"]:
            assert result.get("error"), (
                f"rejection must carry an error message; got {result!r}"
            )

    def test_move_story_same_epic_prefixed_form_does_not_renumber(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """``find_epic`` normalizes 'epic-151' to the same epic dict, so the
        same-epic detection must too — a naive ``to_epic == source_epic['id']``
        string compare misses this form and still renumbers."""
        move_story(sprint_file, "151-3", to_epic="epic-151")
        _assert_source_untouched(sprint_dir)

    def test_update_epic_same_epic_does_not_renumber(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """AC4 (update --epic path): same-epic via update_story must inherit
        the no-op/report behavior, not the silent renumber."""
        result = update_story(sprint_path=sprint_file, story_id="151-3", epic="151")
        _assert_source_untouched(sprint_dir)
        if result["success"]:
            # A success result still has to honor AC1's uniform shape — and
            # the id it reports must be the (unchanged) real id.
            assert result.get("story_id") == "151-3", (
                f"same-epic success must report the unchanged id; got {result!r}"
            )

    def test_move_story_cross_epic_still_works(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """GREEN-on-arrival over-reach guard: a legitimate cross-epic move must
        keep working (renumber to target's next id + dep rewrite) — the
        same-epic detection cannot block real moves."""
        result = move_story(sprint_file, "151-3", to_epic="152")
        assert result["success"] is True, result
        assert "151-3" not in _ids(sprint_dir, SOURCE)
        moved = _story_by_title(sprint_dir, TARGET, MOVED_TITLE)
        assert moved["id"] == "152-2"
        dependent = _story_by_title(sprint_dir, SOURCE, DEPENDENT_TITLE)
        assert dependent["depends_on"] == "152-2"


# =============================================================================
# AC4 — edge guards: --epic + --dry-run + field flag; --epic '' (empty string)
# =============================================================================


class TestUpdateEpicEdgeGuards:
    def test_update_epic_dry_run_plus_field_flag_rejected(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """GREEN-on-arrival guard: the --epic/field-flag conflict check fires
        BEFORE dry-run handling, so ``--epic --dry-run --status`` is rejected
        loudly. Pins that AC1's refactor cannot introduce a dry-run early-exit
        that bypasses the conflict rejection."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="151-3",
            epic="152",
            status="done",
            dry_run=True,
        )
        assert result["success"] is False, result
        assert "--status" in result.get("error", ""), result
        _assert_source_untouched(sprint_dir)

    def test_update_epic_empty_string_fails_loud(
        self, sprint_dir: Path, sprint_file: Path
    ) -> None:
        """``epic=''`` is not 'no epic' — it enters the move path and must fail
        loudly (no epic has id '') without mutating any shard."""
        result = update_story(sprint_path=sprint_file, story_id="151-3", epic="")
        assert result["success"] is False, result
        assert result.get("error"), result
        _assert_source_untouched(sprint_dir)

    def test_cli_update_epic_empty_string_exits_nonzero(
        self, runner: CliRunner, sprint_dir: Path, sprint_file: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["151-3", "--epic", "", "--sprint-file", str(sprint_file)],
        )
        assert result.exit_code != 0
        _assert_source_untouched(sprint_dir)


# =============================================================================
# AC3 companion — the AST delegation check lives in the 160-6 file; this
# self-check pins that the AST technique actually resolves (guards against the
# tightened test rotting into a vacuous pass if update_story is renamed).
# =============================================================================


class TestAstDelegationCheckIsMeaningful:
    def test_update_story_function_is_parseable_and_present(self) -> None:
        from pf.sprint import story_update

        tree = ast.parse(Path(story_update.__file__).read_text(encoding="utf-8"))
        fn_names = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
        assert "update_story" in fn_names, (
            "AST delegation check anchors on update_story; renaming it must "
            "update the 160-6 call-site test too"
        )
