"""Peloton CLI — concurrent agent pipeline via tmux panes.

Two modes:
  pf peloton start <story-id>     — Live mode: spawn agents in tmux panes,
                                     pass work between them in real time
  pf peloton replay <scenario>    — Replay mode: simulate the pipeline against
                                     a known scenario for benchmarking/scoring
"""

from __future__ import annotations

from pathlib import Path

import click

from pf.common.config import get_project_root
from pf.peloton.pane_orchestrator import PaneOrchestrator
from pf.peloton.result_aggregator import ResultAggregator
from pf.peloton.workflow_driver import WorkflowDriver
from pf.tmux.panes import get_session_name, is_tmux_running


def _require_tmux() -> tuple[Path, str]:
    """Validate tmux is running and return (project_root, session_name)."""
    root = get_project_root()

    if not is_tmux_running():
        click.echo("Error: No tmux server running on pf socket.", err=True)
        click.echo("Start with: pf frame start", err=True)
        raise SystemExit(1)

    session_result = get_session_name()
    if not session_result["success"]:
        click.echo(f"Error: {session_result['error']}", err=True)
        raise SystemExit(1)

    return root, session_result["data"]


@click.group()
def peloton():
    """Peloton mode — concurrent agent team pipeline via tmux panes.

    \b
    Agents run simultaneously in separate tmux panes. When one agent
    completes its phase, work is passed to the next pane automatically.

    \b
    Modes:
      start   — Live: spawn real agents, pass real work between panes
      replay  — Benchmark: simulate the pipeline against a scenario
    """
    pass


@peloton.command("start")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--theme", default=None, help="Theme override for agent personas")
@click.option("--model", default=None, help="Model override for agents")
def start(scenario_path: str, theme: str | None, model: str | None):
    """Start a peloton run — agents in concurrent tmux panes.

    Spawns dedicated tmux panes for each agent role (TEA, Dev, Reviewer).
    Each agent runs in its own pane. When a phase completes, output is
    captured and passed to the next agent's pane as context.

    \b
    Live mode: pass a story session file or scenario YAML.
    Replay mode: pass a benchmark scenario YAML with ground truth.
    """
    root, session_name = _require_tmux()
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
    click.echo(f"Peloton: spawning {len(phase_names)} concurrent agent panes")

    # Spawn all panes up front — agents exist simultaneously
    spawn_result = orchestrator.spawn_agent_panes(phase_names, theme=theme, model=model)
    if not spawn_result["success"]:
        click.echo(f"Error spawning panes: {spawn_result['error']}", err=True)
        raise SystemExit(1)

    for role, pane in spawn_result["data"].items():
        click.echo(f"  {pane.pane_id} → {role} ({pane.title})")

    # Drive phases — each agent runs in its pane, output flows to next
    click.echo("Driving workflow through panes...")
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
        click.echo(f"Results: {agg_result['data'].output_dir}")

    # Teardown agent panes (protected panes survive)
    orchestrator.teardown()
    click.echo("Peloton run complete.")
