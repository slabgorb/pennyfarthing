"""
Deterministic YAML I/O for sprint data.

Story: MSSCI-14254 - Core yaml_io module with deterministic serialization

Provides:
- read_sprint(path) -> CommentedMap (preserves ordering/comments)
- write_sprint(path, data) -> atomic write
- canonical_dump(data) -> deterministic YAML string
"""

from pathlib import Path
from typing import Any


# Canonical key ordering derived from sprint-template.yaml
SPRINT_KEY_ORDER: list[str] = [
    "name", "jira_sprint_id", "jira_sprint_name", "goal",
    "start_date", "end_date", "status",
]

EPIC_KEY_ORDER: list[str] = [
    "id", "type", "title", "description", "priority", "status",
    "repos", "jira", "points", "marker", "stories",
]

STORY_KEY_ORDER: list[str] = [
    "id", "jira", "title", "description", "points", "priority",
    "status", "in_sprint", "assigned_to", "started", "repos",
    "workflow", "acceptance_criteria", "completed", "pr",
    "delivered_in", "notes",
]


def read_sprint(path: Path) -> Any:
    """Read sprint YAML file preserving ordering and comments.

    Args:
        path: Path to sprint YAML file

    Returns:
        CommentedMap with preserved ordering and comments

    Raises:
        FileNotFoundError: If path doesn't exist
        ValueError: If YAML is malformed
    """
    raise NotImplementedError("read_sprint not implemented")


def write_sprint(path: Path, data: Any) -> None:
    """Write sprint data to YAML file atomically.

    Uses temp file + os.replace() for atomic writes on POSIX.

    Args:
        path: Destination path
        data: Sprint data (CommentedMap or dict)

    Raises:
        TypeError: If data is not a valid mapping type
        OSError: If write fails
    """
    raise NotImplementedError("write_sprint not implemented")


def canonical_dump(data: Any) -> str:
    """Serialize sprint data to deterministic YAML string.

    Applies:
    - Fixed key ordering per sprint-template.yaml
    - Block scalars (|) for multiline strings
    - 2-space indentation
    - No trailing whitespace

    Args:
        data: Sprint data (CommentedMap or dict)

    Returns:
        Deterministic YAML string
    """
    raise NotImplementedError("canonical_dump not implemented")
