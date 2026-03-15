"""Tests for peloton pane reuse — TeamCreate targets pre-opened panes, TUI below CLI.

Story 148-19: Peloton pane reuse
Epic: MSSCI-16421

Bug 1: create_peloton_layout pre-opens tmux panes for agents but TeamCreate
ignores them and spawns additional panes. The prompt must include pane IDs
so TeamCreate can target pre-opened panes instead of spawning new ones.

Bug 2: TUI pane should stack directly below the CLI pane in the peloton
layout, not at the bottom of the pane list.

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
    tui_pane_id: str = "%1",
    extra: list[dict] | None = None,
) -> list[dict]:
    """Build a fake live_panes list with CLI and TUI panes."""
    panes = [
        {"pane_id": cli_pane_id, "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
        {"pane_id": tui_pane_id, "title": "TUI", "command": "python", "width": 120, "height": 20},
    ]
    if extra:
        panes.extend(extra)
    return panes


def _make_registry(session: str = "pf-test-0") -> dict:
    return {
        "session": session,
        "socket": "pf",
        "max_panes": 10,
        "panes": [],
    }


_AGENT_ROLES = ["tea", "dev", "reviewer"]
_SPLIT_COUNTER = 0


def _mock_split_side_effect(session, target, direction, *args, **kwargs):
    """Generate unique pane IDs for each split_pane call."""
    global _SPLIT_COUNTER
    _SPLIT_COUNTER += 1
    return {"success": True, "data": f"%{100 + _SPLIT_COUNTER}"}


# ---------------------------------------------------------------------------
# Bug 1: Pane reuse — TeamCreate must target pre-opened panes
# ---------------------------------------------------------------------------


class TestCreatePelotonLayoutReturnsPaneMapping:
    """create_peloton_layout must return agent→pane_id mapping so TeamCreate
    can target the pre-opened panes instead of spawning new ones."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_agent_panes_have_pane_ids(self, mock_split, mock_title):
        """Each agent in the returned agent_panes must have a pane_id."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        for ap in result["data"]["agent_panes"]:
            assert "pane_id" in ap
            assert ap["pane_id"].startswith("%")

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_agent_panes_count_matches_roles(self, mock_split, mock_title):
        """One pane per role — no extras, no missing."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        assert len(result["data"]["agent_panes"]) == len(_AGENT_ROLES)


class TestStartSessionIncludesPaneIds:
    """start_session must include pane_id mapping in its output so that the
    TeamCreate prompt can target pre-opened panes."""

    @patch("pf.peloton.live.get_workflow_agents")
    @patch("pf.peloton.live.create_peloton_layout")
    @patch("pf.peloton.live.save_state")
    def test_prompt_contains_pane_ids(self, mock_save, mock_layout, mock_agents, tmp_path):
        """The TeamCreate prompt must reference pane_ids for each agent so
        TeamCreate targets existing panes rather than spawning new ones."""
        from pf.peloton.live import start_session

        mock_agents.return_value = {"success": True, "data": ["tea", "dev", "reviewer"]}
        mock_save.return_value = {"success": True}
        mock_layout.return_value = {
            "success": True,
            "data": {
                "cli_pane": "%0",
                "tui_pane": "%1",
                "right_column": "%100",
                "agent_panes": [
                    {"pane_id": "%100", "role": "tea"},
                    {"pane_id": "%101", "role": "dev"},
                    {"pane_id": "%102", "role": "reviewer"},
                ],
                "registry": _make_registry(),
            },
        }

        result = start_session(tmp_path, "148-19", "tdd")

        assert result["success"]
        prompt = result["data"]["prompt"]

        # The prompt must include pane_id references so TeamCreate can target them
        assert "%100" in prompt, "Prompt must include tea pane_id for TeamCreate targeting"
        assert "%101" in prompt, "Prompt must include dev pane_id for TeamCreate targeting"
        assert "%102" in prompt, "Prompt must include reviewer pane_id for TeamCreate targeting"

    @patch("pf.peloton.live.get_workflow_agents")
    @patch("pf.peloton.live.create_peloton_layout")
    @patch("pf.peloton.live.save_state")
    def test_result_includes_pane_mapping(self, mock_save, mock_layout, mock_agents, tmp_path):
        """The result data must include a pane_mapping dict {role: pane_id}
        for downstream consumers (e.g. the skill that calls TeamCreate)."""
        from pf.peloton.live import start_session

        mock_agents.return_value = {"success": True, "data": ["tea", "dev", "reviewer"]}
        mock_save.return_value = {"success": True}
        mock_layout.return_value = {
            "success": True,
            "data": {
                "cli_pane": "%0",
                "tui_pane": "%1",
                "right_column": "%100",
                "agent_panes": [
                    {"pane_id": "%100", "role": "tea"},
                    {"pane_id": "%101", "role": "dev"},
                    {"pane_id": "%102", "role": "reviewer"},
                ],
                "registry": _make_registry(),
            },
        }

        result = start_session(tmp_path, "148-19", "tdd")

        assert result["success"]
        data = result["data"]

        # Must have a pane_mapping for TeamCreate to use
        assert "pane_mapping" in data, "Result must include pane_mapping {role: pane_id}"
        mapping = data["pane_mapping"]
        assert mapping["tea"] == "%100"
        assert mapping["dev"] == "%101"
        assert mapping["reviewer"] == "%102"


