"""Tests for story finish with non-Jira story IDs — hobby projects without Jira.

Story: 147-11 — Jira integration should be optional

TDD RED phase: All tests should FAIL until implementation.

Bug: `pf sprint story finish` rejects non-Jira story IDs like E1-13
('Invalid story ID format') and silently skips YAML status update.

Root cause: story_transition.py validates `parts[0].isdigit()` which
rejects alphanumeric epic prefixes. The finish pipeline assumes Jira
is always present.

Acceptance Criteria:
1. AC1 - finish succeeds for non-Jira story IDs (e.g., E1-13)
2. AC2 - YAML status updates to done without Jira
3. AC3 - Session archival works without Jira key
4. AC4 - Jira transitions skipped (not errored) when no Jira configured
5. AC5 - Existing Jira-enabled projects continue to work
"""

import shutil
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_transition import transition_story
from pf.sprint.yaml_io import read_sprint

# =============================================================================
# Test Data
# =============================================================================

# Hobby project sprint — no Jira keys, alphanumeric epic IDs
HOBBY_SPRINT_YAML = """\
sprint:
  name: "Hobby Sprint 1"
  goal: Build side project
  start_date: 2026-03-01
  end_date: 2026-03-15
  status: active
epics:
  - id: "E1"
    type: epic
    title: "Core Features"
    priority: p1
    status: in_progress
    stories:
      - id: E1-13
        title: Add widget support
        points: 2
        priority: p2
        status: in_progress
        workflow: tdd
      - id: E1-14
        title: Add gadget support
        points: 1
        priority: p3
        status: in_review
        workflow: trivial
      - id: E1-15
        title: Backlog item
        points: 1
        priority: p3
        status: backlog
        workflow: trivial
"""

# Standard Jira project sprint — for AC5 regression
JIRA_SPRINT_YAML = """\
sprint:
  name: "TO Sprint 2610"
  jira_sprint_id: 290
  jira_sprint_name: "TO Sprint 2610"
  goal: Sprint work
  start_date: 2026-03-10
  end_date: 2026-03-23
  status: active
epics:
  - id: "148"
    type: epic
    title: "Standard Epic"
    priority: p1
    status: in_progress
    jira: PROJ-16500
    stories:
      - id: 148-1
        title: Standard Jira story
        points: 3
        priority: p2
        status: in_progress
        jira: PROJ-16501
        workflow: tdd
      - id: 148-2
        title: Jira story in review
        points: 2
        priority: p2
        status: in_review
        jira: PROJ-16502
        workflow: tdd
"""

# Session file content for a non-Jira story
HOBBY_SESSION = """\
---
story_id: "E1-13"
jira_key: "none"
epic: "E1"
workflow: "tdd"
---

# Story E1-13: Add widget support

## Story Details

- **ID:** E1-13
- **Jira:** none
- **Workflow:** tdd
- **Branch:** none
"""
# Branch is the none-sentinel (155-34 pre-adjustment): these worlds pin
# non-Jira story-id acceptance, not branch verification — the sentinel stays
# on the accepted no-PR arm before and after the 155-34 unmerged-branch guard.

# Session file for a Jira story
JIRA_SESSION = """\
---
story_id: "148-1"
jira_key: "PROJ-16501"
epic: "148"
workflow: "tdd"
---

# Story 148-1: Standard Jira story

## Story Details

- **ID:** 148-1
- **Jira:** [PROJ-16501](https://jira.example.com/browse/PROJ-16501)
- **Workflow:** tdd
- **Branch:** feature/PROJ-16501-standard-story
- **PR:** #42 - Standard story PR
"""


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def hobby_project(tmp_path: Path) -> Path:
    """Create a hobby project dir with non-Jira sprint YAML."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(HOBBY_SPRINT_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "E1-13-session.md").write_text(HOBBY_SESSION)
    return tmp_path


@pytest.fixture
def jira_project(tmp_path: Path) -> Path:
    """Create a standard Jira project dir for regression testing."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "current-sprint.yaml").write_text(JIRA_SPRINT_YAML)
    (sprint_dir / "archive").mkdir()
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "148-1-session.md").write_text(JIRA_SESSION)
    return tmp_path


# =============================================================================
# AC1: finish succeeds for non-Jira story IDs (e.g., E1-13)
# =============================================================================


