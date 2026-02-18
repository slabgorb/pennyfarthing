"""Tests for BikeRack launcher command (Story 103-3).

Verifies:
  AC1: `pf bikerack` launches WheelHub if not already running
  AC2: `pf bikerack` starts Claude CLI session
  AC3: `pf bikerack` opens TUI in companion terminal pane
  AC4: TUI process is independent of Claude session
  AC5: Port discovery via `.bikerack-port` works correctly

Run with: python -m pytest tests/python/test_bikerack_launcher.py -v
"""

import os
import signal
import subprocess
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from pennyfarthing_scripts.bikerack.launcher import (
    read_tui_pid_file,
    start_tui,
    write_tui_pid_file,
)


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project directory with .pennyfarthing marker."""
    (tmp_path / ".pennyfarthing").mkdir()
    return tmp_path


class TestStartTui:
    """AC3: `pf bikerack` opens TUI in companion terminal pane."""

    def test_start_tui_returns_popen(self, tmp_project):
        """start_tui() should return a subprocess.Popen object."""
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            result = start_tui(tmp_project, port=2898)

            assert isinstance(result, MagicMock)  # Popen mock
            assert result.pid == 12345

    def test_start_tui_passes_port(self, tmp_project):
        """start_tui() should pass port to the TUI process."""
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            start_tui(tmp_project, port=2898)

            # The port must be passed to the TUI somehow (env or arg)
            call_args = mock_popen.call_args
            # Check either env contains port or args contain port
            env = call_args.kwargs.get("env", {})
            args = call_args.args[0] if call_args.args else call_args.kwargs.get("args", [])
            port_in_env = any("2898" in str(v) for v in env.values())
            port_in_args = any("2898" in str(a) for a in args)
            assert port_in_env or port_in_args, (
                "Port 2898 should be passed to TUI via env or args"
            )

    def test_start_tui_writes_tui_pid_file(self, tmp_project):
        """start_tui() should write .wheelhub-gui-pid file."""
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            start_tui(tmp_project, port=2898)

            pid_file = tmp_project / ".wheelhub-gui-pid"
            assert pid_file.exists(), ".wheelhub-gui-pid should be written"
            assert int(pid_file.read_text().strip()) == 12345


class TestTuiProcessIndependence:
    """AC4: TUI process is independent of Claude session."""

    def test_start_tui_uses_new_session(self, tmp_project):
        """start_tui() must use start_new_session=True for process independence."""
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            start_tui(tmp_project, port=2898)

            call_kwargs = mock_popen.call_args.kwargs
            assert call_kwargs.get("start_new_session") is True, (
                "start_tui must use start_new_session=True so TUI survives parent exit"
            )

    def test_start_tui_does_not_wait_for_process(self, tmp_project):
        """start_tui() should NOT call proc.wait() — it must be fire-and-forget."""
        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            start_tui(tmp_project, port=2898)

            mock_proc.wait.assert_not_called()
            mock_proc.communicate.assert_not_called()


class TestTuiPidFileManagement:
    """AC4+AC5: TUI PID tracking for lifecycle management."""

    def test_write_tui_pid_file(self, tmp_project):
        """write_tui_pid_file() should write PID to .wheelhub-gui-pid."""
        write_tui_pid_file(tmp_project, 99999)

        pid_file = tmp_project / ".wheelhub-gui-pid"
        assert pid_file.exists()
        assert int(pid_file.read_text().strip()) == 99999

    def test_read_tui_pid_file(self, tmp_project):
        """read_tui_pid_file() should read PID from .wheelhub-gui-pid."""
        (tmp_project / ".wheelhub-gui-pid").write_text("88888")

        result = read_tui_pid_file(tmp_project)
        assert result == 88888

    def test_read_tui_pid_file_missing(self, tmp_project):
        """read_tui_pid_file() returns None when file doesn't exist."""
        result = read_tui_pid_file(tmp_project)
        assert result is None

    def test_read_tui_pid_file_invalid(self, tmp_project):
        """read_tui_pid_file() returns None when file has invalid content."""
        (tmp_project / ".wheelhub-gui-pid").write_text("not-a-number")

        result = read_tui_pid_file(tmp_project)
        assert result is None