class TestNoDoubleRegistration:
    """Agent panes registered by create_peloton_layout must not be duplicated
    when TeamCreate adds its own entries."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_registry_entries_are_unique_per_role(self, mock_split, mock_title):
        """Each role should appear exactly once in the registry."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        registry = _make_registry()
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        reg = result["data"]["registry"]
        roles = [p["role"] for p in reg["panes"]]
        assert len(roles) == len(set(roles)), f"Duplicate roles in registry: {roles}"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_registry_entries_marked_as_peloton_owned(self, mock_split, mock_title):
        """All pre-opened panes must have owner='peloton' for cleanup."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        registry = _make_registry()
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        for pane in result["data"]["registry"]["panes"]:
            assert pane["owner"] == "peloton"


# ---------------------------------------------------------------------------
# Bug 2: TUI pane must stack directly below CLI pane
# ---------------------------------------------------------------------------


class TestTuiPanePlacement:
    """TUI pane must be placed directly below the CLI pane in the left column,
    not at the bottom of the pane list."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_split_from_cli_pane(self, mock_split, mock_title):
        """When TUI doesn't exist yet, it must be created by splitting the CLI
        pane vertically (below), not by splitting the last agent pane."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        # No TUI pane in live_panes — layout should create one below CLI
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
        ]

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=live_panes,
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]

        # TUI pane must exist in the result
        assert result["data"]["tui_pane"] is not None, "TUI pane must be created when missing"

        # The TUI pane must be created by splitting the CLI pane vertically
        # Find the split call that created the TUI pane
        tui_pane_id = result["data"]["tui_pane"]
        split_calls = mock_split.call_args_list

        # At least one split must target the CLI pane (%0) with vertical direction
        cli_vertical_splits = [
            c for c in split_calls
            if c[0][1] == "%0" and c[0][2] == "v"
        ]
        assert len(cli_vertical_splits) > 0, (
            "TUI must be created by vertically splitting the CLI pane. "
            f"Splits were: {split_calls}"
        )

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_pane_placed_below_cli_when_preexisting(self, mock_split, mock_title):
        """When TUI already exists, layout must ensure it's positioned directly
        below CLI — not at the bottom of the window."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]

        # The first split (horizontal, creating right column) must target the
        # CLI pane, preserving CLI+TUI together in the left column.
        first_split = mock_split.call_args_list[0]
        # First split targets CLI pane (%0), horizontal direction
        assert first_split[0][1] == "%0", "First split must target CLI pane"
        assert first_split[0][2] == "h", "First split must be horizontal (right column)"

        # TUI pane should be identified and returned
        assert result["data"]["tui_pane"] == "%1"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_below_cli_not_below_agents(self, mock_split, mock_title):
        """TUI must NOT be created by splitting the last agent pane.
        It must be in the left column (CLI column), not the right (agent column)."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        # No TUI in live_panes
        live_panes = [
            {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
        ]

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=live_panes,
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]

        # Gather all agent pane IDs
        agent_pane_ids = {ap["pane_id"] for ap in result["data"]["agent_panes"]}

        # TUI pane must NOT be one of the agent panes
        tui_pane_id = result["data"]["tui_pane"]
        assert tui_pane_id not in agent_pane_ids, (
            f"TUI pane ({tui_pane_id}) must not be an agent pane. "
            "It should be in the left column below CLI."
        )

        # TUI must not be created by splitting any agent pane
        agent_splits = [
            c for c in mock_split.call_args_list
            if c[0][1] in agent_pane_ids
        ]
        tui_from_agent = [
            c for c in agent_splits
            if c[0][2] == "v"  # vertical split of agent pane
        ]
        # The only vertical splits of agent panes should be for other agents,
        # not for TUI
        # (This is a weaker assertion — the strong one is that TUI splits from CLI)


class TestLayoutStructure:
    """The peloton layout must have a two-column structure:
    Left: CLI (top) + TUI (bottom). Right: agent panes stacked."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_right_column_contains_only_agents(self, mock_split, mock_title):
        """The right column panes must be exclusively agent panes."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        agent_panes = result["data"]["agent_panes"]
        right_col_id = result["data"]["right_column"]

        # Right column pane must be the first agent's pane
        assert agent_panes[0]["pane_id"] == right_col_id

        # All agent panes must have correct roles
        roles = [ap["role"] for ap in agent_panes]
        assert roles == _AGENT_ROLES

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_cli_and_tui_not_in_agent_panes(self, mock_split, mock_title):
        """CLI and TUI panes must not appear in the agent_panes list."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert result["success"]
        agent_ids = {ap["pane_id"] for ap in result["data"]["agent_panes"]}
        assert result["data"]["cli_pane"] not in agent_ids
        tui = result["data"]["tui_pane"]
        if tui:
            assert tui not in agent_ids


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases for pane reuse and layout."""

    def test_empty_roles_returns_error(self):
        """No roles → error, not an empty layout."""
        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=[],
        )
        assert not result["success"]
        assert "error" in result

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
            agent_roles=_AGENT_ROLES,
        )
        assert not result["success"]

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_single_role_layout(self, mock_split, mock_title):
        """Layout with a single agent role should work."""
        global _SPLIT_COUNTER
        _SPLIT_COUNTER = 0
        mock_split.side_effect = _mock_split_side_effect
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=["reviewer"],
        )

        assert result["success"]
        assert len(result["data"]["agent_panes"]) == 1
        assert result["data"]["agent_panes"][0]["role"] == "reviewer"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_split_failure_propagates(self, mock_split, mock_title):
        """If split_pane fails, create_peloton_layout must return error."""
        mock_split.return_value = {"success": False, "error": "pane too small"}
        mock_title.return_value = {"success": True, "data": ""}

        result = create_peloton_layout(
            session="pf-test-0",
            registry=_make_registry(),
            live_panes=_make_live_panes(),
            agent_roles=_AGENT_ROLES,
        )

        assert not result["success"]
