"""Tests for tmux pane discoverability.

Story 148-1: Extend tmux for pane discoverability
Epic: 148 — TUI-tmux Fixer

Acceptance Criteria:
- [AC1] Each role has a distinctive icon via get_pane_icon(role)
- [AC2] configure_pane_borders(session) enables pane-border-status with role labels
- [AC3] Pane border format includes role icon and title
- [AC4] set_pane_env(pane_id, role) injects PF_PANE_ROLE env var
- [AC5] pf tmux list output includes role icons

Tests should FAIL until discoverability features are implemented.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from pf.tmux.panes import (
    configure_pane_borders,
    get_pane_icon,
    set_pane_env,
)

# ---------------------------------------------------------------------------
# AC1: get_pane_icon returns a distinctive icon for each role
# ---------------------------------------------------------------------------


class TestGetPaneIcon:
    """AC1: Each role has a distinctive icon."""

    @pytest.mark.parametrize("role", ["claude", "tui", "worker", "saddle"])
    def test_role_has_icon(self, role: str) -> None:
        """Each known role returns a non-empty icon string."""
        icon = get_pane_icon(role)
        assert isinstance(icon, str)
        assert len(icon) > 0

    def test_all_icons_are_distinct(self) -> None:
        """Each role must have a unique icon for instant identification."""
        roles = ["claude", "tui", "worker", "saddle"]
        icons = [get_pane_icon(r) for r in roles]
        assert len(set(icons)) == len(roles), f"Duplicate icons found: {icons}"

    def test_unknown_role_returns_fallback(self) -> None:
        """Unknown roles get a fallback icon, not an error."""
        icon = get_pane_icon("unknown-role")
        assert isinstance(icon, str)
        assert len(icon) > 0


# ---------------------------------------------------------------------------
# AC2: configure_pane_borders enables pane-border-status
# ---------------------------------------------------------------------------


class TestConfigurePaneBorders:
    """AC2: configure_pane_borders sets up tmux pane borders with labels."""

    @patch("pf.tmux.panes._run_tmux")
    def test_enables_pane_border_status(self, mock_run: MagicMock) -> None:
        """Should enable pane-border-status so titles are visible."""
        mock_run.return_value = {"success": True, "data": ""}
        result = configure_pane_borders("pf-test-0")
        assert result["success"] is True

        # At least one call should set pane-border-status
        calls = [str(c) for c in mock_run.call_args_list]
        border_status_calls = [c for c in calls if "pane-border-status" in c]
        assert len(border_status_calls) > 0, "Must enable pane-border-status"

    @patch("pf.tmux.panes._run_tmux")
    def test_sets_border_format_with_role(self, mock_run: MagicMock) -> None:
        """Border format should include role identification."""
        mock_run.return_value = {"success": True, "data": ""}
        result = configure_pane_borders("pf-test-0")
        assert result["success"] is True

        calls = [str(c) for c in mock_run.call_args_list]
        format_calls = [c for c in calls if "pane-border-format" in c]
        assert len(format_calls) > 0, "Must set pane-border-format"

    @patch("pf.tmux.panes._run_tmux")
    def test_returns_error_on_tmux_failure(self, mock_run: MagicMock) -> None:
        """Should propagate tmux errors cleanly."""
        mock_run.return_value = {"success": False, "error": "no server"}
        result = configure_pane_borders("pf-test-0")
        assert result["success"] is False
        assert "error" in result


# ---------------------------------------------------------------------------
# AC3: Pane border format includes icon and title
# ---------------------------------------------------------------------------


class TestPaneBorderFormat:
    """AC3: Border format string includes role icon and pane title."""

    @patch("pf.tmux.panes._run_tmux")
    def test_border_format_contains_pane_title(self, mock_run: MagicMock) -> None:
        """The format string must reference #{pane_title} for dynamic labels."""
        mock_run.return_value = {"success": True, "data": ""}
        configure_pane_borders("pf-test-0")

        # Find the pane-border-format call and check the format string
        for call in mock_run.call_args_list:
            args = call[0] if call[0] else ()
            for arg in args:
                if "pane_title" in str(arg):
                    return  # Found reference to pane_title — pass
        pytest.fail("pane-border-format must reference #{pane_title}")


# ---------------------------------------------------------------------------
# AC4: set_pane_env injects PF_PANE_ROLE environment variable
# ---------------------------------------------------------------------------


