"""
Deterministic YAML I/O for sprint data.

Story: MSSCI-14254 - Core yaml_io module with deterministic serialization

Provides:
- read_sprint(path) -> CommentedMap (preserves ordering/comments)
- write_sprint(path, data) -> atomic write
- canonical_dump(data) -> deterministic YAML string
"""

import io
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.scalarstring import LiteralScalarString


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

# Top-level key ordering
TOP_KEY_ORDER: list[str] = ["sprint", "epics", "stories"]


def _make_yaml() -> YAML:
    """Create a configured ruamel.yaml instance."""
    yml = YAML()
    yml.preserve_quotes = True
    yml.default_flow_style = False
    yml.indent(mapping=2, sequence=4, offset=2)
    yml.width = 4096  # Prevent line wrapping
    return yml


def read_sprint(path: Path) -> CommentedMap:
    """Read sprint YAML file preserving ordering and comments.

    Args:
        path: Path to sprint YAML file

    Returns:
        CommentedMap with preserved ordering and comments

    Raises:
        FileNotFoundError: If path doesn't exist
        ValueError: If YAML is malformed or empty
    """
    if not path.exists():
        raise FileNotFoundError(f"Sprint YAML file not found: {path}")

    yml = _make_yaml()
    try:
        with open(path) as f:
            data = yml.load(f)
    except Exception as e:
        raise ValueError(f"Failed to parse YAML: {e}") from e

    if data is None:
        raise ValueError(f"Empty YAML file: {path}")

    return data


def _sort_mapping(data: CommentedMap, key_order: list[str]) -> CommentedMap:
    """Reorder keys in a CommentedMap according to key_order.

    Known keys appear in template order, unknown keys are appended at the end.
    """
    result = CommentedMap()
    # First, add known keys in order
    for key in key_order:
        if key in data:
            result[key] = data[key]
    # Then add any unknown keys at the end
    for key in data:
        if key not in key_order:
            result[key] = data[key]
    return result


def _ensure_block_scalars(data: Any) -> Any:
    """Convert multiline strings to block scalar style recursively."""
    if isinstance(data, CommentedMap):
        result = CommentedMap()
        for key, value in data.items():
            result[key] = _ensure_block_scalars(value)
        return result
    elif isinstance(data, (list, CommentedSeq)):
        result_list = CommentedSeq()
        for item in data:
            result_list.append(_ensure_block_scalars(item))
        return result_list
    elif isinstance(data, str) and "\n" in data:
        return LiteralScalarString(data)
    return data


def _canonicalize(data: Any) -> Any:
    """Apply canonical ordering and formatting to sprint data recursively."""
    if not isinstance(data, Mapping):
        return data

    # Determine which key order to use based on context
    # Top level
    result = _sort_mapping(
        data if isinstance(data, CommentedMap) else _to_commented_map(data),
        TOP_KEY_ORDER,
    )

    # Reorder sprint section
    if "sprint" in result and isinstance(result["sprint"], Mapping):
        sprint_cm = (
            result["sprint"]
            if isinstance(result["sprint"], CommentedMap)
            else _to_commented_map(result["sprint"])
        )
        result["sprint"] = _sort_mapping(sprint_cm, SPRINT_KEY_ORDER)

    # Reorder epics and their stories
    if "epics" in result and isinstance(result["epics"], (list, CommentedSeq)):
        new_epics = CommentedSeq()
        for epic in result["epics"]:
            if isinstance(epic, Mapping):
                epic_cm = (
                    epic if isinstance(epic, CommentedMap) else _to_commented_map(epic)
                )
                sorted_epic = _sort_mapping(epic_cm, EPIC_KEY_ORDER)

                # Reorder stories within epic
                if "stories" in sorted_epic and isinstance(
                    sorted_epic["stories"], (list, CommentedSeq)
                ):
                    new_stories = CommentedSeq()
                    for story in sorted_epic["stories"]:
                        if isinstance(story, Mapping):
                            story_cm = (
                                story
                                if isinstance(story, CommentedMap)
                                else _to_commented_map(story)
                            )
                            new_stories.append(
                                _sort_mapping(story_cm, STORY_KEY_ORDER)
                            )
                        else:
                            new_stories.append(story)
                    sorted_epic["stories"] = new_stories

                new_epics.append(sorted_epic)
            else:
                new_epics.append(epic)
        result["epics"] = new_epics

    # Apply block scalars to multiline strings
    result = _ensure_block_scalars(result)

    return result


def _to_commented_map(data: Mapping) -> CommentedMap:
    """Convert a plain dict to CommentedMap recursively."""
    result = CommentedMap()
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = _to_commented_map(value)
        elif isinstance(value, list):
            seq = CommentedSeq()
            for item in value:
                if isinstance(item, dict):
                    seq.append(_to_commented_map(item))
                else:
                    seq.append(item)
            result[key] = seq
        else:
            result[key] = value
    return result


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
    canonicalized = _canonicalize(data)

    yml = _make_yaml()
    stream = io.StringIO()
    yml.dump(canonicalized, stream)
    output = stream.getvalue()

    # Strip trailing whitespace from each line
    lines = output.split("\n")
    cleaned = [line.rstrip() for line in lines]
    result = "\n".join(cleaned)

    # Ensure exactly one trailing newline
    result = result.rstrip("\n") + "\n"

    return result


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
    if not isinstance(data, Mapping):
        raise TypeError(f"Expected mapping type, got {type(data).__name__}")

    output = canonical_dump(data)

    tmp_path = path.with_suffix(".yaml.tmp")
    try:
        with open(tmp_path, "w") as f:
            f.write(output)
        os.replace(tmp_path, path)
    except Exception:
        # Clean up temp file if it exists
        if tmp_path.exists():
            tmp_path.unlink()
        raise
