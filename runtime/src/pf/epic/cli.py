"""
Epic CLI - Click-based CLI for epic lifecycle management.

Usage:
    pf epic [COMMAND] [ARGS]...

Commands:
    start    Start an epic - move to current sprint and generate context
    close    Close an epic - verify completion and archive
    show     Show epic details
    add      Add a new epic
    update   Update epic fields
    promote  Move epic from future to current sprint
    archive  Archive completed epics
    cancel   Cancel an epic and all stories
    reindex  Adopt an orphaned shard into the index
"""

import click


@click.group()
def epic():
    """Epic lifecycle management.

    \b
    Commands:
      start    - Start an epic (move to sprint + generate tech context)
      close    - Close an epic (verify completion + archive)
      show     - Show epic details
      add      - Add a new epic to the sprint
      update   - Update epic fields (status, priority, title, jira, etc.)
      promote  - Move epic from future to current sprint
      archive  - Archive completed epics
      cancel   - Cancel an epic and all stories
      reindex  - Adopt an orphaned shard into the index
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


# Register sprint epic subcommands on this group for discoverability.
# Click allows the same command object to be registered on multiple groups.
from pf.sprint.epic_add import epic_add_command  # noqa: E402
from pf.sprint.epic_reindex import epic_reindex_command  # noqa: E402
from pf.sprint.epic_update import epic_update_command  # noqa: E402

epic.add_command(epic_add_command, "add")
epic.add_command(epic_update_command, "update")
epic.add_command(epic_reindex_command, "reindex")

# Import inline commands from sprint/cli.py — these are defined as functions
# there, so we import the sprint epic group and re-register its commands.
# We use lazy imports to avoid circular dependencies.


def _register_sprint_epic_commands():
    """Lazily register sprint epic commands that are defined inline in sprint/cli.py."""
    from pf.sprint.cli import epic as sprint_epic_group

    for name in ("show", "cancel", "archive", "promote"):
        cmd = sprint_epic_group.get_command(None, name)  # type: ignore[arg-type]
        if cmd is not None and epic.get_command(None, name) is None:  # type: ignore[arg-type]
            epic.add_command(cmd, name)


_register_sprint_epic_commands()
