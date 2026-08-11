"""Tests for Story 143-18: Saddle wiring — CLI commands, SM integration, relay-mode hook.

Covers:
  AC1: `pf saddle start/stop/status` CLI commands
  AC2: SM handoff calls saddle start when saddle_mode is enabled
  AC3: Relay-mode auto-advances through saddle pane instead of skill invocation
  AC4: saddle_mode setting with proper defaults
  AC5: Backward compatibility when saddle_mode is disabled
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

# Ensure the project source is on the path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.saddle.cli import saddle
from pf.handoff.marker import generate_marker


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def cli_runner():
    """Click CLI test runner."""
    return CliRunner()


@pytest.fixture
def tmp_project(tmp_path):
    """Minimal project root with .pennyfarthing dir."""
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir()
    return tmp_path


@pytest.fixture
def mock_tmux():
    """Mock tmux panes module for CLI tests."""
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


def _make_ctx(relay_mode: bool = True, saddle_mode: bool = True, usable_percent: int = 20, error: str | None = None):
    """Build a mock ContextResult with saddle_mode support."""
    from pf.context_window import ContextResult

    ctx = ContextResult()
    ctx.relay_mode = relay_mode
    ctx.saddle_mode = saddle_mode
    ctx.usable_percent = usable_percent
    ctx.error = error
    return ctx


# ===========================================================================
# AC1: pf saddle start/stop/status CLI commands
# ===========================================================================


class TestSaddleCLIStart:
    """pf saddle start <agent> launches agent in saddle pane."""

    def test_start_with_valid_agent_succeeds(self, cli_runner, tmp_project, mock_tmux):
        """pf saddle start dev should succeed and report the agent started."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(saddle, ["start", "dev"])
            assert result.exit_code == 0, f"Expected exit 0, got {result.exit_code}: {result.output}"
            assert "dev" in result.output.lower()

    def test_start_with_invalid_agent_fails(self, cli_runner, tmp_project):
        """pf saddle start nonexistent should fail with meaningful error."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project):
            result = cli_runner.invoke(saddle, ["start", "nonexistent"])
            assert result.exit_code != 0

    def test_start_calls_core_start_agent(self, cli_runner, tmp_project, mock_tmux):
        """CLI start command must delegate to saddle.core.start_agent."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.start_agent", return_value={"success": True, "data": {"agent": "dev", "pane_id": "%99", "command": "claude /pf-dev"}}) as mock_start:
            result = cli_runner.invoke(saddle, ["start", "dev"])
            mock_start.assert_called_once()
            call_args = mock_start.call_args
            assert call_args.kwargs.get("agent_name") == "dev" or call_args.args[0] == "dev"

    def test_start_requires_agent_argument(self, cli_runner):
        """pf saddle start with no argument should fail."""
        result = cli_runner.invoke(saddle, ["start"])
        assert result.exit_code != 0

    def test_start_outputs_json_format(self, cli_runner, tmp_project, mock_tmux):
        """Start should output parseable result (JSON or structured)."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.start_agent", return_value={"success": True, "data": {"agent": "tea", "pane_id": "%99", "command": "claude /pf-tea"}}) as mock_start:
            result = cli_runner.invoke(saddle, ["start", "tea"])
            assert result.exit_code == 0
            assert "tea" in result.output.lower()


class TestSaddleCLIStop:
    """pf saddle stop interrupts the running agent."""

    def test_stop_succeeds_when_agent_running(self, cli_runner, tmp_project, mock_tmux):
        """pf saddle stop should succeed when an agent is active."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.stop_agent", return_value={"success": True, "data": {"agent_stopped": "dev"}}) as mock_stop:
            result = cli_runner.invoke(saddle, ["stop"])
            assert result.exit_code == 0

    def test_stop_calls_core_stop_agent(self, cli_runner, tmp_project, mock_tmux):
        """CLI stop must delegate to saddle.core.stop_agent."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.stop_agent", return_value={"success": True, "data": {"agent_stopped": "dev"}}) as mock_stop:
            result = cli_runner.invoke(saddle, ["stop"])
            mock_stop.assert_called_once()

    def test_stop_when_no_agent_reports_error(self, cli_runner, tmp_project):
        """pf saddle stop when nothing is running should report gracefully."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.stop_agent", return_value={"success": False, "error": "No agent running in saddle"}) as mock_stop:
            result = cli_runner.invoke(saddle, ["stop"])
            assert result.exit_code != 0
            assert "no agent" in result.output.lower() or "not running" in result.output.lower()


