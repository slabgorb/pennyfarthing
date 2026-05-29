"""Sprint story add command.

Story: PROJ-14256 - Sprint story add command

This module provides:
- generate_story_id(sprint_data, epic) -> str
- add_story(sprint_path, epic_id, title, points, ...) -> dict
- add_initiative_story(initiative_slug, title, points, ...) -> dict
- story_add_command (Click command for CLI registration)
"""

from pathlib import Path
from typing import Any

import click
from ruamel.yaml.comments import CommentedMap

from pf.sprint.loader import find_epic
from pf.sprint.validator import validate_full_sprint
from pf.sprint.yaml_io import (
    STORY_KEY_ORDER,
    read_sprint,
    write_sprint,
)


def _extract_epic_num(epic: Any) -> str:
    """Extract the numeric part from an epic ID like 'epic-76' -> '76'."""
    epic_id = str(epic.get("id", ""))
    return epic_id.replace("epic-", "")


def generate_story_id(sprint_data: Any, epic: Any) -> str:
    """Generate the next story ID for an epic.

    Args:
        sprint_data: Full sprint YAML data
        epic: The target epic dict/CommentedMap

    Returns:
        Next story ID string (e.g., "76-3")
    """
    epic_num = _extract_epic_num(epic)
    stories = epic.get("stories", [])

    max_seq = 0
    for story in stories:
        story_id = str(story.get("id", ""))
        parts = story_id.split("-")
        if len(parts) >= 2:
            try:
                seq = int(parts[-1])
                if seq > max_seq:
                    max_seq = seq
            except ValueError:
                pass

    return f"{epic_num}-{max_seq + 1}"


def add_story(
    sprint_path: Path,
    epic_id: str,
    title: str,
    points: int,
    *,
    story_type: str | None = None,
    priority: str = "P1",
    workflow: str = "tdd",
    jira: str | None = None,
    repos: str | None = None,
    depends_on: str | None = None,
    plan_ref: str | None = None,
) -> dict[str, Any]:
    """Add a new story to an epic in the sprint YAML.

    Args:
        sprint_path: Path to sprint YAML file
        epic_id: Epic ID to add the story to
        title: Story title
        points: Story points
        story_type: Optional story type (feature, bug, chore, refactor)
        priority: Priority (default: P1)
        workflow: Workflow (default: tdd)
        jira: Optional Jira key
        plan_ref: Optional plan back-link string (e.g. "plan:path/to/plan.md#task-1")

    Returns:
        Dict with success status and story_id or error
    """
    data = read_sprint(sprint_path)

    epic = find_epic(data, epic_id)
    if epic is None:
        available = []
        for e in data.get("epics", []):
            available.append(str(e.get("id", "")))
        return {
            "success": False,
            "error": f"Epic '{epic_id}' not found. Available epics: {', '.join(available)}",
        }

    story_id = generate_story_id(data, epic)

    # Build story as CommentedMap with canonical key ordering
    story = CommentedMap()
    fields: dict[str, Any] = {
        "id": story_id,
        "title": title,
        "points": points,
        "priority": priority,
        "status": "backlog",
        "workflow": workflow,
    }
    if jira is not None:
        fields["jira"] = jira
    if repos is not None:
        fields["repos"] = repos
    if depends_on is not None:
        fields["depends_on"] = depends_on
    if plan_ref is not None:
        fields["plan_ref"] = plan_ref
    if story_type is not None:
        fields["type"] = story_type

    # Insert keys in STORY_KEY_ORDER, then any extras
    for key in STORY_KEY_ORDER:
        if key in fields:
            story[key] = fields[key]
    for key in fields:
        if key not in STORY_KEY_ORDER:
            story[key] = fields[key]

    # Append to epic's stories list
    if "stories" not in epic:
        from ruamel.yaml.comments import CommentedSeq

        epic["stories"] = CommentedSeq()
    epic["stories"].append(story)

    # Validate before writing
    result = validate_full_sprint(data)
    if not result.valid:
        # Remove the story we just added to avoid corrupting data
        epic["stories"].pop()
        return {
            "success": False,
            "error": f"Validation failed after insertion: {result.errors}",
        }

    write_sprint(sprint_path, data)

    return {
        "success": True,
        "story_id": story_id,
    }


