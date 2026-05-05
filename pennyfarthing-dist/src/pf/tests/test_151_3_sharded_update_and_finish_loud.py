"""Tests for story 151-3: shard-aware story update + loud finish on yaml errors.

Story: 151-3 (PROJ-17082) — story update locates stories across epic-*.yaml
shards; story finish fails loudly on yaml-update error.

TDD RED phase: tests describe correct behavior.

Two failure modes covered here:

1. **Sharded story update.** ``current-sprint.yaml`` holds epic *string refs*
   (sharded format); each epic lives in ``sprint/epic-{ref}.yaml``. The story
   update CLI and the bidirectional sync helper must locate and mutate stories
   that live inside those shard files (not just the top-level ``stories`` /
   ``standalone_stories`` lists). All three reported fields are covered:
   ``--assigned-to``, ``--status``, ``--points``.

2. **Finish fails loud.** ``finish_story`` currently swallows yaml-update
   failures: when the underlying ``transition_story`` reports
   ``{success: False}``, the function still returns ``{"success": True}`` and
   continues with downstream side-effects. Tests assert ``finish_story`` must
   surface the yaml-update failure as ``success: False`` with a clear error
   message, *before* running irreversible cleanup steps.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from pf.jira.bidirectional import (
    SyncChange,
    SyncPlan,
    _update_story_in_sprint,
    execute_sync_plan,
)
from pf.sprint.story_finish import finish_story
from pf.sprint.story_update import story_update_command, update_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Test Fixtures — sharded sprint layouts
# =============================================================================

# Index file for a sharded sprint: epics are *string refs* on disk.
SHARDED_INDEX_YAML = """\
sprint:
  name: "TestSharded"
  jira_sprint_id: 999
  jira_sprint_name: "TestSharded"
  goal: Test sharded update
  start_date: 2026-04-01
  end_date: 2026-04-14
  status: active
  number: 1
epics:
  - PROJ-17079
  - "152"
stories:
  - id: TOP-1
    jira: PROJ-90001
    title: Top-level story
    points: 1
    priority: p2
    status: in_progress
    workflow: trivial
standalone_stories:
  - id: STAND-1
    jira: PROJ-91001
    title: Standalone story
    points: 1
    priority: p2
    status: in_progress
    workflow: trivial
"""

# Epic shard with a Jira key — file name == epic-PROJ-17079.yaml
SHARD_JIRA_YAML = """\
id: "151"
type: epic
title: "Sprint YAML write correctness"
priority: p0
status: in_progress
jira: PROJ-17079
stories:
  - id: 151-3
    jira: PROJ-17082
    title: story update locates stories across epic-*.yaml
    points: 3
    priority: p0
    status: in_progress
    workflow: tdd
  - id: 151-4
    jira: PROJ-17083
    title: secondary story used for multi-update assertions
    points: 2
    priority: p1
    status: backlog
    workflow: tdd
"""

# Epic shard without a Jira key — file name == epic-152.yaml
SHARD_NOJIRA_YAML = """\
id: "152"
type: epic
title: "Internal-only Epic"
priority: p1
status: in_progress
stories:
  - id: 152-1
    title: Internal story (no jira key on epic)
    points: 2
    priority: p1
    status: in_progress
    workflow: trivial
"""

SHARD_SESSION = """\
---
story_id: "151-3"
jira_key: "PROJ-17082"
epic: "PROJ-17079"
workflow: "tdd"
---

# Story 151-3: shard story used to drive finish_story tests

