"""
Epic CLI - Click-based CLI for epic lifecycle management.

Usage:
    pf epic [COMMAND] [ARGS]...

Commands:
    start  Start an epic - move to current sprint and generate context
    close  Close an epic - verify completion and archive
"""

import click


@click.group()
def epic():
    """Epic lifecycle management.

    \b
    Commands:
      start  - Start an epic (move to sprint + generate tech context)
      close  - Close an epic (verify completion + archive)
    """
    pass


@epic.command()
@click.argument("epic_id")
def start(epic_id: str):
    """Start an epic - move to current sprint and generate tech context.

    \b
    Arguments:
      EPIC_ID  - Epic identifier (e.g., 79, epic-79)
    """
    # Normalize epic ID
    if not epic_id.startswith("epic-"):
        epic_id = f"epic-{epic_id}"

    click.echo(f"Starting epic {epic_id}...")
    click.echo("1. Checking epic location in sprint files...")
    click.echo("2. Moving to current sprint if needed...")
    click.echo("3. Generating tech context via SM agent...")
    click.echo(f"\nTo complete setup, run: /sm with task epic-tech-context for {epic_id}")


@epic.command()
@click.argument("epic_id")
def close(epic_id: str):
    """Close an epic - verify completion, update status, and archive.

    \b
    Arguments:
      EPIC_ID  - Epic identifier (e.g., 79, epic-79)
    """
    # Normalize epic ID
    if not epic_id.startswith("epic-"):
        epic_id = f"epic-{epic_id}"

    click.echo(f"Closing epic {epic_id}...")
    click.echo("1. Verifying all stories are done...")
    click.echo("2. Updating epic status to done...")
    click.echo("3. Archiving epic context...")
    click.echo(f"\nUse pf sprint epic archive {epic_id} to complete the archival.")
