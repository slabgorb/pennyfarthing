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
    epic        Epic subcommands (show, add, promote, archive, cancel, import, remove)
    initiative  Initiative subcommands (show, cancel)
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
      epic     - Epic operations (show, add, promote, archive, cancel, import, remove)
      initiative - Initiative operations (show, cancel)
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
    """Show available stories grouped by epic.

    Shows stories with backlog, ready, or planning status.
    Output is grouped by epic with a markdown table per epic.
    """
    from pennyfarthing_scripts.sprint.loader import load_sprint

    data = load_sprint()
    if not data or "epics" not in data:
        click.echo("No sprint data available")
        return

    sprint_info = data.get("sprint", {})
    click.echo(f"# Available Stories - {sprint_info.get('name', 'Unknown Sprint')}")
    click.echo("")

    available_statuses = {"backlog", "ready", "planning"}
    total_count = 0
    total_points = 0

    for epic in data["epics"]:
        if not isinstance(epic, dict):
            continue

        stories = [
            s for s in epic.get("stories", [])
            if s.get("status") in available_statuses
        ]
        if not stories:
            continue

        click.echo(f"### {epic.get('title', 'Unknown Epic')}")
        if epic.get("description"):
            desc = epic["description"].strip().split("\n")[0][:200]
            click.echo(f"*{desc}*")
        click.echo("")
        click.echo("| ID | Title | Pts | Pri | Status | Assigned | Workflow |")
        click.echo("|----|-------|-----|-----|--------|----------|----------|")

        for s in stories:
            title = s.get("title", "?")
            if len(title) > 40:
                title = title[:37] + "..."
            sid = s.get("id", "?")
            pts = s.get("points", "?")
            pri = s.get("priority", "P2")
            stat = s.get("status", "backlog")
            wf = s.get("workflow", "tdd")
            assigned = s.get("assigned_to", "")
            if assigned:
                parts = assigned.split("@")[0].split(".")
                if len(parts) >= 2:
                    assigned = f"{parts[0][0].upper()}. {parts[-1].capitalize()}"
            click.echo(f"| {sid} | {title} | {pts} | {pri} | {stat} | {assigned} | {wf} |")
            total_count += 1
            total_points += s.get("points", 0) or 0

        click.echo("")

    click.echo("---")
    click.echo(f"**Total available:** {total_count} stories, {total_points} points")


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
      STORY_ID  - Story ID (e.g., 83-2)
    """
    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.sprint.story_finish import finish_story

    root = get_project_root()
    result = finish_story(root, story_id, dry_run=dry_run)

    if not result["success"]:
        raise click.ClickException(result["error"])

    if result.get("dry_run"):
        click.echo(f"[DRY RUN] Finish story {story_id} ({result.get('jira_key', '?')})")
        for step in result.get("steps", []):
            click.echo(f"  {step['step']}. {step['action']}")
        return

    click.echo(f"=== Story {story_id} Complete ===")
    jira_key = result.get("jira_key", "")
    click.echo(f"Jira: https://1898andco.atlassian.net/browse/{jira_key}")
    for step in result.get("steps", []):
        warning = step.get("warning", "")
        error = step.get("error", "")
        suffix = f" (warning: {warning})" if warning else f" (error: {error})" if error else ""
        click.echo(f"  {step['step']}. {step['action']}{suffix}")


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
    """Epic operations (show, add, promote, archive, cancel, import, remove)."""
    pass


@epic.command("show")
@click.argument("epic_id")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def epic_show(epic_id: str, output_json: bool):
    """Show details for a specific epic.

    Searches both the current sprint and future initiative shards.

    \b
    Arguments:
      EPIC_ID  - Epic ID (e.g., epic-42 or MSSCI-14298)

    \b
    Examples:
      pf sprint epic show MSSCI-14298
      pf sprint epic show epic-42
      pf sprint epic show epic-42 --json
    """
    import json as json_mod

    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.sprint.loader import load_sprint

    root = get_project_root()
    epic_data = None
    source = None

    # 1. Search current sprint
    sprint_data = load_sprint(root)
    if sprint_data and "epics" in sprint_data:
        for e in sprint_data["epics"]:
            if isinstance(e, dict):
                eid = str(e.get("id", ""))
                ejira = str(e.get("jira", ""))
                if epic_id in (eid, ejira, eid.replace("epic-", ""), f"epic-{epic_id}"):
                    epic_data = e
                    source = "current sprint"
                    break

    # 2. Search future initiative shards
    if not epic_data:
        epic_data, source = _find_epic_in_initiatives(epic_id, root)

    if not epic_data:
        raise click.ClickException(f"Epic not found: {epic_id}")

    if output_json:
        # Convert to plain dict for JSON serialization
        click.echo(json_mod.dumps(dict(epic_data), indent=2, default=str))
    else:
        click.echo(f"Epic: {epic_data.get('id', epic_id)}")
        click.echo(f"Title: {epic_data.get('title', 'N/A')}")
        click.echo(f"Status: {epic_data.get('status', 'N/A')}")
        click.echo(f"Points: {epic_data.get('points', 'N/A')}")
        click.echo(f"Source: {source}")
        if epic_data.get("priority"):
            click.echo(f"Priority: {epic_data.get('priority')}")
        if epic_data.get("jira"):
            click.echo(f"Jira: {epic_data.get('jira')}")
        if epic_data.get("repos"):
            click.echo(f"Repos: {epic_data.get('repos')}")
        if epic_data.get("description"):
            click.echo(f"Description: {epic_data.get('description').rstrip()}")

        stories = epic_data.get("stories", [])
        if stories:
            click.echo(f"\nStories ({len(stories)}):")
            for s in stories:
                sid = s.get("id", "?")
                stitle = s.get("title", "?")
                spts = s.get("points", "?")
                sstat = s.get("status", "?")
                click.echo(f"  {sid}: {stitle} [{spts}pts] ({sstat})")


def _epic_shard_path(sprint_dir, ref: str):
    """Resolve an epic shard file path from a ref string.

    Handles both 'epic-42' and 'MSSCI-12792' style refs.
    The file naming convention is epic-{ref}.yaml, but refs that
    already start with 'epic-' should not be double-prefixed.
    """
    if ref.startswith("epic-"):
        return sprint_dir / f"{ref}.yaml"
    return sprint_dir / f"epic-{ref}.yaml"


def _epic_ref_matches(ref: str, epic_id: str) -> bool:
    """Check if an initiative epic ref matches the requested epic_id."""
    # Normalize both to compare without prefix
    ref_bare = ref.replace("epic-", "") if ref.startswith("epic-") else ref
    id_bare = epic_id.replace("epic-", "") if epic_id.startswith("epic-") else epic_id
    return ref_bare == id_bare or ref == epic_id


def _find_epic_in_initiatives(epic_id: str, root):
    """Search initiative shard files for an epic by ID.

    Returns (epic_dict, source_string) or (None, None).
    """
    import yaml

    sprint_dir = root / "sprint"
    for init_file in sorted(sprint_dir.glob("initiative-*.yaml")):
        with open(init_file) as f:
            init_data = yaml.safe_load(f.read())
        if not init_data:
            continue

        init_name = init_data.get("name", init_file.stem)
        epics = init_data.get("epics", [])
        for e in epics:
            if isinstance(e, str):
                if _epic_ref_matches(e, epic_id):
                    shard = _epic_shard_path(sprint_dir, e)
                    if shard.exists():
                        with open(shard) as sf:
                            epic_data = yaml.safe_load(sf.read())
                        if epic_data:
                            return epic_data, f"initiative: {init_name}"
            elif isinstance(e, dict):
                eid = str(e.get("id", ""))
                if _epic_ref_matches(eid, epic_id):
                    return e, f"initiative: {init_name}"

    return None, None


@epic.command("cancel")
@click.argument("epic_id")
@click.option("--jira", is_flag=True, help="Also cancel the epic in Jira")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def epic_cancel(epic_id: str, jira: bool, dry_run: bool):
    """Cancel an epic and all its stories.

    Sets the epic status to 'canceled' and all stories to 'canceled'.
    Searches both the current sprint and future initiative shards.

    \b
    Arguments:
      EPIC_ID  - Epic ID (e.g., epic-42 or MSSCI-14298)

    \b
    Examples:
      pf sprint epic cancel epic-42 --dry-run
      pf sprint epic cancel epic-42
      pf sprint epic cancel epic-42 --jira
    """
    from pennyfarthing_scripts.common.config import get_project_root
    from pennyfarthing_scripts.sprint.loader import load_sprint
    from pennyfarthing_scripts.sprint.yaml_io import read_sprint, write_sprint

    root = get_project_root()
    sprint_dir = root / "sprint"
    sprint_path = sprint_dir / "current-sprint.yaml"

    # 1. Try current sprint
    sprint_data = read_sprint(sprint_path) if sprint_path.exists() else None
    found_in_sprint = False
    if sprint_data and "epics" in sprint_data:
        for e in sprint_data["epics"]:
            if not isinstance(e, dict):
                continue
            eid = str(e.get("id", ""))
            ejira = str(e.get("jira", ""))
            if epic_id in (eid, ejira, eid.replace("epic-", ""), f"epic-{epic_id}"):
                found_in_sprint = True
                jira_key = e.get("jira")
                stories = e.get("stories", [])
                story_count = len(stories)

                click.echo(f"Epic: {eid}")
                click.echo(f"Title: {e.get('title', 'N/A')}")
                click.echo(f"Stories: {story_count}")

                if jira_key and not jira:
                    click.echo(f"\nWarning: Epic has Jira key {jira_key} -- pass --jira to also cancel in Jira")

                if dry_run:
                    click.echo(f"\n[DRY-RUN] Would cancel {eid} and {story_count} stories")
                    return

                e["status"] = "canceled"
                for s in stories:
                    s["status"] = "canceled"

                write_sprint(sprint_path, sprint_data)
                click.echo(f"\nCanceled {eid} and {story_count} stories in current sprint")

                if jira and jira_key:
                    _transition_jira(jira_key, "Cancelled")
                    click.echo(f"Transitioned Jira {jira_key} to Cancelled")
                return

    # 2. Try initiative shards
    if not found_in_sprint:
        _cancel_epic_in_initiatives(epic_id, root, jira=jira, dry_run=dry_run)


def _transition_jira(jira_key: str, status: str) -> bool:
    """Transition a Jira issue to the given status."""
    import subprocess

    try:
        result = subprocess.run(
            ["jira", "issue", "move", jira_key, status],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.returncode == 0
    except Exception:
        return False


def _cancel_epic_in_initiatives(epic_id: str, root, *, jira: bool, dry_run: bool):
    """Find and cancel an epic in initiative shard files."""
    import yaml

    sprint_dir = root / "sprint"

    for init_file in sorted(sprint_dir.glob("initiative-*.yaml")):
        with open(init_file) as f:
            raw = f.read()
        init_data = yaml.safe_load(raw)
        if not init_data:
            continue

        init_name = init_data.get("name", init_file.stem)
        epics = init_data.get("epics", [])

        for i, e in enumerate(epics):
            matched = False
            epic_dict = None

            if isinstance(e, str):
                if _epic_ref_matches(e, epic_id):
                    shard = _epic_shard_path(sprint_dir, e)
                    if shard.exists():
                        with open(shard) as sf:
                            epic_dict = yaml.safe_load(sf.read())
                        matched = True
            elif isinstance(e, dict):
                eid = str(e.get("id", ""))
                if _epic_ref_matches(eid, epic_id):
                    epic_dict = e
                    matched = True

            if not matched or not epic_dict:
                continue

            jira_key = epic_dict.get("jira")
            stories = epic_dict.get("stories", [])
            story_count = len(stories)

            click.echo(f"Epic: {epic_dict.get('id', epic_id)}")
            click.echo(f"Title: {epic_dict.get('title', 'N/A')}")
            click.echo(f"Initiative: {init_name}")
            click.echo(f"Stories: {story_count}")

            if jira_key and not jira:
                click.echo(f"\nWarning: Epic has Jira key {jira_key} -- pass --jira to also cancel in Jira")

            if dry_run:
                click.echo(f"\n[DRY-RUN] Would cancel {epic_dict.get('id', epic_id)} and {story_count} stories")
                return

            epic_dict["status"] = "canceled"
            for s in stories:
                s["status"] = "canceled"

            # Write back — either shard file or inline in initiative
            if isinstance(e, str):
                shard = _epic_shard_path(sprint_dir, e)
                with open(shard, "w") as sf:
                    yaml.dump(dict(epic_dict), sf, default_flow_style=False, sort_keys=False)
            else:
                with open(init_file, "w") as f:
                    yaml.dump(init_data, f, default_flow_style=False, sort_keys=False)

            click.echo(f"\nCanceled {epic_dict.get('id', epic_id)} and {story_count} stories")

            if jira and jira_key:
                _transition_jira(jira_key, "Cancelled")
                click.echo(f"Transitioned Jira {jira_key} to Cancelled")
            return

    raise click.ClickException(f"Epic not found: {epic_id}")


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
    """Move an epic from future initiatives to current-sprint.yaml.

    Detects ID collisions and assigns new IDs if needed.
    Automatically removes the epic from its initiative shard after promotion.

    \b
    Arguments:
      EPIC_ID  - Epic ID (e.g., epic-41 or 41)

    \b
    Examples:
      pf sprint epic promote epic-41
      pf sprint epic promote 41
    """
    import copy

    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    sprint_dir = root / "sprint"
    sprint_file = sprint_dir / "current-sprint.yaml"

    if not sprint_file.exists():
        raise click.ClickException(f"Sprint file not found: {sprint_file}")

    # Find the epic in initiative shards
    epic_data = None
    source_init_file = None
    source_ref = None

    for init_file in sorted(sprint_dir.glob("initiative-*.yaml")):
        with open(init_file) as f:
            init_data = yaml.safe_load(f.read())
        if not init_data:
            continue
        for e in init_data.get("epics", []):
            edata = _resolve_epic_ref(e, sprint_dir)
            if not edata:
                continue
            eid = str(edata.get("id", ""))
            if _epic_ref_matches(eid, epic_id):
                epic_data = copy.deepcopy(edata)
                source_init_file = init_file
                source_ref = e
                break
        if epic_data:
            break

    if not epic_data:
        raise click.ClickException(f"Epic {epic_id} not found in future initiatives")

    # Load current sprint
    with open(sprint_file) as f:
        sprint_data = yaml.safe_load(f.read())

    if not sprint_data:
        raise click.ClickException(f"Invalid sprint file: {sprint_file}")

    if "epics" not in sprint_data:
        sprint_data["epics"] = []

    # Check for ID collision
    original_id = str(epic_data.get("id", epic_id))
    new_epic_id = original_id
    existing_ids = {str(e.get("id", "")) for e in sprint_data["epics"] if isinstance(e, dict)}

    if new_epic_id in existing_ids:
        max_num = 0
        for eid in existing_ids:
            if eid.startswith("epic-"):
                try:
                    max_num = max(max_num, int(eid.replace("epic-", "")))
                except ValueError:
                    pass
        new_epic_id = f"epic-{max_num + 1}"
        click.echo(f"Warning: Epic ID {original_id} already exists. Assigning new ID: {new_epic_id}")

    # Transform epic for current sprint
    old_id_num = original_id.replace("epic-", "")
    new_id_num = new_epic_id.replace("epic-", "")

    epic_data["id"] = new_epic_id
    epic_data["status"] = "backlog"
    if not epic_data.get("title", "").startswith("Epic:"):
        epic_data["title"] = f"Epic: {epic_data.get('title', 'Unknown')}"

    for s in epic_data.get("stories", []):
        sid = str(s.get("id", ""))
        if sid.startswith(f"{old_id_num}-"):
            s["id"] = sid.replace(f"{old_id_num}-", f"{new_id_num}-", 1)
        s["status"] = "backlog"
        s.setdefault("repos", "pennyfarthing")
        s.setdefault("workflow", "tdd")
        s.setdefault("priority", "P2")
        s.setdefault("acceptance_criteria", [])

    story_count = len(epic_data.get("stories", []))

    click.echo("")
    click.echo("Promoting epic to current sprint:")
    click.echo(f"  Original ID: {original_id}")
    if new_epic_id != original_id:
        click.echo(f"  New ID: {new_epic_id}")
    click.echo(f"  Title: {epic_data.get('title')}")
    click.echo(f"  Points: {epic_data.get('points', 0)}")
    click.echo(f"  Stories: {story_count}")
    click.echo("")

    # Append to sprint
    sprint_data["epics"].append(epic_data)

    from pennyfarthing_scripts.sprint.yaml_io import write_sprint
    write_sprint(sprint_file, sprint_data)
    click.echo(f"Added epic to {sprint_file}")

    # Remove from initiative shard
    with open(source_init_file) as f:
        init_data = yaml.safe_load(f.read())

    if isinstance(source_ref, str):
        # String ref — remove from list and delete shard file
        init_data["epics"] = [e for e in init_data.get("epics", []) if e != source_ref]
        shard = _epic_shard_path(sprint_dir, source_ref)
        if shard.exists():
            shard.unlink()
    else:
        # Inline dict — remove matching entry
        init_data["epics"] = [
            e for e in init_data.get("epics", [])
            if not (isinstance(e, dict) and _epic_ref_matches(str(e.get("id", "")), epic_id))
        ]

    remaining_epics = init_data.get("epics", [])
    if remaining_epics:
        # Initiative still has epics — update shard in place
        with open(source_init_file, "w") as f:
            yaml.dump(init_data, f, default_flow_style=False, sort_keys=False)
        click.echo(f"Removed {original_id} from {source_init_file.name}")
    else:
        # Initiative is empty — remove shard and future.yaml reference
        init_name = init_data.get("name", "")
        init_slug = source_init_file.stem.replace("initiative-", "")
        source_init_file.unlink()
        click.echo(f"Removed empty initiative shard: {source_init_file.name}")

        # Remove from future.yaml
        future_file = sprint_dir / "future.yaml"
        if future_file.exists():
            with open(future_file) as f:
                future_data = yaml.safe_load(f.read()) or {}
            future_inits = future_data.get("future", {}).get("initiatives", [])
            if init_slug in future_inits:
                future_inits.remove(init_slug)
                with open(future_file, "w") as f:
                    yaml.dump(future_data, f, default_flow_style=False, sort_keys=False)
                click.echo(f"Removed '{init_slug}' from future.yaml")

    click.echo("")
    click.echo("Promotion complete!")
    click.echo("")
    click.echo("Next steps:")
    click.echo(f"  1. Review the epic: pf sprint epic show {new_epic_id}")
    click.echo(f"  2. Create Jira epic: pf jira create epic {new_epic_id}")
    click.echo(f"  3. Start work: /sprint work {new_id_num}-1")


# Register epic-add as epic.add
from pennyfarthing_scripts.sprint.epic_add import epic_add_command

epic.add_command(epic_add_command, "add")


# --- Initiative subgroup ---

@sprint.group()
def initiative():
    """Initiative operations (show, cancel)."""
    pass


@initiative.command("show")
@click.argument("name")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
def initiative_show(name: str, output_json: bool):
    """Show details for a specific initiative.

    \b
    Arguments:
      NAME  - Initiative slug (e.g., benchmark-reliability, technical-debt)

    \b
    Examples:
      pf sprint initiative show benchmark-reliability
      pf sprint initiative show technical-debt --json
    """
    import json as json_mod

    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    init_file = root / "sprint" / f"initiative-{name}.yaml"

    if not init_file.exists():
        raise click.ClickException(f"Initiative not found: {name}\n  Expected: {init_file}")

    with open(init_file) as f:
        init_data = yaml.safe_load(f.read())

    if not init_data:
        raise click.ClickException(f"Empty initiative file: {init_file}")

    if output_json:
        click.echo(json_mod.dumps(init_data, indent=2, default=str))
        return

    click.echo(f"Initiative: {init_data.get('name', name)}")
    click.echo(f"Status: {init_data.get('status', 'N/A')}")
    if init_data.get("total_points"):
        click.echo(f"Total Points: {init_data.get('total_points')}")
    if init_data.get("blocked_by"):
        click.echo(f"Blocked By: {init_data.get('blocked_by')}")
    if init_data.get("description"):
        click.echo(f"Description: {init_data.get('description').rstrip()}")

    epics = init_data.get("epics", [])
    if epics:
        click.echo(f"\nEpics ({len(epics)}):")
        sprint_dir = root / "sprint"
        for e in epics:
            if isinstance(e, str):
                # String ref — try to load shard for details
                shard = _epic_shard_path(sprint_dir, e)
                if shard.exists():
                    with open(shard) as sf:
                        edata = yaml.safe_load(sf.read())
                    if edata:
                        etitle = edata.get("title", "?")
                        epts = edata.get("points", "?")
                        estat = edata.get("status", "?")
                        click.echo(f"  {edata.get('id', e)}: {etitle} [{epts}pts] ({estat})")
                        continue
                click.echo(f"  {e} (shard not found)")
            elif isinstance(e, dict):
                eid = e.get("id", "?")
                etitle = e.get("title", "?")
                epts = e.get("points", "?")
                estat = e.get("status", "?")
                click.echo(f"  {eid}: {etitle} [{epts}pts] ({estat})")

    standalone_stories = init_data.get("standalone_stories", [])
    if standalone_stories:
        click.echo(f"\nStandalone Stories ({len(standalone_stories)}):")
        for s in standalone_stories:
            sid = s.get("id", "?")
            stitle = s.get("title", "?")
            spts = s.get("points", "?")
            sstat = s.get("status", "?")
            click.echo(f"  {sid}: {stitle} [{spts}pts] ({sstat})")


@initiative.command("cancel")
@click.argument("name")
@click.option("--jira", is_flag=True, help="Also cancel epics in Jira")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def initiative_cancel(name: str, jira: bool, dry_run: bool):
    """Cancel an initiative and all its epics/stories.

    Sets the initiative status to 'canceled' and cancels all epics and stories
    within it.

    \b
    Arguments:
      NAME  - Initiative slug (e.g., benchmark-reliability, technical-debt)

    \b
    Examples:
      pf sprint initiative cancel technical-debt --dry-run
      pf sprint initiative cancel technical-debt
      pf sprint initiative cancel technical-debt --jira
    """
    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    sprint_dir = root / "sprint"
    init_file = sprint_dir / f"initiative-{name}.yaml"

    if not init_file.exists():
        raise click.ClickException(f"Initiative not found: {name}\n  Expected: {init_file}")

    with open(init_file) as f:
        init_data = yaml.safe_load(f.read())

    if not init_data:
        raise click.ClickException(f"Empty initiative file: {init_file}")

    init_name = init_data.get("name", name)
    epics = init_data.get("epics", [])
    standalone_stories = init_data.get("standalone_stories", [])

    # Collect Jira keys for warning
    jira_keys = []
    epic_count = 0
    story_count = 0

    for e in epics:
        if isinstance(e, str):
            shard = _epic_shard_path(sprint_dir, e)
            if shard.exists():
                with open(shard) as sf:
                    edata = yaml.safe_load(sf.read())
                if edata:
                    epic_count += 1
                    if edata.get("jira"):
                        jira_keys.append(edata["jira"])
                    story_count += len(edata.get("stories", []))
        elif isinstance(e, dict):
            epic_count += 1
            if e.get("jira"):
                jira_keys.append(e["jira"])
            story_count += len(e.get("stories", []))

    story_count += len(standalone_stories)

    click.echo(f"Initiative: {init_name}")
    click.echo(f"Epics: {epic_count}")
    click.echo(f"Stories: {story_count}")

    if jira_keys and not jira:
        click.echo(f"\nWarning: {len(jira_keys)} epic(s) have Jira keys -- pass --jira to also cancel in Jira")
        for k in jira_keys:
            click.echo(f"  {k}")

    if dry_run:
        click.echo(f"\n[DRY-RUN] Would cancel initiative '{init_name}' ({epic_count} epics, {story_count} stories)")
        return

    # Cancel all epics
    for i, e in enumerate(epics):
        if isinstance(e, str):
            shard = _epic_shard_path(sprint_dir, e)
            if shard.exists():
                with open(shard) as sf:
                    edata = yaml.safe_load(sf.read())
                if edata:
                    edata["status"] = "canceled"
                    for s in edata.get("stories", []):
                        s["status"] = "canceled"
                    with open(shard, "w") as sf:
                        yaml.dump(edata, sf, default_flow_style=False, sort_keys=False)
                    if jira and edata.get("jira"):
                        _transition_jira(edata["jira"], "Cancelled")
        elif isinstance(e, dict):
            e["status"] = "canceled"
            for s in e.get("stories", []):
                s["status"] = "canceled"
            if jira and e.get("jira"):
                _transition_jira(e["jira"], "Cancelled")

    # Cancel standalone stories
    for s in standalone_stories:
        s["status"] = "canceled"

    # Update initiative status
    init_data["status"] = "canceled"

    with open(init_file, "w") as f:
        yaml.dump(init_data, f, default_flow_style=False, sort_keys=False)

    click.echo(f"\nCanceled initiative '{init_name}' ({epic_count} epics, {story_count} stories)")
    if jira and jira_keys:
        click.echo(f"Transitioned {len(jira_keys)} Jira epic(s) to Cancelled")


# --- Check command (replaces check-story.sh) ---

@sprint.command()
@click.argument("id")
def check(id: str):
    """Check story/epic availability. Returns JSON.

    \b
    Arguments:
      ID  - Story ID, epic ID, or 'next' for highest priority

    \b
    Returns JSON with type, details, and availability:
      type: "story" | "epic" | "next" | "not_found"
    """
    import json

    from pennyfarthing_scripts.sprint.loader import (
        find_epic,
        get_all_stories,
        load_sprint,
    )
    from pennyfarthing_scripts.sprint.work import check_story, get_next_story

    data = load_sprint()

    if id == "next":
        result = get_next_story()
        if result.get("available"):
            story = result["story"]
            # Find parent epic
            epic_id = _find_epic_for_story(data, story.get("id", ""))
            out = {
                "type": "next",
                "story": {
                    "id": story.get("id"),
                    "title": story.get("title"),
                    "points": story.get("points", 0),
                    "priority": story.get("priority", "P2"),
                    "workflow": story.get("workflow", "tdd"),
                    "repos": story.get("repos", "pennyfarthing"),
                    "epic_id": epic_id,
                    "acceptance_criteria": story.get("acceptance_criteria", []),
                },
            }
        else:
            out = {"type": "next", "story": None, "message": "No available stories in backlog"}
        click.echo(json.dumps(out, indent=2))
        return

    # Check if it's an epic
    if data:
        epic = find_epic(data, id)
        if epic:
            available_statuses = {"backlog", "ready", "planning"}
            available = [
                s for s in epic.get("stories", [])
                if s.get("status") in available_statuses
            ]
            # Sort by priority
            priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
            available.sort(key=lambda s: priority_order.get(s.get("priority", "P2"), 2))

            first = available[0] if available else None
            out = {
                "type": "epic",
                "id": str(epic.get("id", id)),
                "title": epic.get("title", "Unknown"),
                "available_stories": len(available),
            }
            if first:
                out["first_story"] = {
                    "id": first.get("id"),
                    "title": first.get("title"),
                    "points": first.get("points", 0),
                    "workflow": first.get("workflow", "tdd"),
                    "repos": first.get("repos", "pennyfarthing"),
                    "acceptance_criteria": first.get("acceptance_criteria", []),
                }
            else:
                out["first_story"] = None
                out["message"] = "No available stories in this epic"
            click.echo(json.dumps(out, indent=2))
            return

    # Check if it's a story
    result = check_story(id)
    story = result.get("story")
    if story:
        epic_id = _find_epic_for_story(data, story.get("id", ""))
        out = {
            "type": "story",
            "id": story.get("id", id),
            "title": story.get("title", "Unknown"),
            "points": story.get("points", 0),
            "workflow": story.get("workflow", "tdd"),
            "status": story.get("status", "backlog"),
            "assigned_to": story.get("assigned_to", ""),
            "epic_id": epic_id,
            "repos": story.get("repos", "pennyfarthing"),
            "available": result.get("available", False),
            "acceptance_criteria": story.get("acceptance_criteria", []),
        }
        click.echo(json.dumps(out, indent=2))
        return

    # Not found
    click.echo(json.dumps({
        "type": "not_found",
        "id": id,
        "message": "Story or epic not found in current sprint",
    }, indent=2))


def _find_epic_for_story(data: dict | None, story_id: str) -> str:
    """Find the parent epic ID for a story."""
    if not data or "epics" not in data:
        return ""
    for epic in data["epics"]:
        if not isinstance(epic, dict):
            continue
        for s in epic.get("stories", []):
            if s.get("id") == story_id:
                return str(epic.get("id", ""))
    return ""


# --- Info command (replaces sprint-info.sh) ---

@sprint.command()
def info():
    """Output sprint info as JSON.

    \b
    Returns sprint header fields plus computed story point totals.
    """
    import json

    from pennyfarthing_scripts.sprint.loader import get_all_stories, get_sprint_info

    sprint_data = get_sprint_info()
    stories = get_all_stories()

    remaining = sum(
        s.get("points", 0) or 0
        for s in stories
        if s.get("status") in ("backlog", "planning", "ready", None)
    )
    in_progress = sum(
        s.get("points", 0) or 0
        for s in stories
        if s.get("status") == "in_progress"
    )

    result = {str(k): str(v) if hasattr(v, 'isoformat') else v for k, v in sprint_data.items()}
    result["remaining"] = remaining
    result["inProgress"] = in_progress

    click.echo(json.dumps(result))


# --- Metrics command (replaces sprint-metrics.sh) ---

@sprint.command()
@click.option("--json", "output_json", is_flag=True, help="Output in JSON format")
def metrics(output_json: bool):
    """Display sprint metrics and progress.

    Shows points, stories, timeline, and velocity tracking.
    """
    import json
    from datetime import date, datetime

    from pennyfarthing_scripts.sprint.loader import get_all_stories, get_sprint_info

    sprint_data = get_sprint_info()
    stories = get_all_stories()

    if not sprint_data:
        click.echo("No sprint data available")
        return

    sprint_name = sprint_data.get("name", "Unknown")
    goal = sprint_data.get("goal", "")
    start_date_str = sprint_data.get("start_date", "")
    end_date_str = sprint_data.get("end_date", "")

    # Count stories/points by status
    done_stories = [s for s in stories if s.get("status") in ("done", "completed")]
    wip_stories = [s for s in stories if s.get("status") == "in_progress"]
    backlog_stories = [s for s in stories if s.get("status") in ("backlog", "planning", "ready", None)]

    done_pts = sum(s.get("points", 0) or 0 for s in done_stories)
    wip_pts = sum(s.get("points", 0) or 0 for s in wip_stories)
    backlog_pts = sum(s.get("points", 0) or 0 for s in backlog_stories)
    total_pts = done_pts + wip_pts + backlog_pts

    # Date calculations
    today = date.today()
    try:
        start_date = datetime.strptime(str(start_date_str), "%Y-%m-%d").date()
        end_date = datetime.strptime(str(end_date_str), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        start_date = today
        end_date = today

    total_days = (end_date - start_date).days or 1
    days_elapsed = max(0, (today - start_date).days)
    days_remaining = max(0, (end_date - today).days)

    pct_complete = (done_pts * 100 // total_pts) if total_pts > 0 else 0
    pct_time = (days_elapsed * 100 // total_days) if total_days > 0 else 0

    velocity_target = sprint_data.get("velocity_target", total_pts)
    expected_pts = (velocity_target * days_elapsed // total_days) if total_days > 0 else 0

    if output_json:
        click.echo(json.dumps({
            "sprint": sprint_name,
            "dates": {
                "start": str(start_date_str),
                "end": str(end_date_str),
                "today": str(today),
            },
            "points": {
                "total": total_pts,
                "completed": done_pts,
                "in_progress": wip_pts,
                "backlog": backlog_pts,
                "velocity_target": velocity_target,
            },
            "stories": {
                "total": len(stories),
                "done": len(done_stories),
                "in_progress": len(wip_stories),
                "backlog": len(backlog_stories),
            },
            "progress": {
                "percent_complete": pct_complete,
                "percent_time": pct_time,
                "days_elapsed": days_elapsed,
                "days_remaining": days_remaining,
                "total_days": total_days,
            },
            "velocity": {
                "expected_points": expected_pts,
                "actual_points": done_pts,
                "on_track": done_pts >= expected_pts,
            },
        }, indent=2))
        return

    # Human-readable output
    click.echo("")
    click.echo(f"  Sprint: {sprint_name}")
    click.echo(f"  Goal: {goal}")
    click.echo("")
    click.echo(f"  Timeline: {start_date_str} to {end_date_str} (Day {days_elapsed}/{total_days}, {days_remaining} remaining)")
    click.echo("")
    click.echo(f"  Points:  {done_pts} done / {wip_pts} WIP / {backlog_pts} backlog = {total_pts} total ({pct_complete}%)")
    click.echo(f"  Stories: {len(done_stories)} done / {len(wip_stories)} WIP / {len(backlog_stories)} backlog = {len(stories)} total")
    click.echo("")
    click.echo(f"  Velocity: {done_pts}/{expected_pts} expected ({velocity_target} target)")
    if done_pts >= expected_pts:
        click.echo("  Status: On track")
    else:
        click.echo("  Status: Behind schedule")


# --- Story field command (replaces get-story-field.sh) ---

@story.command("field")
@click.argument("story_id")
@click.argument("field_name")
def story_field(story_id: str, field_name: str):
    """Get a field value from a story.

    \b
    Arguments:
      STORY_ID    - Story ID (e.g., 79-1 or MSSCI-12345)
      FIELD_NAME  - Field to extract (e.g., workflow, status, points)

    Returns the field value or "null" if not found.
    """
    from pennyfarthing_scripts.sprint.loader import get_story_by_id, get_story_field, load_sprint

    # Default values for common fields
    defaults = {
        "workflow": "tdd",
        "status": "backlog",
        "repos": "pennyfarthing",
    }

    # Try get_story_field first (works with epic-story format like "79-1")
    data = load_sprint()
    if data:
        value = get_story_field(data, story_id, field_name)
        if value is not None:
            click.echo(str(value))
            return

    # Fallback: try direct story lookup (works with Jira keys)
    story = get_story_by_id(story_id)
    if story:
        value = story.get(field_name)
        if value is not None:
            click.echo(str(value))
            return

    # Return default or null
    click.echo(defaults.get(field_name, "null"))


# --- Epic field command (replaces get-epic-field.sh) ---

@epic.command("field")
@click.argument("epic_id")
@click.argument("field_name")
def epic_field(epic_id: str, field_name: str):
    """Get a field value from an epic.

    \b
    Arguments:
      EPIC_ID     - Epic ID (e.g., epic-79 or 79)
      FIELD_NAME  - Field to extract (e.g., jira, title, status)

    Returns the field value or "null" if not found.
    """
    from pennyfarthing_scripts.sprint.loader import find_epic, load_sprint

    data = load_sprint()
    if not data:
        click.echo("null")
        return

    epic = find_epic(data, epic_id)
    if not epic:
        click.echo("null")
        return

    value = epic.get(field_name)
    if value is not None:
        click.echo(str(value).rstrip())
    else:
        click.echo("null")


# --- Future command (replaces list-future.sh) ---

@sprint.command()
@click.argument("epic_id", required=False)
def future(epic_id: str | None):
    """Show future work initiatives and epics.

    \b
    Arguments:
      EPIC_ID  - Optional epic ID to show detailed stories (e.g., epic-55)

    \b
    Examples:
      pf sprint future                  # Show all initiatives
      pf sprint future epic-55          # Show stories for specific epic
    """
    import yaml

    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    sprint_dir = root / "sprint"

    init_files = sorted(sprint_dir.glob("initiative-*.yaml"))
    if not init_files:
        click.echo("No future initiatives found.")
        return

    # If specific epic requested, show detailed view
    if epic_id:
        _show_future_epic_detail(epic_id, init_files, sprint_dir)
        return

    # Default: show initiative summary
    click.echo("# Future Work - Available for Promotion")
    click.echo("")

    total_epics = 0
    total_points = 0

    for init_file in init_files:
        with open(init_file) as f:
            init_data = yaml.safe_load(f.read())
        if not init_data:
            continue

        init_name = init_data.get("name", init_file.stem)
        init_status = init_data.get("status", "planning")
        blocked_by = init_data.get("blocked_by")
        init_points = init_data.get("total_points", 0)

        if init_status == "ready":
            status_tag = "[READY]"
        elif blocked_by:
            status_tag = "[BLOCKED]"
        else:
            status_tag = f"[{init_status}]"

        click.echo(f"## {init_name} {status_tag}")
        click.echo(f"**Total:** {init_points} points")
        if blocked_by:
            click.echo(f"**Blocked:** {blocked_by}")
        click.echo("")

        click.echo("| Epic | Title | Pts | Pri | Status |")
        click.echo("|------|-------|-----|-----|--------|")

        epics = init_data.get("epics", [])
        for e in epics:
            edata = _resolve_epic_ref(e, sprint_dir)
            if not edata:
                continue
            eid = edata.get("id", "?")
            etitle = edata.get("title", "?")
            if len(etitle) > 40:
                etitle = etitle[:37] + "..."
            epts = edata.get("points", "?")
            epri = edata.get("priority", "P2")
            estat = edata.get("status", "planning")
            click.echo(f"| {eid} | {etitle} | {epts} | {epri} | {estat} |")
            total_epics += 1
            total_points += edata.get("points", 0) or 0

        click.echo("")

    click.echo("---")
    click.echo(f"**Summary:** {total_epics} epics, {total_points} points total")
    click.echo("")
    click.echo("To see epic details: `pf sprint future epic-55`")
    click.echo("To promote an epic: `pf sprint epic promote epic-55`")


def _resolve_epic_ref(ref, sprint_dir) -> dict | None:
    """Resolve an epic reference (string ref or inline dict) to a dict."""
    import yaml

    if isinstance(ref, dict):
        return ref
    if isinstance(ref, str):
        shard = _epic_shard_path(sprint_dir, ref)
        if shard.exists():
            with open(shard) as f:
                return yaml.safe_load(f.read())
    return None


def _show_future_epic_detail(epic_id: str, init_files, sprint_dir):
    """Show detailed view of a specific future epic."""
    import yaml

    for init_file in init_files:
        with open(init_file) as f:
            init_data = yaml.safe_load(f.read())
        if not init_data:
            continue

        for e in init_data.get("epics", []):
            edata = _resolve_epic_ref(e, sprint_dir)
            if not edata:
                continue
            eid = str(edata.get("id", ""))
            if epic_id not in (eid, eid.replace("epic-", ""), f"epic-{epic_id}"):
                continue

            click.echo(f"# Epic Details: {eid}")
            click.echo("")
            click.echo(f"**Title:** {edata.get('title', '?')}")
            click.echo(f"**Points:** {edata.get('points', '?')} | **Priority:** {edata.get('priority', 'P2')} | **Status:** {edata.get('status', 'planning')}")
            click.echo("")
            desc = edata.get("description", "No description")
            if desc:
                click.echo("**Description:**")
                for line in str(desc).strip().split("\n")[:5]:
                    click.echo(line)
                click.echo("")

            stories = edata.get("stories", [])
            if stories:
                click.echo("## Stories")
                click.echo("")
                click.echo("| ID | Title | Pts | Pri | Status |")
                click.echo("|----|-------|-----|-----|--------|")
                for s in stories:
                    stitle = s.get("title", "?")
                    if len(stitle) > 45:
                        stitle = stitle[:42] + "..."
                    click.echo(f"| {s.get('id', '?')} | {stitle} | {s.get('points', '?')} | {s.get('priority', 'P1')} | {s.get('status', 'planning')} |")
                click.echo("")

            click.echo("---")
            click.echo(f"To promote this epic: `pf sprint epic promote {eid}`")
            return

    raise click.ClickException(f"Epic {epic_id} not found in future initiatives")


# --- New sprint command (replaces new-sprint.sh) ---

@sprint.command("new")
@click.argument("sprint_yyww")
@click.argument("jira_id", type=int)
@click.argument("start_date")
@click.argument("end_date")
@click.argument("goal")
def new_sprint(sprint_yyww: str, jira_id: int, start_date: str, end_date: str, goal: str):
    """Initialize a new sprint.

    \b
    Arguments:
      SPRINT_YYWW  Sprint identifier in YYWW format (e.g., 2607)
      JIRA_ID      Jira sprint ID number (e.g., 278)
      START_DATE   Sprint start date YYYY-MM-DD
      END_DATE     Sprint end date YYYY-MM-DD
      GOAL         Sprint goal (quoted string)

    \b
    Examples:
      pf sprint new 2607 278 2026-02-16 2026-03-01 "Performance and polish"
    """
    from pennyfarthing_scripts.common.config import get_project_root

    root = get_project_root()
    sprint_file = root / "sprint" / "current-sprint.yaml"
    archive_file = root / "sprint" / "archive" / f"sprint-{sprint_yyww}-completed.yaml"

    # Warn if current sprint is active
    if sprint_file.exists():
        import yaml

        with open(sprint_file) as f:
            existing = yaml.safe_load(f.read())
        if existing and existing.get("sprint", {}).get("status") == "active":
            click.echo("Warning: Current sprint is still active!")
            click.echo("Current sprint file will be overwritten.")
            if not click.confirm("Continue?"):
                click.echo("Aborted.")
                return

    # Create sprint file using write_sprint for consistency
    from pennyfarthing_scripts.sprint.yaml_io import write_sprint

    sprint_data = {
        "sprint": {
            "name": f"TO Sprint {sprint_yyww}",
            "jira_sprint_id": jira_id,
            "jira_sprint_name": f"TO Sprint {sprint_yyww}",
            "goal": goal,
            "start_date": start_date,
            "end_date": end_date,
            "status": "active",
        },
        "epics": [],
    }
    write_sprint(sprint_file, sprint_data)
    click.echo(f"Created {sprint_file}")

    # Create archive file
    from datetime import date

    archive_content = f"""# Sprint TO Sprint {sprint_yyww} - Completed Stories
# Jira Sprint ID: {jira_id}
# Archived: {date.today()}

sprint:
  name: "TO Sprint {sprint_yyww}"
  jira_sprint_id: {jira_id}
  jira_sprint_name: "TO Sprint {sprint_yyww}"
  goal: {goal}

completed:
  # Completed stories will be appended here by pf sprint archive
"""
    archive_file.parent.mkdir(parents=True, exist_ok=True)
    archive_file.write_text(archive_content)
    click.echo(f"Created {archive_file}")

    click.echo("")
    click.echo(f"New sprint initialized:")
    click.echo(f"  Name: TO Sprint {sprint_yyww}")
    click.echo(f"  Jira ID: {jira_id}")
    click.echo(f"  Dates: {start_date} to {end_date}")
    click.echo(f"  Goal: {goal}")
    click.echo("")
    click.echo("Next steps:")
    click.echo("  1. Add epics: pf sprint epic promote <epic-id>")
    click.echo("  2. Check status: pf sprint status")


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
