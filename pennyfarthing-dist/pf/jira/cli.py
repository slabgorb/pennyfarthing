"""
Jira CLI - Unified entry point for all Jira operations.

Usage:
    pf jira <command> [args]
    python -m pf.jira <command> [args]

Commands:
    view         View issue details
    check        Check story availability
    claim        Claim a story
    move         Transition issue status
    assign       Assign issue to user
    link         Link two issues
    search       Search issues (plain text or JQL)
    create epic  Create epic + stories from YAML
    create story Create single story from YAML
    sync         Sync epic to Jira
    bidirectional Bidirectional sync
    reconcile    Reconciliation report
    sprint add   Add issue to sprint
"""

import sys

import click


@click.group()
def jira():
    """Jira issue management for Pennyfarthing.

    \b
    All operations use REST API where possible.
    No interactive prompts, no subprocess stdin issues.
    """
    pass


@jira.command()
@click.argument("key")
def view(key):
    """View issue details (delegates to jira CLI)."""
    import subprocess

    result = subprocess.run(
        ["jira", "issue", "view", key],
        capture_output=False,
    )
    raise SystemExit(result.returncode)


@jira.command()
@click.argument("key")
def check(key):
    """Check if a story is available to claim."""
    from pf.jira.claim import main as claim_main

    raise SystemExit(claim_main([key]))


@jira.command()
@click.argument("key")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def claim(key, dry_run):
    """Claim a story (assign to self + move to In Progress)."""
    if dry_run:
        click.echo(f"[DRY-RUN] Would claim {key} (assign to self + move to In Progress)")
        return
    from pf.jira.claim import main as claim_main

    raise SystemExit(claim_main([key, "--claim"]))


@jira.command()
@click.argument("key")
@click.argument("status")
@click.option("--dry-run", is_flag=True, help="Preview without applying")
def move(key, status, dry_run):
    """Transition a Jira issue to a new status.

    \b
    Statuses: "To Do", "In Progress", "In Review", "Done"
    """
    from pf.jira.operations import move_issue

    result = move_issue(key, status, dry_run=dry_run)
    if result.get("already_at_status"):
        click.echo(f"{key} already at '{status}'")
    elif result.get("success"):
        click.echo(f"Moved {key} to '{status}'")
    else:
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@jira.command()
@click.argument("key")
@click.argument("user")
@click.option("--dry-run", is_flag=True, help="Preview without applying")
def assign(key, user, dry_run):
    """Assign issue to a user (email or GitHub username)."""
    from pf.jira.operations import assign_issue

    result = assign_issue(key, user, dry_run=dry_run)
    if result.get("already_assigned"):
        click.echo(f"{key} already assigned to {user}")
    elif result.get("success"):
        click.echo(f"Assigned {key} to {user}")
    else:
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@jira.command()
@click.argument("parent_key")
@click.argument("child_key")
@click.argument("link_type", default="Relates")
@click.option("--dry-run", is_flag=True, help="Preview without applying")
def link(parent_key, child_key, link_type, dry_run):
    """Link two Jira issues.

    \b
    Link types: "Parent-Child", "Blocks", "Relates", "Duplicate"
    """
    from pf.jira.operations import link_issues

    result = link_issues(parent_key, child_key, link_type, dry_run=dry_run)
    if result.get("success"):
        click.echo(f"Linked {parent_key} -> {child_key} ({link_type})")
    else:
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@jira.command()
@click.argument("query")
@click.option("--project", "-p", default=None, help="Jira project key (default: from config)")
@click.option("--max-results", "-n", default=50, type=int, help="Maximum results (default: 50)")
@click.option("--status", "-s", default=None, help="Filter by status (e.g. 'In Progress', 'Done')")
@click.option("--type", "-t", "issue_type", default=None, help="Filter by issue type (e.g. Story, Epic, Bug)")
@click.option("--json-output", "--json", "json_out", is_flag=True, help="Output as JSON")
def search(query, project, max_results, status, issue_type, json_out):
    """Search issues using plain text or JQL.

    \b
    Plain text queries search summary, description, and comments.
    JQL queries (detected automatically) are passed through directly.

    \b
    Examples:
      pf jira search "BikeRack reconnect"
      pf jira search "sprint fix" --project MSSCI
      pf jira search "status = 'In Progress' AND assignee = currentUser()"
      pf jira search "install" --status "To Do" --type Story
    """
    import json as json_mod

    from pf.jira.client import JIRA_PROJECT, get_client

    client = get_client()
    proj = project or JIRA_PROJECT

    jql = _build_search_jql(query, proj, status, issue_type)

    issues = client.search_issues_sync(
        jql,
        fields=["key", "summary", "status", "assignee", "customfield_10031", "issuetype"],
        max_results=max_results,
    )

    if json_out:
        click.echo(json_mod.dumps(issues, indent=2))
        return

    if not issues:
        click.echo(f"No issues found. JQL: {jql}")
        return

    click.echo(f"Found {len(issues)} issue(s):\n")
    _print_search_results(issues)


