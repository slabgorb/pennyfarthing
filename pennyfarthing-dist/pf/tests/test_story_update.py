"""Tests for sprint/story_update.py module.

Story: MSSCI-14257 - Sprint story update command

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. AC1 - Field Updates: Update individual and multiple story fields by story ID
2. AC2 - Story Lookup: Find stories across all epics by story ID
3. AC3 - Auto-Cleanup Rules: status=done auto-sets completed, removes assigned_to;
   status=in_progress auto-sets started
4. AC4 - Validate & Atomic Write: Validate after mutation, atomic write, dry-run, reject invalid
5. CLI Integration: Command registered, CliRunner invocation, error exits
"""

from pathlib import Path
from unittest.mock import patch

import pytest
from click.testing import CliRunner

from pf.sprint.story_update import (
    update_story,
)
from pf.sprint.yaml_io import (
    read_sprint,
)

# =============================================================================
# Test Fixtures
# =============================================================================


MINIMAL_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: MSSCI-14253
    stories:
      - id: 76-1
        title: Core yaml_io module
        points: 3
        priority: P0
        status: done
        workflow: tdd
      - id: 76-2
        title: Sprint validate command
        points: 2
        priority: P0
        status: in_progress
        assigned_to: kavery
        started: "2026-01-25"
        workflow: tdd
      - id: 76-3
        title: Sprint story add command
        points: 3
        priority: P0
        status: backlog
        workflow: tdd
"""

MULTI_EPIC_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: MSSCI-14253
    stories:
      - id: 76-1
        title: Core yaml_io module
        points: 3
        priority: P0
        status: done
        workflow: tdd
  - id: epic-77
    type: epic
    title: "Epic: Another Feature"
    priority: P1
    status: in_progress
    jira: MSSCI-14300
    stories:
      - id: 77-1
        title: First task
        points: 2
        priority: P1
        status: backlog
        assigned_to: kavery
        workflow: trivial
"""

ASSIGNED_STORY_YAML = """\
sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 276
  jira_sprint_name: "TO Sprint 2604"
  goal: Complete the sprint
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
  number: 2604
epics:
  - id: epic-76
    type: epic
    title: "Epic: Sprint Data Management"
    priority: P1
    status: in_progress
    jira: MSSCI-14253
    stories:
      - id: 76-1
        title: Core yaml_io module
        points: 3
        priority: P0
        status: in_progress
        assigned_to: kavery
        started: "2026-01-20"
        workflow: tdd
"""


@pytest.fixture
def sprint_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with one epic and three stories."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MINIMAL_SPRINT_YAML)
    return p


@pytest.fixture
def multi_epic_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with multiple epics."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(MULTI_EPIC_YAML)
    return p


@pytest.fixture
def assigned_story_file(tmp_path: Path) -> Path:
    """Create a sprint YAML file with an assigned, in-progress story."""
    p = tmp_path / "current-sprint.yaml"
    p.write_text(ASSIGNED_STORY_YAML)
    return p


@pytest.fixture
def runner() -> CliRunner:
    """Create a Click test runner."""
    return CliRunner()


# =============================================================================
# AC1: Field Updates
# =============================================================================


class TestUpdateStoryFields:
    """Update individual and multiple story fields by story ID."""

    def test_update_status(self, sprint_file: Path) -> None:
        """Updating status should change the story's status field."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "ready"

    def test_update_points(self, sprint_file: Path) -> None:
        """Updating points should change the story's points field."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            points=5,
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["points"] == 5
        assert isinstance(story["points"], int)

    def test_update_priority(self, sprint_file: Path) -> None:
        """Updating priority should change the story's priority field."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            priority="P2",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["priority"] == "P2"

    def test_update_assigned_to(self, sprint_file: Path) -> None:
        """Updating assigned_to should set the assignee."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            assigned_to="jdoe",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["assigned_to"] == "jdoe"

    def test_update_multiple_fields(self, sprint_file: Path) -> None:
        """Should be able to update multiple fields in one call."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
            priority="P0",
            points=5,
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "ready"
        assert story["priority"] == "P0"
        assert story["points"] == 5

    def test_untouched_fields_preserved(self, sprint_file: Path) -> None:
        """Fields not specified in the update should remain unchanged."""
        data_before = read_sprint(sprint_file)
        original_title = data_before["epics"][0]["stories"][2]["title"]
        original_workflow = data_before["epics"][0]["stories"][2]["workflow"]

        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            priority="P2",
        )

        data_after = read_sprint(sprint_file)
        story = data_after["epics"][0]["stories"][2]
        assert story["title"] == original_title
        assert story["workflow"] == original_workflow

    def test_no_updates_provided(self, sprint_file: Path) -> None:
        """Calling with no field updates should succeed as a noop."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
        )

        assert result["success"] is True

    def test_update_completed_story(self, sprint_file: Path) -> None:
        """Should allow updating fields on a story with status=done."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-1",
            completed_date="2026-01-22",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][0]
        assert story["completed"] == "2026-01-22"


# =============================================================================
# AC2: Story Lookup
# =============================================================================


class TestFindStoryAcrossEpics:
    """Find stories across all epics by story ID."""

    def test_find_in_first_epic(self, multi_epic_file: Path) -> None:
        """Should find story in the first epic."""
        result = update_story(
            sprint_path=multi_epic_file,
            story_id="76-1",
            priority="P2",
        )

        assert result["success"] is True

        data = read_sprint(multi_epic_file)
        story = data["epics"][0]["stories"][0]
        assert story["priority"] == "P2"

    def test_find_in_second_epic(self, multi_epic_file: Path) -> None:
        """Should find story in the second epic."""
        result = update_story(
            sprint_path=multi_epic_file,
            story_id="77-1",
            priority="P0",
        )

        assert result["success"] is True

        data = read_sprint(multi_epic_file)
        story = data["epics"][1]["stories"][0]
        assert story["priority"] == "P0"

    def test_story_not_found_error(self, sprint_file: Path) -> None:
        """Should return error when story ID doesn't exist."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-99",
            status="ready",
        )

        assert result["success"] is False
        assert "error" in result
        assert "76-99" in result["error"]

    def test_epic_not_found_error(self, sprint_file: Path) -> None:
        """Should return error when epic number doesn't exist."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="999-1",
            status="ready",
        )

        assert result["success"] is False
        assert "error" in result

    def test_invalid_story_id_format(self, sprint_file: Path) -> None:
        """Should handle story IDs without a dash gracefully."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="invalid",
            status="ready",
        )

        assert result["success"] is False
        assert "error" in result


