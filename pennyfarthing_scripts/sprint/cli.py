"""
Sprint CLI - Click-based CLI for sprint operations.

Usage:
    pf sprint [COMMAND] [ARGS]...

Commands:
    status      Show sprint status
    backlog     Show available stories
    work        Start work on a story
    archive     Archive a completed story
    story       Story subcommands (show, add, update, size, template, finish, claim)
    epic        Epic subcommands (add, promote, archive, import, remove)
"""

import click


@click.group()
def sprint():
    """Sprint status and story operations.

    \b
    Commands:
      status   - Show sprint status
      backlog  - Show available stories
      story    - Story operations (show, add, update, size, template, finish, claim)
      epic     - Epic operations (add, promote, archive, import, remove)
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


# --- Story subgroup ---

@sprint.group()
def story():
    """Story operations (show, add, update, size, template, finish, claim)."""
    pass


@story.command("show")
@click.argument("story_id")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def story_show(story_id: str, output_json: bool):
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


@story.command("size")
@click.argument("points", required=False, type=int)
def story_size(points: int | None):
    """Display story sizing guidelines.

    \b
    Arguments:
      POINTS  - Optional specific point value to show guidance for
    """
    from pennyfarthing_scripts.story.size import format_size_info, get_sizing_guidelines

    guidelines = get_sizing_guidelines(points)
    click.echo(format_size_info(guidelines))


@story.command("template")
@click.argument("template_type", required=False)
def story_template(template_type: str | None):
    """Display story templates by type.

    \b
    Arguments:
      TYPE  - Template type (feature, bug, refactor, chore)
    """
    from pennyfarthing_scripts.story.template import get_all_templates, get_template

    if template_type:
        template = get_template(template_type)
        if template:
            click.echo(f"Type: {template['type']}")
            click.echo(f"Description: {template['description']}")
            click.echo("")
            click.echo("Template:")
            click.echo(template["template"])
        else:
            raise click.ClickException(f"Unknown template type: {template_type}")
    else:
        click.echo("Available templates:")
        for name, template in get_all_templates().items():
            click.echo(f"  {name}: {template['description']}")


@story.command("finish")
@click.argument("story_id")
@click.option("--dry-run", is_flag=True, help="Show what would be done without executing")
def story_finish(story_id: str, dry_run: bool):
    """Complete a story: archive session, merge PR, transition Jira, update sprint YAML.

    \b
    Arguments:
      STORY_ID  - Story ID (e.g., MSSCI-12052)
    """
    import subprocess as sp

    from pennyfarthing_scripts.common.config import get_project_root

    script = get_project_root() / ".pennyfarthing" / "scripts" / "workflow" / "finish-story.sh"
    if not script.exists():
        raise click.ClickException(f"Script not found: {script}")

    cmd = [str(script), story_id]
    if dry_run:
        cmd.append("--dry-run")

    result = sp.run(cmd, capture_output=True, text=True, cwd=str(get_project_root()))
    if result.stdout:
        click.echo(result.stdout.rstrip())
    if result.returncode != 0:
        error = result.stderr.strip() if result.stderr else "Unknown error"
        raise click.ClickException(error)


@story.command("claim")
@click.argument("story_id")
@click.option("--claim/--unclaim", default=True, help="Claim or unclaim the story")
def story_claim(story_id: str, claim: bool):
    """Claim or unclaim a story in Jira.

    \b
    Arguments:
      STORY_ID  - Story ID / Jira key to claim
    """
    from pennyfarthing_scripts.jira.claim import claim_issue, unclaim_issue

    if claim:
        result = claim_issue(story_id)
    else:
        result = unclaim_issue(story_id)

    if result.get("success"):
        click.echo(result.get("message", f"{'Claimed' if claim else 'Unclaimed'} {story_id}"))
    else:
        raise click.ClickException(result.get("error", "Unknown error"))


# Register story-add as story.add
from pennyfarthing_scripts.sprint.story_add import story_add_command

story.add_command(story_add_command, "add")

# Register story-update as story.update
from pennyfarthing_scripts.sprint.story_update import story_update_command

story.add_command(story_update_command, "update")


# --- Epic subgroup ---

@sprint.group()
def epic():
    """Epic operations (add, promote, archive, import, remove)."""
    pass


@epic.command("archive")
@click.argument("epic_id", required=False)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
@click.option("--jira", is_flag=True, help="Also update Jira epic status to Done")
def epic_archive(epic_id: str | None, dry_run: bool, jira: bool):
    """Archive completed epics.

    \b
    Arguments:
      EPIC_ID  - Epic ID to archive (omit to scan all completed epics)

    \b
    Examples:
      pf sprint epic archive                    # Scan and archive all completed
      pf sprint epic archive --dry-run          # Preview what would be archived
      pf sprint epic archive epic-64            # Archive specific epic
      pf sprint epic archive epic-64 --jira     # Archive and update Jira
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
                    e = r.get("epic", {})
                    eid = e.get("id") if e else r.get("epic_id")
                    stories = len(e.get("stories", [])) if e else r.get("stories_archived", 0)
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


