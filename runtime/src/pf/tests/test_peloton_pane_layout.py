"""Tests for peloton pane layout — TUI below CLI, no agent pane pre-opening.

Story 148-15 (original): Created two-column layout with agent panes.
Story 148-19 (update): Removed agent pane pre-opening. TeamCreate spawns its
own panes via teammateMode=tmux. Layout only handles TUI placement below CLI.

Acceptance Criteria (updated by 148-19):
- [AC1] create_peloton_layout exists and returns {success, data}
- [AC2] CLI pane is preserved (not killed or moved)
- [AC3] TUI pane is preserved when present
- [AC4] start_session produces a TeamCreate prompt (layout is internal)
- [AC5] Registry is passed through unchanged (no agent panes added)
- [AC6] Works with and without TUI already present
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

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
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 30},
        {"pane_id": "%1", "title": "TUI", "command": "python", "width": 200, "height": 30},
    ]


def _make_live_panes_cli_only() -> list[dict]:
    """Simulates a tmux session with only the CLI pane (no TUI)."""
    return [
        {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 200, "height": 60},
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
# AC1: create_peloton_layout exists and returns success
# ---------------------------------------------------------------------------


class TestLayoutExists:
    """AC1: The layout function exists and returns a result."""

    def test_create_peloton_layout_exists(self) -> None:
        """A create_peloton_layout function must exist in pane_orchestrator."""
        from pf.peloton.pane_orchestrator import create_peloton_layout  # noqa: F401

    def test_returns_success_with_cli_and_tui(self) -> None:
        """Layout succeeds when both CLI and TUI are present."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]
        assert "cli_pane" in result["data"]
        assert "tui_pane" in result["data"]
        assert "registry" in result["data"]


# ---------------------------------------------------------------------------
# AC2: CLI pane is preserved
# ---------------------------------------------------------------------------


class TestCliTuiPositionPreserved:
    """AC2: CLI and TUI panes are not moved or destroyed."""

    def test_cli_pane_not_killed(self) -> None:
        """CLI pane must survive peloton layout creation."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.kill_pane") as mock_kill:
            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
            )

            killed_ids = [c.args[0] if c.args else c.kwargs.get("pane_id") for c in mock_kill.call_args_list]
            assert "%0" not in killed_ids, "CLI pane must not be killed"

    def test_tui_pane_not_killed(self) -> None:
        """TUI pane must survive peloton layout creation."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        with patch("pf.peloton.pane_orchestrator.kill_pane") as mock_kill:
            create_peloton_layout(
                session="pf-test-0",
                registry=registry,
                live_panes=live_panes,
            )

            killed_ids = [c.args[0] if c.args else c.kwargs.get("pane_id") for c in mock_kill.call_args_list]
            assert "%1" not in killed_ids, "TUI pane must not be killed"

    def test_result_preserves_cli_and_tui_ids(self) -> None:
        """Result data should report the CLI and TUI pane IDs unchanged."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]
        assert result["data"]["cli_pane"] == "%0"
        assert result["data"]["tui_pane"] == "%1"


# ---------------------------------------------------------------------------
# AC4: start_session produces prompt (layout is internal)
# ---------------------------------------------------------------------------


class TestPelotonStartIntegration:
    """AC4: start_session produces a TeamCreate prompt."""

    def test_start_session_returns_prompt(self, project: Path) -> None:
        """start_session should return a prompt for TeamCreate."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert result["success"]
        assert "prompt" in result["data"]
        assert "team_name" in result["data"]
        assert "agents" in result["data"]

    def test_start_session_includes_layout_in_result(self, project: Path) -> None:
        """start_session result includes layout (added by 148-24)."""
        from pf.peloton.live import start_session

        result = start_session(project, "42-1", "tdd")

        assert result["success"]
        assert "layout" in result["data"]
        assert "pane_mapping" not in result["data"]


# ---------------------------------------------------------------------------
# AC5: Registry passed through unchanged
# ---------------------------------------------------------------------------