def _is_jql(query: str) -> bool:
    """Detect if a query string looks like JQL rather than plain text."""
    jql_keywords = [
        " = ", " != ", " ~ ", " !~ ", " IN ", " NOT IN ",
        " AND ", " OR ", " ORDER BY ", " >= ", " <= ",
        " IS ", " WAS ", " CHANGED ",
    ]
    upper = f" {query} ".upper()
    return any(kw.upper() in upper for kw in jql_keywords)


def _build_search_jql(
    query: str,
    project: str,
    status: str | None,
    issue_type: str | None,
) -> str:
    """Build JQL from query string, project, and optional filters."""
    if _is_jql(query):
        jql = query
        if project and "project" not in query.lower():
            jql = f"project = {project} AND ({jql})"
    else:
        jql = f'project = {project} AND text ~ "{query}"'

    if status:
        jql += f' AND status = "{status}"'
    if issue_type:
        jql += f' AND issuetype = "{issue_type}"'

    jql += " ORDER BY updated DESC"
    return jql


def _print_search_results(issues: list) -> None:
    """Format and print search results as a table."""
    from pf.jira.client import get_jira_field

    rows = []
    for issue in issues:
        key = issue.get("key", "?")
        summary = get_jira_field(issue, "fields.summary", "")
        status_name = get_jira_field(issue, "fields.status.name", "?")
        issue_type = get_jira_field(issue, "fields.issuetype.name", "?")
        assignee = get_jira_field(issue, "fields.assignee.displayName", "Unassigned")
        points = get_jira_field(issue, "fields.customfield_10031")
        pts_str = str(int(points)) if points else "-"
        rows.append((key, issue_type, summary, status_name, pts_str, assignee))

    if not rows:
        return

    # Column widths
    key_w = max(len(r[0]) for r in rows)
    type_w = max(len(r[1]) for r in rows)
    status_w = max(len(r[3]) for r in rows)
    pts_w = 3
    # Summary gets the rest, capped at 50
    sum_w = 50

    header = (
        f"{'Key':<{key_w}}  {'Type':<{type_w}}  {'Summary':<{sum_w}}  "
        f"{'Status':<{status_w}}  {'Pts':<{pts_w}}  Assignee"
    )
    click.echo(header)
    click.echo("-" * len(header))

    for key, itype, summary, st, pts, assignee in rows:
        trunc = (summary[:sum_w - 1] + "…") if len(summary) > sum_w else summary
        click.echo(
            f"{key:<{key_w}}  {itype:<{type_w}}  {trunc:<{sum_w}}  "
            f"{st:<{status_w}}  {pts:<{pts_w}}  {assignee}"
        )


@jira.group()
def create():
    """Create Jira issues from sprint YAML."""
    pass


@create.command("epic")
@click.argument("epic_id")
@click.option("--dry-run", is_flag=True, help="Preview without creating")
def create_epic(epic_id, dry_run):
    """Create a Jira epic and its child stories from sprint YAML."""
    from pf.jira.create import create_epic_in_jira

    result = create_epic_in_jira(epic_id, dry_run=dry_run)
    if not result.get("success"):
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@create.command("story")
@click.argument("epic_jira_key")
@click.argument("story_id")
@click.option("--dry-run", is_flag=True, help="Preview without creating")
def create_story(epic_jira_key, story_id, dry_run):
    """Create a single Jira story under an epic from sprint YAML."""
    from pf.jira.create import create_story_in_jira

    result = create_story_in_jira(epic_jira_key, story_id, dry_run=dry_run)
    if not result.get("success") and not result.get("dry_run"):
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@create.command("standalone")
@click.argument("title")
@click.option("--points", default=2, type=int, help="Story points (default: 2)")
@click.option("--description", "-d", default="", help="Story description")
@click.option("--dry-run", is_flag=True, help="Preview without creating")
def create_standalone(title, points, description, dry_run):
    """Create a standalone Jira story, add to sprint, mark Done.

    Uses REST API directly — no interactive prompts, no stdin issues.

    \b
    Arguments:
      TITLE  - Story summary

    \b
    Examples:
      pf jira create standalone "Fix sprint script shard support" --points 3
      pf jira create standalone "Add drift detection" -d "Detects YAML drift"
      pf jira create standalone "Quick fix" --dry-run
    """
    from pf.jira.client import JIRA_PROJECT, get_client
    from pf.jira.create import _build_adf_description
    from pf.sprint.loader import get_sprint_info

    sprint_info = get_sprint_info()
    sprint_id = sprint_info.get("jira_sprint_id")

    if dry_run:
        click.echo(f"[DRY-RUN] Would create: {title}")
        click.echo(f"  Points: {points}")
        click.echo(f"  Sprint: {sprint_id}")
        click.echo("  Actions: create -> add to sprint -> transition to Done")
        return

    client = get_client()

    # 1. Create the story
    payload = {
        "fields": {
            "project": {"key": JIRA_PROJECT},
            "summary": title,
            "description": _build_adf_description(description),
            "issuetype": {"name": "Story"},
            "labels": ["pennyfarthing"],
        }
    }

    response = client.create_issue_sync(payload)
    if not response or "key" not in response:
        raise click.ClickException(f"Failed to create story: {response}")

    jira_key = response["key"]
    click.echo(f"Created: {jira_key}")

    # 2. Set story points
    if points > 0:
        client.update_issue_sync(jira_key, {"customfield_10031": points})

    # 3. Add to sprint
    if sprint_id:
        client.add_to_sprint_sync(sprint_id, jira_key)
        click.echo(f"Added to sprint {sprint_id}")

    # 4. Transition to Done
    result = client.transition_sync(jira_key, "Done")
    if result.get("success"):
        click.echo("Transitioned to Done")
    else:
        click.echo(f"Warning: could not transition to Done: {result.get('error')}")

    click.echo(f"\n{jira_key}: {title}")
    click.echo(f"https://1898andco.atlassian.net/browse/{jira_key}")


