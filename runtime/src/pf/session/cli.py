"""
Session CLI - Click-based CLI for session lifecycle management.

Usage:
    pf session [COMMAND] [ARGS]...

Commands:
    new       Start the next available story from the backlog
    continue  Resume work from a saved checkpoint
"""

import click


@click.group()
def session():
    """Session lifecycle management.

    \b
    Commands:
      new       - Start the next available story from backlog
      continue  - Resume from saved checkpoint after context circuit breaker
    """
    pass


@session.command("new")
def session_new():
    """Start the next available story from the sprint backlog.

    Equivalent to: pf sprint work next
    """
    # Delegate to sprint work command
    from pf.sprint.work import start_work

    start_work("next")


@session.command("continue")
@click.option("--list", "list_only", is_flag=True, help="Just display available checkpoints")
@click.option("--story-id", help="Resume specific story directly")
def session_continue(list_only: bool, story_id: str | None):
    """Resume work from a saved checkpoint after context circuit breaker.

    \b
    Options:
      --list       Display available checkpoints without restoring
      --story-id   Resume specific story directly (skip selection)
    """
    from pf.common.config import get_project_root

    root = get_project_root()
    session_dir = root / ".session"

    if not session_dir.is_dir():
        click.echo("No .session/ directory found", err=True)
        raise SystemExit(1)

    checkpoints = sorted(session_dir.glob("*-checkpoint.md"))

    if not checkpoints:
        click.echo("No saved checkpoints found")
        click.echo("Use /pf-session new to start a new story")
        return

    if list_only:
        click.echo("Available checkpoints:")
        for cp in checkpoints:
            click.echo(f"  {cp.stem}")
        return

    if story_id:
        matches = [cp for cp in checkpoints if story_id in cp.stem]
        if not matches:
            click.echo(f"No checkpoint found for story {story_id}", err=True)
            raise SystemExit(1)
        target = matches[0]
    else:
        click.echo("Available checkpoints:")
        for i, cp in enumerate(checkpoints, 1):
            click.echo(f"  {i}. {cp.stem}")
        target = checkpoints[0]

    click.echo("\nTo resume, load the agent with checkpoint context:")
    click.echo(f"  Read: {target}")