class TestRegistryIntegration:
    """AC5: Registry is returned unchanged — no agent panes added."""

    def test_registry_unchanged_with_tui_present(self) -> None:
        """When TUI is present, registry should pass through with no new entries."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)
        original_pane_count = len(registry["panes"])

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]
        updated_registry = result["data"]["registry"]
        assert len(updated_registry["panes"]) == original_pane_count

    def test_no_peloton_owned_panes_added(self) -> None:
        """No peloton-owned panes should be added to registry."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]
        peloton_panes = [p for p in result["data"]["registry"]["panes"] if p.get("owner") == "peloton"]
        assert len(peloton_panes) == 0

    def test_protected_panes_unchanged(self) -> None:
        """Protected panes (CLI, TUI) in registry must not be modified."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        updated_registry = result["data"]["registry"]
        cli_entry = next(p for p in updated_registry["panes"] if p["pane_id"] == "%0")
        tui_entry = next(p for p in updated_registry["panes"] if p["pane_id"] == "%1")
        assert cli_entry["protected"] is True
        assert tui_entry["protected"] is True
        assert cli_entry["role"] == "claude"
        assert tui_entry["role"] == "tui"


# ---------------------------------------------------------------------------
# AC6: Works with and without TUI
# ---------------------------------------------------------------------------


class TestLayoutWithoutTui:
    """AC6: Layout works when TUI is NOT running — creates TUI pane."""

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_layout_works_without_tui(self, mock_split, mock_title) -> None:
        """When only CLI pane exists, layout should create TUI below it."""
        mock_split.return_value = {"success": True, "data": "%10"}
        mock_title.return_value = {"success": True, "data": ""}

        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"], f"Layout must work without TUI: {result.get('error')}"
        assert result["data"]["tui_pane"] == "%10"

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_tui_created_by_vertical_split(self, mock_split, mock_title) -> None:
        """TUI should be created by vertical split of CLI pane."""
        mock_split.return_value = {"success": True, "data": "%10"}
        mock_title.return_value = {"success": True, "data": ""}

        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()
        registry = _make_registry("pf-test-0", live_panes)

        create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert mock_split.call_count == 1
        call_args = mock_split.call_args_list[0]
        assert call_args[0][1] == "%0", "TUI split must target CLI pane"
        assert call_args[0][2] == "v", "TUI split must be vertical (below CLI)"


class TestLayoutWithTui:
    """AC6: Layout works when TUI IS already running."""

    def test_layout_works_with_tui(self) -> None:
        """When both CLI and TUI panes exist, layout should succeed."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]
        assert result["data"]["tui_pane"] == "%1"

    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_no_splits_when_tui_present(self, mock_split) -> None:
        """No splits should happen when TUI already exists."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert mock_split.call_count == 0, "No splits needed when TUI exists"


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestLayoutEdgeCases:
    """Edge cases and error handling."""

    def test_empty_agent_list_succeeds(self) -> None:
        """Empty roles should succeed — layout only needs CLI+TUI."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_tui()
        registry = _make_registry("pf-test-0", live_panes)

        # No agent_roles parameter — function no longer takes it
        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert result["success"]

    @patch("pf.peloton.pane_orchestrator.set_pane_title")
    @patch("pf.peloton.pane_orchestrator.split_pane")
    def test_split_failure_returns_error(self, mock_split, mock_title) -> None:
        """If TUI split fails, the layout should report failure cleanly."""
        mock_split.return_value = {"success": False, "error": "no space for split"}
        mock_title.return_value = {"success": True, "data": ""}

        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = _make_live_panes_cli_only()  # Force TUI creation
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert not result["success"]
        assert "error" in result

    def test_no_cli_pane_found_returns_error(self) -> None:
        """If there's no CLI pane in the session, layout should fail gracefully."""
        from pf.peloton.pane_orchestrator import create_peloton_layout

        live_panes = [
            {"pane_id": "%5", "title": "random-shell", "command": "zsh", "width": 200, "height": 60},
        ]
        registry = _make_registry("pf-test-0", live_panes)

        result = create_peloton_layout(
            session="pf-test-0",
            registry=registry,
            live_panes=live_panes,
        )

        assert not result["success"]
        assert "cli" in result["error"].lower() or "claude" in result["error"].lower()
