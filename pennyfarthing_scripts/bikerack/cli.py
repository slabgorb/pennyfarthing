"""BikeRack CLI — Click-based CLI for bikerack operations.

Usage:
    pf bikerack [COMMAND]

Commands:
    start   Start BikeRack mode (default)
    stop    Stop running BikeRack instance
    status  Show running state
"""

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
def start():
    """Start BikeRack mode.

    Starts WheelHub in background, waits for readiness,
    sets OTEL env vars, and execs Claude CLI.
    """
    raise NotImplementedError("bikerack start not implemented")


@bikerack.command()
def stop():
    """Stop running BikeRack instance."""
    raise NotImplementedError("bikerack stop not implemented")


@bikerack.command()
def status():
    """Show BikeRack running state."""
    raise NotImplementedError("bikerack status not implemented")