def _generate_initiative_story_id(init_data: dict[str, Any], slug: str) -> str:
    """Generate the next standalone story ID for an initiative.

    Uses the pattern {slug-prefix}-{N} where slug-prefix is derived from
    the initiative slug (e.g., "technical-debt" -> "td", "quality-scale" -> "qs").
    Only counts existing stories that share the same prefix.

    Args:
        init_data: Initiative YAML data
        slug: Initiative slug (e.g., "technical-debt")

    Returns:
        Next story ID string (e.g., "td-2")
    """
    # Build prefix from initiative slug initials
    parts = slug.split("-")
    prefix = "".join(p[0] for p in parts if p)

    stories = init_data.get("standalone_stories", [])
    max_seq = 0
    for story in stories:
        story_id = str(story.get("id", ""))
        # Only count stories with matching prefix
        if not story_id.startswith(f"{prefix}-"):
            continue
        suffix = story_id[len(prefix) + 1 :]
        try:
            seq = int(suffix)
            if seq > max_seq:
                max_seq = seq
        except ValueError:
            pass

    return f"{prefix}-{max_seq + 1}"


def add_initiative_story(
    initiative_slug: str,
    title: str,
    points: int,
    *,
    story_type: str | None = None,
    priority: str = "P1",
    workflow: str = "tdd",
    jira: str | None = None,
    repos: str = "pennyfarthing",
) -> dict[str, Any]:
    """Add a standalone story to an initiative YAML file.

    Args:
        initiative_slug: Initiative slug (e.g., "technical-debt")
        title: Story title
        points: Story points
        story_type: Optional story type (feature, bug, chore, refactor)
        priority: Priority (default: P1)
        workflow: Workflow (default: tdd)
        jira: Optional Jira key
        repos: Repos (default: pennyfarthing)

    Returns:
        Dict with success status and story_id or error
    """
    from pf.common.config import get_project_root

    root = get_project_root()
    init_path = root / "sprint" / f"initiative-{initiative_slug}.yaml"

    if not init_path.exists():
        available = [
            f.stem.replace("initiative-", "") for f in (root / "sprint").glob("initiative-*.yaml")
        ]
        return {
            "success": False,
            "error": f"Initiative '{initiative_slug}' not found. Available: {', '.join(sorted(available))}",
        }

    # Use ruamel.yaml to preserve block scalars and formatting
    from ruamel.yaml import YAML as RuamelYAML

    ryml = RuamelYAML()
    ryml.preserve_quotes = True
    ryml.default_flow_style = False
    ryml.indent(mapping=2, sequence=4, offset=2)
    ryml.width = 4096

    with open(init_path) as f:
        init_data = ryml.load(f)

    if not init_data:
        return {"success": False, "error": f"Empty initiative file: {init_path}"}

    story_id = _generate_initiative_story_id(init_data, initiative_slug)

    story: dict[str, Any] = {
        "id": story_id,
        "title": title,
        "points": points,
        "priority": priority,
        "status": "backlog",
        "repos": repos,
        "workflow": workflow,
    }
    if jira is not None:
        story["jira"] = jira
    if story_type is not None:
        story["type"] = story_type

    if "standalone_stories" not in init_data:
        init_data["standalone_stories"] = []
    init_data["standalone_stories"].append(story)

    # Update total_points
    current_total = init_data.get("total_points", 0) or 0
    init_data["total_points"] = current_total + points

    with open(init_path, "w") as f:
        ryml.dump(init_data, f)

    return {
        "success": True,
        "story_id": story_id,
    }


