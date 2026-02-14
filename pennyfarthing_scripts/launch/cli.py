"""Launch CLI — mid-session GUI/TUI launcher commands.

Usage:
    pf gui                 # Ensure WheelHub, open browser
    pf tui                 # Start TUI (auto-detects interactivity)
    pf launch gui          # Full path
    pf launch tui          # Full path
    pf launch status       # Is WheelHub running?
    pf launch stop         # Kill WheelHub
"""

from __future__ import annotations

import sys
import webbrowser
from pathlib import Path

import click


def _ensure_wheelhub(project_dir: Path) -> tuple[int, int, bool]:
    """Ensure WheelHub is running. Returns (port, pid, was_already_running).

    If already running, reuses existing instance.
    If not, starts a new one and prints a mid-session OTEL note.
    """
    from pennyfarthing_scripts.bikerack.launcher import (
        is_already_running,
        poll_for_port_file,
        start_wheelhub,
        write_pid_file,
    )

    running, pid, port = is_already_running(project_dir)
    if running:
        return port, pid, True

    click.echo("Starting WheelHub server...")
    proc = start_wheelhub(project_dir)
    write_pid_file(project_dir, proc.pid)
    port = poll_for_port_file(project_dir)
    click.echo(f"WheelHub listening on http://localhost:{port}")
    click.echo(
        "Note: OTEL telemetry requires Claude to be started with BikeRack env vars. "
        "File-based panels (sprint, git, diffs) work independently."
    )
    return port, proc.pid, False


@click.group()
def launch():
    """Mid-session GUI/TUI launcher.

    \b
    Commands:
      gui     - Open BikeRack dashboard in browser
      tui     - Launch terminal UI
      status  - Show WheelHub running state
      stop    - Stop WheelHub server
    """
    pass


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
@click.option("--no-open", is_flag=True, help="Print URL only, don't open browser.")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def gui(project_dir, no_open, dry_run):
    """Open BikeRack dashboard in browser.

    Ensures WheelHub is running (starts it if needed), then opens
    the dashboard URL. Safe to call multiple times — reuses existing server.
    """
    from pennyfarthing_scripts.bikerack.launcher import resolve_project_dir

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would launch BikeRack GUI")
        click.echo(f"  Project: {project_dir}")
        click.echo("  Actions: ensure WheelHub running, open browser to dashboard")
        return

    try:
        port, pid, reused = _ensure_wheelhub(project_dir)
    except TimeoutError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    url = f"http://localhost:{port}/bikerack"

    if no_open:
        click.echo(f"Dashboard: {url}")
    else:
        click.echo(f"Opening {url}")
        webbrowser.open(url)


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
@click.option("--foreground", "mode", flag_value="foreground", help="Force TUI in current terminal.")
@click.option("--detach", "mode", flag_value="detach", help="Force TUI in new Terminal.app window.")
@click.option("--port", type=int, default=None, help="WheelHub port (skip auto-start).")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def tui(project_dir, mode, port, dry_run):
    """Launch BikeRack TUI.

    Auto-detects terminal interactivity:
    - Interactive terminal → runs TUI in foreground
    - Non-interactive (e.g. Claude's Bash tool) → opens new Terminal.app window

    Use --foreground or --detach to override auto-detection.
    """
    from pennyfarthing_scripts.bikerack.launcher import resolve_project_dir

    project_dir = resolve_project_dir(project_dir)

    # Auto-detect mode if not specified
    if mode is None:
        mode = "foreground" if sys.stdin.isatty() else "detach"

    if dry_run:
        click.echo("[DRY-RUN] Would launch BikeRack TUI")
        click.echo(f"  Project: {project_dir}")
        click.echo(f"  Mode: {mode}")
        if port:
            click.echo(f"  Port: {port} (user-specified, skip WheelHub start)")
        else:
            click.echo("  Actions: ensure WheelHub running, launch TUI")
        return

    # Resolve port — either user-specified or ensure WheelHub is running
    if port is None:
        try:
            port, _pid, _reused = _ensure_wheelhub(project_dir)
        except TimeoutError as e:
            click.echo(f"Error: {e}", err=True)
            sys.exit(1)

    if mode == "foreground":
        from pennyfarthing_scripts.bikerack.tui import main as tui_main

        tui_main(port=port, project_dir=project_dir)
    else:
        _launch_tui_detached(project_dir, port)


def _launch_tui_detached(project_dir: Path, port: int) -> None:
    """Launch TUI in a new Terminal.app window via osascript."""
    import subprocess

    python = sys.executable
    cmd = f"{python} -m pennyfarthing_scripts.bikerack.tui --port {port} --project-dir {project_dir}"

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
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
def status(project_dir):
    """Show WheelHub running state."""
    from pennyfarthing_scripts.bikerack.launcher import get_status, resolve_project_dir

    project_dir = resolve_project_dir(project_dir)
    result = get_status(project_dir)

    if result["running"]:
        click.echo("WheelHub is running")
        click.echo(f"  PID: {result['pid']}")
        click.echo(f"  Port: {result['port']}")
        click.echo(f"  Dashboard: {result['dashboard']}")
        if result.get("tui_pid"):
            click.echo(f"  TUI PID: {result['tui_pid']}")
    else:
        click.echo("WheelHub is not running")


@launch.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes.")
def stop(project_dir, dry_run):
    """Stop WheelHub server."""
    from pennyfarthing_scripts.bikerack.launcher import resolve_project_dir, stop_bikerack

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would stop WheelHub server")
        click.echo(f"  Project: {project_dir}")
        return

    result = stop_bikerack(project_dir)

    if result["success"]:
        click.echo(result["message"])
    else:
        click.echo(result["message"], err=True)
        sys.exit(1)