## Story Details
- **ID:** 151-3
- **Jira:** [PROJ-17082](https://jira.example.com/browse/PROJ-17082)
- **Workflow:** tdd
- **Branch:** feat/151-3-sharded-update-finish-loud
"""


@pytest.fixture
def sharded_sprint_dir(tmp_path: Path) -> Path:
    """Sharded sprint directory with two epic shards (jira-keyed + numeric)."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_JIRA_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_NOJIRA_YAML)
    (sprint_dir / "archive").mkdir()
    return sprint_dir


@pytest.fixture
def sharded_project(tmp_path: Path) -> Path:
    """Full project layout (sprint/ + .session/) for finish_story tests."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SHARDED_INDEX_YAML)
    (sprint_dir / "epic-PROJ-17079.yaml").write_text(SHARD_JIRA_YAML)
    (sprint_dir / "epic-152.yaml").write_text(SHARD_NOJIRA_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "151-3-session.md").write_text(SHARD_SESSION)
    return tmp_path


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# =============================================================================
# Helpers
# =============================================================================


def _read_shard_story(sprint_dir: Path, shard_filename: str, story_id: str) -> dict:
    """Read a story directly from a shard file (not via index merging)."""
    shard = read_sprint(sprint_dir / shard_filename)
    for story in shard.get("stories", []):
        if story.get("id") == story_id:
            return story
    raise AssertionError(
        f"Story {story_id} not found in shard {shard_filename}; "
        f"available ids: {[s.get('id') for s in shard.get('stories', [])]}"
    )


# =============================================================================
# Failure mode 1a — update_story() core API on sharded YAML
# =============================================================================


class TestUpdateStoryOnShardedYaml:
    """update_story() must mutate stories living inside epic shard files
    for all three reported fields (status, points, assigned_to).
    """

    def test_assigned_to_persists_to_jira_keyed_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """--assigned-to on a shard story must persist to the shard file."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            assigned_to="alice",
        )
        assert result["success"] is True

        # Read the shard file directly (not the index) — the change must be there.
        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["assigned_to"] == "alice"

    def test_status_persists_to_jira_keyed_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """--status on a shard story must persist to the shard file."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            status="in_review",
        )
        assert result["success"] is True

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"

    def test_points_persists_to_jira_keyed_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """--points on a shard story must persist to the shard file."""
        result = update_story(
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
            story_id="151-3",
            points=8,
        )
        assert result["success"] is True

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["points"] == 8
        assert isinstance(story["points"], int)

    def test_update_persists_to_numeric_only_shard(
        self, sharded_sprint_dir: Path
    ) -> None:
        """A shard whose epic has no Jira key must also be findable & writable.

        The shard file is ``epic-152.yaml``; nothing about that name should
        change after a successful update — repeated updates must remain stable.
        """
        index = sharded_sprint_dir / "current-sprint.yaml"

        result = update_story(
            sprint_path=index, story_id="152-1", points=4
        )
        assert result["success"] is True

        story = _read_shard_story(sharded_sprint_dir, "epic-152.yaml", "152-1")
        assert story["points"] == 4

    def test_two_updates_on_same_shard_remain_stable(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Two consecutive updates on the same shard story must both succeed
        and the *final* value must be the second update's value.

        Guards against any path that loses or rewrites mid-flight state.
        """
        index = sharded_sprint_dir / "current-sprint.yaml"

        r1 = update_story(sprint_path=index, story_id="151-3", status="in_review")
        assert r1["success"] is True

        r2 = update_story(sprint_path=index, story_id="151-3", points=5)
        assert r2["success"] is True

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"
        assert story["points"] == 5

    def test_update_does_not_disturb_sibling_shard_stories(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Updating one story in a shard must not touch siblings in the same shard."""
        index = sharded_sprint_dir / "current-sprint.yaml"

        update_story(sprint_path=index, story_id="151-3", status="in_review")

        sibling = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-4"
        )
        # 151-4 was untouched — must still be backlog
        assert sibling["status"] == "backlog"
        assert sibling["points"] == 2


# =============================================================================
# Failure mode 1b — story_update_command (CLI) on sharded YAML
# =============================================================================


class TestStoryUpdateCommandOnShardedYaml:
    """The Click command must wire the same sharded behavior end-to-end."""

    def test_cli_assigned_to_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "151-3",
                "--assigned-to",
                "alice",
            ],
        )
        assert result.exit_code == 0, result.output

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["assigned_to"] == "alice"

    def test_cli_status_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "151-3",
                "--status",
                "in_review",
            ],
        )
        assert result.exit_code == 0, result.output

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["status"] == "in_review"

    def test_cli_points_persists_to_shard(
        self, runner: CliRunner, sharded_sprint_dir: Path
    ) -> None:
        result = runner.invoke(
            story_update_command,
            [
                "--sprint-file",
                str(sharded_sprint_dir / "current-sprint.yaml"),
                "151-3",
                "--points",
                "8",
            ],
        )
        assert result.exit_code == 0, result.output

        story = _read_shard_story(
            sharded_sprint_dir, "epic-PROJ-17079.yaml", "151-3"
        )
        assert story["points"] == 8


# =============================================================================
# Failure mode 1c — bidirectional sync helper coverage
# =============================================================================


class TestBidirectionalUpdateHelper:
    """``_update_story_in_sprint`` is the silent-no-op surface that the SM
    flagged. It must locate stories in *all* sections of the sprint document:
    epic shards, ``standalone_stories``, and top-level ``stories``.
    """

    def test_finds_story_inside_sharded_epic(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Stories that live in an epic-*.yaml shard must be findable
        once ``read_sprint`` has merged the shard data.
        """
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        found = _update_story_in_sprint(data, "PROJ-17082", "status", "in_review")
        assert found is True

        # In-memory mutation must hit the right story
        epic = next(
            e for e in data["epics"] if str(e.get("jira", "")) == "PROJ-17079"
        )
        story = next(s for s in epic["stories"] if s.get("jira") == "PROJ-17082")
        assert story["status"] == "in_review"

    def test_finds_story_in_standalone_stories(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Stories in ``standalone_stories`` must NOT be silently skipped.

        Currently RED: the helper iterates only ``epics`` → ``stories`` and
        returns False for any standalone story, which the caller swallows
        as a no-op (no error, no warning, no apply).
        """
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        found = _update_story_in_sprint(data, "PROJ-91001", "status", "in_review")
        assert found is True

        story = next(s for s in data["standalone_stories"] if s["jira"] == "PROJ-91001")
        assert story["status"] == "in_review"

    def test_finds_story_in_top_level_stories(
        self, sharded_sprint_dir: Path
    ) -> None:
        """Stories in the top-level ``stories`` list must also be findable.

        Currently RED for the same reason as standalone_stories.
        """
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        found = _update_story_in_sprint(data, "PROJ-90001", "points", 5)
        assert found is True

        story = next(s for s in data["stories"] if s["jira"] == "PROJ-90001")
        assert story["points"] == 5

    def test_returns_false_for_unknown_jira_key(
        self, sharded_sprint_dir: Path
    ) -> None:
        """When no story matches, helper must return False (not silently True)
        so callers can distinguish 'updated' from 'absent'.
        """
        data = read_sprint(sharded_sprint_dir / "current-sprint.yaml")
        found = _update_story_in_sprint(
            data, "PROJ-DOES-NOT-EXIST", "status", "in_review"
        )
        assert found is False


class TestExecuteSyncPlanReportsUnfound:
    """``execute_sync_plan`` currently logs nothing when
    ``_update_story_in_sprint`` returns False — the change disappears
    silently. The fix must surface unfound stories as errors so a sync
    cannot claim success while leaving YAML untouched.
    """

    @pytest.mark.asyncio
    async def test_unfound_yaml_change_recorded_as_error(
        self, sharded_sprint_dir: Path
    ) -> None:
        plan = SyncPlan(
            changes=[
                SyncChange(
                    key="PROJ-DOES-NOT-EXIST",
                    field="status",
                    action="update-yaml",
                    yaml_value=None,
                    jira_value="In Review",
                    target_value="in_review",
                )
            ],
            both=["PROJ-DOES-NOT-EXIST"],
        )

        result = await execute_sync_plan(
            plan,
            dry_run=False,
            client=MagicMock(),
            sprint_path=sharded_sprint_dir / "current-sprint.yaml",
        )

        # changes_applied must NOT silently increment for an unfound story
        assert result.changes_applied == 0
        # ...and the failure must appear in errors so the CLI can report it
        assert result.errors, (
            "execute_sync_plan must surface unfound stories — got an empty errors list"
        )
        assert any(
            "PROJ-DOES-NOT-EXIST" in err for err in result.errors
        ), f"Error list should mention the missing key: {result.errors}"


# =============================================================================
# Failure mode 2 — finish_story must fail loud on yaml-update error
# =============================================================================


class TestFinishStoryFailsLoudOnYamlError:
    """``finish_story`` must NOT report success when the underlying yaml
    transition fails. Today it appends a 'warning' step and returns
    ``{"success": True}``, masking bad YAML state.
    """

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    def test_returns_failure_when_transition_returns_false(
        self,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """transition_story → {success: False} must propagate as success: False."""
        mock_transition.return_value = {
            "success": False,
            "error": "Disk full while writing sprint YAML",
            "to_status": "done",
        }
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(sharded_project, "151-3")

        assert result["success"] is False, (
            "finish_story must surface yaml-update failure as success: False, "
            f"got: {result}"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    def test_failure_result_includes_error_message(
        self,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """The error from transition_story must be carried through to the caller."""
        mock_transition.return_value = {
            "success": False,
            "error": "Disk full while writing sprint YAML",
            "to_status": "done",
        }
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(sharded_project, "151-3")

        assert result.get("success") is False
        assert "error" in result, f"Failure result missing 'error' key: {result}"
        # The original transition error text should appear so operators can debug
        assert "Disk full" in result["error"], (
            f"Expected transition error text in result.error, got: {result['error']!r}"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    def test_no_irreversible_cleanup_after_yaml_failure(
        self,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """When yaml-update fails, the post-yaml cleanup steps must not run.

        Specifically: the local session file under ``.session/`` must NOT be
        deleted, so a re-run of finish can still find context. Today the
        function plows on through every step regardless.
        """
        mock_transition.return_value = {
            "success": False,
            "error": "Write permission denied",
            "to_status": "done",
        }
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        session_path = sharded_project / ".session" / "151-3-session.md"
        assert session_path.exists()  # sanity precondition

        finish_story(sharded_project, "151-3")

        assert session_path.exists(), (
            "Session file was deleted despite yaml-update failure — "
            "finish_story should abort cleanup steps when YAML cannot be updated"
        )

    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.sprint.story_finish.transition_story")
    def test_success_path_unchanged(
        self,
        mock_transition: MagicMock,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        sharded_project: Path,
    ) -> None:
        """Regression guard: when transition succeeds, finish_story still
        returns success: True. Stops the loud-fail change from over-reaching.
        """
        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(sharded_project, "151-3")

        assert result["success"] is True
        assert result["story_id"] == "151-3"
