"""
Jira CLI wrapper for Pennyfarthing scripts.

Wraps the `jira` CLI tool for issue operations.
"""

import json
import shutil
import subprocess
from typing import Any


def is_jira_cli_available() -> bool:
    """Check if the jira CLI is available.

    Returns:
        True if jira CLI is installed and accessible
    """
    return shutil.which("jira") is not None


def get_issue(issue_key: str) -> dict[str, Any] | None:
    """Fetch issue details from Jira.

    Args:
        issue_key: Jira issue key (e.g., "MSSCI-12398")

    Returns:
        Issue data as dict, or None if not found
    """
    if not is_jira_cli_available():
        return None

    result = subprocess.run(
        ["jira", "issue", "view", issue_key, "--output", "json"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return None

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def update_issue_status(issue_key: str, status: str) -> bool:
    """Transition an issue to a new status.

    Args:
        issue_key: Jira issue key
        status: Target status name

    Returns:
        True if successful, False otherwise
    """
    if not is_jira_cli_available():
        return False

    result = subprocess.run(
        ["jira", "issue", "move", issue_key, status],
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


def add_comment(issue_key: str, comment: str) -> bool:
    """Add a comment to an issue.

    Args:
        issue_key: Jira issue key
        comment: Comment text

    Returns:
        True if successful, False otherwise
    """
    if not is_jira_cli_available():
        return False

    result = subprocess.run(
        ["jira", "issue", "comment", "add", issue_key, "--body", comment],
        capture_output=True,
        text=True,
    )

    return result.returncode == 0