class TestSaddleCLIStatus:
    """pf saddle status reports current state."""

    def test_status_returns_json(self, cli_runner, tmp_project):
        """pf saddle status should output JSON-parseable state."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.status", return_value={"success": True, "data": {"active": True, "agent": "dev", "pane_id": "%99"}}) as mock_status:
            result = cli_runner.invoke(saddle, ["status"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            assert "active" in parsed and "agent" in parsed

    def test_status_shows_active_agent(self, cli_runner, tmp_project):
        """Status shows agent name when one is running."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.status", return_value={"success": True, "data": {"active": True, "agent": "dev", "pane_id": "%99"}}) as mock_status:
            result = cli_runner.invoke(saddle, ["status"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            data = parsed.get("data", parsed)
            assert data["agent"] == "dev"

    def test_status_shows_inactive_state(self, cli_runner, tmp_project):
        """Status shows inactive when no agent running."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.status", return_value={"success": True, "data": {"active": False, "agent": None, "pane_id": None}}) as mock_status:
            result = cli_runner.invoke(saddle, ["status"])
            assert result.exit_code == 0
            parsed = json.loads(result.output)
            data = parsed.get("data", parsed)
            assert data["active"] is False


# ===========================================================================
# AC2: CLI Registration
# ===========================================================================


class TestSaddleCLIRegistration:
    """pf saddle must be registered as a command group in the main CLI."""

    def test_saddle_group_is_importable(self):
        """The saddle CLI group must be importable from pf.saddle.cli."""
        from pf.saddle.cli import saddle as saddle_group
        assert saddle_group is not None
        assert hasattr(saddle_group, "commands") or callable(saddle_group)

    def test_saddle_registered_in_main_cli(self):
        """pf saddle should appear in the main CLI lazy commands."""
        from pf.cli import _LAZY_COMMANDS
        assert "saddle" in _LAZY_COMMANDS, f"'saddle' not found in _LAZY_COMMANDS: {list(_LAZY_COMMANDS.keys())}"

    def test_saddle_lazy_command_points_to_correct_module(self):
        """Lazy command entry must resolve to pf.saddle.cli.saddle."""
        from pf.cli import _LAZY_COMMANDS
        module_path, attr = _LAZY_COMMANDS["saddle"]
        assert module_path == "pf.saddle.cli"
        assert attr == "saddle"


# ===========================================================================
# AC3: Marker Saddle Mode — Relay ON
# ===========================================================================


class TestMarkerSaddleModeRelayOn:
    """When saddle_mode is ON and relay is ON, marker uses saddle commands."""

    def test_marker_emits_saddle_start_command(self):
        """Marker should include 'pf saddle start' when saddle_mode is enabled."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "pf saddle start" in result.lower() or "saddle" in result.lower()

    def test_marker_includes_agent_name_in_saddle_command(self):
        """Saddle marker must specify which agent to start."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("tea")
            assert "tea" in result

    def test_marker_does_not_emit_skill_invoke_in_saddle_mode(self):
        """In saddle mode, should NOT use /pf-{agent} skill invocation."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            lines = result.strip().split("\n")
            invoke_lines = [l for l in lines if "invoke:" in l and "/pf-dev" in l]
            assert not invoke_lines, f"Saddle mode should not use skill invoke: {invoke_lines}"

    def test_marker_relay_true_in_saddle_mode(self):
        """Saddle mode with relay should still indicate relay: true."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "relay: true" in result


# ===========================================================================
# AC3: Marker Saddle Mode — Relay OFF
# ===========================================================================


class TestMarkerSaddleModeRelayOff:
    """When saddle_mode is ON but relay is OFF, marker suggests manual saddle command."""

    def test_marker_fallback_mentions_saddle(self):
        """Manual mode with saddle should suggest pf saddle start in fallback."""
        ctx = _make_ctx(relay_mode=False, saddle_mode=True)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "saddle" in result.lower() or "pf saddle" in result.lower()


# ===========================================================================
# AC4: Marker reads saddle_mode from context
# ===========================================================================


class TestMarkerReadsSaddleMode:
    """marker.py must read saddle_mode from the config/context system."""

    def test_context_result_has_saddle_mode_field(self):
        """ContextResult must have a saddle_mode field."""
        from pf.context_window import ContextResult
        ctx = ContextResult()
        assert hasattr(ctx, "saddle_mode"), "ContextResult missing saddle_mode field"

    def test_context_result_saddle_mode_defaults_false(self):
        """saddle_mode should default to False."""
        from pf.context_window import ContextResult
        ctx = ContextResult()
        assert ctx.saddle_mode is False

    def test_check_context_returns_saddle_mode(self):
        """check_context() should populate saddle_mode from config."""
        from pf.context_window import check_context

        mock_config = {
            "workflow": {
                "relay_mode": True,
                "saddle_mode": True,
                "permission_mode": "standard",
            },
        }

        # Patch the config loading to return our test config
        try:
            from pf.context_window import _load_config
            _has_load = True
        except ImportError:
            _has_load = False

        if _has_load:
            with patch("pf.context_window._load_config", return_value=mock_config):
                result = check_context()
                assert hasattr(result, "saddle_mode")
        else:
            with patch("pf.common.config.load_pennyfarthing_config", return_value=mock_config):
                result = check_context()
                assert hasattr(result, "saddle_mode")
                assert isinstance(result, type(check_context()))


def _has_load_config():
    """Check if context_window has a _load_config function."""
    try:
        from pf.context_window import _load_config
        return True
    except ImportError:
        return False


# ===========================================================================
# AC5: Backward Compatibility — saddle disabled
# ===========================================================================


class TestBackwardCompatSaddleDisabled:
    """When saddle_mode is OFF, everything works as before."""

    def test_relay_on_saddle_off_uses_skill_invoke(self):
        """With relay ON but saddle OFF, marker uses /pf-{agent} skill as before."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=False)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "/pf-dev" in result

    def test_relay_off_saddle_off_uses_fallback(self):
        """With both off, marker gives manual /pf-{agent} fallback."""
        ctx = _make_ctx(relay_mode=False, saddle_mode=False)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "/pf-dev" in result
            assert "saddle" not in result.lower()

    def test_saddle_off_no_saddle_in_output(self):
        """When saddle is disabled, the word 'saddle' should not appear in marker."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=False)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("reviewer")
            assert "saddle" not in result.lower()


# ===========================================================================
# Settings: saddle_mode
# ===========================================================================


class TestSettingsSaddleMode:
    """saddle_mode must be a recognized setting with proper defaults."""

    def test_saddle_mode_in_workflow_defaults(self):
        """DEFAULTS['workflow'] must include saddle_mode."""
        from pf.settings.settings import DEFAULTS
        workflow = DEFAULTS.get("workflow", {})
        assert "saddle_mode" in workflow, f"saddle_mode not in workflow defaults: {list(workflow.keys())}"

    def test_saddle_mode_defaults_to_false(self):
        """saddle_mode should default to False (opt-in)."""
        from pf.settings.settings import DEFAULTS
        assert DEFAULTS["workflow"]["saddle_mode"] is False

    def test_saddle_mode_readable_via_get_setting(self):
        """pf settings get workflow.saddle_mode should work."""
        from pf.settings.settings import DEFAULTS, _deep_merge, _get_by_path
        user_config = {"workflow": {"relay_mode": True}}
        merged = _deep_merge(DEFAULTS, user_config)
        value = _get_by_path(merged, "workflow.saddle_mode")
        assert value is False

    def test_saddle_mode_settable(self):
        """Setting saddle_mode to True should persist correctly."""
        from pf.settings.settings import _deep_merge, _set_by_path, DEFAULTS
        config = _deep_merge(DEFAULTS, {})
        _set_by_path(config, "workflow.saddle_mode", True)
        assert config["workflow"]["saddle_mode"] is True

    def test_saddle_mode_in_show_keys_or_workflow(self):
        """saddle_mode should be visible under workflow in settings show."""
        from pf.settings.settings import DEFAULTS, SHOW_KEYS
        assert "workflow" in SHOW_KEYS
        assert "saddle_mode" in DEFAULTS["workflow"]


# ===========================================================================
# Edge Cases
# ===========================================================================


class TestSaddleWiringEdgeCases:
    """Boundary and error conditions for saddle wiring."""

    def test_marker_saddle_mode_with_high_context(self):
        """Saddle mode + high context should still use saddle (not tirepump override)."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True, usable_percent=85)
        ctx.use_tirepump = True
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "saddle" in result.lower() or "pf saddle" in result.lower()

    def test_marker_saddle_mode_with_error_context(self):
        """When context check errors but saddle_mode is set, should still produce marker."""
        ctx = _make_ctx(relay_mode=True, saddle_mode=True, error="no_transcript")
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")
            assert "AGENT_COMMAND:" in result

    def test_cli_start_with_all_valid_agents(self, cli_runner, tmp_project, mock_tmux):
        """Every valid agent name should be accepted by the CLI."""
        from pf.saddle.core import VALID_AGENTS
        for agent in sorted(VALID_AGENTS):
            with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
                 patch("pf.saddle.core.start_agent", return_value={"success": True, "data": {"agent": agent, "pane_id": "%99", "command": f"claude /pf-{agent}"}}) as mock_start:
                result = cli_runner.invoke(saddle, ["start", agent])
                assert result.exit_code == 0, f"Agent '{agent}' failed: {result.output}"

    def test_cli_stop_returns_result_dict_contract(self, cli_runner, tmp_project):
        """Stop command output should follow {success, data/error} contract."""
        with patch("pf.saddle.cli.get_project_root", return_value=tmp_project), \
             patch("pf.saddle.core.stop_agent", return_value={"success": True, "data": {"agent_stopped": "dev"}}) as mock_stop:
            result = cli_runner.invoke(saddle, ["stop"])
            assert result.exit_code == 0