@click.command("add")
@click.argument("epic_id", type=str, required=False)
@click.argument("title", type=str, required=False)
@click.argument("points", type=int, required=False)
@click.option(
    "--type",
    "story_type",
    type=click.Choice(["feature", "bug", "chore", "refactor"]),
    default="feature",
)
@click.option(
    "--priority", type=click.Choice(["p0", "p1", "p2", "p3"], case_sensitive=False), default="p1"
)
@click.option("--workflow", type=click.Choice(["tdd", "trivial", "bdd", "superpowers"]), default="tdd")
@click.option("--jira", "jira_id", type=str, default=None)
@click.option("--sprint-file", type=click.Path(), default=None, help="Path to sprint YAML file")
@click.option(
    "--initiative",
    type=str,
    default=None,
    help="Add as standalone story to initiative (e.g., technical-debt)",
)
@click.option("--repos", type=str, default="pennyfarthing", help="Repos (default: pennyfarthing)")
@click.option("--depends-on", type=str, default=None, help="Story ID this depends on (stacked PRs)")
@click.option(
    "--epic",
    "epic_override",
    type=str,
    default=None,
    help="Target epic ID — overrides the positional EPIC_ID",
)
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def story_add_command(
    epic_id: str | None,
    title: str | None,
    points: int | None,
    story_type: str,
    priority: str,
    workflow: str,
    jira_id: str | None,
    sprint_file: str | None,
    initiative: str | None,
    repos: str,
    depends_on: str | None,
    epic_override: str | None,
    dry_run: bool,
) -> None:
    """Add a new story to an epic or initiative.

    \b
    Epic mode (default):
      pf sprint story add <EPIC_ID> <TITLE> <POINTS>

    Initiative mode (--initiative):
      pf sprint story add --initiative <SLUG> <TITLE> <POINTS>
    """
    if initiative:
        # Initiative mode: first positional arg is title, second is points
        # epic_id absorbs the title, title absorbs points (as str)
        if epic_id is None:
            raise click.ClickException("TITLE is required")
        init_title = epic_id
        if title is None:
            raise click.ClickException("POINTS is required")
        try:
            init_points = int(title)
        except ValueError as err:
            raise click.ClickException(f"POINTS must be an integer, got '{title}'") from err

        if dry_run:
            click.echo(
                f"[DRY-RUN] Would add story to initiative {initiative}: {init_title} [{init_points}pts]"
            )
            return

        result = add_initiative_story(
            initiative_slug=initiative,
            title=init_title,
            points=init_points,
            story_type=story_type if story_type != "feature" else None,
            priority=priority,
            workflow=workflow,
            jira=jira_id,
            repos=repos,
        )

        if result["success"]:
            click.echo(
                f"Added story {result['story_id']}: {init_title} [{init_points}pts] to initiative {initiative}"
            )
        else:
            raise click.ClickException(result["error"])
    else:
        # Epic mode: --epic overrides the positional EPIC_ID when supplied.
        target_epic = epic_override or epic_id
        if target_epic is None:
            raise click.ClickException("EPIC_ID is required")
        if title is None:
            raise click.ClickException("TITLE is required")
        if points is None:
            raise click.ClickException("POINTS is required")

        if dry_run:
            click.echo(f"[DRY-RUN] Would add story to epic {target_epic}: {title} [{points}pts]")
            return

        if sprint_file is None:
            from pf.common.config import get_project_root

            path = get_project_root() / "sprint" / "current-sprint.yaml"
        else:
            path = Path(sprint_file)

        result = add_story(
            sprint_path=path,
            epic_id=target_epic,
            title=title,
            points=points,
            story_type=story_type if story_type != "feature" else None,
            priority=priority,
            workflow=workflow,
            jira=jira_id,
            repos=repos,
            depends_on=depends_on,
        )

        if result["success"]:
            click.echo(f"Added story {result['story_id']}: {title} [{points}pts]")
        else:
            raise click.ClickException(result["error"])
