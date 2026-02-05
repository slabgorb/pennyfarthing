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


@sprint.command("archive-epic")
@click.argument("epic_id", required=False)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
@click.option("--jira", is_flag=True, help="Also update Jira epic status to Done")
def archive_epic(epic_id: str | None, dry_run: bool, jira: bool):
    """Archive completed epics.

    \b
    Arguments:
      EPIC_ID  - Epic ID to archive (omit to scan all completed epics)

    \b
    Examples:
      pf sprint archive-epic                    # Scan and archive all completed
      pf sprint archive-epic --dry-run          # Preview what would be archived
      pf sprint archive-epic epic-64            # Archive specific epic
      pf sprint archive-epic epic-64 --jira     # Archive and update Jira
    """
    # Lazy import
    from pennyfarthing_scripts.sprint.archive_epic import (
        archive_all_completed,
        archive_epic as do_archive_epic,
    )

    if epic_id:
        result = do_archive_epic(epic_id, dry_run=dry_run, update_jira=jira)
    else:
        result = archive_all_completed(dry_run=dry_run, update_jira=jira)

    if result.get("success"):
        if dry_run:
            click.echo(f"[DRY-RUN] {result.get('message')}")
            if "archived" in result:
                for r in result["archived"]:
                    epic = r.get("epic", {})
                    eid = epic.get("id") if epic else r.get("epic_id")
                    stories = len(epic.get("stories", [])) if epic else r.get("stories_archived", 0)
                    click.echo(f"  Would archive: {eid} ({stories} stories)")
        else:
            click.echo(result.get("message"))
            if "archived" in result:
                for r in result["archived"]:
                    click.echo(f"  ✓ {r.get('epic_id')}: {r.get('stories_archived')} stories")
            if result.get("stories_archived"):
                click.echo(f"  ✓ {result.get('epic_id')}: {result.get('stories_archived')} stories")
    else:
        error_msg = result.get("error", "Unknown error")
        if result.get("incomplete_stories"):
            error_msg += f"\n  Incomplete: {', '.join(result['incomplete_stories'])}"
        raise click.ClickException(error_msg)


@sprint.command("import-epic")
@click.argument("epics_file")
@click.argument("initiative_name", required=False)
@click.option("--marker", default="imported", help="Marker tag for stories (default: imported)")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def import_epic(epics_file: str, initiative_name: str | None, marker: str, dry_run: bool):
    """Import BMAD epics-and-stories output to future.yaml.

    \b
    Arguments:
      EPICS_FILE       - Path to markdown file from epics-and-stories workflow
      INITIATIVE_NAME  - Name for the initiative (optional, extracted from file)

    \b
    Examples:
      pf sprint import-epic docs/planning/my-feature-epics.md
      pf sprint import-epic docs/planning/my-feature-epics.md "My Feature" --marker my-feature
      pf sprint import-epic docs/planning/my-feature-epics.md --dry-run
    """
    # Lazy import
    from pennyfarthing_scripts.sprint.import_epic import import_epic as do_import

    result = do_import(
        epics_file,
        initiative_name=initiative_name,
        marker=marker,
        dry_run=dry_run,
    )

    if result.get("success"):
        if dry_run:
            click.echo(f"[DRY-RUN] {result.get('message')}")
            click.echo(f"  Epics: {result.get('epics_count')}")
            click.echo(f"  Stories: {result.get('stories_count')}")
            click.echo(f"  Points: {result.get('total_points')}")
            click.echo(f"  Epic numbers: epic-{result.get('start_epic_num')} to epic-{result.get('next_epic_num') - 1}")
            click.echo("")
            click.echo("YAML Preview:")
            click.echo("-" * 60)
            click.echo(result.get("yaml_preview"))
            click.echo("-" * 60)
        else:
            click.echo(f"✓ {result.get('message')}")
            click.echo(f"  Next available epic number: {result.get('next_epic_num')}")
    else:
        raise click.ClickException(result.get("error", "Unknown error"))


# Register validate command from validate_cmd module
from pennyfarthing_scripts.sprint.validate_cmd import validate_command

sprint.add_command(validate_command)

# Register story-add command from story_add module
from pennyfarthing_scripts.sprint.story_add import story_add_command

sprint.add_command(story_add_command, "story-add")

# Register story-update command from story_update module
from pennyfarthing_scripts.sprint.story_update import story_update_command

sprint.add_command(story_update_command, "story-update")


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
