"""Tests for sprint/story_transition.py — story lifecycle state machine.

Story: MSSCI-15428 - Implement story lifecycle state machine with transition validation

TDD RED phase: All tests should FAIL until implementation.

Acceptance Criteria:
1. AC1 - State machine defined with valid transitions
2. AC2 - Single function updates YAML + Jira + session atomically
3. AC3 - Invalid transitions rejected with clear errors
4. AC4 - Partial failure reports which steps succeeded/failed
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_transition import TRANSITIONS, transition_story
from pf.sprint.yaml_io import read_sprint


# =============================================================================
# Test Fixtures
# =============================================================================

SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2608"
  jira_sprint_id: 280
  jira_sprint_name: "TO Sprint 2608"
  goal: State engine consolidation
  start_date: 2026-02-10
  end_date: 2026-02-23
  status: active
epics:
  - id: "125"
    type: epic
    title: "Sprint State Engine Consolidation"
    priority: p1
    status: in_progress
    jira: MSSCI-15421
    stories:
      - id: 125-7
        title: Implement story lifecycle state machine
        points: 3
        priority: p2
        status: backlog
        jira: MSSCI-15428
        workflow: tdd
      - id: 125-8
        title: Event-driven Jira sync
        points: 3
        priority: p2
        status: in_progress
        jira: MSSCI-15429
        started: "2026-02-15"
        assigned_to: kavery
        workflow: tdd
      - id: 125-9
        title: Focus commands
        points: 2
        priority: p3
        status: review
        jira: MSSCI-15430
        workflow: trivial
      - id: 125-10
        title: Already done story
        points: 2
        priority: p3
        status: done
        jira: MSSCI-15431
        completed: "2026-02-20"
        workflow: trivial
"""

NO_JIRA_YAML = """\
sprint:
  name: "TO Sprint 2608"
  jira_sprint_id: 280
  jira_sprint_name: "TO Sprint 2608"
  goal: Test sprint
  start_date: 2026-02-10
  end_date: 2026-02-23
  status: active
epics:
  - id: "125"
    type: epic
    title: "Test Epic"
    priority: p1
    status: in_progress
    jira: MSSCI-15421
    stories:
      - id: 125-20
        title: Story without Jira key
        points: 1
        priority: p3
        status: backlog
        workflow: trivial
"""


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a project directory with sprint YAML and session dir."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(SPRINT_YAML)
    (sprint_dir / "archive").mkdir()
    (tmp_path / ".session").mkdir()
    return tmp_path


