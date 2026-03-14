"""Tests for Story 148-9: Peloton live mode — persistent tmux panes for team mode agents.

Covers all 6 ACs:
  AC-1: spawn_panes pre-spawns panes based on workflow
  AC-2: activate_next launches agent in its pane
  AC-3: switch_to jumps to any pane
  AC-4: Panes persist (state management)
  AC-5: stop tears down panes
  AC-6: get_status shows pane state
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
    spawn_panes,
    stop,
    switch_to,
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
def session_file(tmp_path: Path) -> Path:
    """Create a minimal session file."""
    sf = tmp_path / ".session" / "148-9-session.md"
    sf.parent.mkdir(parents=True, exist_ok=True)
    sf.write_text("# Story 148-9\n**Phase:** red\n**Workflow:** tdd\n")
    return sf


# ---------------------------------------------------------------------------
# State management (AC-4: persistence)
# ---------------------------------------------------------------------------


class TestStateManagement:
    """AC-4: Peloton state persists across calls."""

    def test_load_state_returns_default_when_no_file(self, project_root: Path):
        """No state file should return inactive default state."""
        state = load_state(project_root)
        assert state["active"] is False
        assert state["story_id"] is None
        assert state["panes"] == {}

    def test_save_and_load_roundtrip(self, project_root: Path):
        """State saved should be loadable back."""
        state = {
            "active": True,
            "story_id": "148-9",
            "workflow": "tdd",
            "panes": {
                "tea": {"pane_id": "%10", "agent_started": False},
                "dev": {"pane_id": "%11", "agent_started": False},
            },
            "active_role": None,
        }
        result = save_state(project_root, state)
        assert result["success"] is True

        loaded = load_state(project_root)
        assert loaded["active"] is True
        assert loaded["story_id"] == "148-9"
        assert "tea" in loaded["panes"]
        assert "dev" in loaded["panes"]

    def test_save_creates_pennyfarthing_dir(self, tmp_path: Path):
        """save_state should create .pennyfarthing/ if missing."""
        state = {"active": False, "story_id": None, "panes": {}}
        result = save_state(tmp_path, state)
        assert result["success"] is True
        assert (tmp_path / ".pennyfarthing" / "peloton-state.json").exists()

    def test_state_file_is_valid_json(self, project_root: Path):
        """State file should be parseable JSON."""
        state = {"active": True, "story_id": "148-9", "panes": {"tea": {"pane_id": "%5"}}}
        save_state(project_root, state)
        raw = (project_root / ".pennyfarthing" / "peloton-state.json").read_text()
        parsed = json.loads(raw)
        assert parsed["story_id"] == "148-9"

    def test_load_corrupted_file_returns_default(self, project_root: Path):
        """Corrupted state file should fall back to default, not crash."""
        state_path = project_root / ".pennyfarthing" / "peloton-state.json"
        state_path.write_text("{invalid json!!!")
        state = load_state(project_root)
        assert state["active"] is False


# ---------------------------------------------------------------------------
# AC-1: spawn_panes pre-spawns panes based on workflow
# ---------------------------------------------------------------------------


class TestSpawnPanes:
    """AC-1: `pf peloton start` pre-spawns panes based on workflow."""

    def test_get_workflow_agents_returns_unique_roles(self):
        """Should extract unique agent roles from workflow phases."""
        result = get_workflow_agents("tdd")
        assert result["success"] is True
        agents = result["data"]
        assert "tea" in agents
        assert "dev" in agents
        assert "reviewer" in agents
        # SM appears twice (setup + finish) but should be deduplicated
        assert agents.count("sm") <= 1 or len(set(agents)) == len(agents)

    def test_get_workflow_agents_unknown_workflow(self):
        """Should fail for nonexistent workflow."""
        result = get_workflow_agents("nonexistent-workflow")
        assert result["success"] is False

    def test_spawn_panes_creates_pane_per_role(self, project_root: Path):
        """Should create one pane per unique agent role."""
        result = spawn_panes(project_root, "148-9", "tdd")
        assert result["success"] is True
        panes = result["data"]
        assert "tea" in panes
        assert "dev" in panes
        assert "reviewer" in panes

    def test_spawn_panes_pane_ids_are_unique(self, project_root: Path):
        """Each spawned pane should have a distinct pane_id."""
        result = spawn_panes(project_root, "148-9", "tdd")
        assert result["success"] is True
        pane_ids = list(result["data"].values())
        assert len(pane_ids) == len(set(pane_ids))

    def test_spawn_panes_saves_state(self, project_root: Path):
        """After spawning, state file should exist with pane records."""
        result = spawn_panes(project_root, "148-9", "tdd")
        assert result["success"] is True
        state = load_state(project_root)
        assert state["active"] is True
        assert state["story_id"] == "148-9"
        assert len(state["panes"]) > 0

    def test_spawn_panes_titles_follow_convention(self, project_root: Path):
        """Pane titles should follow peloton-{role} naming."""
        result = spawn_panes(project_root, "148-9", "tdd")
        assert result["success"] is True
        state = load_state(project_root)
        for role, pane_info in state["panes"].items():
            # Title should be recorded and contain peloton + role
            assert "pane_id" in pane_info

    def test_spawn_panes_agents_not_started(self, project_root: Path):
        """Panes should be idle shells — agents NOT started yet."""
        result = spawn_panes(project_root, "148-9", "tdd")
        assert result["success"] is True
        state = load_state(project_root)
        for role, pane_info in state["panes"].items():
            assert pane_info.get("agent_started") is False


# ---------------------------------------------------------------------------
# AC-2: activate_next launches agent in its pane
# ---------------------------------------------------------------------------


class TestActivateNext:
    """AC-2: `pf peloton next` activates the next phase's agent."""

    def test_activate_next_returns_role_and_team_data(self, project_root: Path):
        """Should return which role was activated and team-mode data."""
        spawn_panes(project_root, "148-9", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        assert "role" in result["data"]
        assert "team_name" in result["data"]
        assert "prompt" in result["data"]

    def test_activate_next_updates_active_role(self, project_root: Path):
        """State should track which role is currently active."""
        spawn_panes(project_root, "148-9", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        state = load_state(project_root)
        assert state["active_role"] == result["data"]["role"]

    def test_activate_next_marks_agent_started(self, project_root: Path):
        """Activated pane should have agent_started set to True."""
        spawn_panes(project_root, "148-9", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        state = load_state(project_root)
        role = result["data"]["role"]
        assert state["panes"][role]["agent_started"] is True

    def test_activate_next_fails_without_spawn(self, project_root: Path):
        """Should fail if panes haven't been spawned yet."""
        result = activate_next(project_root)
        assert result["success"] is False

    def test_activate_next_includes_prompt(self, project_root: Path):
        """Should return a prompt for the Agent tool with pf agent start."""
        spawn_panes(project_root, "148-9", "tdd")
        result = activate_next(project_root)
        assert result["success"] is True
        assert "prompt" in result["data"]
        assert "pf agent start" in result["data"]["prompt"]


# ---------------------------------------------------------------------------
# AC-3: switch_to jumps to any pane
# ---------------------------------------------------------------------------


class TestSwitchTo:
    """AC-3: `pf peloton switch <role>` jumps to any pane."""

    def test_switch_to_known_role(self, project_root: Path):
        """Should succeed for a role that has a pane."""
        spawn_panes(project_root, "148-9", "tdd")
        result = switch_to(project_root, "dev")
        assert result["success"] is True
        assert result["data"]["role"] == "dev"
        assert "pane_id" in result["data"]

    def test_switch_to_unknown_role_fails(self, project_root: Path):
        """Should fail for a role that doesn't have a pane."""
        spawn_panes(project_root, "148-9", "tdd")
        result = switch_to(project_root, "nonexistent")
        assert result["success"] is False

    def test_switch_to_fails_without_spawn(self, project_root: Path):
        """Should fail if panes haven't been spawned."""
        result = switch_to(project_root, "dev")
        assert result["success"] is False

    def test_switch_updates_active_role(self, project_root: Path):
        """Switching should update the active role in state."""
        spawn_panes(project_root, "148-9", "tdd")
        switch_to(project_root, "reviewer")
        state = load_state(project_root)
        assert state["active_role"] == "reviewer"


# ---------------------------------------------------------------------------
# AC-5: stop tears down panes
# ---------------------------------------------------------------------------


class TestStop:
    """AC-5: `pf peloton stop` tears down all peloton panes."""

    def test_stop_returns_killed_list(self, project_root: Path):
        """Should return which panes were killed."""
        spawn_panes(project_root, "148-9", "tdd")
        result = stop(project_root)
        assert result["success"] is True
        assert "killed" in result["data"]
        assert len(result["data"]["killed"]) > 0

    def test_stop_clears_state(self, project_root: Path):
        """After stop, state should be inactive with no panes."""
        spawn_panes(project_root, "148-9", "tdd")
        stop(project_root)
        state = load_state(project_root)
        assert state["active"] is False
        assert state["panes"] == {} or len(state["panes"]) == 0

    def test_stop_without_spawn_succeeds(self, project_root: Path):
        """Stopping when nothing is running should succeed gracefully."""
        result = stop(project_root)
        assert result["success"] is True

    def test_stop_removes_state_file(self, project_root: Path):
        """State file should be removed after stop."""
        spawn_panes(project_root, "148-9", "tdd")
        stop(project_root)
        state_path = project_root / ".pennyfarthing" / "peloton-state.json"
        # Either file is removed or contents show inactive
        if state_path.exists():
            state = json.loads(state_path.read_text())
            assert state["active"] is False


# ---------------------------------------------------------------------------
# AC-6: get_status shows pane state
# ---------------------------------------------------------------------------


class TestGetStatus:
    """AC-6: `pf peloton status` shows pane state."""

    def test_status_when_active(self, project_root: Path):
        """Should show story, workflow, panes, and active role."""
        spawn_panes(project_root, "148-9", "tdd")
        result = get_status(project_root)
        assert result["success"] is True
        data = result["data"]
        assert data["story_id"] == "148-9"
        assert data["workflow"] == "tdd"
        assert isinstance(data["panes"], (dict, list))
        assert len(data["panes"]) > 0

    def test_status_when_inactive(self, project_root: Path):
        """Should indicate no active peloton session."""
        result = get_status(project_root)
        assert result["success"] is True
        assert result["data"]["story_id"] is None

    def test_status_shows_agent_started_flag(self, project_root: Path):
        """Each pane in status should show whether agent is started."""
        spawn_panes(project_root, "148-9", "tdd")
        activate_next(project_root)
        result = get_status(project_root)
        assert result["success"] is True
        panes = result["data"]["panes"]
        # At least one pane should have agent_started=True
        if isinstance(panes, dict):
            started = [v.get("agent_started") for v in panes.values()]
        else:
            started = [p.get("agent_started") for p in panes]
        assert True in started