class TestNonJiraStoryIdAccepted:
    """AC1: Story IDs with alphanumeric epic prefixes must be accepted."""

    def test_transition_accepts_alphanumeric_epic_prefix(
        self, hobby_project: Path
    ) -> None:
        """transition_story should accept 'E1-13' without 'Invalid story ID format'."""
        result = transition_story(hobby_project, "E1-13", "in_review")

        # Must not fail with "Invalid story ID format"
        assert result["success"] is True, (
            f"Expected success but got error: {result.get('error')}"
        )
        assert result["story_id"] == "E1-13"
        assert result["from_status"] == "in_progress"
        assert result["to_status"] == "in_review"

    def test_transition_accepts_various_non_numeric_prefixes(
        self, tmp_path: Path
    ) -> None:
        """Various alphanumeric epic ID formats should be accepted."""
        for epic_id, story_id in [
            ("E1", "E1-3"),
            ("proj2", "proj2-1"),
            ("A", "A-5"),
            ("side1", "side1-2"),
        ]:
            sprint_dir = tmp_path / f"sprint_{epic_id}"
            sprint_dir.mkdir(exist_ok=True)
            (sprint_dir / "current-sprint.yaml").write_text(f"""\
sprint:
  name: "Test"
  status: active
epics:
  - id: "{epic_id}"
    type: epic
    title: "Test Epic"
    status: in_progress
    stories:
      - id: {story_id}
        title: Test story
        points: 1
        status: in_progress
        workflow: trivial
""")
            project = tmp_path / f"proj_{epic_id}"
            project.mkdir(exist_ok=True)
            project_sprint = project / "sprint"
            project_sprint.mkdir(exist_ok=True)
            shutil.copy2(
                sprint_dir / "current-sprint.yaml",
                project_sprint / "current-sprint.yaml",
            )

            result = transition_story(project, story_id, "in_review")
            assert result["success"] is True, (
                f"Story ID '{story_id}' rejected: {result.get('error')}"
            )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_story_succeeds_for_non_jira_id(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        hobby_project: Path,
    ) -> None:
        """finish_story should complete successfully for non-Jira story IDs."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(hobby_project, "E1-13")

        assert result["success"] is True, (
            f"finish_story failed: {result.get('error')}"
        )
        assert result["story_id"] == "E1-13"


# =============================================================================
# AC2: YAML status updates to done without Jira
# =============================================================================


class TestYamlUpdateWithoutJira:
    """AC2: YAML status must update to 'done' even without Jira."""

    def test_yaml_status_updated_to_in_review(self, hobby_project: Path) -> None:
        """YAML status should update from in_progress to in_review for non-Jira story."""
        result = transition_story(hobby_project, "E1-13", "in_review")

        assert result["success"] is True, result.get("error")

        data = read_sprint(hobby_project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "in_review"

    def test_yaml_status_updated_to_done(self, hobby_project: Path) -> None:
        """YAML status should update through to 'done' for non-Jira story."""
        # First: in_progress -> in_review
        result1 = transition_story(hobby_project, "E1-13", "in_review")
        assert result1["success"] is True, (
            f"in_review transition failed: {result1.get('error')}"
        )

        # Then: in_review -> done
        result2 = transition_story(hobby_project, "E1-13", "done")
        assert result2["success"] is True, (
            f"done transition failed: {result2.get('error')}"
        )

        data = read_sprint(hobby_project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "done"
        assert "completed" in story

    def test_completed_date_set_on_done(self, hobby_project: Path) -> None:
        """Completed date should be set when transitioning to done without Jira."""
        # in_progress -> in_review -> done
        transition_story(hobby_project, "E1-13", "in_review")
        result = transition_story(hobby_project, "E1-13", "done")

        assert result["success"] is True, result.get("error")

        data = read_sprint(hobby_project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert "completed" in story
        # Should be a valid ISO date string
        assert len(story["completed"]) == 10  # YYYY-MM-DD


# =============================================================================
# AC3: Session archival works without Jira key
# =============================================================================


class TestSessionArchivalWithoutJira:
    """AC3: Session files are archived correctly without Jira keys."""

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_session_archived_with_story_id_name(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        hobby_project: Path,
    ) -> None:
        """Session should be archived as '{story_id}-session.md' when no Jira key."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        result = finish_story(hobby_project, "E1-13")

        assert result["success"] is True, result.get("error")

        # Session should be archived with story ID (not Jira key)
        archive_path = hobby_project / "sprint" / "archive" / "E1-13-session.md"
        assert archive_path.exists(), (
            f"Expected archived session at {archive_path}"
        )

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_original_session_removed_after_archive(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        hobby_project: Path,
    ) -> None:
        """Original session file should be removed after successful archival."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        finish_story(hobby_project, "E1-13")

        session_path = hobby_project / ".session" / "E1-13-session.md"
        assert not session_path.exists(), "Session file should have been removed"

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_archived_session_content_preserved(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        hobby_project: Path,
    ) -> None:
        """Archived session should contain the same content as the original."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        mock_run.return_value = MagicMock(returncode=0, stdout="")

        original_content = (
            hobby_project / ".session" / "E1-13-session.md"
        ).read_text()

        finish_story(hobby_project, "E1-13")

        archive_path = hobby_project / "sprint" / "archive" / "E1-13-session.md"
        assert archive_path.read_text() == original_content


