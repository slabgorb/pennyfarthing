"""Tests for story 153-8 item 2: story-not-found errors list candidate IDs.

Story: 153-8 (DX bundle) — when a story lookup fails, the user gets a bare,
unhelpful string:

    Story 'X' not found in epics, standalone_stories, or stories

There is no way to tell whether the ID is wrong, the shard is missing, or the
user fat-fingered a digit. The error should instead list the available story
IDs (near-misses first) so the user can self-correct in one step.

This lookup path is shared: both ``story_update.update_story`` and
``story_remove.remove_story`` (and ``story finish`` via the same
``find_story_in_data`` resolver) emit the identical bare message today.

RED phase: these tests describe the intended behavior. They fail on HEAD
because the current message names neither the available IDs nor the closest
matches. The exact wording is left to Dev; the tests assert on *content*
(the missing ID is named, real IDs are listed, near-miss appears before a
distant ID) rather than a brittle exact string, and pin a shared helper
(``format_story_not_found_error``) so update/remove/finish stay consistent.

The fix (Dev, GREEN) introduces a single helper in ``pf.sprint.loader`` that
both commands call, so the candidate-ID behavior never drifts between them.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from click.testing import CliRunner

from pf.sprint.story_remove import remove_story, story_remove_command
from pf.sprint.story_update import story_update_command, update_story

# =============================================================================
# Fixtures — a small sprint with a handful of known IDs across sections
# =============================================================================

INDEX_YAML = """\
sprint:
  name: "NotFound153-8"
  goal: candidate-id error coverage
  start_date: 2026-06-01
  end_date: 2026-06-14
  status: active
  number: 1
epics:
  - "153"
standalone_stories:
  - id: SA-1
    title: a standalone story
    points: 1
    priority: p3
    status: backlog
    workflow: trivial
"""

SHARD_YAML = """\
id: "153"
type: epic
title: "DX bundle epic"
priority: p3
status: backlog
repos: pennyfarthing
stories:
  - id: 153-7
    title: near miss seven
    points: 1
    priority: p3
    status: backlog
    workflow: tdd
  - id: 153-8
    title: the real one
    points: 3
    priority: p3
    status: in_progress
    workflow: tdd
  - id: 999-1
    title: a distant id
    points: 1
    priority: p3
    status: backlog
    workflow: tdd
"""


@pytest.fixture
def sprint_index(tmp_path: Path) -> Path:
    """Returns the path to current-sprint.yaml for a small sharded sprint."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(INDEX_YAML)
    (sprint_dir / "epic-153.yaml").write_text(SHARD_YAML)
    return sprint_dir / "current-sprint.yaml"


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# AC2 — update_story not-found error lists candidate IDs
# =============================================================================


class TestUpdateNotFoundListsCandidates:
    def test_error_names_the_missing_id(self, sprint_index: Path) -> None:
        """The error still names the thing the user asked for."""
        result = update_story(sprint_path=sprint_index, story_id="153-X", status="done")
        assert result["success"] is False
        assert "153-X" in result["error"]

    def test_error_lists_available_ids(self, sprint_index: Path) -> None:
        """The error enumerates real story IDs the user could have meant."""
        result = update_story(sprint_path=sprint_index, story_id="153-X", status="done")
        assert result["success"] is False
        error = result["error"]
        # At least one real ID from the sprint must appear so the user can recover.
        assert "153-8" in error, f"expected available IDs in error; got: {error!r}"

    def test_error_includes_standalone_ids(self, sprint_index: Path) -> None:
        """Candidate IDs span every section the lookup searches, not just epics."""
        result = update_story(sprint_path=sprint_index, story_id="153-X", status="done")
        assert result["success"] is False
        assert "SA-1" in result["error"], (
            "standalone story IDs must be offered as candidates too; "
            f"got: {result['error']!r}"
        )

    def test_near_miss_listed_before_distant_id(self, sprint_index: Path) -> None:
        """Near-misses come first: '153-7' should precede the distant '999-1'
        when the user typed '153-9'."""
        result = update_story(sprint_path=sprint_index, story_id="153-9", status="done")
        assert result["success"] is False
        error = result["error"]
        assert "153-7" in error and "999-1" in error, (
            f"both candidates should be listed; got: {error!r}"
        )
        assert error.index("153-7") < error.index("999-1"), (
            "the near-miss (153-7) must be ranked before the distant id (999-1); "
            f"got: {error!r}"
        )

    def test_not_the_bare_legacy_message(self, sprint_index: Path) -> None:
        """The unhelpful legacy message alone is no longer acceptable."""
        result = update_story(sprint_path=sprint_index, story_id="153-X", status="done")
        assert result["success"] is False
        legacy = "not found in epics, standalone_stories, or stories"
        # The legacy phrase may remain, but it must be accompanied by candidates.
        assert result["error"].strip() != f"Story '153-X' {legacy}", (
            "error must add candidate IDs, not just the bare legacy string"
        )


# =============================================================================
# AC2 — remove_story shares the same candidate-listing behavior
# =============================================================================


class TestRemoveNotFoundListsCandidates:
    def test_remove_error_lists_available_ids(self, sprint_index: Path) -> None:
        """remove_story must list candidates too (shared lookup path)."""
        result = remove_story(sprint_path=sprint_index, story_id="153-X")
        assert result["success"] is False
        assert "153-X" in result["error"]
        assert "153-8" in result["error"], (
            f"remove must also offer candidate IDs; got: {result['error']!r}"
        )


# =============================================================================
# AC2 — shared helper so update/remove/finish never drift
# =============================================================================


class TestSharedNotFoundHelper:
    """A single helper formats the not-found error for every command, keyed off
    the merged sprint data. Pinning it here prevents the three call sites from
    diverging in wording or behavior."""

    def test_helper_exists_and_lists_candidates(self, sprint_index: Path) -> None:
        from pf.sprint.loader import format_story_not_found_error
        from pf.sprint.yaml_io import read_sprint

        data = read_sprint(sprint_index)
        msg = format_story_not_found_error(data, "153-X")
        assert "153-X" in msg
        assert "153-8" in msg
        assert "SA-1" in msg


# =============================================================================
# AC2 — CLI surface: error message reaches the user, exit non-zero
# =============================================================================


class TestNotFoundCLISurface:
    def test_cli_update_not_found_shows_candidates(
        self, runner: CliRunner, sprint_index: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            ["--sprint-file", str(sprint_index), "153-X", "--status", "done"],
        )
        assert result.exit_code != 0
        assert "153-8" in result.output, (
            f"CLI must surface candidate IDs to the user; output: {result.output!r}"
        )

    def test_cli_remove_not_found_shows_candidates(
        self, runner: CliRunner, sprint_index: Path
    ) -> None:
        result = runner.invoke(
            story_remove_command,
            ["--sprint-file", str(sprint_index), "153-X"],
        )
        assert result.exit_code != 0
        assert "153-8" in result.output, (
            f"CLI remove must surface candidate IDs; output: {result.output!r}"
        )