@pytest.fixture
def project_no_jira(tmp_path: Path) -> Path:
    """Create a project with a story that has no Jira key."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(NO_JIRA_YAML)
    (sprint_dir / "archive").mkdir()
    (tmp_path / ".session").mkdir()
    return tmp_path


# =============================================================================
# AC1: State machine defined with valid transitions
# =============================================================================


class TestTransitionMap:
    """AC1: State machine rules are defined and enforced."""

    def test_transitions_map_exists(self) -> None:
        """TRANSITIONS constant should define valid state transitions."""
        assert isinstance(TRANSITIONS, dict)
        assert len(TRANSITIONS) > 0

    def test_backlog_transitions(self) -> None:
        """backlog can transition to in_progress or canceled."""
        assert TRANSITIONS["backlog"] == {"in_progress", "canceled"}

    def test_in_progress_transitions(self) -> None:
        """in_progress can transition to review or canceled."""
        assert TRANSITIONS["in_progress"] == {"review", "canceled"}

    def test_review_transitions(self) -> None:
        """review can transition to done or canceled."""
        assert TRANSITIONS["review"] == {"done", "canceled"}

    def test_done_transitions(self) -> None:
        """done can only transition to canceled."""
        assert TRANSITIONS["done"] == {"canceled"}

    def test_canceled_is_terminal(self) -> None:
        """canceled is a terminal state — no transitions allowed."""
        assert TRANSITIONS["canceled"] == set()

    def test_all_statuses_in_map(self) -> None:
        """Every valid status should be a key in the transitions map."""
        expected = {"backlog", "in_progress", "review", "done", "canceled"}
        assert set(TRANSITIONS.keys()) == expected

    def test_canceled_reachable_from_all_non_terminal(self) -> None:
        """canceled should be reachable from every non-terminal state."""
        for status, targets in TRANSITIONS.items():
            if status != "canceled":
                assert "canceled" in targets, f"canceled not reachable from {status}"


# =============================================================================
# AC2: Single function updates YAML + Jira + session atomically
# =============================================================================


class TestTransitionStoryHappyPath:
    """AC2: transition_story updates YAML, Jira, and session."""

    @patch("pf.sprint.story_transition.get_client")
    def test_backlog_to_in_progress(self, mock_get_client: MagicMock, project: Path) -> None:
        """backlog → in_progress should update YAML, Jira, and create session."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is True
        assert result["story_id"] == "125-7"
        assert result["from_status"] == "backlog"
        assert result["to_status"] == "in_progress"
        assert isinstance(result["steps"], list)
        assert len(result["steps"]) >= 2  # At least YAML + Jira

        # YAML updated
        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "in_progress"
        assert "started" in story  # Auto-set started date

        # Jira transitioned
        mock_client.transition_sync.assert_called_once_with("MSSCI-15428", "In Progress")

    @patch("pf.sprint.story_transition.get_client")
    def test_in_progress_to_review(self, mock_get_client: MagicMock, project: Path) -> None:
        """in_progress → review should update YAML and Jira."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-8", "review")

        assert result["success"] is True
        assert result["from_status"] == "in_progress"
        assert result["to_status"] == "review"

        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][1]
        assert story["status"] == "review"

        mock_client.transition_sync.assert_called_once_with("MSSCI-15429", "In Review")

    @patch("pf.sprint.story_transition.get_client")
    def test_review_to_done(self, mock_get_client: MagicMock, project: Path) -> None:
        """review → done should update YAML, Jira, and set completed date."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-9", "done")

        assert result["success"] is True
        assert result["from_status"] == "review"
        assert result["to_status"] == "done"

        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][2]
        assert story["status"] == "done"
        assert "completed" in story

        mock_client.transition_sync.assert_called_once_with("MSSCI-15430", "Done")

    @patch("pf.sprint.story_transition.get_client")
    def test_any_to_canceled(self, mock_get_client: MagicMock, project: Path) -> None:
        """Any non-terminal state → canceled should work."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "canceled", reason="Descoped")

        assert result["success"] is True
        assert result["to_status"] == "canceled"

        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "canceled"

    @patch("pf.sprint.story_transition.get_client")
    def test_result_includes_jira_key(self, mock_get_client: MagicMock, project: Path) -> None:
        """Result should include the Jira key from sprint YAML."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["jira_key"] == "MSSCI-15428"

    @patch("pf.sprint.story_transition.get_client")
    def test_steps_include_yaml_update(self, mock_get_client: MagicMock, project: Path) -> None:
        """Steps array should include a yaml_update step with success."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        yaml_steps = [s for s in result["steps"] if s["action"] == "yaml_update"]
        assert len(yaml_steps) == 1
        assert yaml_steps[0]["success"] is True

    @patch("pf.sprint.story_transition.get_client")
    def test_steps_include_jira_transition(self, mock_get_client: MagicMock, project: Path) -> None:
        """Steps array should include a jira_transition step."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        jira_steps = [s for s in result["steps"] if s["action"] == "jira_transition"]
        assert len(jira_steps) == 1
        assert jira_steps[0]["success"] is True

    @patch("pf.sprint.story_transition.get_client")
    def test_dry_run_no_changes(self, mock_get_client: MagicMock, project: Path) -> None:
        """dry_run=True should validate but not write anything."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        sprint_path = project / "sprint" / "current-sprint.yaml"
        original = sprint_path.read_text()

        result = transition_story(project, "125-7", "in_progress", dry_run=True)

        assert result["success"] is True
        assert sprint_path.read_text() == original
        mock_client.transition_sync.assert_not_called()


# =============================================================================
# AC3: Invalid transitions rejected with clear errors
# =============================================================================


class TestInvalidTransitions:
    """AC3: Invalid transitions are rejected before any changes."""

    def test_done_to_in_progress_rejected(self, project: Path) -> None:
        """done → in_progress is not a valid transition."""
        result = transition_story(project, "125-10", "in_progress")

        assert result["success"] is False
        assert "error" in result
        assert "done" in result["error"]
        assert "in_progress" in result["error"]
        assert result["steps"] == []

    def test_done_to_backlog_rejected(self, project: Path) -> None:
        """done → backlog is not a valid transition."""
        result = transition_story(project, "125-10", "backlog")

        assert result["success"] is False
        assert result["steps"] == []

    def test_backlog_to_review_rejected(self, project: Path) -> None:
        """backlog → review skips in_progress — not allowed."""
        result = transition_story(project, "125-7", "review")

        assert result["success"] is False
        assert "backlog" in result["error"]
        assert "review" in result["error"]

    def test_backlog_to_done_rejected(self, project: Path) -> None:
        """backlog → done skips intermediate states — not allowed."""
        result = transition_story(project, "125-7", "done")

        assert result["success"] is False

    def test_canceled_to_anything_rejected(self, project: Path) -> None:
        """canceled is terminal — cannot transition out."""
        # First cancel the story
        sprint_path = project / "sprint" / "current-sprint.yaml"
        data = read_sprint(sprint_path)
        data["epics"][0]["stories"][0]["status"] = "canceled"
        from pf.sprint.yaml_io import write_sprint
        write_sprint(sprint_path, data)

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        assert "canceled" in result["error"]

    def test_same_status_rejected(self, project: Path) -> None:
        """Transitioning to current status should be rejected."""
        result = transition_story(project, "125-7", "backlog")

        assert result["success"] is False
        assert "error" in result

    def test_invalid_target_status_rejected(self, project: Path) -> None:
        """An unrecognized target status should be rejected."""
        result = transition_story(project, "125-7", "yolo")

        assert result["success"] is False
        assert "error" in result

    def test_no_yaml_changes_on_invalid(self, project: Path) -> None:
        """Invalid transition should not modify YAML at all."""
        sprint_path = project / "sprint" / "current-sprint.yaml"
        original = sprint_path.read_text()

        transition_story(project, "125-10", "in_progress")

        assert sprint_path.read_text() == original

    def test_error_message_lists_valid_targets(self, project: Path) -> None:
        """Error for invalid transition should list what IS valid."""
        result = transition_story(project, "125-10", "in_progress")

        assert result["success"] is False
        # Should mention canceled as the only valid target from done
        assert "canceled" in result["error"]

    def test_story_not_found(self, project: Path) -> None:
        """Non-existent story ID returns error."""
        result = transition_story(project, "999-1", "in_progress")

        assert result["success"] is False
        assert "999-1" in result["error"]

    def test_invalid_story_id_format(self, project: Path) -> None:
        """Malformed story ID returns error."""
        result = transition_story(project, "bad", "in_progress")

        assert result["success"] is False
        assert "error" in result


# =============================================================================
# AC4: Partial failure reports which steps succeeded/failed
# =============================================================================


class TestPartialFailure:
    """AC4: When some steps fail, result reports exactly what happened."""

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_failure_yaml_persists(self, mock_get_client: MagicMock, project: Path) -> None:
        """If Jira fails, YAML should still be updated and result reports partial failure."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "No transition to 'In Progress' available",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        # Overall failure due to partial
        assert result["success"] is False
        assert "Partial failure" in result["error"]

        # YAML was still updated (persisted)
        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "in_progress"

        # Steps report individual outcomes
        yaml_step = next(s for s in result["steps"] if s["action"] == "yaml_update")
        assert yaml_step["success"] is True

        jira_step = next(s for s in result["steps"] if s["action"] == "jira_transition")
        assert jira_step["success"] is False
        assert "error" in jira_step

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_exception_handled(self, mock_get_client: MagicMock, project: Path) -> None:
        """If Jira raises an exception, it should be caught and reported."""
        mock_client = MagicMock()
        mock_client.transition_sync.side_effect = ConnectionError("Jira unreachable")
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False

        jira_step = next(s for s in result["steps"] if s["action"] == "jira_transition")
        assert jira_step["success"] is False
        assert "Jira unreachable" in jira_step["error"]

    @patch("pf.sprint.story_transition.get_client")
    def test_missing_jira_key_skips_jira(self, mock_get_client: MagicMock, project_no_jira: Path) -> None:
        """Story without Jira key should skip Jira step and still succeed."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        result = transition_story(project_no_jira, "125-20", "in_progress")

        assert result["success"] is True
        assert result["jira_key"] is None

        # Jira was skipped
        jira_steps = [s for s in result["steps"] if s["action"] == "jira_transition"]
        assert len(jira_steps) == 1
        assert jira_steps[0].get("skipped") is True

        mock_client.transition_sync.assert_not_called()

    @patch("pf.sprint.story_transition.get_client")
    def test_steps_are_ordered(self, mock_get_client: MagicMock, project: Path) -> None:
        """Steps should be returned in execution order."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        step_nums = [s["step"] for s in result["steps"]]
        assert step_nums == sorted(step_nums)

    @patch("pf.sprint.story_transition.get_client")
    def test_step_count_matches_expectations(self, mock_get_client: MagicMock, project: Path) -> None:
        """Should have steps for: validate, yaml_update, jira_transition at minimum."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        actions = {s["action"] for s in result["steps"]}
        assert "yaml_update" in actions
        assert "jira_transition" in actions
