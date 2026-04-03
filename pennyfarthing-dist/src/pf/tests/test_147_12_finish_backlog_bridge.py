"""Tests for story 147-12: Fix story finish flow for non-Jira repos.

Story: 147-12 — Fix story finish flow for non-Jira repos — bridge backlog→done transitions

TDD RED phase: All tests should FAIL until implementation.

Two bugs:
1. finish_story() only bridges in_progress→in_review before transitioning to done.
   Stories in backlog status (common when work.py:start_work() never wrote in_progress)
   hit a wall: backlog→done is rejected by the TRANSITIONS map.
2. When a story HAS a Jira key but Jira is not configured (no token),
   transition_story() reports success:False with drift:True. finish_story()
   treats this as a failure and records warnings, even though the YAML update
   succeeded. The Jira failure should be suppressed when Jira is unconfigured.

Acceptance Criteria:
1. AC1 - finish_story bridges backlog→in_progress→in_review→done automatically
2. AC2 - Jira drift not reported when Jira is not configured (no token)
3. AC3 - Existing Jira-enabled finish flow unchanged (regression)
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_transition import transition_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Test Data
# =============================================================================

# Sprint with stories in various statuses, WITH Jira keys but Jira not configured
BACKLOG_SPRINT_YAML = """\
sprint:
  name: "Test Sprint"
  goal: Test finish flow
  start_date: 2026-04-01
  end_date: 2026-04-14
  status: active
epics:
  - id: "200"
    type: epic
    title: "Test Epic"
    priority: p1
    status: in_progress
    jira: PROJ-99999
    stories:
      - id: 200-1
        title: Story stuck in backlog
        points: 2
        priority: p0
        status: backlog
        jira: PROJ-99901
        workflow: tdd
      - id: 200-2
        title: Story in progress (existing behavior)
        points: 2
        priority: p1
        status: in_progress
        jira: PROJ-99902
        workflow: tdd
      - id: 200-3
        title: Story in review (existing behavior)
        points: 1
        priority: p1
        status: in_review
        jira: PROJ-99903
        workflow: trivial
      - id: 200-4
        title: Story in backlog without Jira key
        points: 1
        priority: p1
        status: backlog
        workflow: trivial
"""

BACKLOG_SESSION = """\
---
story_id: "200-1"
jira_key: "PROJ-99901"
epic: "200"
workflow: "tdd"
---

# Story 200-1: Story stuck in backlog

## Story Details

- **ID:** 200-1
- **Jira:** PROJ-99901
- **Workflow:** tdd
- **Branch:** feat/200-1-stuck-in-backlog
"""

NO_JIRA_SESSION = """\
---
story_id: "200-4"
jira_key: "none"
epic: "200"
workflow: "trivial"
---

# Story 200-4: Story in backlog without Jira key

## Story Details

- **ID:** 200-4
- **Jira:** none
- **Workflow:** trivial
- **Branch:** feat/200-4-no-jira-backlog
"""

IN_PROGRESS_SESSION = """\
---
story_id: "200-2"
jira_key: "PROJ-99902"
epic: "200"
workflow: "tdd"
---

# Story 200-2: Story in progress

## Story Details

