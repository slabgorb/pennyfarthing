"""Frame launcher — core lifecycle functions.

Core lifecycle functions for Frame server and TUI management.
"""

from __future__ import annotations

import atexit
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn


def find_free_port() -> int:
    """Ask the OS for a free port by binding to port 0.

    FRAME_PORT env-var overrides for manual control.
    """
    env = os.environ.get("FRAME_PORT")
    if env:
        return int(env)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def is_process_alive(pid: int) -> bool:
    """Check if a process with given PID is alive."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def cleanup_files(project_dir: Path) -> None:
    """Clean up .frame-port, frame-pid, and tui-pid files."""
    for name in (".frame-port", "frame-pid", "tui-pid"):
        try:
            (project_dir / name).unlink()
        except FileNotFoundError:
            pass


def read_port_file(project_dir: Path) -> int | None:
    """Read port from .frame-port file. Returns None if not found."""
    try:
        return int((project_dir / ".frame-port").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def read_pid_file(project_dir: Path) -> int | None:
    """Read PID from frame-pid file. Returns None if not found."""
    try:
        return int((project_dir / "frame-pid").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def write_pid_file(project_dir: Path, pid: int) -> None:
    """Write frame-pid file."""
    (project_dir / "frame-pid").write_text(str(pid))


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
    """Resolve project directory from option -> env var -> cwd.

    Used by frame and launch CLI commands.
    """
    if project_dir:
        return Path(project_dir)
    env = os.environ.get("FRAME_PROJECT_DIR") or os.environ.get("PF_PROJECT_DIR")
    if env:
        return Path(env)
    return Path.cwd()


def _frame_log_path(project_dir: Path) -> Path:
    """Return the Frame log file path, ensuring parent dir exists."""
    session_dir = project_dir / ".session"
    session_dir.mkdir(exist_ok=True)
    return session_dir / "frame.log"


def start_frame(project_dir: Path) -> subprocess.Popen | dict:
    """Start Frame server (Python/uvicorn) in background.

    Logs stdout/stderr to .session/frame.log for diagnostics.
    Returns a result dict with {success: False, error: ...} on failure.
    """
    log_path = _frame_log_path(project_dir)

    port = find_free_port()

    env = os.environ.copy()
    env["FRAME_PROJECT_DIR"] = str(project_dir)
    env["FRAME_PORT"] = str(port)

    # Forward session ID so Frame resolves the correct agent persona
    session_id = os.environ.get("SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID")
    if session_id:
        env["SESSION_ID"] = session_id

    cmd = [
        sys.executable, "-m", "uvicorn",
        "pf.frame.app:create_app",
        "--factory",
        "--host", "127.0.0.1",
        "--port", str(port),
    ]
    log_file = open(log_path, "w")  # noqa: SIM115
    return subprocess.Popen(
        cmd,
        env=env,
        cwd=str(project_dir),
        stdout=log_file,
        stderr=log_file,
    )



def poll_for_port_file(
    project_dir: Path,
    timeout: float = 10.0,
    interval: float = 0.2,
    proc: subprocess.Popen | None = None,
) -> int:
    """Poll for .frame-port file, return port number.

    If proc is provided, checks whether the process is still alive each tick.
    On early exit, reads .session/frame.log and includes it in the error.
    """
    port_file = project_dir / ".frame-port"
    deadline = time.monotonic() + timeout

    while True:
        if port_file.exists():
            return int(port_file.read_text().strip())

        if proc is not None and proc.poll() is not None:
            log_path = _frame_log_path(project_dir)
            log_tail = ""
            if log_path.exists():
                log_tail = log_path.read_text().strip()
                if log_tail:
                    log_tail = f"\n\nFrame log:\n{log_tail}"
            raise RuntimeError(
                f"Frame exited with code {proc.returncode} before writing port file{log_tail}"
            )

        if time.monotonic() >= deadline:
            log_path = _frame_log_path(project_dir)
            log_tail = ""
            if log_path.exists():
                log_tail = log_path.read_text().strip()
                if log_tail:
                    lines = log_tail.splitlines()
                    log_tail = "\n\nFrame log (last 20 lines):\n" + "\n".join(lines[-20:])
            raise TimeoutError(f"Timed out waiting for {port_file} after {timeout}s{log_tail}")
        time.sleep(interval)


def register_cleanup(project_dir: Path, pid: int) -> None:
    """Register atexit handler to kill Frame and clean up files (Rule 8)."""

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


def _probe_frame(port: int, timeout: float = 1.0) -> bool:
    """HTTP liveness probe — GET http://127.0.0.1:{port}/health."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, ValueError):
        return False


