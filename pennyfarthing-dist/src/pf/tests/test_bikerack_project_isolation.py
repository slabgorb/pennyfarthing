"""Tests for WheelHub project-scoped discovery (Story 136-23).

Verifies:
  AC1: TUI reads ONLY $PROJECT_DIR/.bikerack-port — no port scanning
  AC2: If port file missing, TUI starts its own WheelHub (or errors clearly)
  AC3: If port file exists but WheelHub is dead, TUI starts a new one
  AC4: TUI never connects to another project's WheelHub
  AC5: Two projects running simultaneously show correct project data

Run with: python -m pytest tests/python/test_bikerack_project_isolation.py -v
"""

from unittest.mock import patch

import pytest

from pf.bikerack.launcher import is_already_running, read_port_file
from pf.bikerack.ws_client import WheelHubClient


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
# AC1: TUI reads ONLY $PROJECT_DIR/.bikerack-port — no port scanning
# =============================================================================


class TestNoPortScanning:
    """AC1: Port scanning must be completely removed from discovery."""

    def test_is_already_running_no_files_probes_default_only(self, tmp_project):
        """When no PID or port files exist, probes only the default port.

        Before fix: scans range(2898, 2909) as 'last resort'.
        After fix: probes single default port to detect orphaned servers.
        """
        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return False  # Nothing responding

        with patch("pf.bikerack.launcher._probe_wheelhub", side_effect=tracking_probe):
            with patch("pf.bikerack.launcher._default_port", return_value=1898):
                running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert pid is None
        assert port is None
        # Must probe exactly one port (the default), not a range
        assert probed_ports == [1898]

    def test_is_already_running_no_files_detects_orphan(self, tmp_project):
        """When no files exist but default port responds, detect orphaned server."""
        with patch("pf.bikerack.launcher._probe_wheelhub", return_value=True):
            with patch("pf.bikerack.launcher._default_port", return_value=1898):
                running, pid, port = is_already_running(tmp_project)

        assert running is True
        assert pid is None
        assert port == 1898

    def test_is_already_running_pid_only_probes_default(self, tmp_project):
        """When only PID file exists (no port file), cleans up then probes default.

        PID-only is a stale state — cleaned up, then falls through to
        default port probe for orphan detection.
        """
        (tmp_project / "bikerack-pid").write_text("99999")

        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return False

        with patch("pf.bikerack.launcher.is_process_alive", return_value=True):
            with patch("pf.bikerack.launcher._probe_wheelhub", side_effect=tracking_probe):
                with patch("pf.bikerack.launcher._default_port", return_value=1898):
                    running, pid, port = is_already_running(tmp_project)

        assert running is False
        # Probes only the single default port (not a range)
        assert probed_ports == [1898]
        # PID file should be cleaned up
        assert not (tmp_project / "bikerack-pid").exists()

    def test_is_already_running_pid_dead_probes_default(self, tmp_project):
        """When PID file exists but process is dead, cleans up then probes default."""
        (tmp_project / "bikerack-pid").write_text("99999")

        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return False

        with patch("pf.bikerack.launcher.is_process_alive", return_value=False):
            with patch("pf.bikerack.launcher._probe_wheelhub", side_effect=tracking_probe):
                with patch("pf.bikerack.launcher._default_port", return_value=1898):
                    running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert probed_ports == [1898]
        assert not (tmp_project / "bikerack-pid").exists()


class TestWsClientNoDefaultPort:
    """AC1: WheelHubClient must not fall back to DEFAULT_PORT."""

    def test_discover_port_no_file_raises(self, tmp_project):
        """When no port file exists and no explicit port, must raise or return None.

        Before fix: returns DEFAULT_PORT (2898) which may belong to another project.
        After fix: raises an error instead of silently connecting to wrong WheelHub.
        """
        client = WheelHubClient(project_dir=tmp_project)
        # After fix, discover_port() should raise when no port source is available
        with pytest.raises((FileNotFoundError, RuntimeError)):
            client.discover_port()

    def test_discover_port_explicit_port_works(self, tmp_project):
        """When explicit port is given, use it regardless of port file."""
        client = WheelHubClient(port=3456, project_dir=tmp_project)
        assert client.discover_port() == 3456

    def test_discover_port_reads_port_file(self, tmp_project):
        """When port file exists, read port from it."""
        (tmp_project / ".bikerack-port").write_text("3456")
        client = WheelHubClient(project_dir=tmp_project)
        assert client.discover_port() == 3456

    def test_discover_port_invalid_file_raises(self, tmp_project):
        """When port file has invalid content, must raise, not fall back."""
        (tmp_project / ".bikerack-port").write_text("not-a-number")
        client = WheelHubClient(project_dir=tmp_project)
        with pytest.raises((ValueError, FileNotFoundError, RuntimeError)):
            client.discover_port()

    def test_discover_port_no_project_dir_raises(self):
        """When no project_dir and no explicit port, must raise."""
        client = WheelHubClient()
        with pytest.raises((FileNotFoundError, RuntimeError)):
            client.discover_port()


# =============================================================================
# AC2: If port file missing, TUI starts its own WheelHub (or errors clearly)
# =============================================================================


class TestMissingPortFile:
    """AC2: Clear error or auto-start when port file is missing."""

    def test_read_port_file_missing_returns_none(self, tmp_project):
        """read_port_file returns None when .bikerack-port doesn't exist."""
        result = read_port_file(tmp_project)
        assert result is None

    def test_is_already_running_no_port_file_not_running(self, tmp_project):
        """Without port file, is_already_running must report not running when default port is dead."""
        with patch("pf.bikerack.launcher._probe_wheelhub", return_value=False):
            running, pid, port = is_already_running(tmp_project)
        assert running is False
        assert port is None


