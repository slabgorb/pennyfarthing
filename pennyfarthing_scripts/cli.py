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
    """
    pass


# Import and register sprint group (lazy registration preserves startup time)
from pennyfarthing_scripts.sprint.cli import sprint  # noqa: E402

cli.add_command(sprint)

# Import and register hotspots group
from pennyfarthing_scripts.hotspots.cli import hotspots  # noqa: E402

cli.add_command(hotspots)

# Import and register jira group
from pennyfarthing_scripts.jira.cli import jira  # noqa: E402

cli.add_command(jira)

# Import and register deadcode group
from pennyfarthing_scripts.deadcode.cli import deadcode  # noqa: E402

cli.add_command(deadcode)

# Import and register theme group
from pennyfarthing_scripts.theme.cli import theme  # noqa: E402

cli.add_command(theme)

# Import and register healthscore group
from pennyfarthing_scripts.healthscore.cli import healthscore  # noqa: E402

cli.add_command(healthscore)

# Import and register validate group
from pennyfarthing_scripts.validate.cli import validate  # noqa: E402

cli.add_command(validate)

# Import and register bikerack group
from pennyfarthing_scripts.bikerack.cli import bikerack  # noqa: E402

cli.add_command(bikerack)


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
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
@click.option("--minimal", is_flag=True, help="Skip all context (fastest)")
@click.option("--full", is_flag=True, help="Include domain docs")
@click.option("--quiet", is_flag=True, help="Suppress section headers")
@click.option("--tier", type=click.Choice(["FULL", "REFRESH", "HANDOFF", "MINIMAL"], case_sensitive=False), help="Context tier level")
def agent_start(
    name: str,
    session_id: str | None,
    no_persona: bool,
    json_output: bool,
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
        json_output=json_output,
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