- **ID:** 200-2
- **Jira:** [PROJ-99902](https://jira.example.com/browse/PROJ-99902)
- **Workflow:** tdd
- **Branch:** feat/200-2-in-progress
"""


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Project with stories in backlog, in_progress, and in_review."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(BACKLOG_SPRINT_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "200-1-session.md").write_text(BACKLOG_SESSION)
    (session_dir / "200-2-session.md").write_text(IN_PROGRESS_SESSION)
    (session_dir / "200-4-session.md").write_text(NO_JIRA_SESSION)
    return tmp_path


# =============================================================================
# AC1: finish_story bridges backlog→in_progress→in_review→done
# =============================================================================


class TestFinishBridgesFromBacklog:
    """AC1: finish_story must walk the full chain when story is in backlog."""

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    def test_finish_from_backlog_calls_transition_chain(
        self,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """finish_story should call transition_story multiple times to bridge
        from backlog through in_progress and in_review to done."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "200-1")

        assert result["success"] is True, f"finish_story failed: {result.get('error')}"

        # Should have called transition_story to bridge through intermediate states
        # At minimum: backlog→in_progress, in_progress→in_review, in_review→done
        call_targets = [call.args[2] for call in mock_transition.call_args_list]
        assert "in_progress" in call_targets, (
            f"Expected transition to in_progress, got calls: {call_targets}"
        )
        assert "in_review" in call_targets, (
            f"Expected transition to in_review, got calls: {call_targets}"
        )
        assert "done" in call_targets, (
            f"Expected transition to done, got calls: {call_targets}"
        )

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    def test_finish_from_backlog_succeeds(
        self,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """finish_story should report success when starting from backlog."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "200-1")

        assert result["success"] is True
        assert result["story_id"] == "200-1"

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    def test_finish_from_backlog_no_jira_key(
        self,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """finish_story should bridge from backlog even for non-Jira stories."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "200-4")

        assert result["success"] is True

        # Still should bridge through intermediate states
        call_targets = [call.args[2] for call in mock_transition.call_args_list]
        assert "in_progress" in call_targets

    @patch("pf.sprint.story_finish._add_story_to_completed")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.sprint.story_finish.transition_story")
    def test_finish_from_in_progress_still_works(
        self,
        mock_transition: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        mock_add_completed: MagicMock,
        project: Path,
    ) -> None:
        """Existing in_progress→in_review→done bridge must still work (regression)."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(project, "200-2")

        assert result["success"] is True

        # Should bridge in_progress→in_review, then in_review→done
        call_targets = [call.args[2] for call in mock_transition.call_args_list]
        assert "in_review" in call_targets
        assert "done" in call_targets


# =============================================================================
# AC2: Jira drift not reported when Jira is not configured
# =============================================================================


class TestJiraDriftSuppressedWhenUnconfigured:
    """AC2: When Jira has no token, transition_story should not report drift."""

    @patch("pf.sprint.story_transition.get_client")
    def test_no_drift_when_jira_unconfigured(
        self, mock_get_client: MagicMock, project: Path,
    ) -> None:
        """transition_story should succeed (not report drift) when Jira client
        has no token, even for stories WITH Jira keys."""
        # Simulate unconfigured Jira: client exists but token is empty
        mock_client = MagicMock()
        mock_client.token = ""
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "Could not get transitions",
        }
        mock_get_client.return_value = mock_client

        # Story 200-2 has Jira key PROJ-99902 and is in_progress
        result = transition_story(project, "200-2", "in_review")

        # YAML should still update
        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][1]
        assert story["status"] == "in_review"

        # The critical assertion: should NOT report drift when Jira is unconfigured
        assert result.get("drift") is not True, (
            "Should not report drift when Jira is not configured"
        )
        # Should succeed since YAML update worked and Jira was skippable
        assert result["success"] is True, (
            f"Should succeed when Jira is unconfigured, got error: {result.get('error')}"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_no_drift_warning_in_steps(
        self, mock_get_client: MagicMock, project: Path,
    ) -> None:
        """Steps should show Jira as skipped (not failed) when unconfigured."""
        mock_client = MagicMock()
        mock_client.token = ""
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "Could not get transitions",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "200-2", "in_review")

        jira_steps = [
            s for s in result["steps"] if s["action"] == "jira_transition"
        ]
        assert len(jira_steps) == 1

        jira_step = jira_steps[0]
        # Should be skipped, not failed
        assert jira_step.get("skipped") is True or jira_step.get("success") is True, (
            f"Jira step should be skipped when unconfigured, got: {jira_step}"
        )
        assert jira_step.get("success") is not False, (
            "Jira step should not report failure when unconfigured"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_no_remediation_when_jira_unconfigured(
        self, mock_get_client: MagicMock, project: Path,
    ) -> None:
        """Result should not include remediation instructions when Jira is unconfigured."""
        mock_client = MagicMock()
        mock_client.token = ""
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "Could not get transitions",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "200-2", "in_review")

        assert "remediation" not in result, (
            f"Should not suggest remediation when Jira unconfigured, got: {result.get('remediation')}"
        )


# =============================================================================
# AC3: Existing Jira-enabled finish flow unchanged (regression)
# =============================================================================


class TestJiraEnabledRegressions:
    """AC3: When Jira IS configured and working, behavior is unchanged."""

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_failure_still_reports_drift_when_configured(
        self, mock_get_client: MagicMock, project: Path,
    ) -> None:
        """When Jira IS configured (has token) but transition fails,
        drift SHOULD still be reported — this is a real sync problem."""
        mock_client = MagicMock()
        mock_client.token = "real-api-token"
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "No transition to 'In Review' available",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "200-2", "in_review")

        # YAML should still update (YAML-first principle)
        data = read_sprint(project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][1]
        assert story["status"] == "in_review"

        # But drift SHOULD be reported when Jira is configured
        assert result["success"] is False, "Should report failure when configured Jira fails"
        assert result.get("drift") is True, "Should report drift when configured Jira fails"
        assert "remediation" in result, "Should suggest remediation for real Jira failures"

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_success_still_works(
        self, mock_get_client: MagicMock, project: Path,
    ) -> None:
        """Normal successful Jira transition should still work."""
        mock_client = MagicMock()
        mock_client.token = "real-api-token"
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "200-2", "in_review")

        assert result["success"] is True
        assert result.get("drift") is not True
        assert "remediation" not in result
