"""Tests for 148-19: Remove agent pane pre-opening from peloton layout.

Story 148-19: Stop pre-opening agent panes in peloton layout
Epic: MSSCI-16421

TeamCreate always spawns its own panes via teammateMode=tmux, so pre-opened
agent panes just sit idle with zsh. Remove agent pane creation from
create_peloton_layout — it should ONLY create/position the TUI pane below CLI.
Also revert the pane_mapping/prompt enrichment dead code from start_session.

All tests mock tmux — NO real tmux panes.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pf.peloton.pane_orchestrator import create_peloton_layout


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_live_panes(
    cli_pane_id: str = "%0",
    tui_pane_id: str | None = "%1",
) -> list[dict]:
    """Build a fake live_panes list with CLI and optionally TUI panes."""
    panes = [
        {"pane_id": cli_pane_id, "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
    ]
    if tui_pane_id is not None:
        panes.append(
            {"pane_id": tui_pane_id, "title": "TUI", "command": "python", "width": 120, "height": 20},
        )
    return panes


def _make_registry(session: str = "pf-test-0") -> dict:
    return {
        "session": session,
        "socket": "pf",
        "max_panes": 10,
        "panes": [],
    }


_SPLIT_COUNTER = 0


def _mock_split_side_effect(session, target, direction, *args, **kwargs):
    """Generate unique pane IDs for each split_pane call."""
    global _SPLIT_COUNTER
    _SPLIT_COUNTER += 1
    return {"success": True, "data": f"%{100 + _SPLIT_COUNTER}"}


# ---------------------------------------------------------------------------
# 1. create_peloton_layout does NOT create agent panes
# ---------------------------------------------------------------------------


class TestNoAgentPaneCreation:
    """create_peloton_layout must NOT create agent panes.

    TeamCreate spawns its own panes via teammateMode=tmux. Pre-opening panes
    just creates idle zsh sessions. The layout function should only handle
    TUI placement.
    """

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_split_pane_calls_for_agents(self, mock_split, mock_title):
        """split_pane must NOT be called to create agent panes.

        The only split_pane call allowed is for creating the TUI pane below
        CLI (vertical split). No horizontal splits for a right column, no
        vertical splits for agent stacking.
        """
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        # TUI already exists — no splits needed at all
        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id="%1"),
        )

        assert result["success"]
        # With TUI already present, there should be ZERO split_pane calls
        # (no agent panes, no TUI creation needed)
        assert mock_split.call_count == 0, (
            f"Expected 0 split_pane calls (no agent panes), got {mock_split.call_count}. "
            f"Calls: {mock_split.call_args_list}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_agent_panes_in_result(self, mock_split, mock_title):
        """Result must NOT contain agent_panes list."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
        )

        assert result["success"]
        data = result["data"]
        # agent_panes should either not exist or be empty
        agent_panes = data.get("agent_panes", [])
        assert len(agent_panes) == 0, (
            f"Expected no agent panes in result, got {len(agent_panes)}: {agent_panes}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_right_column_in_result(self, mock_split, mock_title):
        """Result must NOT contain right_column — there is no right column
        when agent panes are not pre-opened."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
        )

        assert result["success"]
        data = result["data"]
        assert "right_column" not in data, (
            f"right_column should not exist — no agent panes are created. "
            f"Got: {data.get('right_column')}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_agent_panes_registered(self, mock_split, mock_title):
        """Registry must NOT contain any peloton-owned agent panes."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        registry = _make_registry()
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=_make_live_panes(),
        )

        assert result["success"]
        reg = result["data"]["registry"]
        peloton_panes = [p for p in reg["panes"] if p.get("owner") == "peloton"]
        assert len(peloton_panes) == 0, (
            f"Registry should have 0 peloton-owned panes, got {len(peloton_panes)}: {peloton_panes}"
        )


# ---------------------------------------------------------------------------
# 2. create_peloton_layout DOES create TUI pane below CLI
# ---------------------------------------------------------------------------


class TestTuiPaneCreation:
    """create_peloton_layout must create TUI pane below CLI if not present."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_creates_tui_when_missing(self, mock_split, mock_title):
        """When TUI pane doesn't exist, layout should create one below CLI."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id=None),  # No TUI
        )

        assert result["success"]
        assert result["data"]["tui_pane"] is not None, "TUI pane must be created when missing"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_created_by_vertical_split_of_cli(self, mock_split, mock_title):
        """TUI must be created by vertically splitting the CLI pane (below it)."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id=None),
        )

        assert result["success"]
        # Should be exactly 1 split call — vertical split of CLI for TUI
        assert mock_split.call_count == 1, (
            f"Expected exactly 1 split_pane call (TUI only), got {mock_split.call_count}. "
            f"Calls: {mock_split.call_args_list}"
        )
        call_args = mock_split.call_args_list[0]
        assert call_args[0][1] == "%0", "TUI split must target CLI pane (%0)"
        assert call_args[0][2] == "v", "TUI split must be vertical (below CLI)"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_title_set(self, mock_split, mock_title):
        """Newly created TUI pane must have its title set to 'TUI'."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id=None),
        )

        assert result["success"]
        # set_pane_title should be called once for TUI, NOT for agents
        tui_title_calls = [
            c for c in mock_title.call_args_list
            if c[0][1] == "TUI"  # second arg is the title string
        ]
        assert len(tui_title_calls) == 1, (
            f"Expected 1 set_pane_title call for TUI, got {len(tui_title_calls)}. "
            f"All calls: {mock_title.call_args_list}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_skips_tui_creation_when_present(self, mock_split, mock_title):
        """When TUI already exists, don't create another one."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id="%1"),  # TUI exists
        )

        assert result["success"]
        assert result["data"]["tui_pane"] == "%1"
        # No splits needed — TUI exists, no agent panes
        assert mock_split.call_count == 0, (
            f"Expected 0 splits when TUI already exists, got {mock_split.call_count}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_result_contains_cli_and_tui_only(self, mock_split, mock_title):
        """Result data should contain only cli_pane, tui_pane, and registry."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
        )

        assert result["success"]
        data = result["data"]
        assert "cli_pane" in data
        assert "tui_pane" in data
        assert "registry" in data