@jira.command()
@click.argument("epic")
@click.option("--dry-run", is_flag=True, help="Preview without applying")
@click.option("--transition", is_flag=True, help="Sync status to Jira")
@click.option("--points", is_flag=True, help="Sync story points")
@click.option("--all", "sync_all", is_flag=True, help="Sync all fields")
def sync(epic, dry_run, transition, points, sync_all):
    """Sync epic stories from sprint YAML to Jira."""
    from pf.jira.sync import main as sync_main

    args = [epic]
    if dry_run:
        args.append("--dry-run")
    if transition or sync_all:
        args.append("--transition")
    if points or sync_all:
        args.append("--points")
    raise SystemExit(sync_main(args))


@jira.command()
@click.option("--dry-run", is_flag=True, help="Preview without applying")
@click.option("--yaml-wins", is_flag=True, help="Prefer YAML values on conflict")
@click.option("--status", is_flag=True, help="Sync status field")
@click.option("--points", is_flag=True, help="Sync story points")
@click.option("--assignee", is_flag=True, help="Sync assignee field (Jira -> YAML only)")
@click.option("--all", "sync_all", is_flag=True, help="Sync all fields")
@click.option("--sprint", "sprint_id", help="Target specific sprint")
def bidirectional(dry_run, yaml_wins, status, points, assignee, sync_all, sprint_id):
    """Bidirectional sync between YAML and Jira."""
    from pf.jira.bidirectional import main as bidirectional_main

    args = []
    if dry_run:
        args.append("--dry-run")
    if yaml_wins:
        args.append("--yaml-wins")
    if status or sync_all:
        args.append("--status")
    if points or sync_all:
        args.append("--points")
    if assignee or sync_all:
        args.append("--assignee")
    if sync_all:
        args.append("--all")
    if sprint_id:
        args.extend(["--sprint", sprint_id])
    raise SystemExit(bidirectional_main(args))


@jira.command()
@click.option("--fix", is_flag=True, help="Apply automatic fixes where safe")
def reconcile(fix):
    """Reconciliation report: sprint YAML vs Jira."""
    from pf.jira.reconcile import reconcile as run_reconcile

    result = run_reconcile(fix=fix)
    if not result.get("success"):
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


@jira.group("sprint")
def jira_sprint():
    """Sprint operations."""
    pass


@jira_sprint.command("add")
@click.argument("sprint_id")
@click.argument("issue_key")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def sprint_add(sprint_id, issue_key, dry_run):
    """Add an issue to a sprint."""
    if dry_run:
        click.echo(f"[DRY-RUN] Would add {issue_key} to sprint {sprint_id}")
        return
    from pf.jira.client import get_client

    client = get_client()
    result = client.add_to_sprint_sync(sprint_id, issue_key)
    if result.get("success"):
        click.echo(f"Added {issue_key} to sprint {sprint_id}")
    else:
        click.echo(f"Failed: {result.get('error', 'unknown')}", err=True)
        raise SystemExit(1)


def cli(args=None):
    """Backwards-compatible entry point."""
    try:
        jira(args, standalone_mode=False)
    except SystemExit as e:
        return e.code or 0
    except click.exceptions.UsageError as e:
        click.echo(str(e), err=True)
        return 1
    return 0


def main(args=None):
    """Alias for cli()."""
    return cli(args)


if __name__ == "__main__":
    sys.exit(cli())
