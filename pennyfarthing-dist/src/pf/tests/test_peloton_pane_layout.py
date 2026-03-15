"""Tests for peloton pane layout — CLI/TUI stacked left, agents stacked right.

Story 148-15: Peloton pane layout — CLI/TUI stacked top-bottom, peloton panes in right split
Epic: 148 — TUI-tmux Fixer

Desired layout:
┌──────────────┬──────────────┐
│              │              │
│   CLI        │  Agent 1     │
│              │  (TEA)       │
│──────────────│──────────────│
│              │  Agent 2     │
│   TUI        │  (Dev)       │
│              │              │
└──────────────┴──────────────┘

Acceptance Criteria:
- [AC1] Peloton start creates a right-side vertical split for agent panes
- [AC2] CLI session remains in top-left, TUI in bottom-left
- [AC3] Agent panes open within the right column, stacked vertically
- [AC4] Layout is applied when `pf peloton start` runs
- [AC5] Existing pane management (tmux registry) is respected
- [AC6] Works when TUI is already running; works when TUI is not running

Tests should FAIL until the layout feature is implemented.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def project(tmp_path: Path) -> Path:
    """Minimal project structure for peloton layout tests."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()

    # Workflow definition
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

    # Session file
    session_dir = tmp_path / ".session"
    session_dir.mkdir()
    (session_dir / "42-1-session.md").write_text(
        "**Story:** 42-1\n"
        "**Workflow:** tdd\n"
        "**Phase:** setup\n"
    )

    return tmp_path


def _make_live_panes_cli_tui() -> list[dict]:
    """Simulates a tmux session with CLI on top, TUI on bottom."""
    return [
        {
            "pane_id": "%0",
            "title": "Claude Code",
            "command": "claude",
            "width": 200,
            "height": 30,
        },
        {
            "pane_id": "%1",
            "title": "TUI",
            "command": "python",
            "width": 200,
            "height": 30,
        },
    ]


def _make_live_panes_cli_only() -> list[dict]:
    """Simulates a tmux session with only the CLI pane (no TUI)."""
    return [
        {
            "pane_id": "%0",
            "title": "Claude Code",
            "command": "claude",
            "width": 200,
            "height": 60,
        },
    ]


def _make_registry(session: str, panes: list[dict]) -> dict:
    """Build a registry dict from pane list."""
    return {
        "session": session,
        "socket": "pf",
        "max_panes": 10,
        "panes": [
            {
                "pane_id": p["pane_id"],
                "role": "claude" if "Claude" in p["title"] else ("tui" if "TUI" in p["title"] else "worker"),
                "title": p["title"],
                "protected": "Claude" in p["title"] or "TUI" in p["title"],
                "owner": None,
            }
            for p in panes
        ],
    }


# ---------------------------------------------------------------------------
# AC1: Peloton creates a right-side vertical split for agent panes
# ---------------------------------------------------------------------------


class TestRightColumnCreation:
    """AC1: Agent panes go in a right column, not mixed with CLI/TUI."""

    def test_create_peloton_layout_exists(self) -> None:
        """A create_peloton_layout function must exist in pane_orchestrator."""
        from pf.peloton.pane_orchestrator import create_peloton_layout  # noqa: F401

    def test_creates_right_column_split(self) -> None:
        """The layout function should split the CLI pane horizontally to create a right column."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.return_value = {"success": True, "data": "%10"}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            # The first split should be horizontal (h) off the CLI pane to create right column
            first_split = mock_split.call_args_list[0]
            args, kwargs = first_split
            # direction should be "h" for horizontal — creates a pane to the RIGHT
            assert "h" in args or kwargs.get("direction") == "h", \
                "First split must be horizontal to create right column"

    def test_right_column_pane_id_returned(self) -> None:
        """The result should contain the right column's root pane ID."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.return_value = {"success": True, "data": "%10"}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert "right_column" in result["data"]
            assert result["data"]["right_column"] is not None


# ---------------------------------------------------------------------------
# AC2: CLI remains top-left, TUI stays bottom-left
# ---------------------------------------------------------------------------


