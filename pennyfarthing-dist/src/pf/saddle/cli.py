"""Saddle CLI — pf saddle start/stop/status commands.

Wires the saddle core module into the pf CLI for interactive agent management.

Story 143-18
"""

from __future__ import annotations

import json

import click

from pf.common.config import get_project_root
from pf.saddle import core


@click.group("saddle")
def saddle():
    """Manage the saddle tmux pane for interactive agent sessions."""


@saddle.command()
@click.argument("agent_name")
def start(agent_name: str):
    """Start an agent in the saddle pane."""
    project_root = get_project_root()
    result = core.start_agent(agent_name=agent_name, project_root=project_root)

    if not result.get("success"):
        click.echo(json.dumps(result, indent=2), err=True)
        raise SystemExit(1)

    click.echo(json.dumps(result, indent=2))


@saddle.command()
def stop():
    """Stop the running agent in the saddle pane."""
    project_root = get_project_root()
    result = core.stop_agent(project_root=project_root)

    if not result.get("success"):
        click.echo(json.dumps(result, indent=2), err=True)
        raise SystemExit(1)

    click.echo(json.dumps(result, indent=2))


@saddle.command()
def status():
    """Query current saddle state."""
    project_root = get_project_root()
    result = core.status(project_root=project_root)

    if not result.get("success"):
        click.echo(json.dumps(result, indent=2), err=True)
        raise SystemExit(1)

    # Output the data portion directly for easy parsing
    click.echo(json.dumps(result.get("data", result), indent=2))
