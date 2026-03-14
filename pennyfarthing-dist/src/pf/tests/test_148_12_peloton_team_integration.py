"""Tests for Story 148-12: Peloton team mode integration.

Wire activate_next to TeamCreate and resolve tmux pane strategy.
Peloton live mode should NOT spawn orphan tmux panes — team mode agents
run as teammates within the current Claude Code session.

ACs:
  AC-1: start does not spawn orphan tmux panes
  AC-2: next returns valid JSON with team-mode data
  AC-3: Data shape is consumable by TeamCreate
  AC-4: Existing APIs updated to match pane-free model
  AC-5: stop cleans up correctly (no stale panes or state)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pf.peloton.live import (
    activate_next,
    get_status,
    get_workflow_agents,
    load_state,
    save_state,
    start_session,
    stop,
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


@pytest.fixture
def started_session(project_root: Path) -> Path:
    """Initialize a peloton session and return project_root."""
    start_session(project_root, "148-12", "tdd")
    return project_root


# ---------------------------------------------------------------------------
# AC-1: start does not spawn orphan tmux panes
# ---------------------------------------------------------------------------


class TestStartNoOrphanPanes:
    """AC-1: pf peloton start must not spawn tmux panes that team mode never uses."""

    def test_start_session_exists(self):
        """A start_session function should exist as the pane-free replacement for spawn_panes."""
        from pf.peloton import live
        assert hasattr(live, "start_session"), (
            "live.py should export start_session — the pane-free replacement for spawn_panes"
        )

    def test_start_session_initializes_state(self, project_root: Path):
        """start_session should initialize peloton state with workflow and story."""
        from pf.peloton.live import start_session
        result = start_session(project_root, "148-12", "tdd")
        assert result["success"] is True
        state = load_state(project_root)
        assert state["active"] is True
        assert state["story_id"] == "148-12"
        assert state["workflow"] == "tdd"

    def test_start_session_records_agent_order(self, project_root: Path):
        """start_session should record the ordered agent list from the workflow."""
        from pf.peloton.live import start_session
        result = start_session(project_root, "148-12", "tdd")
        assert result["success"] is True
        state = load_state(project_root)
        assert "agents" in state, "State should contain an 'agents' list"
        agents = state["agents"]
        assert isinstance(agents, list)
        assert len(agents) > 0
        assert "tea" in agents
        assert "dev" in agents

    def test_start_session_does_not_create_pane_ids(self, project_root: Path):
        """start_session must NOT create pane_id entries — no tmux panes."""
        from pf.peloton.live import start_session
        start_session(project_root, "148-12", "tdd")
        state = load_state(project_root)
        # State should not have a panes dict with pane_id values
        state_json = json.dumps(state)
        assert "pane_id" not in state_json, (
            f"State should not reference pane_id — team mode doesn't use tmux panes. Got: {state_json}"
        )

    def test_start_session_returns_agent_list(self, project_root: Path):
        """start_session should return the agent list in its data."""
        from pf.peloton.live import start_session
        result = start_session(project_root, "148-12", "tdd")
        assert result["success"] is True
        assert "agents" in result["data"]
        assert isinstance(result["data"]["agents"], list)

    def test_start_session_does_not_require_tmux(self, project_root: Path):
        """start_session should work without tmux running — no pane allocation needed."""
        from pf.peloton.live import start_session
        # tmp_path is not a real project, so tmux won't be available
        # This should still succeed because start_session doesn't need tmux
        result = start_session(project_root, "148-12", "tdd")
        assert result["success"] is True

    def test_start_session_fails_for_unknown_workflow(self, project_root: Path):
        """start_session should fail gracefully for nonexistent workflows."""
        from pf.peloton.live import start_session
        result = start_session(project_root, "148-12", "nonexistent-workflow-xyz")
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC-2: next returns valid JSON with team-mode data
# ---------------------------------------------------------------------------


class TestNextReturnsTeamData:
    """AC-2: pf peloton next must return valid team-mode JSON."""

    def test_activate_next_after_start_session(self, started_session: Path):
        """activate_next should work with the new start_session (no spawn_panes)."""
        result = activate_next(started_session)
        assert result["success"] is True
        assert "role" in result["data"]

    def test_activate_next_returns_all_team_fields(self, started_session: Path):
        """Result must contain role, team_name, prompt, and story_id."""
        result = activate_next(started_session)
        assert result["success"] is True
        data = result["data"]
        required_keys = {"role", "team_name", "prompt", "story_id"}
        missing = required_keys - set(data.keys())
        assert not missing, f"Missing keys in activate_next result: {missing}"

    def test_activate_next_no_pane_id_in_result(self, started_session: Path):
        """Result must NOT contain pane_id — team mode doesn't use panes."""
        result = activate_next(started_session)
        assert result["success"] is True
        assert "pane_id" not in result["data"], (
            "activate_next should not return pane_id — team mode agents don't use tmux panes"
        )

    def test_activate_next_result_is_json_serializable(self, started_session: Path):
        """The data dict must be JSON-serializable for CLI output."""
        result = activate_next(started_session)
        assert result["success"] is True
        # Should not raise
        serialized = json.dumps(result["data"])
        parsed = json.loads(serialized)
        assert parsed["role"] == result["data"]["role"]

    def test_activate_next_advances_through_agents(self, started_session: Path):
        """Successive calls should advance through the workflow agent order."""
        first = activate_next(started_session)
        assert first["success"] is True
        first_role = first["data"]["role"]

        second = activate_next(started_session)
        assert second["success"] is True
        second_role = second["data"]["role"]

        assert first_role != second_role, (
            f"Successive activate_next calls should advance to different agents, "
            f"but both returned '{first_role}'"
        )

    def test_activate_next_errors_past_last_agent(self, started_session: Path):
        """Should error when all agents have been activated."""
        agents_result = get_workflow_agents("tdd")
        agent_count = len(agents_result["data"])

        for _ in range(agent_count):
            result = activate_next(started_session)
            assert result["success"] is True

        # One more should fail
        result = activate_next(started_session)
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC-3: Data shape consumable by TeamCreate
# ---------------------------------------------------------------------------


