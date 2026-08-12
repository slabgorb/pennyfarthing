"""
Jira issue operations: move, assign, link.

Replaces jira-lib.sh functions with REST API calls.
No interactive prompts, no subprocess stdin issues.

Usage:
    pf jira move PROJ-12345 "In Progress"
    pf jira assign PROJ-12345 user@example.com
    pf jira link PROJ-12345 PROJ-12346 "Blocks"
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

    A dry run resolves the same state the real call would: the issue must exist
    and Jira must actually offer a transition to ``target_status``. Only the
    real path writes; callers own the output.

    Args:
        issue_key: Jira issue key (e.g., "PROJ-12345")
        target_status: Target status name (e.g., "In Progress", "Done")
        dry_run: If True, resolve and preview without applying

    Returns:
        {success, error?, already_at_status?, dry_run?}
    """
    client = get_client()

    # Check current status
    issue = client.get_issue_sync(issue_key)
    if issue:
        current_status = get_jira_field(issue, "fields.status.name", "")
        if current_status.lower() == target_status.lower():
            return {"success": True, "already_at_status": True}

    if dry_run:
        if not issue:
            return {"success": False, "error": f"Issue not found: {issue_key}"}
        transitions = client.get_transitions_sync(issue_key)
        if transitions is None:
            return {
                "success": False,
                "error": f"Could not get transitions for {issue_key}",
            }
        available = [t.get("name") for t in transitions]
        if target_status.lower() not in {str(n).lower() for n in available}:
            return {
                "success": False,
                "error": f"No transition to '{target_status}' available. Available: {available}",
            }
        return {"success": True, "dry_run": True}

    return client.transition_sync(issue_key, target_status)


def assign_issue(
    issue_key: str,
    assignee: str | None,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Assign a Jira issue to a user.

    Accepts a Jira account email or a GitHub username mapped through
    jira.user_map. The identifier is resolved against Jira BEFORE the dry_run
    branch, so a dry run can fail for an identifier the real call would reject.
    Only the real path writes.

    Args:
        issue_key: Jira issue key
        assignee: Jira account email, mapped GitHub username, or None to unassign
        dry_run: If True, resolve and preview without applying

    Returns:
        {success, data?, error?, already_assigned?, dry_run?} where data holds
        the resolved account: {account_id, email, display_name}
    """
    client = get_client()

    if not client.token:
        return {"success": False, "error": "Cannot validate user: no Jira credentials"}

    if not assignee or assignee in ("null", "x", "none"):
        # Callers own the output; printing here duplicated (and contradicted)
        # the CLI's line.
        if dry_run:
            return {"success": True, "dry_run": True, "unassign": True}
        return {**client.assign_issue_sync(issue_key, None), "unassign": True}

    # jira.user_map wins; otherwise ask Jira about the identifier as typed.
    query = assignee if "@" in assignee else (map_github_to_jira(assignee) or assignee)

    account = client.find_user_sync(query)
    if not account:
        # Name what the user typed, not a substituted email.
        return {"success": False, "error": f"User not found: {assignee}"}

    resolved = {
        "account_id": account.get("accountId"),
        # Jira may withhold emailAddress; fall back to the resolved query so we
        # never pass None down to assign_issue_sync (which would unassign).
        "email": account.get("emailAddress") or query,
        "display_name": account.get("displayName") or query,
    }

    # Check current assignee
    issue = client.get_issue_sync(issue_key)
    if issue:
        current_email = get_jira_field(issue, "fields.assignee.emailAddress", "")
        if current_email and current_email == resolved["email"]:
            return {"success": True, "already_assigned": True, "data": resolved}

    if dry_run:
        return {"success": True, "data": resolved, "dry_run": True}

    result = client.assign_issue_sync(issue_key, resolved["email"])
    if result.get("success"):
        return {**result, "data": resolved}
    return result


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
    client = get_client()

    if dry_run:
        # Verify both endpoints exist — a typo in either key used to preview
        # as a successful link.
        for key in (inward_key, outward_key):
            if not client.get_issue_sync(key):
                return {"success": False, "error": f"Issue not found: {key}"}
        return {"success": True, "dry_run": True}

    return client.link_issues_sync(inward_key, outward_key, link_type)
