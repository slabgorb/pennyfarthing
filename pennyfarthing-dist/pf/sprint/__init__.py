"""
Sprint management package for Pennyfarthing scripts.

This package provides:
- loader: Sprint YAML loading and parsing
- status: Sprint status operations
- work: Work session management
- archive: Story archiving

Usage:
    # Use the loader module
    from pf.sprint import load_sprint, find_epic
    sprint_data = load_sprint()
    epic = find_epic(sprint_data, "63")

    # Use CLI
    python -m pf.sprint <subcommand> [args]
"""

# Re-export from loader for backwards compatibility
# Import submodules to make them accessible
# CLI entry point - import module, not function, so "from sprint import cli" gets the module
from pf.sprint import (
    archive,
    cli,
    loader,
    status,
    work,
)
from pf.sprint.cli import main
from pf.sprint.loader import (
    find_epic,
    find_story,
    get_all_stories,
    get_epic_by_id,
    get_sprint_info,
    get_stories_by_status,
    get_story_by_id,
    get_story_field,
    load_current_sprint,
    load_sprint,
)

__all__ = [
    # Loader functions
    "find_epic",
    "find_story",
    "get_all_stories",
    "get_epic_by_id",
    "get_sprint_info",
    "get_stories_by_status",
    "get_story_by_id",
    "get_story_field",
    "load_current_sprint",
    "load_sprint",
    # Submodules
    "archive",
    "loader",
    "status",
    "work",
    # CLI
    "cli",
    "main",
]
