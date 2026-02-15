"""
Pennyfarthing CLI - Command line interface for agent orchestration.

Usage:
    python -m pennyfarthing_scripts.cli [OPTIONS] COMMAND [ARGS]...
    pf [OPTIONS] COMMAND [ARGS]...

This module uses lazy loading to keep startup time under 200ms.
Heavy imports (httpx, workflow modules) are deferred until needed.
"""

import click

# Get version from package - this is a fast import
from pennyfarthing_scripts import __version__


@click.group()
@click.version_option(version=__version__, prog_name="pf")
def cli():
    """Pennyfarthing CLI - Agent orchestration utilities.

    Commands are organized into groups:

    \b
    workflow  - Workflow state and phase management
    agent     - Agent session management
    sprint    - Sprint status and story operations
    debug     - Analysis tools (hotspots, deadcode, healthscore)

    \b
    Shortcuts (sugar for common operations):
      status   - Show sprint status (= sprint status)
      backlog  - Show available stories (= sprint backlog)
      work     - Start work on a story (= sprint work)
      story    - Story operations (= sprint story)
      gui      - Open BikeRack dashboard (= launch gui)
      tui      - Launch terminal UI (= launch tui)
    """
    pass


# Import and register sprint group (lazy registration preserves startup time)
from pennyfarthing_scripts.sprint.cli import sprint  # noqa: E402

cli.add_command(sprint)

# Top-level sugar shortcuts for common sprint operations
cli.add_command(sprint.commands["status"], "status")
cli.add_command(sprint.commands["backlog"], "backlog")
cli.add_command(sprint.commands["work"], "work")
cli.add_command(sprint.commands["story"], "story")

# Import analysis groups
from pennyfarthing_scripts.deadcode.cli import deadcode  # noqa: E402
from pennyfarthing_scripts.healthscore.cli import healthscore  # noqa: E402
from pennyfarthing_scripts.hotspots.cli import hotspots  # noqa: E402


@cli.group()
def debug():
    """Debug and analysis tools.

    \b
    Subcommands:
      hotspots     - Git history hotspot detection
      deadcode     - Dead code detection tools
      healthscore  - Composite codebase health score
    """
    pass


debug.add_command(hotspots)
debug.add_command(deadcode)
debug.add_command(healthscore)

# Hidden backward-compat aliases
cli.add_command(hotspots, "hotspots")
cli.commands["hotspots"].hidden = True
cli.add_command(deadcode, "deadcode")
cli.commands["deadcode"].hidden = True
cli.add_command(healthscore, "healthscore")
cli.commands["healthscore"].hidden = True

# Import and register jira group
from pennyfarthing_scripts.jira.cli import jira  # noqa: E402

cli.add_command(jira)

# Import and register theme group
from pennyfarthing_scripts.theme.cli import theme  # noqa: E402

cli.add_command(theme)

# Import and register validate group
from pennyfarthing_scripts.validate.cli import validate  # noqa: E402

cli.add_command(validate)

# Import and register bikerack group
from pennyfarthing_scripts.bikerack.cli import bikerack  # noqa: E402

cli.add_command(bikerack)

# Import and register launch group + top-level sugar aliases
from pennyfarthing_scripts.launch.cli import launch  # noqa: E402

cli.add_command(launch)
cli.add_command(launch.commands["gui"], "gui")
cli.add_command(launch.commands["tui"], "tui")

# Import and register bc group
from pennyfarthing_scripts.bc.cli import bc  # noqa: E402

cli.add_command(bc)

# Import and register handoff group
from pennyfarthing_scripts.handoff.cli import handoff  # noqa: E402

cli.add_command(handoff)

# Import and register gate group
from pennyfarthing_scripts.gate.cli import gate  # noqa: E402

cli.add_command(gate)


@cli.group()
def agent():
    """Agent session management.

    \b
    Commands:
      start  - Start an agent session with context
    """
    pass


@agent.command("start")
@click.argument("name")
@click.option("--session-id", help="Use explicit session ID")
@click.option("--no-persona", is_flag=True, help="Skip persona loading")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
@click.option("--minimal", is_flag=True, help="Skip all context (fastest)")
@click.option("--full", is_flag=True, help="Include domain docs")
@click.option("--quiet", is_flag=True, help="Suppress section headers")
@click.option("--tier", type=click.Choice(["full", "refresh", "handoff", "minimal"], case_sensitive=False), help="Context tier level")
def agent_start(
    name: str,
    session_id: str | None,
    no_persona: bool,
    output_json: bool,
    minimal: bool,
    full: bool,
    quiet: bool,
    tier: str | None,
):
    """Start an agent session with full context.

    Loads agent definition, persona, behavior guide, sprint context,
    session context, and sidecar memory.

    \b
    Arguments:
      NAME  - Agent name (sm, tea, dev, reviewer, etc.)
    """
    # Lazy import - only load when command is actually invoked
    from pennyfarthing_scripts.prime import prime

    exit_code = prime(
        agent_name=name,
        session_id=session_id,
        no_persona=no_persona,
        json_output=output_json,
        minimal=minimal,
        full=full,
        quiet=quiet,
        tier=tier,
    )
    raise SystemExit(exit_code)


@cli.group()
def workflow():
    """Workflow state and phase management.

    \b
    Commands:
      check       - Check current workflow state
      phase-check - Verify phase ownership
      handoff     - Emit handoff marker
    """
    pass


@workflow.command("check")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def workflow_check(output_json: bool):
    """Check current workflow state.

    Returns the current story ID, phase, and workflow state.
    """
    # Lazy import - only load when command is actually invoked
    from pennyfarthing_scripts.workflow import get_workflow_state

    state = get_workflow_state()

    if output_json:
        import json

        click.echo(json.dumps(state, indent=2))
    else:
        click.echo(f"State: {state.get('state', 'unknown')}")
        if state.get("story_id"):
            click.echo(f"Story: {state['story_id']}")
        if state.get("workflow"):
            click.echo(f"Workflow: {state['workflow']}")
        if state.get("phase"):
            click.echo(f"Phase: {state['phase']}")


@workflow.command("phase-check")
@click.argument("workflow_name")
@click.argument("phase")
def workflow_phase_check(workflow_name: str, phase: str):
    """Check which agent owns a workflow phase.

    \b
    Arguments:
      WORKFLOW_NAME  - The workflow type (tdd, trivial, etc.)
      PHASE          - The phase to check (red, implement, review, etc.)
    """
    # Lazy import
    from pennyfarthing_scripts.workflow import get_phase_owner

    owner = get_phase_owner(workflow_name, phase)
    click.echo(owner)


@workflow.command("handoff")
@click.argument("next_agent")
def workflow_handoff(next_agent: str):
    """Emit a handoff marker for Cyclist.

    \b
    Arguments:
      NEXT_AGENT  - The agent to hand off to (tea, dev, reviewer, etc.)
    """
    # Output the marker format expected by Cyclist
    click.echo("---")
    click.echo("AGENT_COMMAND:")
    click.echo(f'  marker: "<!-- CYCLIST:HANDOFF:/{next_agent} -->"')
    click.echo(f'  fallback: "Run `/{next_agent}` to continue"')
    click.echo("---")


def main():
    """Entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
