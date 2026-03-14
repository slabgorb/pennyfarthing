"""Peloton CLI — `pf peloton start <scenario.yaml>`.

Launches the automated team pipeline via tmux panes.
"""

from __future__ import annotations

from pathlib import Path

import click

from pf.common.config import get_project_root
from pf.peloton.pane_orchestrator import PaneOrchestrator
from pf.peloton.result_aggregator import ResultAggregator
from pf.peloton.workflow_driver import WorkflowDriver
from pf.tmux.panes import get_session_name, is_tmux_running


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
    root = get_project_root()

    if not is_tmux_running():
        click.echo("Error: No tmux server running on pf socket.", err=True)
        click.echo("Start with: pf frame start", err=True)
        raise SystemExit(1)

    session_result = get_session_name()
    if not session_result["success"]:
        click.echo(f"Error: {session_result['error']}", err=True)
        raise SystemExit(1)

    session_name = session_result["data"]
    scenario = Path(scenario_path)

    # Create orchestrator
    orchestrator = PaneOrchestrator(
        project_root=root,
        session_name=session_name,
        story_id="peloton",
    )

    # Create workflow driver
    driver = WorkflowDriver(
        orchestrator=orchestrator,
        session_file=root / ".session" / "peloton-session.md",
    )

    # Load scenario
    load_result = driver.load_scenario(scenario)
    if not load_result["success"]:
        click.echo(f"Error: {load_result['error']}", err=True)
        raise SystemExit(1)

    phase_names = load_result["data"]["phases"]
    click.echo(f"Loaded scenario with phases: {', '.join(phase_names)}")

    # Spawn panes
    spawn_result = orchestrator.spawn_agent_panes(phase_names, theme=theme, model=model)
    if not spawn_result["success"]:
        click.echo(f"Error spawning panes: {spawn_result['error']}", err=True)
        raise SystemExit(1)

    click.echo(f"Spawned {len(spawn_result['data'])} agent panes")

    # Run all phases
    run_result = driver.run_all()
    if not run_result["success"]:
        click.echo(f"Error: {run_result['error']}", err=True)
        orchestrator.teardown()
        raise SystemExit(1)

    # Aggregate results
    aggregator = ResultAggregator(
        output_base_dir=root / "internal" / "results" / "pipeline-replay",
        scenario_id=load_result["data"].get("story_id", "unknown"),
    )
    agg_result = aggregator.aggregate(run_result["data"])
    if agg_result["success"]:
        aggregator.write_pipeline_yaml(agg_result["data"])
        click.echo(f"Results written to {agg_result['data'].output_dir}")

    # Teardown
    orchestrator.teardown()
    click.echo("Peloton run complete.")