# =============================================================================
# AC3: Auto-Cleanup Rules
# =============================================================================


class TestAutoCleanup:
    """Auto-cleanup rules for status transitions."""

    def test_done_preserves_assigned_to(self, assigned_story_file: Path) -> None:
        """Setting status=done should preserve assigned_to (no auto-removal)."""
        result = update_story(
            sprint_path=assigned_story_file,
            story_id="76-1",
            status="done",
        )

        assert result["success"] is True

        data = read_sprint(assigned_story_file)
        story = data["epics"][0]["stories"][0]
        assert story["assigned_to"] == "kavery"

    def test_done_auto_sets_completed(self, assigned_story_file: Path) -> None:
        """Setting status=done should auto-set completed to today."""
        with patch("pf.sprint.story_update.date") as mock_date:
            mock_date.today.return_value.isoformat.return_value = "2026-02-05"

            result = update_story(
                sprint_path=assigned_story_file,
                story_id="76-1",
                status="done",
            )

        assert result["success"] is True

        data = read_sprint(assigned_story_file)
        story = data["epics"][0]["stories"][0]
        assert story["completed"] == "2026-02-05"

    def test_done_preserves_explicit_completed(self, assigned_story_file: Path) -> None:
        """If completed_date is explicitly provided with status=done, use it."""
        result = update_story(
            sprint_path=assigned_story_file,
            story_id="76-1",
            status="done",
            completed_date="2026-01-30",
        )

        assert result["success"] is True

        data = read_sprint(assigned_story_file)
        story = data["epics"][0]["stories"][0]
        assert story["completed"] == "2026-01-30"

    def test_in_progress_auto_sets_started(self, sprint_file: Path) -> None:
        """Setting status=in_progress should auto-set started to today."""
        with patch("pf.sprint.story_update.date") as mock_date:
            mock_date.today.return_value.isoformat.return_value = "2026-02-05"

            result = update_story(
                sprint_path=sprint_file,
                story_id="76-3",
                status="in_progress",
            )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["started"] == "2026-02-05"

    def test_in_progress_preserves_existing_started(self, sprint_file: Path) -> None:
        """If started is already set, don't overwrite it on status=in_progress."""
        # 76-2 already has started: "2026-01-25"
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-2",
            status="in_progress",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][1]
        assert story["started"] == "2026-01-25"

    def test_backlog_no_auto_cleanup(self, sprint_file: Path) -> None:
        """Setting status=backlog should not trigger any auto-cleanup."""
        # Update 76-2 (in_progress with assigned_to) back to backlog
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-2",
            status="backlog",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][1]
        assert story["status"] == "backlog"
        # assigned_to should NOT be removed for backlog transition
        assert story.get("assigned_to") == "kavery"

    def test_ready_no_auto_cleanup(self, sprint_file: Path) -> None:
        """Setting status=ready should not trigger any auto-cleanup."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        assert result["success"] is True

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "ready"


# =============================================================================
# AC4: Validate & Atomic Write
# =============================================================================


class TestValidateAndAtomicWrite:
    """Validate after mutation, atomic write, dry-run, reject invalid."""

    def test_valid_update_writes_file(self, sprint_file: Path) -> None:
        """A valid update should persist changes to disk."""
        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "ready"

    def test_invalid_status_rejected(self, sprint_file: Path) -> None:
        """An invalid status value should be rejected before write."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="invalid_status",
        )

        assert result["success"] is False
        assert "error" in result

    def test_file_unchanged_on_validation_failure(self, sprint_file: Path) -> None:
        """Original file should be untouched when validation fails."""
        original_content = sprint_file.read_text()

        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="invalid_status",
        )

        assert sprint_file.read_text() == original_content

    def test_no_temp_files_after_success(self, sprint_file: Path) -> None:
        """No .yaml.tmp file should remain after successful update."""
        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        tmp_file = sprint_file.with_suffix(".yaml.tmp")
        assert not tmp_file.exists()

    def test_dry_run_does_not_write(self, sprint_file: Path) -> None:
        """Dry-run mode should report changes without writing."""
        original_content = sprint_file.read_text()

        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
            dry_run=True,
        )

        assert result["success"] is True
        assert sprint_file.read_text() == original_content

    def test_dry_run_reports_changes(self, sprint_file: Path) -> None:
        """Dry-run should report what would have changed."""
        result = update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
            dry_run=True,
        )

        assert result["success"] is True
        assert result.get("dry_run") is True

    def test_file_valid_after_update(self, sprint_file: Path) -> None:
        """Sprint file should pass full validation after update."""
        from pf.sprint.validator import validate_full_sprint

        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        data = read_sprint(sprint_file)
        result = validate_full_sprint(data)
        assert result.valid

    def test_other_stories_unchanged(self, sprint_file: Path) -> None:
        """Updating one story should not affect other stories."""
        data_before = read_sprint(sprint_file)
        original_first = dict(data_before["epics"][0]["stories"][0])

        update_story(
            sprint_path=sprint_file,
            story_id="76-3",
            status="ready",
        )

        data_after = read_sprint(sprint_file)
        first_after = data_after["epics"][0]["stories"][0]
        assert first_after["id"] == original_first["id"]
        assert first_after["title"] == original_first["title"]
        assert first_after["points"] == original_first["points"]
        assert first_after["status"] == original_first["status"]