# =============================================================================
# AC3: If port file exists but WheelHub is dead, TUI starts a new one
# =============================================================================


class TestStalePortFile:
    """AC3: Detect dead WheelHub and clean up stale port file."""

    def test_port_file_exists_wheelhub_dead_cleanup(self, tmp_project):
        """When port file exists but WheelHub isn't responding, clean up.

        After cleanup, falls through to default-port probe (also dead).
        """
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / "bikerack-pid").write_text("99999")

        with patch("pf.bikerack.launcher.is_process_alive", return_value=False):
            with patch("pf.bikerack.launcher._probe_wheelhub", return_value=False):
                running, pid, port = is_already_running(tmp_project)

        assert running is False
        # Stale files should be cleaned up
        assert not (tmp_project / ".bikerack-port").exists()
        assert not (tmp_project / "bikerack-pid").exists()

    def test_port_file_only_wheelhub_dead_cleanup(self, tmp_project):
        """When port file exists (no PID file) but WheelHub dead, clean up.

        After cleanup, falls through to default-port probe (also dead).
        """
        (tmp_project / ".bikerack-port").write_text("2898")

        with patch("pf.bikerack.launcher._probe_wheelhub", return_value=False):
            running, pid, port = is_already_running(tmp_project)

        assert running is False
        assert not (tmp_project / ".bikerack-port").exists()


# =============================================================================
# AC4: TUI never connects to another project's WheelHub
# =============================================================================


class TestProjectIsolation:
    """AC4: Each project's TUI must only connect to its own WheelHub."""

    def test_two_projects_independent_port_files(self, tmp_project, tmp_project_b):
        """Two projects with different port files discover independently."""
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project_b / ".bikerack-port").write_text("2899")

        client_a = WheelHubClient(project_dir=tmp_project)
        client_b = WheelHubClient(project_dir=tmp_project_b)

        assert client_a.discover_port() == 2898
        assert client_b.discover_port() == 2899

    def test_project_a_running_project_b_detects_default(self, tmp_project, tmp_project_b):
        """Project B with no files still probes the default port for orphan detection.

        Before fix: Project B scans a range of ports and finds Project A's WheelHub.
        After fix: Project B probes only the single default port. If something responds,
        it's reused (orphan recovery). This is intentional — orphan detection takes
        priority over strict project isolation when no files exist.
        """
        # Project A has a running WheelHub with files
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / "bikerack-pid").write_text("11111")

        # Project B has no WheelHub files

        with patch("pf.bikerack.launcher.is_process_alive", return_value=True):
            with patch("pf.bikerack.launcher._probe_wheelhub", return_value=True):
                running_a, _, port_a = is_already_running(tmp_project)
                running_b, _, port_b = is_already_running(tmp_project_b)

        assert running_a is True
        assert port_a == 2898
        # Project B detects orphan on default port (intended behavior)
        assert running_b is True
        assert port_b == 1898

    def test_is_already_running_only_probes_own_port(self, tmp_project):
        """is_already_running must only probe the port from its own port file.

        Must never probe ports from range(2898, 2909) speculatively.
        """
        (tmp_project / ".bikerack-port").write_text("3500")
        (tmp_project / "bikerack-pid").write_text("11111")

        probed_ports = []

        def tracking_probe(port, timeout=1.0):
            probed_ports.append(port)
            return port == 3500  # Only "our" port responds

        with patch("pf.bikerack.launcher.is_process_alive", return_value=True):
            with patch("pf.bikerack.launcher._probe_wheelhub", side_effect=tracking_probe):
                running, pid, port = is_already_running(tmp_project)

        assert running is True
        assert port == 3500
        # Must only probe the port from the port file, nothing else
        assert probed_ports == [3500], f"Should only probe own port, probed: {probed_ports}"


# =============================================================================
# AC5: Two projects running simultaneously show correct project data
# =============================================================================


class TestSimultaneousProjects:
    """AC5: Concurrent projects get correct WheelHub connections."""

    def test_two_clients_different_ports(self, tmp_project, tmp_project_b):
        """Two WheelHubClients for different projects discover different ports."""
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project_b / ".bikerack-port").write_text("2901")

        client_a = WheelHubClient(project_dir=tmp_project)
        client_b = WheelHubClient(project_dir=tmp_project_b)

        port_a = client_a.discover_port()
        port_b = client_b.discover_port()

        assert port_a == 2898
        assert port_b == 2901
        assert port_a != port_b

    def test_is_already_running_two_projects_both_running(self, tmp_project, tmp_project_b):
        """Two projects can both report running with their own ports."""
        (tmp_project / ".bikerack-port").write_text("2898")
        (tmp_project / "bikerack-pid").write_text("11111")
        (tmp_project_b / ".bikerack-port").write_text("2901")
        (tmp_project_b / "bikerack-pid").write_text("22222")

        with patch("pf.bikerack.launcher.is_process_alive", return_value=True):
            with patch("pf.bikerack.launcher._probe_wheelhub", return_value=True):
                running_a, pid_a, port_a = is_already_running(tmp_project)
                running_b, pid_b, port_b = is_already_running(tmp_project_b)

        assert running_a is True
        assert port_a == 2898
        assert pid_a == 11111
        assert running_b is True
        assert port_b == 2901
        assert pid_b == 22222
