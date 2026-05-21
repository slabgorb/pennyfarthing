"""Tests for Frame project-scoped discovery (Story 136-23).

Verifies:
  AC1: TUI reads ONLY $PROJECT_DIR/.frame-port — no port scanning
  AC2: If port file missing, TUI starts its own Frame server (or errors clearly)
  AC3: If port file exists but Frame server is dead, TUI starts a new one
  AC4: TUI never connects to another project's Frame server
  AC5: Two projects running simultaneously show correct project data

Run with: python -m pytest tests/python/test_frame_project_isolation.py -v
"""

from unittest.mock import patch

import pytest

from pf.frame.launcher import is_already_running, read_port_file
from pf.tui.client import FrameClient


@pytest.fixture
def tmp_project(tmp_path):
    """Create a temporary project directory with .pennyfarthing marker."""
    (tmp_path / ".pennyfarthing").mkdir()
    return tmp_path


@pytest.fixture
def tmp_project_b(tmp_path):
    """Create a second temporary project directory for isolation tests."""
    project_b = tmp_path / "project-b"
    project_b.mkdir()
    (project_b / ".pennyfarthing").mkdir()
    return project_b


# =============================================================================
# AC1: TUI reads ONLY $PROJECT_DIR/.frame-port — no port scanning
# =============================================================================


class TestNoPortScanning:
    """AC1: Port discovery relies solely on .frame-port file — no scanning or guessing."""

    def test_is_already_running_no_files_returns_not_running(self, tmp_project):
        """When no PID or port files exist, reports not running immediately.

        With OS-assigned ports, there is no default port to probe.
        """
        running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert pid is None
        assert port is None

    def test_is_already_running_pid_only_cleans_up(self, tmp_project):
        """When only PID file exists (no port file), cleans up and reports not running.

        PID-only is a stale state — no port to probe.
        """
        (tmp_project / "frame-pid").write_text("99999")

        running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert not (tmp_project / "frame-pid").exists()

    def test_is_already_running_port_only_probes_that_port(self, tmp_project):
        """When only port file exists, probes exactly that port."""
        (tmp_project / ".frame-port").write_text("4567")

        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return True

        with patch("pf.frame.launcher._probe_frame", side_effect=tracking_probe):
            running, pid, port = is_already_running(tmp_project)

        assert running is True
        assert port == 4567
        assert probed_ports == [4567]


class TestWsClientNoDefaultPort:
    """AC1: FrameClient must not fall back to DEFAULT_PORT."""

    def test_discover_port_no_file_raises(self, tmp_project):
        """When no port file exists and no explicit port, must raise or return None.

        Before fix: returns DEFAULT_PORT (2898) which may belong to another project.
        After fix: raises an error instead of silently connecting to wrong Frame server.
        """
        client = FrameClient(project_dir=tmp_project)
        # After fix, discover_port() should raise when no port source is available
        with pytest.raises((FileNotFoundError, RuntimeError)):
            client.discover_port()

    def test_discover_port_explicit_port_works(self, tmp_project):
        """When explicit port is given, use it regardless of port file."""
        client = FrameClient(port=3456, project_dir=tmp_project)
        assert client.discover_port() == 3456

    def test_discover_port_reads_port_file(self, tmp_project):
        """When port file exists, read port from it."""
        (tmp_project / ".frame-port").write_text("3456")
        client = FrameClient(project_dir=tmp_project)
        assert client.discover_port() == 3456

    def test_discover_port_invalid_file_raises(self, tmp_project):
        """When port file has invalid content, must raise, not fall back."""
        (tmp_project / ".frame-port").write_text("not-a-number")
        client = FrameClient(project_dir=tmp_project)
        with pytest.raises((ValueError, FileNotFoundError, RuntimeError)):
            client.discover_port()

    def test_discover_port_no_project_dir_raises(self):
        """When no project_dir and no explicit port, must raise."""
        client = FrameClient()
        with pytest.raises((FileNotFoundError, RuntimeError)):
            client.discover_port()


# =============================================================================
# AC2: If port file missing, TUI starts its own Frame server (or errors clearly)
# =============================================================================


class TestMissingPortFile:
    """AC2: Clear error or auto-start when port file is missing."""

    def test_read_port_file_missing_returns_none(self, tmp_project):
        """read_port_file returns None when .frame-port doesn't exist."""
        result = read_port_file(tmp_project)
        assert result is None

    def test_is_already_running_no_port_file_not_running(self, tmp_project):
        """Without port file, is_already_running must report not running."""
        running, pid, port = is_already_running(tmp_project)
        assert running is False
        assert port is None


# =============================================================================
# AC3: If port file exists but Frame server is dead, TUI starts a new one
# =============================================================================