class TestStopBikerackWithTui:
    """AC4: stop should also kill TUI process."""

    def test_stop_cleans_up_tui_pid_file(self, tmp_project):
        """stop_bikerack() should remove .wheelhub-gui-pid file."""
        from pennyfarthing_scripts.bikerack.launcher import stop_bikerack

        # Set up running state: WheelHub + TUI
        (tmp_project / ".wheelhub-pid").write_text("11111")
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / ".wheelhub-gui-pid").write_text("22222")

        with patch("pennyfarthing_scripts.bikerack.launcher.is_process_alive", return_value=True):
            with patch("os.kill"):
                stop_bikerack(tmp_project)

        tui_pid_file = tmp_project / ".wheelhub-gui-pid"
        assert not tui_pid_file.exists(), (
            "stop_bikerack should clean up .wheelhub-gui-pid"
        )

    def test_stop_kills_tui_process(self, tmp_project):
        """stop_bikerack() should send SIGTERM to TUI process."""
        from pennyfarthing_scripts.bikerack.launcher import stop_bikerack

        (tmp_project / ".wheelhub-pid").write_text("11111")
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / ".wheelhub-gui-pid").write_text("22222")

        with patch("pennyfarthing_scripts.bikerack.launcher.is_process_alive", return_value=True):
            with patch("os.kill") as mock_kill:
                stop_bikerack(tmp_project)

        # Should kill both WheelHub (11111) and TUI (22222)
        killed_pids = [call.args[0] for call in mock_kill.call_args_list]
        assert 22222 in killed_pids, (
            f"stop_bikerack should kill TUI process (PID 22222), killed: {killed_pids}"
        )


class TestGetStatusWithTui:
    """AC4: status should report TUI state."""

    def test_status_includes_tui_pid(self, tmp_project):
        """get_status() should include tui_pid when TUI is running."""
        from pennyfarthing_scripts.bikerack.launcher import get_status

        (tmp_project / ".wheelhub-pid").write_text("11111")
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / ".wheelhub-gui-pid").write_text("22222")

        with patch("pennyfarthing_scripts.bikerack.launcher.is_process_alive", return_value=True):
            result = get_status(tmp_project)

        assert result["running"] is True
        assert result.get("tui_pid") == 22222, (
            f"get_status should include tui_pid, got: {result}"
        )

    def test_status_without_tui(self, tmp_project):
        """get_status() should work when TUI is not running."""
        from pennyfarthing_scripts.bikerack.launcher import get_status

        (tmp_project / ".wheelhub-pid").write_text("11111")
        (tmp_project / ".bikerack-port").write_text("2898")

        with patch("pennyfarthing_scripts.bikerack.launcher.is_process_alive", return_value=True):
            result = get_status(tmp_project)

        assert result["running"] is True
        assert result.get("tui_pid") is None


class TestCleanupIncludesTui:
    """AC4: cleanup should include TUI PID file."""

    def test_cleanup_removes_tui_pid_file(self, tmp_project):
        """cleanup_files() should remove .wheelhub-gui-pid."""
        from pennyfarthing_scripts.bikerack.launcher import cleanup_files

        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / ".wheelhub-pid").write_text("11111")
        (tmp_project / ".wheelhub-gui-pid").write_text("22222")

        cleanup_files(tmp_project)

        assert not (tmp_project / ".wheelhub-gui-pid").exists(), (
            "cleanup_files should remove .wheelhub-gui-pid"
        )


class TestPortDiscoveryIntegration:
    """AC5: Port discovery via .bikerack-port file works correctly."""

    def test_start_tui_uses_discovered_port(self, tmp_project):
        """start_tui() should use the port from poll_for_port_file."""
        from pennyfarthing_scripts.bikerack.launcher import poll_for_port_file

        # Write port file as if WheelHub wrote it
        (tmp_project / ".bikerack-port").write_text("3456")
        port = poll_for_port_file(tmp_project, timeout=1.0)

        with patch("subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.pid = 12345
            mock_popen.return_value = mock_proc

            start_tui(tmp_project, port=port)

            # Verify port 3456 was passed through
            call_args = mock_popen.call_args
            env = call_args.kwargs.get("env", {})
            args = call_args.args[0] if call_args.args else call_args.kwargs.get("args", [])
            port_in_env = any("3456" in str(v) for v in env.values())
            port_in_args = any("3456" in str(a) for a in args)
            assert port_in_env or port_in_args, (
                "Discovered port 3456 should be passed to TUI"
            )