class TestCliTuiPositionPreserved:
    """AC2: CLI and TUI panes are not moved or destroyed."""

    def test_cli_pane_not_killed(self) -> None:
        """CLI pane must survive peloton layout creation."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split, \
             patch("pf.peloton.pane_orchestrator.kill_pane") as mock_kill:
            mock_split.return_value = {"success": True, "data": "%10"}

            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            # CLI pane (%0) must NOT be killed
            killed_ids = [c.args[0] if c.args else c.kwargs.get("pane_id") for c in mock_kill.call_args_list]
            assert "%0" not in killed_ids, "CLI pane must not be killed"

    def test_tui_pane_not_killed(self) -> None:
        """TUI pane must survive peloton layout creation."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split, \
             patch("pf.peloton.pane_orchestrator.kill_pane") as mock_kill:
            mock_split.return_value = {"success": True, "data": "%10"}

            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            # TUI pane (%1) must NOT be killed
            killed_ids = [c.args[0] if c.args else c.kwargs.get("pane_id") for c in mock_kill.call_args_list]
            assert "%1" not in killed_ids, "TUI pane must not be killed"

    def test_result_preserves_cli_and_tui_ids(self) -> None:
        """Result data should report the CLI and TUI pane IDs unchanged."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.return_value = {"success": True, "data": "%10"}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert result["data"]["cli_pane"] == "%0"
            assert result["data"]["tui_pane"] == "%1"


# ---------------------------------------------------------------------------
# AC3: Agent panes stack vertically within the right column
# ---------------------------------------------------------------------------


class TestAgentPaneStacking:
    """AC3: Multiple agent panes stack vertically in the right column."""

    def test_two_agents_produce_two_panes(self) -> None:
        """Two agent roles should produce two pane IDs in the right column."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert len(result["data"]["agent_panes"]) == 2

    def test_three_agents_produce_three_panes(self) -> None:
        """Three agent roles should produce three stacked panes."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11", "%12"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev", "reviewer"],
            )

            assert result["success"]
            assert len(result["data"]["agent_panes"]) == 3

    def test_agent_panes_split_vertically_within_right_column(self) -> None:
        """After the first horizontal split (creating right column),
        subsequent agent panes should split vertically (stacking top-to-bottom)."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11", "%12"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev", "reviewer"],
            )

            # First call: horizontal split to create right column
            # Subsequent calls: vertical splits within the right column
            calls = mock_split.call_args_list
            assert len(calls) >= 2, "Need at least 2 splits: right column + agent stacking"

            # Second and subsequent splits should be vertical (v) for stacking
            for split_call in calls[1:]:
                args, kwargs = split_call
                direction = kwargs.get("direction") if "direction" in kwargs else args[2] if len(args) > 2 else None
                assert direction == "v", \
                    f"Agent panes must split vertically within right column, got direction={direction}"

    def test_agent_panes_map_to_roles(self) -> None:
        """Each agent pane should be associated with its role."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            agent_panes = result["data"]["agent_panes"]
            roles = [p["role"] for p in agent_panes]
            assert "tea" in roles
            assert "dev" in roles


# ---------------------------------------------------------------------------
# AC4: Layout is applied when pf peloton start runs
# ---------------------------------------------------------------------------


class TestPelotonStartIntegration:
    """AC4: start_session triggers the layout when tmux is available."""

    def test_start_session_calls_layout(self, project: Path) -> None:
        """start_session should invoke create_peloton_layout."""
        with patch("pf.peloton.live.create_peloton_layout") as mock_layout:
            mock_layout.return_value = {
                "success": True,
                "data": {
                    "cli_pane": "%0",
                    "tui_pane": "%1",
                    "right_column": "%10",
                    "agent_panes": [
                        {"pane_id": "%10", "role": "tea"},
                        {"pane_id": "%11", "role": "dev"},
                    ],
                },
            }

            from pf.peloton.live import start_session

            result = start_session(project, "42-1", "tdd")

            assert result["success"]
            mock_layout.assert_called_once()

    def test_start_session_includes_layout_in_result(self, project: Path) -> None:
        """start_session result should include layout information."""
        with patch("pf.peloton.live.create_peloton_layout") as mock_layout:
            mock_layout.return_value = {
                "success": True,
                "data": {
                    "cli_pane": "%0",
                    "tui_pane": "%1",
                    "right_column": "%10",
                    "agent_panes": [
                        {"pane_id": "%10", "role": "tea"},
                        {"pane_id": "%11", "role": "dev"},
                    ],
                },
            }

            from pf.peloton.live import start_session

            result = start_session(project, "42-1", "tdd")

            assert result["success"]
            assert "layout" in result["data"]


# ---------------------------------------------------------------------------
# AC5: Existing pane management (tmux registry) is respected
# ---------------------------------------------------------------------------


class TestRegistryIntegration:
    """AC5: Layout creation updates the tmux pane registry."""

    def test_agent_panes_registered(self) -> None:
        """New agent panes should appear in the registry after layout creation."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            # Registry should be updated with new agent panes
            updated_registry = result["data"].get("registry")
            assert updated_registry is not None, "Result must include updated registry"
            pane_ids = [p["pane_id"] for p in updated_registry["panes"]]
            assert "%10" in pane_ids
            assert "%11" in pane_ids

    def test_agent_panes_have_owner_peloton(self) -> None:
        """Agent panes in registry should have owner='peloton'."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            updated_registry = result["data"]["registry"]
            agent_entries = [p for p in updated_registry["panes"] if p["pane_id"] in ("%10", "%11")]
            for entry in agent_entries:
                assert entry["owner"] == "peloton", f"Agent pane {entry['pane_id']} must be owned by peloton"

    def test_protected_panes_unchanged(self) -> None:
        """Protected panes (CLI, TUI) in registry must not be modified."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            updated_registry = result["data"]["registry"]
            cli_entry = next(p for p in updated_registry["panes"] if p["pane_id"] == "%0")
            tui_entry = next(p for p in updated_registry["panes"] if p["pane_id"] == "%1")
            assert cli_entry["protected"] is True
            assert tui_entry["protected"] is True
            assert cli_entry["role"] == "claude"
            assert tui_entry["role"] == "tui"


