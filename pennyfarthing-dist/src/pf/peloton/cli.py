"""Peloton CLI — team mode agents + replay benchmarking.

Live mode:
  pf peloton start              — Initialize team mode session for current story
  pf peloton next               — Get team-mode data for next agent (JSON output)
  pf peloton status             — Show session state
  pf peloton stop               — Clear peloton state

Replay mode (148-8):
  pf peloton replay <scenario>  — Benchmark pipeline against a scenario
"""

from __future__ import annotations

import json
from pathlib import Path

import click

from pf.common.config import get_project_root


@click.group()
def peloton():
    """Peloton mode — team mode agents for story work.

    \b
    Initializes workflow state and provides team-mode activation data.
    Agents run as teammates via TeamCreate, not in tmux panes.

    \b
    Commands:
      start    — Initialize team mode session
      next     — Get next agent's team-mode data (JSON)
      status   — Show session state
      stop     — Clear peloton state
      replay   — Benchmark pipeline (separate from live mode)
    """
    pass


@peloton.command("start")
@click.option("--workflow", default=None, help="Workflow override (default: from session)")
@click.option("--story-id", default=None, help="Story ID override (default: from session)")
def start(workflow: str | None, story_id: str | None):
    """Initialize team mode session for the current story's workflow.

    Reads the active story's workflow to determine which agents are needed
    and records the agent order in peloton state. Does NOT spawn tmux panes —
    agents run as teammates via TeamCreate.
    """
    from pf.peloton import live

    root = get_project_root()

    # Determine workflow and story from session if not provided
    wf_name = workflow or _detect_workflow(root)
    sid = story_id or _detect_story_id(root)

    if not wf_name:
        click.echo("Error: No workflow found. Provide --workflow or start a story first.", err=True)
        raise SystemExit(1)
    if not sid:
        click.echo("Error: No story ID found. Provide --story-id or start a story first.", err=True)
        raise SystemExit(1)

    result = live.start_session(root, sid, wf_name)
    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    agents = result["data"]["agents"]
    click.echo(f"Peloton: initialized session for story {sid} ({wf_name})")
    click.echo(f"Agents: {', '.join(agents)}")
    click.echo("\nRun 'pf peloton next' to activate the first agent.")


@peloton.command("next")
def next_phase():
    """Activate the next workflow phase's agent.

    Outputs team-mode JSON data for the caller to spawn via TeamCreate.
    """
    from pf.peloton import live

    root = get_project_root()
    result = live.activate_next(root)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]
    click.echo(json.dumps(data))


@peloton.command("status")
@click.option("--json", "as_json", is_flag=True, help="Output as JSON")
def status(as_json: bool):
    """Show current peloton session state."""
    from pf.peloton import live

    root = get_project_root()
    result = live.get_status(root)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    data = result["data"]

    if as_json:
        click.echo(json.dumps(data, indent=2))
        return

    if not data["story_id"]:
        click.echo("No peloton session active.")
        return

    click.echo(f"Story: {data['story_id']}  Workflow: {data['workflow']}  Active: {data['active_role'] or 'none'}")
    agents = data.get("agents", [])
    if agents:
        click.echo(f"Agents: {', '.join(agents)}")


@peloton.command("stop")
def stop_cmd():
    """Clear peloton state and stop any active session."""
    from pf.peloton import live

    root = get_project_root()
    result = live.stop(root)

    if not result["success"]:
        click.echo(f"Error: {result['error']}", err=True)
        raise SystemExit(1)

    click.echo("Peloton session stopped.")


@peloton.command("replay")
@click.argument("scenario_path", type=click.Path(exists=True))
@click.option("--theme", default=None, help="Theme override for agent personas")
@click.option("--model", default=None, help="Model override for agents")
def replay(scenario_path: str, theme: str | None, model: str | None):
    """Run a benchmark pipeline replay against a scenario YAML.

    This is the replay/benchmarking mode (148-8), separate from live mode.
    """
    from pf.peloton.pane_orchestrator import PaneOrchestrator
    from pf.peloton.result_aggregator import ResultAggregator
    from pf.peloton.workflow_driver import WorkflowDriver
    from pf.tmux.panes import get_session_name, is_tmux_running

    root = get_project_root()

    if not is_tmux_running():
        click.echo("Error: No tmux server running.", err=True)
        raise SystemExit(1)

    session_result = get_session_name()
    if not session_result["success"]:
        click.echo(f"Error: {session_result['error']}", err=True)
        raise SystemExit(1)

    orchestrator = PaneOrchestrator(
        project_root=root,
        session_name=session_result["data"],
        story_id="peloton-replay",
    )

    driver = WorkflowDriver(
        orchestrator=orchestrator,
        session_file=root / ".session" / "peloton-session.md",
    )

    load_result = driver.load_scenario(Path(scenario_path))
    if not load_result["success"]:
        click.echo(f"Error: {load_result['error']}", err=True)
        raise SystemExit(1)

    phase_names = load_result["data"]["phases"]
    spawn_result = orchestrator.spawn_agent_panes(phase_names, theme=theme, model=model)
    if not spawn_result["success"]:
        click.echo(f"Error: {spawn_result['error']}", err=True)
        raise SystemExit(1)

    run_result = driver.run_all()
    if not run_result["success"]:
        click.echo(f"Error: {run_result['error']}", err=True)
        orchestrator.teardown()
        raise SystemExit(1)

    aggregator = ResultAggregator(
        output_base_dir=root / "internal" / "results" / "pipeline-replay",
        scenario_id=load_result["data"].get("story_id", "unknown"),
    )
    agg_result = aggregator.aggregate(run_result["data"])
    if agg_result["success"]:
        aggregator.write_pipeline_yaml(agg_result["data"])
        click.echo(f"Results: {agg_result['data'].output_dir}")

    orchestrator.teardown()
    click.echo("Replay complete.")


def _detect_workflow(root: Path) -> str | None:
    """Detect workflow from active session file."""
    session_dir = root / ".session"
    if not session_dir.exists():
        return None
    for f in session_dir.glob("*-session.md"):
        text = f.read_text()
        for line in text.splitlines():
            if line.startswith("**Workflow:**"):
                return line.split(":**", 1)[1].strip()
    return None


def _detect_story_id(root: Path) -> str | None:
    """Detect story ID from active session file."""
    session_dir = root / ".session"
    if not session_dir.exists():
        return None
    for f in session_dir.glob("*-session.md"):
        name = f.stem.replace("-session", "")
        if name:
            return name
    return None
