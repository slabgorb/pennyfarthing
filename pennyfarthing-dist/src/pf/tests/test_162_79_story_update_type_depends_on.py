"""Tests for story 162-79: ``pf sprint story update`` gains ``--type`` and
``--depends-on``.

Story: 162-79 (epic 162 — Finish & sprint-tooling truthfulness). Two fields are
writable at ``story add`` time (``story_type`` / ``depends_on``) but ``story
update`` exposes neither, so tagging a story's type (the comment/test/doc/
feature/fix classification) or sequencing a dependency after creation forces
hand-editing sharded YAML — which the project rules forbid ("Never edit sprint
YAML directly — use pf sprint story commands").

RED phase: these tests describe the intended behavior. They fail on HEAD because
``update_story`` has no ``story_type`` / ``depends_on`` keywords (TypeError) and
the Click command has no ``--type`` / ``--depends-on`` options (exit 2 / "No such
option").

The fix (Dev, GREEN) adds ``story_type`` and ``depends_on`` keywords to
``update_story`` that set ``story["type"]`` / ``story["depends_on"]`` and
re-validate through the shard-aware write path, plus ``--type`` / ``--depends-on``
Click options wired through, following the result-object (``{success, ...}``, no
throw — SOUL #10) + ``--dry-run`` + ``--jira`` plumbing of every sibling flag.

Contract notes (see TEA Delivery Findings in the session file):
- ``--type`` validation pins BEHAVIOR, not the exact enum: a canonical value
  ("feature") is accepted; obvious garbage is rejected fail-loud. The canonical
  set (the corpus mixes bug/fix and docs/doc; the story asked for comment/test/
  doc/feature/fix) is a deliberate PM/Dev decision, flagged as a Question.
- ``--depends-on`` must fail loud on a self-reference and on a target that does
  not resolve to a real story — the "truthfulness" charter of epic 162.
- ``--type`` / ``--depends-on`` cannot be combined with ``--epic`` (epic-160
  no-silent-drop charter), exactly like the existing field flags.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.loader import find_story_in_data
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Fixtures — sharded sprint: current-sprint.yaml index + one epic-162.yaml shard
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "Sharded162-79"
  goal: type + depends_on update coverage
  start_date: 2026-08-01
  end_date: 2026-08-14
  status: active
  number: 1
epics:
  - "162"
"""

SHARD_YAML = """\
id: "162"
type: epic
title: "Finish & sprint-tooling truthfulness"
priority: p1
status: backlog
repos: pennyfarthing
stories:
  - id: 162-1
    title: "dependency target — a real, resolvable story"
    points: 1
    priority: p1
    status: done
    workflow: tdd
    type: bug
  - id: 162-2
    title: "story under test"
    points: 3
    priority: p1
    status: in_progress
    workflow: tdd
    type: chore
  - id: 162-3
    title: "sibling story untouched"
    points: 2
    priority: p2
    status: backlog
    workflow: tdd
    type: chore
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sprint dir with a current-sprint.yaml index + one epic-162.yaml shard."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-162.yaml").write_text(SHARD_YAML)
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
# AC1 — function-level: update_story(..., story_type=...) sets and persists type
# =============================================================================


class TestUpdateTypeFunction:
    def test_type_update_succeeds(self, sharded_sprint_dir: Path) -> None:
        """AC1: passing story_type= returns success."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="feature",
        )
        assert result["success"] is True, f"type update must succeed; got: {result}"

    def test_type_update_persists_to_shard(self, sharded_sprint_dir: Path) -> None:
        """AC1: the new type is written back to the epic shard on disk."""
        update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="feature",
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["type"] == "feature"

    def test_type_update_leaves_other_fields_and_siblings_untouched(
        self, sharded_sprint_dir: Path
    ) -> None:
        """AC1: changing only type must not disturb status/points or siblings."""
        update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="feature",
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["status"] == "in_progress"
        assert story["points"] == 3
        sibling = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-3")
        # 162-3 starts 'chore'; 162-2 was updated to 'feature'. Asserting the
        # sibling stays 'chore' (not 'feature') catches a bug that clobbers every
        # story's type to the updated value — the tautological version could not.
        assert sibling["type"] == "chore"

    def test_omitting_type_preserves_existing(self, sharded_sprint_dir: Path) -> None:
        """Default-behavior guard: updating another field must not blank type."""
        update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            points=5,
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["type"] == "chore"  # unchanged

    def test_invalid_type_fails_loud_not_raises(self, sharded_sprint_dir: Path) -> None:
        """AC: an unknown type is rejected via a result object (SOUL #10), not an
        exception, and the on-disk value is left unchanged."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="definitely-not-a-type",
        )
        assert result["success"] is False, (
            f"garbage --type must be rejected; got: {result}"
        )
        assert "error" in result and result["error"]
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["type"] == "chore", "rejected update must not mutate the shard"


# =============================================================================
# AC2 — function-level: update_story(..., depends_on=...) sets and validates
# =============================================================================


class TestUpdateDependsOnFunction:
    def test_depends_on_update_succeeds_and_persists(self, sharded_sprint_dir: Path) -> None:
        """AC2: a depends_on pointing at a real story is set and persisted."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="162-1",
        )
        assert result["success"] is True, f"depends_on update must succeed; got: {result}"
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["depends_on"] == "162-1"

    def test_self_dependency_fails_loud(self, sharded_sprint_dir: Path) -> None:
        """AC2: a story cannot depend on itself."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="162-2",
        )
        assert result["success"] is False, (
            f"self-dependency must be rejected; got: {result}"
        )
        assert "error" in result and result["error"]

    def test_nonexistent_target_fails_loud(self, sharded_sprint_dir: Path) -> None:
        """AC2: depends_on must resolve to a real story (truthfulness charter)."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="999-999",
        )
        assert result["success"] is False, (
            f"unknown depends_on target must be rejected; got: {result}"
        )
        assert "error" in result and result["error"]
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert "depends_on" not in story, "rejected update must not mutate the shard"

    def test_omitting_depends_on_preserves_existing(self, sharded_sprint_dir: Path) -> None:
        """Default-behavior guard: another field update must not clear depends_on."""
        update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="162-1",
        )
        update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            points=8,
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["depends_on"] == "162-1"


