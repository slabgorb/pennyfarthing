"""BikeRack CLI — Click-based CLI for bikerack operations.

Usage:
    pf bikerack [COMMAND]

Commands:
    start   Start BikeRack mode (default)
    stop    Stop running BikeRack instance
    status  Show running state
"""

import sys

import click


@click.group(invoke_without_command=True)
@click.pass_context
def bikerack(ctx):
    """BikeRack Mode — Decoupled WheelHub dashboard launcher.

    \b
    Commands:
      start   - Start WheelHub + Claude CLI (default)
      stop    - Stop running BikeRack instance
      status  - Show running state (PID, port, uptime)
    """
    if ctx.invoked_subcommand is None:
        ctx.invoke(start)


@bikerack.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory (where .pennyfarthing/ lives). Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def start(project_dir, dry_run):
    """Start BikeRack mode.

    Starts WheelHub in background, waits for readiness,
    sets OTEL env vars, and execs Claude CLI.
    """
    from pennyfarthing_scripts.bikerack.launcher import (
        build_otel_env,
        exec_claude,
        is_already_running,
        poll_for_port_file,
        register_cleanup,
        resolve_project_dir,
        start_wheelhub,
        write_pid_file,
    )

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would start BikeRack mode")
        click.echo(f"  Project: {project_dir}")
        click.echo("  Actions: start WheelHub, set OTEL env, exec Claude CLI")
        return

    running, pid, port = is_already_running(project_dir)
    if running:
        # Idempotent: WheelHub already up, just exec Claude with OTEL env
        click.echo(f"BikeRack already running (PID {pid}, port {port})")
        otel_env = build_otel_env(port)
        click.echo(f"Dashboard: http://localhost:{port}/bikerack")
        click.echo("Starting Claude CLI...")
        exec_claude(otel_env, project_dir)

    click.echo("Starting BikeRack mode...")
    try:
        proc = start_wheelhub(project_dir)
        write_pid_file(project_dir, proc.pid)

        port = poll_for_port_file(project_dir)
        click.echo(f"WheelHub listening on http://localhost:{port}")

        otel_env = build_otel_env(port)
        click.echo("Setting OTEL environment variables...")

        register_cleanup(project_dir, proc.pid)

        click.echo(f"Dashboard: http://localhost:{port}/bikerack")
        click.echo("Starting Claude CLI...")
        exec_claude(otel_env, project_dir)
    except TimeoutError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)
    except Exception as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@bikerack.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def stop(project_dir, dry_run):
    """Stop running BikeRack instance."""
    from pennyfarthing_scripts.bikerack.launcher import resolve_project_dir, stop_bikerack

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would stop BikeRack instance")
        click.echo(f"  Project: {project_dir}")
        return

    result = stop_bikerack(project_dir)

    click.echo(result["message"])
    if not result["success"]:
        # "Not running" is not an error for stop — idempotent
        sys.exit(0)


@bikerack.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to CYCLIST_PROJECT_DIR env var, then cwd.",
)
def status(project_dir):
    """Show BikeRack running state."""
    from pennyfarthing_scripts.bikerack.launcher import get_status, resolve_project_dir

    project_dir = resolve_project_dir(project_dir)
    result = get_status(project_dir)

    if result["running"]:
        click.echo("BikeRack is running")
        click.echo(f"  PID: {result['pid']}")
        click.echo(f"  Port: {result['port']}")
        click.echo(f"  Dashboard: {result['dashboard']}")
    else:
        click.echo("BikeRack is not running")
