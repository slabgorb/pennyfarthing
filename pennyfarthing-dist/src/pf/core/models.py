"""
Core domain models for Pennyfarthing.

Story: PROJ-15422 - SprintContext dataclass
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SprintContext:
    """Unified sprint context — bundles all resolved sprint metadata.

    Fields:
        sprint_file: Absolute path to sprint YAML file
        context_root: Root directory for sprint context
        session_root: Root directory for session files
        repos: List of repository names in this sprint
        name: Human-readable sprint name
        type: Sprint type (orchestrator, focus, etc.)
        is_default: Whether this is the default sprint
    """

    sprint_file: str
    context_root: str
    session_root: str
    repos: list[str]
    name: str
    type: str
    is_default: bool