def _probe_frame_project(port: int, project_dir: Path, timeout: float = 1.0) -> bool:
    """Probe /health and verify the server belongs to *this* project.

    Returns True only if the server responds AND its project_dir matches.
    """
    import json

    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            body = json.loads(resp.read())
            server_dir = body.get("project_dir")
            if server_dir is None:
                return False
            return Path(server_dir).resolve() == project_dir.resolve()
    except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError):
        return False


def is_already_running(project_dir: Path) -> tuple[bool, int | None, int | None]:
    """Check if Frame is already running.

    Returns (is_running, pid_or_none, port_or_none).
    Uses HTTP liveness probes in addition to PID/port file checks.
    Cleans up stale/orphaned files when detection fails.

    With OS-assigned ports, there is no way to guess the port of an
    orphaned server — only the .frame-port file is authoritative.
    """
    pid = read_pid_file(project_dir)
    port = read_port_file(project_dir)

    # Both files present — verify PID alive AND port responding
    if pid is not None and port is not None:
        if is_process_alive(pid) and _probe_frame(port):
            return (True, pid, port)
        cleanup_files(project_dir)
        return (False, None, None)

    # Port file only (no PID) — probe before assuming orphaned
    if port is not None and pid is None:
        if _probe_frame(port):
            return (True, None, port)
        cleanup_files(project_dir)
        return (False, None, None)

    # PID file only (no port) — stale state, clean up
    if pid is not None and port is None:
        cleanup_files(project_dir)

    return (False, None, None)


def stop_frame(project_dir: Path) -> dict:
    """Stop running Frame instance and TUI. Returns {success, pid, message}."""
    pid = read_pid_file(project_dir)

    if pid is None:
        return {"success": False, "message": "Frame is not running"}

    if not is_process_alive(pid):
        cleanup_files(project_dir)
        return {"success": False, "message": "Frame is not running (stale PID)"}

    os.kill(pid, signal.SIGTERM)

    # Also kill TUI process if running
    tui_pid = read_tui_pid_file(project_dir)
    if tui_pid is not None:
        try:
            os.kill(tui_pid, signal.SIGTERM)
        except (ProcessLookupError, OSError):
            pass

    cleanup_files(project_dir)
    return {"success": True, "pid": pid, "message": f"Stopped Frame (PID {pid})"}


def get_status(project_dir: Path) -> dict:
    """Get Frame running status. Returns {running, pid, port, dashboard}."""
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
        "dashboard": f"http://localhost:{port}/frame",
        "tui_pid": read_tui_pid_file(project_dir),
    }
    return result


# --- TUI launcher functions ---


def read_tui_pid_file(project_dir: Path) -> int | None:
    """Read TUI PID from tui-pid file. Returns None if not found."""
    try:
        return int((project_dir / "tui-pid").read_text().strip())
    except (FileNotFoundError, ValueError):
        return None


def write_tui_pid_file(project_dir: Path, pid: int) -> None:
    """Write tui-pid file."""
    (project_dir / "tui-pid").write_text(str(pid))


def start_tui(project_dir: Path, port: int) -> subprocess.Popen:
    """Start TUI as independent subprocess.

    Uses start_new_session=True so TUI survives parent exit.
    Writes tui-pid for lifecycle tracking.
    """
    import sys

    proc = subprocess.Popen(
        [sys.executable, "-m", "pf.tui", "--port", str(port)],
        cwd=str(project_dir),
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    write_tui_pid_file(project_dir, proc.pid)
    return proc
