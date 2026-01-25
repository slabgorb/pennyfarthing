"""
Sprint management package for Pennyfarthing scripts.

This package provides:
- loader: Sprint YAML loading and parsing
- status: Sprint status operations
- work: Work session management
- archive: Story archiving

Usage:
    # Use the loader module
    from pennyfarthing_scripts.sprint import load_sprint, find_epic
    sprint_data = load_sprint()
    epic = find_epic(sprint_data, "63")

    # Use CLI
    python -m pennyfarthing_scripts.sprint <subcommand> [args]
"""

# Re-export from loader for backwards compatibility
from pennyfarthing_scripts.sprint.loader import (
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

# Import submodules to make them accessible
from pennyfarthing_scripts.sprint import (
    archive,
    loader,
    status,
    work,
)

# CLI entry point - import module, not function, so "from sprint import cli" gets the module
from pennyfarthing_scripts.sprint import cli
from pennyfarthing_scripts.sprint.cli import main

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