class TestSetPaneEnv:
    """AC4: Panes get a PF_PANE_ROLE env var for programmatic detection."""

    @patch("pf.tmux.panes._run_tmux")
    def test_sets_pf_pane_role(self, mock_run: MagicMock) -> None:
        """Should set PF_PANE_ROLE env var in the target pane."""
        mock_run.return_value = {"success": True, "data": ""}
        result = set_pane_env("%5", "claude")
        assert result["success"] is True

        # Should have sent an export command or used set-environment
        calls = [str(c) for c in mock_run.call_args_list]
        env_calls = [c for c in calls if "PF_PANE_ROLE" in c]
        assert len(env_calls) > 0, "Must set PF_PANE_ROLE in pane"

    @patch("pf.tmux.panes._run_tmux")
    def test_env_value_matches_role(self, mock_run: MagicMock) -> None:
        """The env var value should match the provided role."""
        mock_run.return_value = {"success": True, "data": ""}
        set_pane_env("%5", "tui")

        calls = [str(c) for c in mock_run.call_args_list]
        # At least one call should contain the role value
        tui_calls = [c for c in calls if "tui" in c]
        assert len(tui_calls) > 0, "PF_PANE_ROLE value must match role"

    @patch("pf.tmux.panes._run_tmux")
    def test_returns_error_on_failure(self, mock_run: MagicMock) -> None:
        """Should propagate tmux errors."""
        mock_run.return_value = {"success": False, "error": "pane not found"}
        result = set_pane_env("%99", "worker")
        assert result["success"] is False


# ---------------------------------------------------------------------------
# AC5: pf tmux list includes role icons in output
# ---------------------------------------------------------------------------


class TestListPanesWithIcons:
    """AC5: CLI list output includes role icons for visual identification."""

    @patch("pf.tmux.panes.list_live_panes")
    @patch("pf.tmux.registry.load_registry")
    @patch("pf.tmux.panes.get_session_name")
    @patch("pf.tmux.panes.is_tmux_running")
    @patch("pf.tmux.cli.get_project_root")
    def test_list_output_contains_icons(
        self,
        mock_root: MagicMock,
        mock_running: MagicMock,
        mock_session: MagicMock,
        mock_load_reg: MagicMock,
        mock_live: MagicMock,
        tmp_path,
    ) -> None:
        """pf tmux list should show role icons next to each pane."""
        from click.testing import CliRunner

        from pf.tmux.cli import tmux

        mock_root.return_value = tmp_path
        mock_running.return_value = True
        mock_session.return_value = {"success": True, "data": "pf-test-0"}
        mock_load_reg.return_value = {
            "success": True,
            "data": {
                "session": "pf-test-0",
                "socket": "pf",
                "max_panes": 5,
                "panes": [
                    {"pane_id": "%0", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
                    {"pane_id": "%1", "role": "tui", "title": "TUI", "protected": True, "owner": None},
                ],
            },
        }
        mock_live.return_value = {
            "success": True,
            "data": [
                {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
                {"pane_id": "%1", "title": "TUI", "command": "python", "width": 60, "height": 40},
            ],
        }

        runner = CliRunner()
        result = runner.invoke(tmux, ["list"])

        # Output should contain the icon for claude role
        claude_icon = get_pane_icon("claude")
        tui_icon = get_pane_icon("tui")
        assert claude_icon in result.output, f"Claude icon '{claude_icon}' not in list output"
        assert tui_icon in result.output, f"TUI icon '{tui_icon}' not in list output"

    @patch("pf.tmux.panes.list_live_panes")
    @patch("pf.tmux.registry.load_registry")
    @patch("pf.tmux.panes.get_session_name")
    @patch("pf.tmux.panes.is_tmux_running")
    @patch("pf.tmux.cli.get_project_root")
    def test_json_output_includes_icon_field(
        self,
        mock_root: MagicMock,
        mock_running: MagicMock,
        mock_session: MagicMock,
        mock_load_reg: MagicMock,
        mock_live: MagicMock,
        tmp_path,
    ) -> None:
        """pf tmux list --json should include an icon field per pane."""
        import json

        from click.testing import CliRunner

        from pf.tmux.cli import tmux

        mock_root.return_value = tmp_path
        mock_running.return_value = True
        mock_session.return_value = {"success": True, "data": "pf-test-0"}
        mock_load_reg.return_value = {
            "success": True,
            "data": {
                "session": "pf-test-0",
                "socket": "pf",
                "max_panes": 5,
                "panes": [
                    {"pane_id": "%0", "role": "claude", "title": "Claude Code", "protected": True, "owner": None},
                ],
            },
        }
        mock_live.return_value = {
            "success": True,
            "data": [
                {"pane_id": "%0", "title": "Claude Code", "command": "claude", "width": 120, "height": 40},
            ],
        }

        runner = CliRunner()
        result = runner.invoke(tmux, ["list", "--json"])
        data = json.loads(result.output)

        assert len(data) == 1
        assert "icon" in data[0], "JSON output must include 'icon' field"
        assert data[0]["icon"] == get_pane_icon("claude")