class TestTeamCreateShape:
    """AC-3: activate_next data must be consumable by TeamCreate."""

    def test_team_name_follows_convention(self, started_session: Path):
        """team_name should follow peloton-{story_id} pattern."""
        result = activate_next(started_session)
        assert result["success"] is True
        team_name = result["data"]["team_name"]
        assert team_name == "peloton-148-12", (
            f"team_name should be 'peloton-148-12', got '{team_name}'"
        )

    def test_prompt_includes_agent_start_command(self, started_session: Path):
        """prompt should tell the teammate which agent to activate."""
        result = activate_next(started_session)
        assert result["success"] is True
        prompt = result["data"]["prompt"]
        role = result["data"]["role"]
        assert f"pf agent start {role}" in prompt, (
            f"Prompt should include 'pf agent start {role}', got: {prompt}"
        )

    def test_story_id_matches_session(self, started_session: Path):
        """story_id in result should match what was passed to start_session."""
        result = activate_next(started_session)
        assert result["success"] is True
        assert result["data"]["story_id"] == "148-12"

    def test_role_is_valid_agent_name(self, started_session: Path):
        """role should be a known agent name from the workflow."""
        result = activate_next(started_session)
        assert result["success"] is True

        agents_result = get_workflow_agents("tdd")
        valid_agents = agents_result["data"]
        assert result["data"]["role"] in valid_agents, (
            f"Role '{result['data']['role']}' not in workflow agents: {valid_agents}"
        )


# ---------------------------------------------------------------------------
# AC-4: Existing APIs updated — state schema change
# ---------------------------------------------------------------------------


class TestStateSchemaUpdate:
    """AC-4: State schema uses agents list instead of panes dict."""

    def test_state_has_agents_list(self, started_session: Path):
        """After start_session, state should have 'agents' key with ordered list."""
        state = load_state(started_session)
        assert "agents" in state
        assert isinstance(state["agents"], list)
        assert len(state["agents"]) > 0

    def test_state_agents_excludes_sm(self, started_session: Path):
        """Agent list in state should not include SM (SM is the team lead)."""
        state = load_state(started_session)
        assert "sm" not in state["agents"], (
            "SM should not be in the agents list — SM is the team lead, not a teammate"
        )

    def test_get_status_reflects_new_schema(self, started_session: Path):
        """get_status should return agents list, not panes dict."""
        result = get_status(started_session)
        assert result["success"] is True
        data = result["data"]
        assert "agents" in data, "Status should include 'agents' list"
        assert isinstance(data["agents"], list)

    def test_get_status_shows_active_role(self, started_session: Path):
        """get_status should show which agent is currently active."""
        activate_next(started_session)
        result = get_status(started_session)
        assert result["success"] is True
        assert result["data"]["active_role"] is not None


# ---------------------------------------------------------------------------
# AC-5: stop cleans up correctly
# ---------------------------------------------------------------------------


class TestStopCleanup:
    """AC-5: stop clears state without trying to kill nonexistent panes."""

    def test_stop_after_start_session(self, started_session: Path):
        """stop should succeed after start_session (no panes to kill)."""
        result = stop(started_session)
        assert result["success"] is True

    def test_stop_clears_active_state(self, started_session: Path):
        """After stop, state should show inactive."""
        stop(started_session)
        state = load_state(started_session)
        assert state["active"] is False
        assert state["story_id"] is None

    def test_stop_clears_agents_list(self, started_session: Path):
        """After stop, agents list should be empty."""
        stop(started_session)
        state = load_state(started_session)
        agents = state.get("agents", [])
        assert len(agents) == 0, f"Agents should be cleared after stop, got: {agents}"

    def test_stop_idempotent(self, started_session: Path):
        """Stopping twice should not error."""
        stop(started_session)
        result = stop(started_session)
        assert result["success"] is True
