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
    sprint    - Sprint status and story operations (coming soon)
    agent     - Agent session management (coming soon)
    """
    pass


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
