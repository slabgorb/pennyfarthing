"""Tests for Story 148-11: Peloton live mode uses team mode instead of claude -p.

Peloton live mode currently launches agents via claude -p (non-interactive)
in tmux panes. This story replaces that with Claude Code native Agent Teams.
SM acts as team lead, spawns teammates via TeamCreate/SendMessage.

ACs:
  AC-1: activate_next does NOT use claude -p
  AC-2: live.py provides team-mode activation data (team name, agent, task)
  AC-3: get_workflow_agents excludes SM from teammate list (SM is the lead)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.peloton.live import (
    activate_next,
    get_workflow_agents,
    load_state,
    spawn_panes,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """Create a project root with .pennyfarthing dir."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


# ---------------------------------------------------------------------------
# AC-1: activate_next does NOT use claude -p
# ---------------------------------------------------------------------------


class TestNoClaudeP:
    """AC-1: activate_next must not launch agents via claude -p."""

    def test_activate_next_command_has_no_claude_p(self, project_root: Path):
        """The command returned by activate_next should NOT contain 'claude -p'."""
        spawn_panes(project_root, "148-11", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        # The command field should not contain claude -p
        command = result["data"].get("command", "")
        assert "claude -p" not in command, (
            f"activate_next still uses 'claude -p': {command}"
        )

    def test_activate_next_does_not_send_keys(self, project_root: Path):
        """activate_next should NOT call send_keys to tmux panes for agent launch."""
        import inspect
        source = inspect.getsource(activate_next)
        assert "send_keys" not in source, (
            "activate_next should not use send_keys to launch agents — use team mode instead"
        )


# ---------------------------------------------------------------------------
# AC-2: live.py provides team-mode activation data
# ---------------------------------------------------------------------------


class TestTeamModeActivation:
    """AC-2: activate_next returns team-mode data instead of tmux commands."""

    def test_activate_next_returns_team_name(self, project_root: Path):
        """Result should include a team_name for TeamCreate."""
        spawn_panes(project_root, "148-11", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        assert "team_name" in result["data"], (
            "activate_next should return team_name for TeamCreate"
        )

    def test_activate_next_returns_agent_prompt(self, project_root: Path):
        """Result should include the agent activation prompt (not a shell command)."""
        spawn_panes(project_root, "148-11", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        assert "prompt" in result["data"], (
            "activate_next should return a prompt for the Agent tool, not a shell command"
        )

    def test_activate_next_prompt_includes_agent_start(self, project_root: Path):
        """The prompt should tell the teammate to run pf agent start."""
        spawn_panes(project_root, "148-11", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        prompt = result["data"].get("prompt", "")
        assert "pf agent start" in prompt, (
            f"Prompt should include 'pf agent start', got: {prompt}"
        )

    def test_activate_next_returns_story_id(self, project_root: Path):
        """Result should include the story_id for teammate context."""
        spawn_panes(project_root, "148-11", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        assert result["data"].get("story_id") == "148-11"


# ---------------------------------------------------------------------------
# AC-3: get_workflow_agents excludes SM
# ---------------------------------------------------------------------------


class TestExcludeSM:
    """AC-3: SM is the team lead — it should not appear in the teammate list."""

    def test_workflow_agents_excludes_sm(self):
        """get_workflow_agents should not include 'sm' in the agent list."""
        result = get_workflow_agents("tdd")
        assert result["success"] is True
        agents = result["data"]
        assert "sm" not in agents, (
            f"SM should be excluded from teammate list (SM is the lead), got: {agents}"
        )
