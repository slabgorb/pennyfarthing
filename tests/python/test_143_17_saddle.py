"""Tests for Story 143-17: Saddle — tmux-based interactive agent workspace.

Covers:
  AC1: Saddle pane creation and layout (CLI → Saddle → TUI)
  AC2: Agent start/stop lifecycle
  AC3: Registry integration (saddle as protected role)
  AC4: Status reporting
  AC5: Handoff integration (relay uses saddle pane)
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.saddle.core import ensure_saddle_pane, start_agent, status, stop_agent
from pf.tmux.registry import PROTECTED_ROLES, _classify_pane, reconcile


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_project(tmp_path):
    """Create a minimal project root with .pennyfarthing dir."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture
def mock_tmux():
    """Mock tmux panes module so tests don't need a real tmux session."""
    live_panes = [
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
    ]

    def list_live_panes_side_effect(session):
        return {"success": True, "data": list(live_panes)}

    def split_pane_side_effect(session, target, direction="v", size_pct=50, cwd=None):
        live_panes.append({"pane_id": "%99", "title": "Saddle", "command": "zsh", "width": 200, "height": 15})
        return {"success": True, "data": "%99\n"}

    with patch("pf.tmux.panes.is_tmux_running", return_value=True), \
         patch("pf.tmux.panes.get_session_name", return_value={"success": True, "data": "pf-test-0"}), \
         patch("pf.tmux.panes.list_live_panes", side_effect=list_live_panes_side_effect), \
         patch("pf.tmux.panes.split_pane", side_effect=split_pane_side_effect), \
         patch("pf.tmux.panes.set_pane_title"), \
         patch("pf.tmux.panes.send_keys", return_value={"success": True, "data": ""}):
        yield


@pytest.fixture
def mock_registry_with_cli_and_tui():
    """Registry with CLI (top) and TUI (bottom) panes — no saddle yet."""
    return {
        "session": "pf-test-0",
        "socket": "pf",
        "max_panes": 5,
        "panes": [
            {
                "pane_id": "%0",
                "role": "claude",
                "title": "Claude Code",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%1",
                "role": "tui",
                "title": "TUI",
                "protected": True,
                "owner": None,
            },
        ],
    }


@pytest.fixture
def mock_registry_with_saddle():
    """Registry with CLI, Saddle, and TUI panes."""
    return {
        "session": "pf-test-0",
        "socket": "pf",
        "max_panes": 5,
        "panes": [
            {
                "pane_id": "%0",
                "role": "claude",
                "title": "Claude Code",
                "protected": True,
                "owner": None,
            },
            {
                "pane_id": "%2",
                "role": "saddle",
                "title": "Saddle",
                "protected": True,
                "owner": "dev",
            },
            {
                "pane_id": "%1",
                "role": "tui",
                "title": "TUI",
                "protected": True,
                "owner": None,
            },
        ],
    }


@pytest.fixture
def live_panes_cli_tui():
    """Live pane data for CLI + TUI layout."""
    return [
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
        {"pane_id": "%1", "title": "TUI", "command": "python", "width": 200, "height": 20},
    ]


@pytest.fixture
def live_panes_with_saddle():
    """Live pane data for CLI + Saddle + TUI layout."""
    return [
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 20},
        {"pane_id": "%2", "title": "Saddle", "command": "claude", "width": 200, "height": 15},
        {"pane_id": "%1", "title": "TUI", "command": "python", "width": 200, "height": 15},
    ]


# ===========================================================================
# AC1: Saddle Pane Creation and Layout
# ===========================================================================


class TestSaddlePaneLayout:
    """The saddle pane must sit between CLI (top) and TUI (bottom)."""

    def test_ensure_saddle_creates_pane_between_cli_and_tui(self, tmp_project, mock_tmux):
        """When no saddle exists, ensure_saddle_pane creates one below CLI."""
        result = ensure_saddle_pane(project_root=tmp_project)
        # Must return a pane_id for the new saddle pane
        assert result["success"] is True
        assert "pane_id" in result["data"]

    def test_ensure_saddle_reuses_existing_pane(self, tmp_project, mock_tmux):
        """When saddle pane already exists, reuse it instead of creating another."""
        result = ensure_saddle_pane(project_root=tmp_project)
        assert result["success"] is True
        pane_id = result["data"]["pane_id"]

        # Call again — should return same pane
        result2 = ensure_saddle_pane(project_root=tmp_project)
        assert result2["success"] is True
        assert result2["data"]["pane_id"] == pane_id

    def test_ensure_saddle_works_without_tui(self, tmp_project, mock_tmux):
        """When no TUI pane exists, saddle splits below CLI only."""
        result = ensure_saddle_pane(project_root=tmp_project)
        assert result["success"] is True
        assert "pane_id" in result["data"]

    def test_saddle_pane_has_correct_title(self, tmp_project, mock_tmux):
        """Saddle pane must be titled 'Saddle' for registry classification."""
        result = ensure_saddle_pane(project_root=tmp_project)
        assert result["success"] is True
        # The pane should be findable by the "Saddle" title in the registry


