"""Launch CLI — mid-session TUI launcher commands.

Usage:
    pf tui                 # Start TUI (auto-detects interactivity)
    pf launch tui          # Full path
    pf launch status       # Is Frame running?
    pf launch stop         # Kill Frame
"""

from __future__ import annotations

import sys
from pathlib import Path

import click


def _ensure_frame(project_dir: Path) -> tuple[int, int, bool]:
    """Ensure Frame is running. Returns (port, pid, was_already_running).

    If already running, reuses existing instance.
    If not, starts a new one and prints a mid-session OTEL note.
    """
    from pf.frame.launcher import (
        is_already_running,
        poll_for_port_file,
        start_frame,
        write_pid_file,
    )

    running, pid, port = is_already_running(project_dir)
    if running:
        return port, pid, True

    click.echo("Starting Frame server...", err=True)
    proc = start_frame(project_dir)
    if isinstance(proc, dict):
        raise RuntimeError(proc["error"])
    write_pid_file(project_dir, proc.pid)
    port = poll_for_port_file(project_dir, proc=proc)
    click.echo(f"Frame listening on http://localhost:{port}", err=True)
    return port, proc.pid, False


@click.group()
def launch():
    """Mid-session TUI launcher.

    \b
    Commands:
      tui     - Launch terminal UI
      status  - Show Frame running state
      stop    - Stop Frame server
    """
    pass


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to FRAME_PROJECT_DIR env var, then cwd.",
)
def frame(project_dir):
    """Start Frame server (idempotent).

    Starts Frame if not already running, prints the port number.
    Safe to call multiple times — reuses existing instance.
    """
    from pf.frame.launcher import resolve_project_dir

    project_dir = resolve_project_dir(project_dir)

    try:
        port, pid, reused = _ensure_frame(project_dir)
    except (TimeoutError, RuntimeError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    click.echo(f"{port}")


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to FRAME_PROJECT_DIR env var, then cwd.",
)
@click.option(
    "--foreground", "mode", flag_value="foreground", help="Force TUI in current terminal."
)
@click.option("--detach", "mode", flag_value="detach", help="Force TUI in new Terminal.app window.")
@click.option("--port", type=int, default=None, help="Frame port (skip auto-start).")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def tui(project_dir, mode, port, dry_run):
    """Launch TUI.

    Auto-detects terminal interactivity:
    - Interactive terminal → runs TUI in foreground
    - Non-interactive (e.g. Claude's Bash tool) → opens new Terminal.app window

    Use --foreground or --detach to override auto-detection.
    """
    from pf.frame.launcher import resolve_project_dir

    project_dir = resolve_project_dir(project_dir)

    # Auto-detect mode if not specified
    if mode is None:
        mode = "foreground" if sys.stdin.isatty() else "detach"

    if dry_run:
        click.echo("[DRY-RUN] Would launch TUI")
        click.echo(f"  Project: {project_dir}")
        click.echo(f"  Mode: {mode}")
        if port:
            click.echo(f"  Port: {port} (user-specified, skip Frame start)")
        else:
            click.echo("  Actions: ensure Frame running, launch TUI")
        return

    # Resolve port — either user-specified or ensure Frame is running
    if port is None:
        try:
            port, _pid, _reused = _ensure_frame(project_dir)
        except (TimeoutError, RuntimeError) as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)

    if mode == "foreground":
        from pf.tui.app import main as tui_main

        tui_main(port=port, project_dir=project_dir)
    else:
        _launch_tui_detached(project_dir, port)


def _launch_tui_detached(project_dir: Path, port: int) -> None:
    """Launch TUI in a new Terminal.app window via osascript."""
    import subprocess

    python = sys.executable
    cmd = f"{python} -m pf.tui --port {port} --project-dir {project_dir}"

    applescript = f'''
    tell application "Terminal"
        activate
        do script "{cmd}"
    end tell
    '''

    try:
        subprocess.run(["osascript", "-e", applescript], check=True, capture_output=True)
        click.echo(f"TUI launched in new Terminal.app window (port {port})")
    except subprocess.CalledProcessError as e:
        click.echo(f"Error launching Terminal.app: {e.stderr.decode().strip()}", err=True)
        click.echo(f"Run manually: {cmd}")
        sys.exit(1)


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to FRAME_PROJECT_DIR env var, then cwd.",
)
def status(project_dir):
    """Show Frame running state."""
    from pf.frame.launcher import get_status, resolve_project_dir

    project_dir = resolve_project_dir(project_dir)
    result = get_status(project_dir)

    if result["running"]:
        click.echo("Frame is running")
        click.echo(f"  PID: {result['pid']}")
        click.echo(f"  Port: {result['port']}")
        if result.get("tui_pid"):
            click.echo(f"  TUI PID: {result['tui_pid']}")
    else:
        click.echo("Frame is not running")


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to FRAME_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def stop(project_dir, dry_run):
    """Stop Frame server."""
    from pf.frame.launcher import resolve_project_dir, stop_frame

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would stop Frame server")
        click.echo(f"  Project: {project_dir}")
        return

    result = stop_frame(project_dir)

    if result["success"]:
        click.echo(result["message"])
    else:
        click.echo(result["message"], err=True)
        sys.exit(1)
