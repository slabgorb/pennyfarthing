"""BikeRack launcher — core lifecycle functions.

Story 101-5: BikeRack launcher CLI (pf bikerack start/stop/status)
"""

from __future__ import annotations

import atexit
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import NoReturn


def is_process_alive(pid: int) -> bool:
    """Check if a process with given PID is alive."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def cleanup_files(project_dir: Path) -> None:
    """Clean up .bikerack-port, .wheelhub-pid, and .wheelhub-gui-pid files."""
    for name in (".bikerack-port", ".wheelhub-pid", ".wheelhub-gui-pid"):
        try:
            (project_dir / name).unlink()
        except FileNotFoundError:
            pass


def read_port_file(project_dir: Path) -> int | None:
    """Read port from .bikerack-port file. Returns None if not found."""
    try:
        return int((project_dir / ".bikerack-port").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def read_pid_file(project_dir: Path) -> int | None:
    """Read PID from .wheelhub-pid file. Returns None if not found."""
    try:
        return int((project_dir / ".wheelhub-pid").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def write_pid_file(project_dir: Path, pid: int) -> None:
    """Write .wheelhub-pid file."""
    (project_dir / ".wheelhub-pid").write_text(str(pid))


def build_otel_env(port: int) -> dict[str, str]:
    """Build the 5 OTEL environment variables from discovered port (Rule 5)."""
    return {
        "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
        "OTEL_LOGS_EXPORTER": "otlp",
        "OTEL_METRICS_EXPORTER": "otlp",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
        "OTEL_EXPORTER_OTLP_ENDPOINT": f"http://localhost:{port}",
    }


def resolve_project_dir(project_dir: str | None) -> Path:
    """Resolve project directory from option → env var → cwd.

    Used by bikerack and launch CLI commands.
    """
    if project_dir:
        return Path(project_dir)
    env = os.environ.get("CYCLIST_PROJECT_DIR")
    if env:
        return Path(env)
    return Path.cwd()


def _find_framework_dir() -> Path:
    """Locate the pennyfarthing framework root from this package's location."""
    # pennyfarthing_scripts/bikerack/launcher.py -> pennyfarthing/
    return Path(__file__).resolve().parent.parent.parent


def start_wheelhub(project_dir: Path) -> subprocess.Popen:
    """Start WheelHub server in background with IS_BIKERACK=1."""
    framework_dir = _find_framework_dir()
    bikerack_entry = framework_dir / "packages" / "cyclist" / "dist" / "bikerack.js"

    env = os.environ.copy()
    env["IS_BIKERACK"] = "1"
    env["CYCLIST_PROJECT_DIR"] = str(project_dir)

    return subprocess.Popen(
        ["node", str(bikerack_entry)],
        env=env,
        cwd=str(project_dir),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def poll_for_port_file(
    project_dir: Path, timeout: float = 5.0, interval: float = 0.1
) -> int:
    """Poll for .bikerack-port file, return port number."""
    port_file = project_dir / ".bikerack-port"
    deadline = time.monotonic() + timeout

    while True:
        if port_file.exists():
            return int(port_file.read_text().strip())
        if time.monotonic() >= deadline:
            raise TimeoutError(
                f"Timed out waiting for {port_file} after {timeout}s"
            )
        time.sleep(interval)


def register_cleanup(project_dir: Path, pid: int) -> None:
    """Register atexit handler to kill WheelHub and clean up files (Rule 8)."""

    def _cleanup(project_dir: Path, pid: int) -> None:
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass
        cleanup_files(project_dir)

    atexit.register(_cleanup, project_dir, pid)


def exec_claude(otel_env: dict[str, str], project_dir: Path | None = None) -> NoReturn:
    """Replace current process with Claude CLI using os.execvpe (CE-4)."""
    env = os.environ.copy()
    env.update(otel_env)
    if project_dir:
        os.chdir(project_dir)
    os.execvpe("claude", ["claude"], env)


def is_already_running(project_dir: Path) -> tuple[bool, int | None, int | None]:
    """Check if BikeRack is already running.

    Returns (is_running, pid_or_none, port_or_none).
    Cleans up stale files if PID is dead.
    """
    pid = read_pid_file(project_dir)
    port = read_port_file(project_dir)

    if pid is None or port is None:
        return (False, None, None)

    if is_process_alive(pid):
        return (True, pid, port)

    cleanup_files(project_dir)
    return (False, None, None)


def stop_bikerack(project_dir: Path) -> dict:
    """Stop running BikeRack instance and TUI. Returns {success, pid, message}."""
    pid = read_pid_file(project_dir)

    if pid is None:
        return {"success": False, "message": "BikeRack is not running"}

    if not is_process_alive(pid):
        cleanup_files(project_dir)
        return {"success": False, "message": "BikeRack is not running (stale PID)"}

    os.kill(pid, signal.SIGTERM)

    # Also kill TUI process if running
    tui_pid = read_tui_pid_file(project_dir)
    if tui_pid is not None:
        try:
            os.kill(tui_pid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass

    cleanup_files(project_dir)
    return {"success": True, "pid": pid, "message": f"Stopped BikeRack (PID {pid})"}


def get_status(project_dir: Path) -> dict:
    """Get BikeRack running status. Returns {running, pid, port, dashboard}."""
    pid = read_pid_file(project_dir)
    port = read_port_file(project_dir)

    if pid is None or port is None:
        return {"running": False}

    if not is_process_alive(pid):
        return {"running": False}

    result = {
        "running": True,
        "pid": pid,
        "port": port,
        "dashboard": f"http://localhost:{port}/bikerack",
        "tui_pid": read_tui_pid_file(project_dir),
    }
    return result


# --- Story 103-3: TUI launcher functions ---


def read_tui_pid_file(project_dir: Path) -> int | None:
    """Read TUI PID from .wheelhub-gui-pid file. Returns None if not found."""
    try:
        return int((project_dir / ".wheelhub-gui-pid").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def write_tui_pid_file(project_dir: Path, pid: int) -> None:
    """Write .wheelhub-gui-pid file."""
    (project_dir / ".wheelhub-gui-pid").write_text(str(pid))


def start_tui(project_dir: Path, port: int) -> subprocess.Popen:
    """Start TUI as independent subprocess.

    Uses start_new_session=True so TUI survives parent exit.
    Writes .wheelhub-gui-pid for lifecycle tracking.
    """
    import sys

    proc = subprocess.Popen(
        [sys.executable, "-m", "pennyfarthing_scripts.bikerack.tui", "--port", str(port)],
        cwd=str(project_dir),
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    write_tui_pid_file(project_dir, proc.pid)
    return proc
