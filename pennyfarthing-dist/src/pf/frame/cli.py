"""Frame CLI — Click-based CLI for frame operations.

Usage:
    pf frame [COMMAND]

Commands:
    start   Start Frame mode (default)
    stop    Stop running Frame instance
    status  Show running state
"""

import sys

import click


@click.group(invoke_without_command=True)
@click.pass_context
def frame(ctx):
    """Frame Mode — Decoupled server dashboard launcher.

    \b
    Commands:
      start   - Start Frame server + Claude CLI (default)
      stop    - Stop running Frame instance
      status  - Show running state (PID, port, uptime)
    """
    if ctx.invoked_subcommand is None:
        ctx.invoke(start)


@frame.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory (where .pennyfarthing/ lives). Falls back to WHEELHUB_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def start(project_dir, dry_run):
    """Start Frame mode.

    Starts Frame server in background, waits for readiness,
    sets OTEL env vars, and execs Claude CLI.
    """
    from pf.frame.launcher import (
        build_otel_env,
        exec_claude,
        is_already_running,
        poll_for_port_file,
        register_cleanup,
        resolve_project_dir,
        start_frame,
        write_pid_file,
    )

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would start Frame mode")
        click.echo(f"  Project: {project_dir}")
        click.echo("  Actions: start Frame server, set OTEL env, exec Claude CLI")
        return

    running, pid, port = is_already_running(project_dir)
    if running:
        # Idempotent: Frame already up, just exec Claude with OTEL env
        click.echo(f"Frame already running (PID {pid}, port {port})")
        otel_env = build_otel_env(port)
        click.echo("Starting Claude CLI...")
        exec_claude(otel_env, project_dir)

    click.echo("Starting Frame mode...")
    try:
        proc = start_frame(project_dir)
        if isinstance(proc, dict):
            click.echo(f"Error: {proc['error']}", err=True)
            sys.exit(1)
        write_pid_file(project_dir, proc.pid)

        port = poll_for_port_file(project_dir, proc=proc)
        click.echo(f"Frame server listening on port {port}")

        otel_env = build_otel_env(port)
        click.echo("Setting OTEL environment variables...")

        register_cleanup(project_dir, proc.pid)

        click.echo("Starting Claude CLI...")
        exec_claude(otel_env, project_dir)
    except (TimeoutError, RuntimeError) as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@frame.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to WHEELHUB_PROJECT_DIR env var, then cwd.",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def stop(project_dir, dry_run):
    """Stop running Frame instance."""
    from pf.frame.launcher import resolve_project_dir, stop_frame

    project_dir = resolve_project_dir(project_dir)

    if dry_run:
        click.echo("[DRY-RUN] Would stop Frame instance")
        click.echo(f"  Project: {project_dir}")
        return

    result = stop_frame(project_dir)

    click.echo(result["message"])
    if not result["success"]:
        # "Not running" is not an error for stop — idempotent
        sys.exit(0)


@frame.command()
@click.option(
    "--project-dir",
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    default=None,
    help="Project directory. Falls back to WHEELHUB_PROJECT_DIR env var, then cwd.",
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
        click.echo(f"  API: http://localhost:{result['port']}")
    else:
        click.echo("Frame is not running")