class TestStalePortFile:
    """AC3: Detect dead Frame server and clean up stale port file."""

    def test_port_file_exists_frame_dead_cleanup(self, tmp_project):
        """When port file exists but Frame server isn't responding, clean up."""
        (tmp_project / ".frame-port").write_text("2898")
        (tmp_project / "frame-pid").write_text("99999")

        with patch("pf.frame.launcher.is_process_alive", return_value=False):
            running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert not (tmp_project / ".frame-port").exists()
        assert not (tmp_project / "frame-pid").exists()

    def test_port_file_only_frame_dead_cleanup(self, tmp_project):
        """When port file exists (no PID file) but Frame server dead, clean up."""
        (tmp_project / ".frame-port").write_text("2898")

        with patch("pf.frame.launcher._probe_frame", return_value=False):
            running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert not (tmp_project / ".frame-port").exists()


# =============================================================================
# AC4: TUI never connects to another project's Frame server
# =============================================================================


class TestProjectIsolation:
    """AC4: Each project's TUI must only connect to its own Frame server."""

    def test_two_projects_independent_port_files(self, tmp_project, tmp_project_b):
        """Two projects with different port files discover independently."""
        (tmp_project / ".frame-port").write_text("2898")
        (tmp_project_b / ".frame-port").write_text("2899")

        client_a = FrameClient(project_dir=tmp_project)
        client_b = FrameClient(project_dir=tmp_project_b)

        assert client_a.discover_port() == 2898
        assert client_b.discover_port() == 2899

    def test_project_a_running_project_b_independent(self, tmp_project, tmp_project_b):
        """Project B with no files must NOT see Project A as running.

        With OS-assigned ports, each project relies solely on its own
        .frame-port file. No cross-project orphan probing occurs.
        """
        # Project A has a running Frame server with files
        (tmp_project / ".frame-port").write_text("2898")
        (tmp_project / "frame-pid").write_text("11111")

        # Project B has no Frame server files

        with patch("pf.frame.launcher.is_process_alive", return_value=True):
            with patch("pf.frame.launcher._probe_frame", return_value=True):
                running_a, _, port_a = is_already_running(tmp_project)
                running_b, _, port_b = is_already_running(tmp_project_b)

        assert running_a is True
        assert port_a == 2898
        # Project B has no files — reports not running
        assert running_b is False
        assert port_b is None

    def test_is_already_running_only_probes_own_port(self, tmp_project):
        """is_already_running must only probe the port from its own port file.

        Must never probe ports from range(2898, 2909) speculatively.
        """
        (tmp_project / ".frame-port").write_text("3500")
        (tmp_project / "frame-pid").write_text("11111")

        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return port == 3500  # Only "our" port responds

        with patch("pf.frame.launcher.is_process_alive", return_value=True):
            with patch("pf.frame.launcher._probe_frame", side_effect=tracking_probe):
                running, pid, port = is_already_running(tmp_project)

        assert running is True
        assert port == 3500
        # Must only probe the port from the port file, nothing else
        assert probed_ports == [3500], f"Should only probe own port, probed: {probed_ports}"


# =============================================================================
# AC5: Two projects running simultaneously show correct project data
# =============================================================================


class TestSimultaneousProjects:
    """AC5: Concurrent projects get correct Frame server connections."""

    def test_two_clients_different_ports(self, tmp_project, tmp_project_b):
        """Two FrameClients for different projects discover different ports."""
        (tmp_project / ".frame-port").write_text("2898")
        (tmp_project_b / ".frame-port").write_text("2901")

        client_a = FrameClient(project_dir=tmp_project)
        client_b = FrameClient(project_dir=tmp_project_b)

        port_a = client_a.discover_port()
        port_b = client_b.discover_port()

        assert port_a == 2898
        assert port_b == 2901
        assert port_a != port_b

    def test_is_already_running_two_projects_both_running(self, tmp_project, tmp_project_b):
        """Two projects can both report running with their own ports."""
        (tmp_project / ".frame-port").write_text("2898")
        (tmp_project / "frame-pid").write_text("11111")
        (tmp_project_b / ".frame-port").write_text("2901")
        (tmp_project_b / "frame-pid").write_text("22222")

        with patch("pf.frame.launcher.is_process_alive", return_value=True):
            with patch("pf.frame.launcher._probe_frame", return_value=True):
                running_a, pid_a, port_a = is_already_running(tmp_project)
                running_b, pid_b, port_b = is_already_running(tmp_project_b)

        assert running_a is True
        assert port_a == 2898
        assert pid_a == 11111
        assert running_b is True
        assert port_b == 2901
        assert pid_b == 22222