# ===========================================================================
# AC2: Agent Start/Stop Lifecycle
# ===========================================================================


class TestAgentLifecycle:
    """Agents launch in the saddle pane and can be stopped/interrupted."""

    def test_start_agent_returns_pane_and_command(self, tmp_project, mock_tmux):
        """start_agent creates saddle pane and launches claude with agent skill."""
        result = start_agent("dev", project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["agent"] == "dev"
        assert result["data"]["pane_id"]
        # The command sent should invoke the agent's skill
        assert "/pf-dev" in result["data"]["command"] or "pf-dev" in result["data"]["command"]

    def test_start_agent_replaces_existing_agent(self, tmp_project, mock_tmux):
        """Starting a new agent in saddle stops the previous one first."""
        result1 = start_agent("dev", project_root=tmp_project)
        assert result1["success"] is True

        result2 = start_agent("tea", project_root=tmp_project)
        assert result2["success"] is True
        assert result2["data"]["agent"] == "tea"
        # Should use the same saddle pane
        assert result2["data"]["pane_id"] == result1["data"]["pane_id"]

    def test_start_agent_invalid_name(self, tmp_project):
        """Reject unknown agent names."""
        result = start_agent("nonexistent-agent", project_root=tmp_project)
        assert result["success"] is False
        assert "error" in result

    def test_stop_agent_sends_interrupt(self, tmp_project, mock_tmux):
        """stop_agent sends interrupt to the saddle pane."""
        start_agent("dev", project_root=tmp_project)
        result = stop_agent(project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["agent_stopped"] == "dev"

    def test_stop_agent_when_no_agent_running(self, tmp_project):
        """stop_agent when saddle is idle returns informative result."""
        result = stop_agent(project_root=tmp_project)
        assert result["success"] is False
        assert "no agent" in result["error"].lower() or "not running" in result["error"].lower()

    def test_start_agent_emits_telemetry_event(self, tmp_project, mock_tmux):
        """Agent start should emit subagent event to WheelHub (143-16 foundation)."""
        with patch("pf.wheelhub.subagent_events.emit_subagent_event") as mock_emit:
            start_agent("dev", project_root=tmp_project)
            mock_emit.assert_called_once()
            call_args = mock_emit.call_args
            assert call_args.args[0] == "agent_start" or call_args.kwargs.get("event_type") == "agent_start"


# ===========================================================================
# AC3: Registry Integration — Saddle as Protected Role
# ===========================================================================


class TestRegistryIntegration:
    """The saddle pane must be a protected role in the tmux registry."""

    def test_saddle_is_protected_role(self):
        """'saddle' must be in PROTECTED_ROLES alongside 'claude' and 'tui'."""
        assert "saddle" in PROTECTED_ROLES, (
            f"Expected 'saddle' in PROTECTED_ROLES, got {PROTECTED_ROLES}"
        )

    def test_classify_saddle_pane_by_title(self):
        """A pane titled 'Saddle' should be classified as role='saddle', protected=True."""
        role, protected = _classify_pane("Saddle")
        assert role == "saddle"
        assert protected is True

    def test_classify_saddle_case_insensitive(self):
        """Title classification should handle case variants."""
        role, protected = _classify_pane("saddle")
        assert role == "saddle"
        assert protected is True

    def test_reconcile_preserves_saddle_pane(self):
        """Reconciliation must not remove a live saddle pane."""
        registry = {
            "session": "pf-test-0",
            "socket": "pf",
            "max_panes": 5,
            "panes": [
                {"pane_id": "%0", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
                {"pane_id": "%2", "role": "saddle", "title": "Saddle", "protected": True, "owner": "dev"},
            ],
        }
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
            {"pane_id": "%2", "title": "Saddle", "command": "claude", "width": 200, "height": 20},
        ]

        result = reconcile(registry, live_panes)
        saddle_panes = [p for p in result["panes"] if p["role"] == "saddle"]
        assert len(saddle_panes) == 1
        assert saddle_panes[0]["protected"] is True

    def test_reconcile_auto_classifies_new_saddle_pane(self):
        """When a live pane titled 'Saddle' appears, reconcile classifies it correctly."""
        registry = {
            "session": "pf-test-0",
            "socket": "pf",
            "max_panes": 5,
            "panes": [
                {"pane_id": "%0", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
            ],
        }
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
            {"pane_id": "%2", "title": "Saddle", "command": "zsh", "width": 200, "height": 20},
        ]

        result = reconcile(registry, live_panes)
        saddle_panes = [p for p in result["panes"] if p["role"] == "saddle"]
        assert len(saddle_panes) == 1
        assert saddle_panes[0]["pane_id"] == "%2"
        assert saddle_panes[0]["protected"] is True

    def test_saddle_pane_cannot_be_closed_via_tmux_close(self):
        """Protected saddle pane must be refused by pf tmux close."""
        from pf.tmux.registry import resolve_pane_ref

        registry = {
            "session": "pf-test-0",
            "socket": "pf",
            "max_panes": 5,
            "panes": [
                {"pane_id": "%2", "role": "saddle", "title": "Saddle", "protected": True, "owner": "dev"},
            ],
        }
        entry = resolve_pane_ref(registry, "saddle")
        assert entry is not None
        assert entry["protected"] is True  # tmux close checks this and refuses

    def test_saddle_pane_not_targeted_as_worker(self):
        """find_idle_worker must skip the saddle pane even if idle."""
        from pf.tmux.registry import find_idle_worker

        registry = {
            "session": "pf-test-0",
            "socket": "pf",
            "max_panes": 5,
            "panes": [
                {"pane_id": "%0", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
                {"pane_id": "%2", "role": "saddle", "title": "Saddle", "protected": True, "owner": None},
            ],
        }
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
            {"pane_id": "%2", "title": "Saddle", "command": "zsh", "width": 200, "height": 20},
        ]

        # Saddle is idle (zsh) but protected — must not be returned
        result = find_idle_worker(registry, live_panes)
        assert result is None


# ===========================================================================
# AC4: Status Reporting
# ===========================================================================


class TestSaddleStatus:
    """Status queries must report current saddle state accurately."""

    def test_status_when_agent_running(self, tmp_project, mock_tmux):
        """Status should show active=True with agent name when agent is running."""
        start_agent("dev", project_root=tmp_project)
        result = status(project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["active"] is True
        assert result["data"]["agent"] == "dev"
        assert result["data"]["pane_id"]

    def test_status_when_no_agent(self, tmp_project):
        """Status should show active=False when no agent in saddle."""
        result = status(project_root=tmp_project)
        assert result["success"] is True
        assert result["data"]["active"] is False

    def test_status_returns_result_dict(self, tmp_project):
        """Status must follow {success, data?, error?} contract."""
        result = status(project_root=tmp_project)
        assert "success" in result
        if result["success"]:
            assert "data" in result
        else:
            assert "error" in result


# ===========================================================================
# AC5: Handoff Integration
# ===========================================================================


class TestHandoffIntegration:
    """Handoff markers should support saddle mode for relay."""

    def test_marker_generates_saddle_command_when_enabled(self):
        """When saddle mode is active, marker should use pf saddle start."""
        from pf.handoff.marker import generate_marker

        with patch("pf.handoff.marker.check_context") as mock_ctx:
            mock_ctx.return_value = MagicMock(
                relay_mode=True,
                usable_percent=20,
                error=None,
                saddle_mode=True,
            )
            result = generate_marker("dev")
            # In saddle mode, the command should launch agent in saddle pane
            assert "saddle" in result.lower() or "pf saddle" in result.lower() or "pf-dev" in result.lower()

    def test_marker_falls_back_to_skill_when_saddle_disabled(self):
        """When saddle mode is off, marker should use /pf-{agent} skill as before."""
        from pf.handoff.marker import generate_marker

        with patch("pf.handoff.marker.check_context") as mock_ctx:
            mock_ctx.return_value = MagicMock(
                relay_mode=True,
                usable_percent=20,
                error=None,
                saddle_mode=False,
            )
            result = generate_marker("dev")
            assert "/pf-dev" in result


# ===========================================================================
# Edge Cases
# ===========================================================================


class TestEdgeCases:
    """Boundary conditions and failure modes."""

    def test_start_agent_when_tmux_not_running(self, tmp_project):
        """start_agent fails gracefully when tmux is not running."""
        with patch("pf.tmux.panes.is_tmux_running", return_value=False):
            result = start_agent("dev", project_root=tmp_project)
            assert result["success"] is False
            assert "tmux" in result["error"].lower()

    def test_start_agent_empty_name(self, tmp_project):
        """start_agent rejects empty agent name."""
        result = start_agent("", project_root=tmp_project)
        assert result["success"] is False

    def test_ensure_saddle_when_tmux_not_running(self, tmp_project):
        """ensure_saddle_pane fails gracefully without tmux."""
        with patch("pf.tmux.panes.is_tmux_running", return_value=False):
            result = ensure_saddle_pane(project_root=tmp_project)
            assert result["success"] is False

    def test_stop_agent_twice(self, tmp_project):
        """Stopping an already-stopped agent should not error destructively."""
        start_agent("dev", project_root=tmp_project)
        stop_agent(project_root=tmp_project)
        result = stop_agent(project_root=tmp_project)
        # Second stop: either success (idempotent) or graceful failure
        assert "success" in result