@epic.command("import")
@click.argument("epics_file")
@click.argument("initiative_name", required=False)
@click.option("--marker", default="imported", help="Marker tag for stories (default: imported)")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def epic_import(epics_file: str, initiative_name: str | None, marker: str, dry_run: bool):
    """Import BMAD epics-and-stories output to future.yaml.

    \b
    Arguments:
      EPICS_FILE       - Path to markdown file from epics-and-stories workflow
      INITIATIVE_NAME  - Name for the initiative (optional, extracted from file)

    \b
    Examples:
      pf sprint epic import docs/planning/my-feature-epics.md
      pf sprint epic import docs/planning/my-feature-epics.md "My Feature" --marker my-feature
      pf sprint epic import docs/planning/my-feature-epics.md --dry-run
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


@epic.command("remove")
@click.argument("epic_id")
@click.option("--dry-run", is_flag=True, help="Show what would be removed without making changes")
def epic_remove(epic_id: str, dry_run: bool):
    """Remove an epic from future.yaml (for cancelled pre-Jira epics).

    \b
    Arguments:
      EPIC_ID  - Epic ID to remove (e.g., epic-41)

    \b
    Examples:
      pf sprint epic remove epic-41
      pf sprint epic remove epic-41 --dry-run
    """
    from pathlib import Path

    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    future_path = get_project_root() / "sprint" / "future.yaml"
    if not future_path.exists():
        raise click.ClickException(f"File not found: {future_path}")

    with open(future_path) as f:
        data = yaml.safe_load(f.read())

    if not data or "future" not in data or "initiatives" not in data["future"]:
        raise click.ClickException("Invalid future.yaml structure")

    # Find the epic
    found = False
    for init in data["future"]["initiatives"]:
        epics = init.get("epics", [])
        for e in epics:
            if e.get("id") == epic_id:
                found = True
                story_count = len(e.get("stories", []))
                click.echo(f"Found epic in initiative '{init.get('name', 'unknown')}':")
                click.echo(f"  ID: {epic_id}")
                click.echo(f"  Title: {e.get('title', 'unknown')}")
                click.echo(f"  Points: {e.get('points', '?')}")
                click.echo(f"  Stories: {story_count}")

                if dry_run:
                    click.echo(f"\n[DRY-RUN] Would remove {epic_id} from future.yaml")
                    return

                # Remove using yq to preserve comments and formatting
                import subprocess as sp

                result = sp.run(
                    [
                        "yq", "eval", "-i",
                        f'del(.future.initiatives[].epics[] | select(.id == "{epic_id}"))',
                        str(future_path),
                    ],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    raise click.ClickException(f"yq failed: {result.stderr}")

                click.echo(f"\n✓ Removed {epic_id} from future.yaml")
                return

    if not found:
        raise click.ClickException(
            f"Epic {epic_id} not found in future.yaml"
        )


@epic.command("promote")
@click.argument("epic_id")
def epic_promote(epic_id: str):
    """Move an epic from future.yaml to current-sprint.yaml.

    \b
    Arguments:
      EPIC_ID  - Local epic ID (e.g., epic-41)

    \b
    Examples:
      pf sprint epic promote epic-41
    """
    import subprocess as sp

    from pennyfarthing_scripts.common.config import get_project_root

    script = get_project_root() / ".pennyfarthing" / "scripts" / "sprint" / "promote-epic.sh"
    if not script.exists():
        raise click.ClickException(f"Script not found: {script}")

    result = sp.run(
        [str(script), epic_id],
        capture_output=True,
        text=True,
        cwd=str(get_project_root()),
    )
    if result.stdout:
        click.echo(result.stdout.rstrip())
    if result.returncode != 0:
        error = result.stderr.strip() if result.stderr else "Unknown error"
        raise click.ClickException(error)


# Register epic-add as epic.add
from pennyfarthing_scripts.sprint.epic_add import epic_add_command

epic.add_command(epic_add_command, "add")


# --- Standalone command ---

@sprint.command()
@click.argument("title", required=False)
@click.argument("points", required=False, type=int)
def standalone(title: str | None, points: int | None):
    """Wrap current changes into a standalone Jira story, branch, PR, and merge.

    This is an agent-executed workflow. Use /standalone to run it interactively.
    """
    click.echo("The standalone command is an agent-executed workflow.")
    click.echo("Use /standalone to run it interactively with full agent support.")


# --- Backwards compatibility aliases (hidden) ---

# Hidden alias: sprint story-add -> sprint story add
sprint.add_command(story_add_command, "story-add")
sprint.commands["story-add"].hidden = True

# Hidden alias: sprint story-update -> sprint story update
sprint.add_command(story_update_command, "story-update")
sprint.commands["story-update"].hidden = True

# Hidden alias: sprint archive-epic -> sprint epic archive
@sprint.command("archive-epic", hidden=True)
@click.argument("epic_id", required=False)
@click.option("--dry-run", is_flag=True)
@click.option("--jira", is_flag=True)
def archive_epic_compat(epic_id, dry_run, jira):
    """(Deprecated) Use 'sprint epic archive' instead."""
    ctx = click.get_current_context()
    ctx.invoke(epic_archive, epic_id=epic_id, dry_run=dry_run, jira=jira)

# Hidden alias: sprint import-epic -> sprint epic import
@sprint.command("import-epic", hidden=True)
@click.argument("epics_file")
@click.argument("initiative_name", required=False)
@click.option("--marker", default="imported")
@click.option("--dry-run", is_flag=True)
def import_epic_compat(epics_file, initiative_name, marker, dry_run):
    """(Deprecated) Use 'sprint epic import' instead."""
    ctx = click.get_current_context()
    ctx.invoke(epic_import, epics_file=epics_file, initiative_name=initiative_name, marker=marker, dry_run=dry_run)

# Hidden alias: sprint remove-epic -> sprint epic remove
@sprint.command("remove-epic", hidden=True)
@click.argument("epic_id")
@click.option("--dry-run", is_flag=True)
def remove_epic_compat(epic_id, dry_run):
    """(Deprecated) Use 'sprint epic remove' instead."""
    ctx = click.get_current_context()
    ctx.invoke(epic_remove, epic_id=epic_id, dry_run=dry_run)

# Hidden alias: sprint epic-add -> sprint epic add
sprint.add_command(epic_add_command, "epic-add")
sprint.commands["epic-add"].hidden = True


# Register validate command from validate_cmd module
from pennyfarthing_scripts.sprint.validate_cmd import validate_command

sprint.add_command(validate_command)


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
