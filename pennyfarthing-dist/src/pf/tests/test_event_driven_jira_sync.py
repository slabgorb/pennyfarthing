"""Tests for event-driven Jira sync on story transitions.

Story: MSSCI-15429 - Event-driven Jira sync on story transitions

TDD RED phase: All tests should FAIL until implementation.

Every story transition via the state machine immediately syncs to Jira.
Batch reconcile/sync commands become audit tools that report drift,
not primary sync mechanism.

Acceptance Criteria:
1. AC1 - Story transitions sync to Jira in real-time
2. AC2 - pf sprint reconcile becomes audit-only (reports drift, doesn't fix)
3. AC3 - Transition failures are reported clearly, no silent drift
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_transition import transition_story

# =============================================================================
# Test Fixtures
# =============================================================================

SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2608"
  jira_sprint_id: 280
  jira_sprint_name: "TO Sprint 2608"
  goal: Event-driven Jira sync
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
        title: Story lifecycle state machine
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
        status: in_review
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
def session_for_finish(project: Path) -> Path:
    """Create a session file for the finish story tests."""
    session_path = project / ".session" / "125-9-session.md"
    session_path.write_text(
        "# Story 125-9: Focus commands\n\n"
        "- **Jira Key:** MSSCI-15430\n"
        "- **Workflow:** trivial\n"
        "- **Phase:** approved\n"
        "- **Repos:** pennyfarthing\n"
        "- **PR:** #999 - Focus commands\n"
        "- **Branch:** feature/125-9-focus-commands\n"
    )
    return session_path


# =============================================================================
# AC1: Story transitions sync to Jira in real-time
# =============================================================================


class TestClaimUsesStateMachine:
    """AC1: claim_story delegates Jira transition to the state machine."""

    @patch("pf.jira.client.get_current_user_email", return_value="test@example.com")
    @patch("pf.jira.claim.get_client")
    def test_claim_does_not_call_transition_sync_directly(
        self,
        mock_get_client: MagicMock,
        mock_email: MagicMock,
    ) -> None:
        """claim_story should NOT call client.transition_sync directly.

        Currently claim_story calls client.transition_sync("In Progress")
        directly (line 121 of claim.py). After implementation, it should
        delegate to transition_story so all transitions flow through the
        state machine. This test verifies the direct call is removed.
        """
        from pf.jira.claim import claim_story

        mock_client = MagicMock()
        mock_client.get_issue_sync.return_value = {
            "key": "MSSCI-15428",
            "fields": {
                "summary": "Test",
                "status": {"name": "To Do"},
                "assignee": None,
            },
        }
        mock_client.assign_issue_sync.return_value = {"success": True}
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        claim_story("MSSCI-15428")

        # Should NOT call transition_sync directly — the state machine handles it
        mock_client.transition_sync.assert_not_called()

    def test_claim_module_imports_transition_story(self) -> None:
        """claim.py should import transition_story from the state machine.

        This verifies the wiring: claim delegates to the state machine
        rather than calling Jira directly.
        """
        import pf.jira.claim as claim_module

        assert hasattr(claim_module, "transition_story"), (
            "claim.py should import transition_story from pf.sprint.story_transition"
        )


class TestFinishUsesStateMachine:
    """AC1: finish_story delegates Jira transition to the state machine."""

    def test_finish_module_imports_transition_story(self) -> None:
        """story_finish.py should import transition_story from the state machine.

        This verifies the wiring: finish delegates to the state machine
        rather than calling Jira directly and updating YAML itself.
        """
        import pf.sprint.story_finish as finish_module

        assert hasattr(finish_module, "transition_story"), (
            "story_finish.py should import transition_story from pf.sprint.story_transition"
        )

    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.jira.client.get_client")
    def test_finish_does_not_call_jira_transition_directly(
        self,
        mock_get_client: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        project: Path,
        session_for_finish: Path,
    ) -> None:
        """finish_story should NOT call client.transition_sync directly.

        Currently finish_story calls get_client().transition_sync(jira_key, "Done")
        directly (line 190 of story_finish.py). After implementation, it should
        delegate to transition_story which handles both YAML + Jira atomically.
        """
        from pf.sprint.story_finish import finish_story

        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        finish_story(project, "125-9")

        # Should NOT call transition_sync directly — the state machine does it
        mock_client.transition_sync.assert_not_called()

    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.jira.client.get_client")
    def test_finish_does_not_update_yaml_status_directly(
        self,
        mock_get_client: MagicMock,
        mock_run: MagicMock,
        mock_pr_mode: MagicMock,
        project: Path,
        session_for_finish: Path,
    ) -> None:
        """finish_story should NOT directly set story['status'] = 'done' in YAML.

        The state machine handles YAML updates atomically with Jira sync.
        finish_story should delegate this to transition_story, not duplicate
        the logic with its own read_sprint/find_story/write_sprint cycle.
        """
        import pf.sprint.story_finish as story_finish_mod

        # write_sprint should not even be imported — transition_story handles
        # all YAML writes. Not having the import is a stronger guarantee than
        # mocking it and asserting not-called.
        assert not hasattr(story_finish_mod, "write_sprint"), (
            "story_finish should not import write_sprint — transition_story handles YAML updates"
        )


class TestAllTransitionsFireJiraSync:
    """AC1: Every valid transition through the state machine triggers Jira sync."""

    @patch("pf.sprint.story_transition.get_client")
    def test_backlog_to_in_progress_syncs_jira(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """backlog → in_progress should sync to Jira."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is True
        mock_client.transition_sync.assert_called_once_with("MSSCI-15428", "In Progress")

    @patch("pf.sprint.story_transition.get_client")
    def test_in_progress_to_in_review_syncs_jira(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """in_progress → in_review should sync to Jira."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-8", "in_review")

        assert result["success"] is True
        mock_client.transition_sync.assert_called_once_with("MSSCI-15429", "In Review")

    @patch("pf.sprint.story_transition.get_client")
    def test_in_review_to_done_syncs_jira(self, mock_get_client: MagicMock, project: Path) -> None:
        """in_review → done should sync to Jira."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-9", "done")

        assert result["success"] is True
        mock_client.transition_sync.assert_called_once_with("MSSCI-15430", "Done")

    @patch("pf.sprint.story_transition.get_client")
    def test_any_to_canceled_syncs_jira(self, mock_get_client: MagicMock, project: Path) -> None:
        """any → canceled should sync to Jira."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "canceled")

        assert result["success"] is True
        mock_client.transition_sync.assert_called_once_with("MSSCI-15428", "Canceled")


# =============================================================================
# AC2: pf sprint reconcile becomes audit-only
# =============================================================================


class TestReconcileAuditOnly:
    """AC2: reconcile reports drift but never fixes it."""

    @patch("pf.jira.reconcile.get_client")
    @patch("pf.jira.reconcile.load_sprint")
    def test_reconcile_fix_flag_is_deprecated(
        self,
        mock_load: MagicMock,
        mock_get_client: MagicMock,
    ) -> None:
        """reconcile(fix=True) should indicate that fix mode is deprecated.

        With event-driven sync, reconcile is audit-only. The result should
        include fix_deprecated=True so callers know fix mode no longer applies.
        """
        from pf.jira.reconcile import reconcile

        mock_load.return_value = {
            "sprint": {"name": "Test", "jira_sprint_id": 280},
            "epics": [
                {
                    "id": "125",
                    "jira": "MSSCI-15421",
                    "title": "Test Epic",
                    "stories": [
                        {
                            "id": "125-1",
                            "jira": "MSSCI-15428",
                            "status": "in_progress",
                            "title": "Test Story",
                        },
                    ],
                },
            ],
        }

        mock_client = MagicMock()
        mock_client.get_issue_sync.return_value = {
            "key": "MSSCI-15428",
            "fields": {"status": {"name": "In Progress"}},
        }
        mock_client.search_issues_sync.return_value = []
        mock_get_client.return_value = mock_client

        result = reconcile(fix=True)

        # Result must explicitly flag that fix mode is deprecated
        assert result.get("fix_deprecated") is True, (
            "reconcile(fix=True) should return fix_deprecated=True"
        )

    @patch("pf.jira.reconcile.get_client")
    @patch("pf.jira.reconcile.load_sprint")
    def test_reconcile_never_calls_add_to_sprint(
        self,
        mock_load: MagicMock,
        mock_get_client: MagicMock,
    ) -> None:
        """reconcile should never call add_to_sprint_sync, even with fix=True.

        Reconcile is now audit-only. All mutations go through the state machine.
        """
        from pf.jira.reconcile import reconcile

        mock_load.return_value = {
            "sprint": {"name": "Test", "jira_sprint_id": 280},
            "epics": [
                {
                    "id": "125",
                    "jira": "MSSCI-15421",
                    "title": "Test Epic",
                    "stories": [
                        {
                            "id": "125-1",
                            "jira": "MSSCI-15428",
                            "status": "backlog",
                            "title": "Test Story",
                        },
                    ],
                },
            ],
        }

        mock_client = MagicMock()
        mock_client.get_issue_sync.return_value = {
            "key": "MSSCI-15428",
            "fields": {"status": {"name": "To Do"}},
        }
        # Simulate a story that's in YAML but not in Jira sprint
        mock_client.search_issues_sync.side_effect = [
            [],  # sprint issues (no orphans)
            [{"key": "MSSCI-15428", "fields": {"summary": "Test"}}],  # not in sprint
        ]
        mock_get_client.return_value = mock_client

        reconcile(fix=True)

        # Should NEVER call add_to_sprint_sync — that's a mutation
        mock_client.add_to_sprint_sync.assert_not_called()

    @patch("pf.jira.reconcile.get_client")
    @patch("pf.jira.reconcile.load_sprint")
    def test_reconcile_reports_drift_categories(
        self,
        mock_load: MagicMock,
        mock_get_client: MagicMock,
    ) -> None:
        """reconcile should report drift in clear categories."""
        from pf.jira.reconcile import reconcile

        mock_load.return_value = {
            "sprint": {"name": "Test", "jira_sprint_id": 280},
            "epics": [
                {
                    "id": "125",
                    "jira": "MSSCI-15421",
                    "title": "Test Epic",
                    "stories": [
                        {
                            "id": "125-1",
                            "jira": "MSSCI-15428",
                            "status": "in_progress",
                            "title": "Drifted Story",
                        },
                    ],
                },
            ],
        }

        mock_client = MagicMock()
        # Jira says "To Do" but YAML says "in_progress" — status drift
        mock_client.get_issue_sync.return_value = {
            "key": "MSSCI-15428",
            "fields": {"status": {"name": "To Do"}},
        }
        mock_client.search_issues_sync.return_value = []
        mock_get_client.return_value = mock_client

        result = reconcile()

        assert result["success"] is True
        assert len(result["mismatches"]) > 0
        assert "report" in result
        assert "audit" in result["report"].lower() or "drift" in result["report"].lower(), (
            "Report should use audit/drift language, not fix language"
        )


# =============================================================================
# AC3: Transition failures are reported clearly, no silent drift
# =============================================================================


class TestClearFailureReporting:
    """AC3: Failures produce clear, actionable error messages."""

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_failure_includes_drift_warning(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """When Jira sync fails, result should flag drift state.

        YAML was updated but Jira was not — this is drift. The result
        should make this explicit so callers can act on it.
        """
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "Transition 'In Progress' not available",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        # Should explicitly flag that drift now exists
        assert result.get("drift") is True, (
            "Result should include drift=True when YAML updated but Jira failed"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_failure_includes_remediation(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """Jira failure should include a remediation suggestion.

        The user needs to know HOW to fix the drift — e.g., run
        `pf jira move MSSCI-XXXXX "In Progress"` manually.
        """
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "No transition available",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        assert "remediation" in result, (
            "Result should include a remediation field with fix instructions"
        )
        assert "MSSCI-15428" in result["remediation"], (
            "Remediation should reference the specific Jira key"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_exception_includes_drift_warning(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """Jira exception (network error etc.) should also flag drift."""
        mock_client = MagicMock()
        mock_client.transition_sync.side_effect = ConnectionError("Network timeout")
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        assert result.get("drift") is True, "Network errors should also flag drift state"

    @patch("pf.sprint.story_transition.get_client")
    def test_partial_failure_error_includes_step_details(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """Partial failure error message should specify which steps failed."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {
            "success": False,
            "error": "Invalid transition",
        }
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        # Error should name the specific failed step
        jira_step = next(s for s in result["steps"] if s["action"] == "jira_transition")
        assert jira_step["success"] is False
        assert "error" in jira_step

        # The top-level error should be more descriptive than just "Partial failure"
        assert "jira" in result["error"].lower() or "drift" in result["error"].lower(), (
            "Top-level error should mention Jira or drift, not just 'Partial failure'"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_successful_transition_no_drift_flag(
        self, mock_get_client: MagicMock, project: Path
    ) -> None:
        """Successful transition should not have drift flag."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is True
        assert result.get("drift") is not True, "Successful transition should not flag drift"

    @patch("pf.sprint.story_transition.get_client")
    def test_no_silent_swallowed_errors(self, mock_get_client: MagicMock, project: Path) -> None:
        """Every Jira error should surface in the result — no silent failures.

        The result should contain ALL error information, not swallow any
        exception details.
        """
        mock_client = MagicMock()
        mock_client.transition_sync.side_effect = RuntimeError("Jira API returned 403: Forbidden")
        mock_get_client.return_value = mock_client

        result = transition_story(project, "125-7", "in_progress")

        assert result["success"] is False
        # The specific error message should be preserved, not genericized
        jira_step = next(s for s in result["steps"] if s["action"] == "jira_transition")
        assert "403" in jira_step["error"] or "Forbidden" in jira_step["error"], (
            "Original error details should be preserved in step error"
        )