# =============================================================================
# CLI Integration
# =============================================================================


class TestCLIIntegration:
    """CLI: /sprint story update <story-id> [options]."""

    def test_update_command_exists(self) -> None:
        """story_update_command should be importable and be a Click command."""
        import click

        from pf.sprint.story_update import story_update_command

        assert isinstance(story_update_command, click.BaseCommand)

    def test_basic_update_via_cli(self, runner: CliRunner, sprint_file: Path) -> None:
        """Basic CLI invocation should update a story successfully."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--status", "ready",
        ])

        assert result.exit_code == 0

    def test_cli_status_update(self, runner: CliRunner, sprint_file: Path) -> None:
        """--status option should update the status field."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--status", "ready",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "ready"

    def test_cli_points_update(self, runner: CliRunner, sprint_file: Path) -> None:
        """--points option should update points as integer."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--points", "5",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["points"] == 5

    def test_cli_dry_run(self, runner: CliRunner, sprint_file: Path) -> None:
        """--dry-run should not modify the file."""
        from pf.sprint.story_update import story_update_command

        original_content = sprint_file.read_text()

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--status", "ready",
            "--dry-run",
        ])

        assert result.exit_code == 0
        assert sprint_file.read_text() == original_content

    def test_cli_nonexistent_story_exits_nonzero(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """Specifying a non-existent story should produce non-zero exit code with message."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "99-99",
            "--status", "ready",
        ])

        assert result.exit_code != 0
        # Should be a proper error message, not a raw exception
        assert "99-99" in result.output

    def test_cli_invalid_status_exits_nonzero(
        self, runner: CliRunner, sprint_file: Path
    ) -> None:
        """Specifying an invalid status value should fail."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--status", "invalid",
        ])

        assert result.exit_code != 0

    def test_cli_success_output(self, runner: CliRunner, sprint_file: Path) -> None:
        """Successful update should show confirmation."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--status", "ready",
        ])

        assert result.exit_code == 0
        assert "76-3" in result.output

    def test_cli_assigned_to_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--assigned-to option should set the assignee."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--assigned-to", "jdoe",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["assigned_to"] == "jdoe"

    def test_cli_completed_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--completed option should set the completed date."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-1",
            "--completed", "2026-01-22",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][0]
        assert story["completed"] == "2026-01-22"

    def test_cli_started_option(self, runner: CliRunner, sprint_file: Path) -> None:
        """--started option should set the started date."""
        from pf.sprint.story_update import story_update_command

        result = runner.invoke(story_update_command, [
            "--sprint-file", str(sprint_file),
            "76-3",
            "--started", "2026-02-01",
        ])

        assert result.exit_code == 0

        data = read_sprint(sprint_file)
        story = data["epics"][0]["stories"][2]
        assert story["started"] == "2026-02-01"
