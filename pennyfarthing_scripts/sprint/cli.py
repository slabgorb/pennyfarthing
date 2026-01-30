"""
Sprint CLI - Click-based CLI for sprint operations.

Usage:
    pf sprint [COMMAND] [ARGS]...

Commands:
    status      Show sprint status
    backlog     Show available stories
    work        Start work on a story
    archive     Archive a completed story
"""

import click


@click.group()
def sprint():
    """Sprint status and story operations.

    \b
    Commands:
      status   - Show sprint status
      backlog  - Show available stories
      story    - Show story details
      work     - Start work on a story
      archive  - Archive a completed story
    """
    pass


@sprint.command()
@click.argument("filter", required=False, type=click.Choice(
    ["backlog", "todo", "in-progress", "review", "done"],
    case_sensitive=False,
))
def status(filter: str | None):
    """Show sprint status.

    \b
    Arguments:
      FILTER  - Optional status filter (backlog, in-progress, done, etc.)
    """
    # Lazy import to maintain startup performance
    from pennyfarthing_scripts.sprint.status import format_status, get_sprint_status

    sprint_status = get_sprint_status(filter)
    click.echo(format_status(sprint_status))


@sprint.command()
def backlog():
    """Show available stories in the backlog."""
    # Lazy import
    from pennyfarthing_scripts.sprint.loader import get_stories_by_status

    stories = get_stories_by_status("backlog")
    click.echo(f"Backlog: {len(stories)} stories")
    click.echo("")
    for story in stories:
        priority = story.get("priority", "P2")
        points = story.get("points", "?")
        click.echo(f"  [{priority}] {story.get('id')}: {story.get('title')} [{points}pts]")


@sprint.command()
@click.argument("story_id", required=False)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def work(story_id: str | None, dry_run: bool):
    """Start work on a story.

    \b
    Arguments:
      STORY_ID  - Story ID to work on, or 'next' for highest priority
    """
    # Lazy import
    from pennyfarthing_scripts.sprint.loader import get_stories_by_status
    from pennyfarthing_scripts.sprint.work import check_story, get_next_story

    if not story_id:
        # Show backlog
        stories = get_stories_by_status("backlog")
        click.echo(f"Available stories: {len(stories)}")
        for story in stories[:10]:
            click.echo(f"  {story.get('id')}: {story.get('title')} [{story.get('points', '?')}pts]")
        return

    if story_id == "next":
        result = get_next_story()
    else:
        result = check_story(story_id)

    if result.get("available"):
        story = result.get("story", {})
        click.echo(f"Story: {story.get('id')}")
        click.echo(f"Title: {story.get('title')}")
        click.echo(f"Points: {story.get('points')}")
        click.echo(f"Status: Available")
    else:
        error_msg = result.get("error") or result.get("reason")
        raise click.ClickException(f"Not available: {error_msg}")


@sprint.command()
@click.argument("story_id")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def story(story_id: str, output_json: bool):
    """Show details for a specific story.

    \b
    Arguments:
      STORY_ID  - Story ID (e.g., MSSCI-12664 or 67-1)
    """
    # Lazy import
    from pennyfarthing_scripts.sprint.loader import get_story_by_id

    story_data = get_story_by_id(story_id)

    if not story_data:
        raise click.ClickException(f"Story not found: {story_id}")

    if output_json:
        import json

        click.echo(json.dumps(story_data, indent=2))
    else:
        click.echo(f"Story: {story_data.get('id', story_id)}")
        click.echo(f"Title: {story_data.get('title', 'N/A')}")
        click.echo(f"Points: {story_data.get('points', 'N/A')}")
        click.echo(f"Status: {story_data.get('status', 'N/A')}")
        if story_data.get("priority"):
            click.echo(f"Priority: {story_data.get('priority')}")
        if story_data.get("workflow"):
            click.echo(f"Workflow: {story_data.get('workflow')}")
        if story_data.get("jira"):
            click.echo(f"Jira: {story_data.get('jira')}")
        if story_data.get("description"):
            click.echo(f"Description: {story_data.get('description')}")


@sprint.command()
@click.argument("story_id")
@click.argument("pr_number", required=False)
@click.option("--apply", is_flag=True, help="Also remove from current-sprint.yaml")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def archive(story_id: str, pr_number: str | None, apply: bool, dry_run: bool):
    """Archive a completed story.

    \b
    Arguments:
      STORY_ID   - Story ID to archive
      PR_NUMBER  - Optional PR number if merged via PR
    """
    # Lazy import
    from pennyfarthing_scripts.sprint.archive import archive_story

    result = archive_story(
        story_id,
        pr_number=pr_number,
        dry_run=dry_run,
        apply=apply,
    )

    if result.get("success"):
        if result.get("dry_run"):
            click.echo(f"[DRY-RUN] {result.get('message')}")
        else:
            click.echo(result.get("message"))
    else:
        raise click.ClickException(f"Failed: {result.get('error')}")


# For backwards compatibility when running as module
def main(args: list[str] | None = None) -> int:
    """Entry point for backwards compatibility."""
    try:
        sprint(args)
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 0


if __name__ == "__main__":
    sprint()