# =============================================================================
# AC4: Jira transitions skipped (not errored) when no Jira configured
# =============================================================================


class TestJiraSkippedWhenNotConfigured:
    """AC4: Jira transitions should be gracefully skipped, not errored."""

    def test_transition_skips_jira_for_no_jira_story(
        self, hobby_project: Path
    ) -> None:
        """Jira step should be skipped (not errored) for stories without Jira key."""
        result = transition_story(hobby_project, "E1-13", "in_review")

        assert result["success"] is True, result.get("error")

        # Jira step should be present but skipped
        jira_steps = [
            s for s in result["steps"] if s["action"] == "jira_transition"
        ]
        assert len(jira_steps) == 1
        assert jira_steps[0].get("skipped") is True

    def test_transition_does_not_call_jira_client(
        self, hobby_project: Path
    ) -> None:
        """Jira client should never be instantiated for non-Jira stories."""
        with patch("pf.sprint.story_transition.get_client") as mock_get_client:
            result = transition_story(hobby_project, "E1-13", "in_review")

            assert result["success"] is True, result.get("error")
            mock_get_client.assert_not_called()

    def test_jira_key_is_none_in_result(self, hobby_project: Path) -> None:
        """Result should report jira_key as None for non-Jira stories."""
        result = transition_story(hobby_project, "E1-13", "in_review")

        assert result["success"] is True, result.get("error")
        assert result["jira_key"] is None

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_dry_run_shows_skip_jira(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        hobby_project: Path,
    ) -> None:
        """Dry run should show 'Skip Jira transition' for non-Jira stories."""
        from pf.sprint.story_finish import finish_story

        result = finish_story(hobby_project, "E1-13", dry_run=True)

        assert result["success"] is True
        jira_step = next(
            (s for s in result["steps"] if s["step"] == 3), None
        )
        assert jira_step is not None
        assert "Skip" in jira_step["action"] or "skip" in jira_step["action"].lower()


# =============================================================================
# AC5: Existing Jira-enabled projects continue to work
# =============================================================================


class TestJiraProjectsStillWork:
    """AC5: Regression — Jira-enabled projects must continue working."""

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_story_transition_still_works(
        self, mock_get_client: MagicMock, jira_project: Path
    ) -> None:
        """Standard numeric story IDs with Jira keys should still work."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(jira_project, "148-1", "in_review")

        assert result["success"] is True
        assert result["jira_key"] == "PROJ-16501"
        assert result["from_status"] == "in_progress"
        assert result["to_status"] == "in_review"

        mock_client.transition_sync.assert_called_once_with(
            "PROJ-16501", "In Review"
        )

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_story_yaml_updated(
        self, mock_get_client: MagicMock, jira_project: Path
    ) -> None:
        """YAML should be updated for Jira stories (regression)."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        transition_story(jira_project, "148-1", "in_review")

        data = read_sprint(jira_project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][0]
        assert story["status"] == "in_review"

    @patch("pf.sprint.story_transition.get_client")
    def test_jira_done_sets_completed_date(
        self, mock_get_client: MagicMock, jira_project: Path
    ) -> None:
        """Done transition for Jira stories should still set completed date."""
        mock_client = MagicMock()
        mock_client.transition_sync.return_value = {"success": True}
        mock_get_client.return_value = mock_client

        result = transition_story(jira_project, "148-2", "done")

        assert result["success"] is True

        data = read_sprint(jira_project / "sprint" / "current-sprint.yaml")
        story = data["epics"][0]["stories"][1]
        assert story["status"] == "done"
        assert "completed" in story

    @patch("pf.sprint.story_finish.transition_story")
    @patch("pf.sprint.story_finish._run")
    @patch("pf.common.pr_config.get_pr_merge_mode", return_value="auto")
    @patch("pf.sprint.story_finish._add_story_to_completed")
    def test_finish_story_works_with_jira(
        self,
        mock_add_completed: MagicMock,
        mock_pr_mode: MagicMock,
        mock_run: MagicMock,
        mock_transition: MagicMock,
        jira_project: Path,
    ) -> None:
        """finish_story should still work for standard Jira projects."""
        from pf.sprint.story_finish import finish_story

        mock_transition.return_value = {"success": True, "to_status": "done"}
        # finish now verifies the PR actually merged via `gh pr view --json state`
        # (story 155-1). The session carries PR #42, so the verify call must see
        # a MERGED state for the clean path; a single JSON stdout satisfies both
        # the `gh pr merge` (ignores stdout) and `gh pr view` (parsed) calls.
        mock_run.return_value = MagicMock(returncode=0, stdout='{"state": "MERGED", "mergedAt": "2026-08-04T00:00:00Z"}')

        result = finish_story(jira_project, "148-1")

        assert result["success"] is True
        assert result["story_id"] == "148-1"
        assert result["jira_key"] == "PROJ-16501"