# ---------------------------------------------------------------------------
# 3. start_session does NOT include pane_mapping (revert dead code)
# ---------------------------------------------------------------------------


class TestStartSessionNoPaneMapping:
    """start_session must NOT include pane_mapping or pane-enriched prompts.

    The pane_mapping code was dead code — TeamCreate ignores it and spawns
    new panes regardless. Remove it.
    """

    @patch("pf.peloton.live.get_workflow_agents")
    @patch("pf.peloton.live.save_state")
    def test_no_pane_mapping_in_result(self, mock_save, mock_agents, tmp_path):
        """Result data must NOT contain pane_mapping."""
        from pf.peloton.live import start_session

        mock_agents.return_value = {"success": True, "data": ["tea", "dev", "reviewer"]}
        mock_save.return_value = {"success": True}

        result = start_session(tmp_path, "148-19", "tdd")

        assert result["success"]
        assert "pane_mapping" not in result["data"], (
            f"pane_mapping is dead code — TeamCreate ignores it. "
            f"Got: {result['data'].get('pane_mapping')}"
        )

    @patch("pf.peloton.live.get_workflow_agents")
    @patch("pf.peloton.live.save_state")
    def test_prompt_has_no_pane_ids(self, mock_save, mock_agents, tmp_path):
        """The TeamCreate prompt must NOT contain tmux pane ID references.

        Pane IDs like %100 in the prompt are useless — TeamCreate ignores
        them and spawns new panes.
        """
        from pf.peloton.live import start_session

        mock_agents.return_value = {"success": True, "data": ["tea", "dev", "reviewer"]}
        mock_save.return_value = {"success": True}

        result = start_session(tmp_path, "148-19", "tdd")

        assert result["success"]
        prompt = result["data"]["prompt"]
        assert "Target tmux pane" not in prompt, (
            f"Prompt must not contain 'Target tmux pane' references — they're dead code. "
            f"Prompt: {prompt}"
        )

    @patch("pf.peloton.live.get_workflow_agents")
    @patch("pf.peloton.live.save_state")
    def test_no_layout_key_in_result(self, mock_save, mock_agents, tmp_path):
        """Result data must NOT include layout details.

        The layout is just for TUI placement — no need to expose it
        in start_session result.
        """
        from pf.peloton.live import start_session

        mock_agents.return_value = {"success": True, "data": ["tea", "dev", "reviewer"]}
        mock_save.return_value = {"success": True}

        result = start_session(tmp_path, "148-19", "tdd")

        assert result["success"]
        assert "layout" in result["data"], (
            "layout should be in start_session result (added by 148-24)"
        )


# ---------------------------------------------------------------------------
# 4. Agent pane count after layout = 0
# ---------------------------------------------------------------------------


class TestAgentPaneCountZero:
    """After create_peloton_layout, there should be zero agent panes.
    Only CLI and TUI panes should exist."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_zero_agent_panes_with_tui_present(self, mock_split, mock_title):
        """With TUI already present: 0 new panes created."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        registry = _make_registry()
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=_make_live_panes(tui_pane_id="%1"),
        )

        assert result["success"]
        # Total pane count in registry should be 0 (no new panes added)
        assert len(result["data"]["registry"]["panes"]) == 0, (
            f"Expected 0 panes in registry (no agent panes), "
            f"got {len(result['data']['registry']['panes'])}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_zero_agent_panes_without_tui(self, mock_split, mock_title):
        """Without TUI: only 1 new pane created (TUI), zero agent panes."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        registry = _make_registry()
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=_make_live_panes(tui_pane_id=None),
        )

        assert result["success"]
        # Only split call should be for TUI
        assert mock_split.call_count == 1, (
            f"Expected 1 split (TUI only), got {mock_split.call_count}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_set_pane_title_not_called_for_agents(self, mock_split, mock_title):
        """set_pane_title must NOT be called for agent roles — only for TUI."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id="%1"),
        )

        assert result["success"]
        # With TUI present, no titles should be set at all
        agent_title_calls = [
            c for c in mock_title.call_args_list
            if c[0][1] in ("tea", "dev", "reviewer")
        ]
        assert len(agent_title_calls) == 0, (
            f"set_pane_title must not be called for agent roles. "
            f"Got calls for: {[c[0][1] for c in agent_title_calls]}"
        )


# ---------------------------------------------------------------------------
# Edge cases (preserved from original)
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases for the simplified layout."""

    def test_empty_roles_still_works(self):
        """Empty roles should still succeed — layout only needs CLI+TUI."""
        # agent_roles parameter was removed — function no longer takes it.
        pass  # This test documents expected behavior change — see below.

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_cli_pane_returns_error(self, mock_split, mock_title):
        """If no CLI pane exists, layout must fail gracefully."""
        live_panes = [
            {"pane_id": "%1", "title": "TUI", "command": "python", "width": 60, "height": 20},
        ]
        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=live_panes,
        )
        assert not result["success"]

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_split_failure_propagates(self, mock_split, mock_title):
        """If TUI split fails, layout should return error."""
        mock_split.return_value = {"success": False, "error": "pane too small"}
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(tui_pane_id=None),  # Force TUI creation
        )

        assert not result["success"]
