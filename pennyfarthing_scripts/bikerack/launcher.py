"""BikeRack launcher — core lifecycle functions.

Story 101-5: Stub implementation for TDD RED phase.
All functions raise NotImplementedError until Dev implements them.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import NoReturn


def start_wheelhub(project_dir: Path) -> subprocess.Popen:
    """Start WheelHub server in background with IS_BIKERACK=1."""
    raise NotImplementedError("start_wheelhub not implemented")


def poll_for_port_file(
    project_dir: Path, timeout: float = 5.0, interval: float = 0.1
) -> int:
    """Poll for .bikerack-port file, return port number."""
    raise NotImplementedError("poll_for_port_file not implemented")


def build_otel_env(port: int) -> dict[str, str]:
    """Build the 5 OTEL environment variables from discovered port."""
    raise NotImplementedError("build_otel_env not implemented")


def write_pid_file(project_dir: Path, pid: int) -> None:
    """Write .bikerack-pid file."""
    raise NotImplementedError("write_pid_file not implemented")


def read_pid_file(project_dir: Path) -> int | None:
    """Read PID from .bikerack-pid file. Returns None if not found."""
    raise NotImplementedError("read_pid_file not implemented")


def read_port_file(project_dir: Path) -> int | None:
    """Read port from .bikerack-port file. Returns None if not found."""
    raise NotImplementedError("read_port_file not implemented")


def is_process_alive(pid: int) -> bool:
    """Check if a process with given PID is alive."""
    raise NotImplementedError("is_process_alive not implemented")


def is_already_running(project_dir: Path) -> tuple[bool, int | None, int | None]:
    """Check if BikeRack is already running.

    Returns (is_running, pid_or_none, port_or_none).
    """
    raise NotImplementedError("is_already_running not implemented")


def stop_bikerack(project_dir: Path) -> dict:
    """Stop running BikeRack instance. Returns {success, pid, message}."""
    raise NotImplementedError("stop_bikerack not implemented")


def get_status(project_dir: Path) -> dict:
    """Get BikeRack running status. Returns {running, pid, port, uptime, message}."""
    raise NotImplementedError("get_status not implemented")


def cleanup_files(project_dir: Path) -> None:
    """Clean up .bikerack-port and .bikerack-pid files."""
    raise NotImplementedError("cleanup_files not implemented")


def register_cleanup(project_dir: Path, pid: int) -> None:
    """Register atexit handler to kill WheelHub and clean up files."""
    raise NotImplementedError("register_cleanup not implemented")


def exec_claude(otel_env: dict[str, str]) -> NoReturn:
    """Replace current process with Claude CLI using os.execvpe."""
    raise NotImplementedError("exec_claude not implemented")
