"""
Jira issue operations: move, assign, link.

Replaces jira-lib.sh functions with REST API calls.
No interactive prompts, no subprocess stdin issues.

Usage:
    pf jira move MSSCI-12345 "In Progress"
    pf jira assign MSSCI-12345 keith.avery@1898andco.io
    pf jira link MSSCI-12345 MSSCI-12346 "Blocks"
"""

from typing import Any

from pf.jira.client import (
    get_client,
    get_jira_field,
    map_github_to_jira,
)


def move_issue(
    issue_key: str,
    target_status: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Transition a Jira issue to a new status.

    Checks current status first to avoid redundant transitions.

    Args:
        issue_key: Jira issue key (e.g., "MSSCI-12345")
        target_status: Target status name (e.g., "In Progress", "Done")
        dry_run: If True, preview without applying

    Returns:
        {success, error?, already_at_status?}
    """
    client = get_client()

    # Check current status
    issue = client.get_issue_sync(issue_key)
    if issue:
        current_status = get_jira_field(issue, "fields.status.name", "")
        if current_status.lower() == target_status.lower():
            return {"success": True, "already_at_status": True}

    if dry_run:
        print(f"[DRY RUN] Would move {issue_key} to '{target_status}'")
        return {"success": True, "dry_run": True}

    return client.transition_sync(issue_key, target_status)


def assign_issue(
    issue_key: str,
    assignee: str | None,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Assign a Jira issue to a user.

    Accepts email address or GitHub username (will be mapped).
    Checks current assignee to avoid redundant assignments.

    Args:
        issue_key: Jira issue key
        assignee: Email, GitHub username, or None to unassign
        dry_run: If True, preview without applying

    Returns:
        {success, error?, already_assigned?}
    """
    if not assignee or assignee in ("null", "x", "none"):
        assignee_email = None
    elif "@" in assignee:
        assignee_email = assignee
    else:
        # Try GitHub username mapping
        assignee_email = map_github_to_jira(assignee)

    client = get_client()

    # Check current assignee
    if assignee_email:
        issue = client.get_issue_sync(issue_key)
        if issue:
            current_email = get_jira_field(issue, "fields.assignee.emailAddress", "")
            if current_email == assignee_email:
                return {"success": True, "already_assigned": True}

    if dry_run:
        action = f"assign {issue_key} to {assignee_email}" if assignee_email else f"unassign {issue_key}"
        print(f"[DRY RUN] Would {action}")
        return {"success": True, "dry_run": True}

    return client.assign_issue_sync(issue_key, assignee_email)


def link_issues(
    inward_key: str,
    outward_key: str,
    link_type: str = "Relates",
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Link two Jira issues.

    Args:
        inward_key: Inward issue key (parent/blocker)
        outward_key: Outward issue key (child/blocked)
        link_type: Link type (e.g., "Relates", "Blocks", "Parent-Child")
        dry_run: If True, preview without applying

    Returns:
        {success, error?}
    """
    if dry_run:
        print(f"[DRY RUN] Would link {inward_key} -> {outward_key} ({link_type})")
        return {"success": True, "dry_run": True}

    client = get_client()
    return client.link_issues_sync(inward_key, outward_key, link_type)
