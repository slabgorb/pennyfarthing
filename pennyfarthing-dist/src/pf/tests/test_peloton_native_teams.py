"""Tests for peloton live mode — native agent teams.

Tests the simplified peloton API that produces TeamCreate prompts
for SM to execute via Claude Code native agent teams.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Create a minimal project structure for peloton tests."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Create a TDD workflow
    wf_dir = pf_dir / "workflows"
    wf_dir.mkdir()
    (wf_dir / "tdd.yaml").write_text(
        "workflow:\n"
        "  name: tdd\n"
        "  type: phased\n"
        "  phases:\n"
        "    - name: setup\n"
        "      agent: sm\n"
        "    - name: red\n"
        "      agent: tea\n"
        "    - name: green\n"
        "      agent: dev\n"
        "    - name: review\n"
        "      agent: reviewer\n"
    )

    # Create a session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "42-1-session.md").write_text(
        "**Story:** 42-1\n"
        "**Workflow:** tdd\n"
        "**Phase:** setup\n"
    )

    return tmp_path


class TestStartSession:
    def test_returns_team_name_and_agents(self, project: Path) -> None:
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert result["success"]
        assert result["data"]["team_name"] == "peloton-42-1"
        assert result["data"]["agents"] == ["tea", "dev", "reviewer"]

    def test_excludes_sm_from_agents(self, project: Path) -> None:
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert "sm" not in result["data"]["agents"]

    def test_produces_team_create_prompt(self, project: Path) -> None:
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        prompt = result["data"]["prompt"]
        assert "peloton-42-1" in prompt
        assert "tea" in prompt
        assert "dev" in prompt
        assert "reviewer" in prompt
        assert "42-1" in prompt

    def test_saves_state_file(self, project: Path) -> None:
        from pf.peloton.live import start_session

        start_session(project, "42-1", "tdd")

        state_file = project / ".pennyfarthing" / "peloton-state.json"
        assert state_file.exists()
        state = json.loads(state_file.read_text())
        assert state["active"] is True
        assert state["story_id"] == "42-1"
        assert state["team_name"] == "peloton-42-1"

    def test_error_on_unknown_workflow(self, project: Path) -> None:
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "nonexistent")

        assert not result["success"]
        assert "not found" in result["error"]


class TestGetStatus:
    def test_inactive_when_no_state(self, project: Path) -> None:
        from pf.peloton.live import get_status

        result = get_status(project)

        assert result["success"]
        assert result["data"]["active"] is False

    def test_active_after_start(self, project: Path) -> None:
        from pf.peloton.live import get_status, start_session

        start_session(project, "42-1", "tdd")
        result = get_status(project)

        assert result["success"]
        assert result["data"]["active"] is True
        assert result["data"]["team_name"] == "peloton-42-1"


class TestStop:
    def test_clears_state(self, project: Path) -> None:
        from pf.peloton.live import start_session, stop

        start_session(project, "42-1", "tdd")
        result = stop(project)

        assert result["success"]

        state_file = project / ".pennyfarthing" / "peloton-state.json"
        state = json.loads(state_file.read_text())
        assert state["active"] is False
        assert state["team_name"] is None


class TestGetWorkflowAgents:
    def test_extracts_agents_from_workflow(self, project: Path) -> None:
        from pf.peloton.live import get_workflow_agents

        result = get_workflow_agents("tdd", project)

        assert result["success"]
        assert result["data"] == ["tea", "dev", "reviewer"]

    def test_preserves_order(self, project: Path) -> None:
        from pf.peloton.live import get_workflow_agents

        result = get_workflow_agents("tdd", project)

        agents = result["data"]
        assert agents.index("tea") < agents.index("dev")
        assert agents.index("dev") < agents.index("reviewer")


class TestCLI:
    def test_start_command_exists(self) -> None:
        from click.testing import CliRunner

        from pf.peloton.cli import peloton

        runner = CliRunner()
        result = runner.invoke(peloton, ["start", "--help"])
        assert result.exit_code == 0

    def test_status_command_exists(self) -> None:
        from click.testing import CliRunner

        from pf.peloton.cli import peloton

        runner = CliRunner()
        result = runner.invoke(peloton, ["status", "--help"])
        assert result.exit_code == 0

    def test_stop_command_exists(self) -> None:
        from click.testing import CliRunner

        from pf.peloton.cli import peloton

        runner = CliRunner()
        result = runner.invoke(peloton, ["stop", "--help"])
        assert result.exit_code == 0