# ---------------------------------------------------------------------------
# AC6: Works when TUI is running AND when TUI is not running
# ---------------------------------------------------------------------------


class TestLayoutWithoutTui:
    """AC6: Layout works when TUI is NOT running."""

    def test_layout_works_without_tui(self) -> None:
        """When only CLI pane exists, layout should still create the right column."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"], f"Layout must work without TUI: {result.get('error')}"

    def test_no_tui_still_creates_agent_panes(self) -> None:
        """Agent panes should still be created even without TUI."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert len(result["data"]["agent_panes"]) == 2

    def test_no_tui_reports_none_for_tui_pane(self) -> None:
        """When TUI isn't running, tui_pane should be None."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert result["data"]["tui_pane"] is None


class TestLayoutWithTui:
    """AC6: Layout works when TUI IS already running."""

    def test_layout_works_with_tui(self) -> None:
        """When both CLI and TUI panes exist, layout should succeed."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert result["success"]
            assert result["data"]["tui_pane"] == "%1"

    def test_splits_off_cli_not_tui(self) -> None:
        """The right column split should come from the CLI pane, not the TUI pane.

        The CLI pane is at the top-left — splitting it horizontally creates the
        right column. The TUI stays in bottom-left.
        """
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}

            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            # The first split should target the CLI pane (%0)
            first_call = mock_split.call_args_list[0]
            args, kwargs = first_call
            target = kwargs.get("target") if "target" in kwargs else args[1] if len(args) > 1 else None
            assert target == "%0", f"First split must target CLI pane (%0), got {target}"


# ---------------------------------------------------------------------------
# Edge cases — paranoid testing
# ---------------------------------------------------------------------------


class TestLayoutEdgeCases:
    """Edge cases and error handling."""

    def test_empty_agent_list_returns_error(self) -> None:
        """No agents = no layout to create."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
            agent_roles=[],
        )

        assert not result["success"]

    def test_split_failure_returns_error(self) -> None:
        """If tmux split fails, the layout should report failure cleanly."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.return_value = {"success": False, "error": "no space for split"}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            assert not result["success"]
            assert "error" in result

    def test_single_agent_still_creates_right_column(self) -> None:
        """Even one agent should get the right column treatment."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split:
            mock_split.return_value = {"success": True, "data": "%10"}

            result = create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea"],
            )

            assert result["success"]
            assert len(result["data"]["agent_panes"]) == 1
            assert result["data"]["right_column"] is not None

    def test_pane_titles_set_for_agents(self) -> None:
        """Each agent pane should have its title set for identification."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        split_ids = iter(["%10", "%11"])
        with patch("pf.peloton.pane_orchestrator.split_pane") as mock_split, \
             patch("pf.peloton.pane_orchestrator.set_pane_title") as mock_title:
            mock_split.side_effect = lambda *a, **kw: {"success": True, "data": next(split_ids)}
            mock_title.return_value = {"success": True, "data": ""}

            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
                agent_roles=["tea", "dev"],
            )

            # set_pane_title should be called for each agent pane
            assert mock_title.call_count >= 2, "Must set title for each agent pane"

    def test_no_cli_pane_found_returns_error(self) -> None:
        """If there's no CLI pane in the session, layout should fail gracefully."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        # A session with an unrecognized pane (no CLI, no TUI)
        live_panes = [
            {
                "pane_id": "%5",
                "title": "random-shell",
                "command": "zsh",
                "width": 200,
                "height": 60,
            },
        ]
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
            agent_roles=["tea", "dev"],
        )

        assert not result["success"]
        assert "cli" in result["error"].lower() or "claude" in result["error"].lower()
