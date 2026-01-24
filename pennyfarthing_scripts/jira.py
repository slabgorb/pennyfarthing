"""
Jira CLI wrapper for Pennyfarthing scripts.

Wraps the `jira` CLI tool for issue operations.
"""

import json
import os
import re
import shutil
import subprocess
from typing import Any

# Configuration
JIRA_PROJECT = os.environ.get("JIRA_PROJECT", "MSSCI")
JIRA_URL = os.environ.get("JIRA_URL", "https://1898andco.atlassian.net")

# Status mappings: Pennyfarthing -> Jira
STATUS_TO_JIRA = {
    "backlog": "To Do",
    "todo": "To Do",
    "in-progress": "In Progress",
    "in_progress": "In Progress",
    "active": "In Progress",
    "review": "In Review",
    "in-review": "In Review",
    "in_review": "In Review",
    "done": "Done",
    "completed": "Done",
    "closed": "Done",
    "cancelled": "Done",
    "blocked": "Blocked",
}

# Status mappings: Jira -> Pennyfarthing
JIRA_TO_STATUS = {
    "To Do": "backlog",
    "Open": "backlog",
    "Backlog": "backlog",
    "In Progress": "in_progress",
    "Active": "in_progress",
    "In Review": "review",
    "Review": "review",
    "Done": "done",
    "Closed": "done",
    "Resolved": "done",
    "Blocked": "blocked",
}


def map_status_to_jira(pennyfarthing_status: str | None) -> str:
    """Map Pennyfarthing status to Jira status.

    Args:
        pennyfarthing_status: Status from sprint YAML

    Returns:
        Corresponding Jira status name
    """
    if not pennyfarthing_status:
        return "To Do"
    return STATUS_TO_JIRA.get(pennyfarthing_status.lower(), "To Do")


def map_jira_to_status(jira_status: str | None) -> str:
    """Map Jira status to Pennyfarthing status.

    Args:
        jira_status: Status name from Jira

    Returns:
        Corresponding Pennyfarthing status
    """
    if not jira_status:
        return "backlog"
    return JIRA_TO_STATUS.get(jira_status, "backlog")


def extract_jira_key(input_value: str | None) -> str | None:
    """Extract Jira key from URL or return as-is.

    Args:
        input_value: Jira key or URL containing key

    Returns:
        Extracted Jira key, or None if input is None
    """
    if not input_value:
        return None

    # Already in key format
    key_pattern = re.compile(rf"^{JIRA_PROJECT}-\d+$")
    if key_pattern.match(input_value):
        return input_value

    # Extract from URL
    url_pattern = re.compile(rf"({JIRA_PROJECT}-\d+)")
    match = url_pattern.search(input_value)
    return match.group(1) if match else input_value


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


def get_jira_field(issue_json: dict[str, Any], field_path: str, default: Any = None) -> Any:
    """Extract field from Jira issue JSON using dot notation.

    Args:
        issue_json: Issue data dict
        field_path: Dot-separated path (e.g., "fields.status.name")
        default: Default value if not found

    Returns:
        Field value or default
    """
    if not issue_json:
        return default

    parts = field_path.lstrip(".").split(".")
    value = issue_json

    for part in parts:
        if value is None:
            return default
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return default

    return value if value is not None else default


def get_story_points(issue_key: str, issue_json: dict[str, Any] | None = None) -> int | None:
    """Get story points from an issue.

    Args:
        issue_key: Jira issue key
        issue_json: Optional pre-fetched issue JSON

    Returns:
        Story points as int, or None if not set
    """
    if issue_json is None:
        issue_json = get_issue(issue_key)
    if not issue_json:
        return None

    # customfield_10031 is Story Points for 1898andco Jira
    points = get_jira_field(issue_json, "fields.customfield_10031")
    return int(points) if points is not None else None
