"""Peloton CLI — `pf peloton start <scenario.yaml>`.

Launches the automated team pipeline via tmux panes.
"""

from __future__ import annotations

from pathlib import Path

import click


@click.group()
def peloton():
    """Peloton mode — automated team pipeline via tmux panes."""
    pass


@peloton.command("start")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--theme", default=None, help="Theme override for agent personas")
@click.option("--model", default=None, help="Model override for agents")
def start(scenario_path: str, theme: str | None, model: str | None):
    """Start a peloton run from a scenario YAML file.

    Spawns agent panes (TEA, Dev, Reviewer), drives the TDD workflow,
    aggregates results, and scores against ground truth.
    """
    raise NotImplementedError("peloton start not implemented")
