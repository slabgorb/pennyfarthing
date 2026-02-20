"""
Jira integration package for Pennyfarthing scripts.

This package provides:
- client: JiraClient REST API wrapper and helper functions
- sync: Epic sync to Jira
- bidirectional: Bidirectional sync between YAML and Jira
- epic: Epic creation
- story: Single story sync
- claim: Story claiming

Usage:
    # Use the client module
    from pf.jira import JiraClient
    client = JiraClient()
    issue = client.get_issue_sync("MSSCI-12345")

    # Use CLI
    python -m pf.jira <subcommand> [args]
"""

# Re-export from client for backwards compatibility
# Import submodules to make them accessible
# CLI entry point - import module, not function, so "from jira import cli" gets the module
from pf.jira import (
    bidirectional,
    claim,
    cli,
    client,
    create,
    epic,
    operations,
    reconcile,
    story,
    sync,
)
from pf.jira.cli import main
from pf.jira.client import (
    # Constants
    GITHUB_TO_JIRA_MAP,
    JIRA_PROJECT,
    JIRA_TO_STATUS,
    JIRA_URL,
    STATUS_TO_JIRA,
    # Classes
    JiraClient,
    # Functions
    check_dependencies,
    extract_jira_key,
    get_client,
    get_jira_field,
    get_story_points,
    is_jira_cli_available,
    map_github_to_jira,
    map_jira_to_status,
    map_status_to_jira,
)

__all__ = [
    # Constants
    "GITHUB_TO_JIRA_MAP",
    "JIRA_PROJECT",
    "JIRA_TO_STATUS",
    "JIRA_URL",
    "STATUS_TO_JIRA",
    # Classes
    "JiraClient",
    # Functions
    "check_dependencies",
    "extract_jira_key",
    "get_client",
    "get_jira_field",
    "get_story_points",
    "is_jira_cli_available",
    "map_github_to_jira",
    "map_jira_to_status",
    "map_status_to_jira",
    # Submodules
    "bidirectional",
    "claim",
    "client",
    "create",
    "epic",
    "operations",
    "reconcile",
    "story",
    "sync",
    # CLI
    "cli",
    "main",
]