# =============================================================================
# Cross-cutting — --epic conflict + --dry-run no-write parity
# =============================================================================


class TestEpicConflictAndDryRun:
    def test_type_cannot_combine_with_epic(self, sharded_sprint_dir: Path) -> None:
        """epic-160 no-silent-drop: --type + --epic must be rejected, not dropped."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="feature",
            epic="163",
        )
        assert result["success"] is False, (
            f"--type combined with --epic must be rejected; got: {result}"
        )
        assert "--epic" in result.get("error", "")

    def test_depends_on_cannot_combine_with_epic(self, sharded_sprint_dir: Path) -> None:
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="162-1",
            epic="163",
        )
        assert result["success"] is False, (
            f"--depends-on combined with --epic must be rejected; got: {result}"
        )
        assert "--epic" in result.get("error", "")

    def test_type_dry_run_reports_without_writing(self, sharded_sprint_dir: Path) -> None:
        """--dry-run must preview the type change but leave the shard on disk intact."""
        before = (sharded_sprint_dir / "epic-162.yaml").read_text()
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            story_type="feature",
            dry_run=True,
        )
        assert result["success"] is True and result.get("dry_run") is True, result
        after = (sharded_sprint_dir / "epic-162.yaml").read_text()
        assert before == after, "dry-run must not mutate the shard file"

    def test_depends_on_dry_run_reports_without_writing(self, sharded_sprint_dir: Path) -> None:
        before = (sharded_sprint_dir / "epic-162.yaml").read_text()
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="162-2",
            depends_on="162-1",
            dry_run=True,
        )
        assert result["success"] is True and result.get("dry_run") is True, result
        after = (sharded_sprint_dir / "epic-162.yaml").read_text()
        assert before == after, "dry-run must not mutate the shard file"


# =============================================================================
# AC — CLI: `pf sprint story update <id> --type / --depends-on`
# =============================================================================


class TestUpdateTypeDependsOnCLI:
    def test_cli_type_option_persists(self, runner: CliRunner, sharded_sprint_dir: Path) -> None:
        """AC end-to-end: CLI `--type` writes the new type to the shard."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--type", "feature",
            ],
        )
        assert result.exit_code == 0, f"`--type` must be accepted; output: {result.output}"
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["type"] == "feature"

    def test_cli_depends_on_option_persists(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--depends-on", "162-1",
            ],
        )
        assert result.exit_code == 0, (
            f"`--depends-on` must be accepted; output: {result.output}"
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["depends_on"] == "162-1"

    def test_cli_depends_on_nonexistent_target_is_error_exit(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """A failed validation must surface as a non-zero exit, not a silent 0."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--depends-on", "999-999",
            ],
        )
        assert result.exit_code != 0, (
            f"unknown --depends-on target must exit non-zero; output: {result.output}"
        )
        assert "does not resolve" in result.output, (
            "the failure must state WHY (unresolved target), not just exit non-zero; "
            f"output: {result.output}"
        )

    def test_cli_help_lists_both_options(self, runner: CliRunner) -> None:
        """AC: `--help` advertises both new options so they're discoverable."""
        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0
        assert "--type" in result.output
        assert "--depends-on" in result.output

    def test_cli_merged_view_reflects_type_update(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """The merged view (what `story show` reads) reflects the new type."""
        runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--type", "feature",
            ],
        )
        merged = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        _epic, story, _loc = find_story_in_data(merged, "162-2")
        assert story is not None, "merged view must still resolve 162-2"
        assert story["type"] == "feature"

    def test_cli_merged_view_reflects_depends_on_update(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """The merged view (what `story show` reads) reflects the new depends_on."""
        runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--depends-on", "162-1",
            ],
        )
        merged = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        _epic, story, _loc = find_story_in_data(merged, "162-2")
        assert story is not None, "merged view must still resolve 162-2"
        assert story["depends_on"] == "162-1"

    def test_cli_type_is_case_insensitive(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        """F3: `--type Feature` (capitalised) normalises to canonical `feature`,
        mirroring how `--status` normalises — not a hard rejection."""
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file", str(sharded_sprint_dir / "current-sprint.yaml"),
                "162-2", "--type", "Feature",
            ],
        )
        assert result.exit_code == 0, (
            f"capitalised --type must be accepted and normalised; output: {result.output}"
        )
        story = _read_shard_story(sharded_sprint_dir, "epic-162.yaml", "162-2")
        assert story["type"] == "feature", "type must persist as canonical lowercase"

    def test_cli_help_enumerates_all_valid_types(self, runner: CliRunner) -> None:
        """F1/F3: `--help` derives the accepted set from VALID_STORY_TYPES — every
        valid value (incl `docs`) is discoverable, no drift from the validator."""
        from pf.sprint.validator import VALID_STORY_TYPES

        result = runner.invoke(story_update_command, ["--help"])
        assert result.exit_code == 0
        # Click's help wraps text; strip newlines/whitespace before substring search.
        flattened = " ".join(result.output.split())
        for value in VALID_STORY_TYPES:
            assert value in flattened, (
                f"--help must advertise valid type '{value}'; output: {result.output}"
            )
