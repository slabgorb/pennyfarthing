"""Tests for sprint story finish module.

Verifies that finish_story correctly:
- Parses session metadata
- Updates sprint YAML via read_sprint/write_sprint (shard-aware)
- Archives session files
- Handles dry-run mode
- Returns result objects per ADR-0008

Run with: python -m pytest tests/python/test_story_finish.py -v
"""

import os
import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

from pennyfarthing_scripts.sprint.story_finish import (
    _extract_branch,
    _extract_jira_key,
    _extract_pr_number,
    _parse_session,
    finish_story,
)


@pytest.fixture
def project_tree(tmp_path):
    """Create a minimal project tree with sharded sprint YAML."""
    # Sprint index (sharded)
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir()
    (sprint_dir / "archive").mkdir()

    index = textwrap.dedent("""\
        sprint:
          name: TO Sprint 2606
          status: active
        epics:
          - MSSCI-14465
        stories:
          - id: MSSCI-14394
            jira: MSSCI-14394
            title: standalone bug
            points: 2
            status: done
            completed: '2026-02-06'
    """)
    (sprint_dir / "current-sprint.yaml").write_text(index)

    # Epic shard
    shard = textwrap.dedent("""\
        id: epic-83
        title: "Complexity + Dependencies Tools"
        jira: MSSCI-14465
        status: backlog
        points: 6
        stories:
          - id: "83-1"
            title: "Python complexity module"
            points: 2
            priority: P0
            status: done
            repos: pennyfarthing
            jira: MSSCI-14466
            completed: "2026-02-08"
          - id: "83-2"
            title: "Python dependencies module"
            points: 2
            priority: P0
            status: planning
            assigned_to: dev-agent
            repos: pennyfarthing
            jira: MSSCI-14467
    """)
    (sprint_dir / "epic-MSSCI-14465.yaml").write_text(shard)

    # Session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    session = textwrap.dedent("""\
        # Story 83-2: Python dependencies module

        **Jira:** MSSCI-14467
        **Branch:** feature/83-2-python-dependencies-module
        **PR:** #748 - Python dependencies module
        **Workflow:** tdd
        **Phase:** finish
        **Repos:** pennyfarthing
    """)
    (session_dir / "83-2-session.md").write_text(session)

    return tmp_path


class TestParseSession:
    """Test session metadata extraction."""

    def test_parse_fields(self, project_tree):
        session = project_tree / ".session" / "83-2-session.md"
        fields = _parse_session(session)
        assert fields["jira"] == "MSSCI-14467"
        assert fields["branch"] == "feature/83-2-python-dependencies-module"
        assert "748" in fields["pr"]

    def test_parse_missing_file(self, tmp_path):
        fields = _parse_session(tmp_path / "nonexistent.md")
        assert fields == {}


class TestExtractFields:
    """Test individual field extractors."""

    def test_jira_key_plain(self):
        assert _extract_jira_key({"jira": "MSSCI-14467"}) == "MSSCI-14467"

    def test_jira_key_markdown_link(self):
        assert _extract_jira_key({"jira": "[MSSCI-14467](https://jira.example.com)"}) == "MSSCI-14467"

    def test_jira_key_na(self):
        assert _extract_jira_key({"jira": "N/A (infra fix)"}) is None

    def test_jira_key_missing(self):
        assert _extract_jira_key({}) is None

    def test_pr_number(self):
        assert _extract_pr_number({"pr": "#748 - Python dependencies"}) == "748"

    def test_pr_number_missing(self):
        assert _extract_pr_number({}) is None

    def test_branch_plain(self):
        assert _extract_branch({"branch": "feature/83-2-foo"}) == "feature/83-2-foo"

    def test_branch_with_annotation(self):
        assert _extract_branch({"branch": "feature/83-2-foo (pushed)"}) == "feature/83-2-foo"

    def test_branch_missing(self):
        assert _extract_branch({}) is None


class TestFinishStoryDryRun:
    """Test dry-run mode."""

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_dry_run_returns_steps(self, mock_run, project_tree):
        result = finish_story(project_tree, "83-2", dry_run=True)
        assert result["success"] is True
        assert result["dry_run"] is True
        assert result["jira_key"] == "MSSCI-14467"
        assert len(result["steps"]) == 7

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_dry_run_no_side_effects(self, mock_run, project_tree):
        finish_story(project_tree, "83-2", dry_run=True)
        # Session file should still exist
        assert (project_tree / ".session" / "83-2-session.md").exists()
        # No archive created
        assert not (project_tree / "sprint" / "archive" / "MSSCI-14467-session.md").exists()
        # YAML unchanged
        shard = (project_tree / "sprint" / "epic-MSSCI-14465.yaml").read_text()
        assert "status: planning" in shard


class TestFinishStoryYamlUpdate:
    """Test the critical YAML update (step 4) — the bug fix."""

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_updates_story_status_to_done(self, mock_run, project_tree):
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        result = finish_story(project_tree, "83-2")
        assert result["success"] is True

        # Read back the shard file directly to verify the write
        from pennyfarthing_scripts.sprint.yaml_io import read_sprint
        data = read_sprint(project_tree / "sprint" / "current-sprint.yaml")
        for epic in data.get("epics", []):
            for story in epic.get("stories", []):
                if story.get("id") == "83-2":
                    assert story["status"] == "done"
                    assert "completed" in story
                    assert story["assigned_to"] == "dev-agent"
                    return
        pytest.fail("Story 83-2 not found in sprint data after finish")

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_does_not_modify_other_stories(self, mock_run, project_tree):
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        finish_story(project_tree, "83-2")

        from pennyfarthing_scripts.sprint.yaml_io import read_sprint
        data = read_sprint(project_tree / "sprint" / "current-sprint.yaml")
        for epic in data.get("epics", []):
            for story in epic.get("stories", []):
                if story.get("id") == "83-1":
                    assert story["status"] == "done"  # Was already done
                    return
        pytest.fail("Story 83-1 not found")

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_archives_session_file(self, mock_run, project_tree):
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        finish_story(project_tree, "83-2")
        assert (project_tree / "sprint" / "archive" / "MSSCI-14467-session.md").exists()

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_removes_session_file(self, mock_run, project_tree):
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        finish_story(project_tree, "83-2")
        assert not (project_tree / ".session" / "83-2-session.md").exists()


class TestFinishStoryErrors:
    """Test error handling."""

    def test_missing_session_file(self, project_tree):
        result = finish_story(project_tree, "99-1")
        assert result["success"] is False
        assert "not found" in result["error"].lower()

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_no_jira_key_still_succeeds(self, mock_run, project_tree):
        # When no Jira key in session or shard, finish should still succeed
        # but skip Jira transition and use story_id for archive name
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        session = project_tree / ".session" / "99-1-session.md"
        session.write_text("# Story\n\n**Phase:** finish\n")
        result = finish_story(project_tree, "99-1")
        assert result["success"] is True
        # Archive uses story_id as filename when no Jira key
        assert (project_tree / "sprint" / "archive" / "99-1-session.md").exists()
        # Jira step is skipped
        jira_step = [s for s in result["steps"] if s["step"] == 3][0]
        assert jira_step.get("skipped") is True

    @patch("pennyfarthing_scripts.sprint.story_finish._run")
    def test_returns_steps_on_success(self, mock_run, project_tree):
        mock_run.return_value = type("R", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        result = finish_story(project_tree, "83-2")
        assert result["success"] is True
        assert "steps" in result
        assert len(result["steps"]) == 7
        actions = [s["action"] for s in result["steps"]]
        assert "archive_session" in actions
        assert "yaml_update" in actions
        assert "remove_session" in actions


class TestFinishStoryCli:
    """Test CLI integration."""

    def test_finish_command_registered(self):
        from click.testing import CliRunner
        from pennyfarthing_scripts.sprint.cli import sprint

        runner = CliRunner()
        result = runner.invoke(sprint, ["story", "finish", "--help"])
        assert result.exit_code == 0
        assert "STORY_ID" in result.output
