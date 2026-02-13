"""
Deterministic YAML I/O for sprint data.

Story: MSSCI-14254 - Core yaml_io module with deterministic serialization

Provides:
- read_sprint(path) -> CommentedMap (preserves ordering/comments, merges shards)
- write_sprint(path, data) -> atomic write (shard-aware)
- canonical_dump(data) -> deterministic YAML string
"""

import io
import os
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.scalarstring import LiteralScalarString

JIRA_PATTERN = re.compile(r"^MSSCI-\d{5}$")


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


def _read_yaml_file(path: Path) -> CommentedMap:
    """Read a single YAML file preserving ordering and comments.

    Args:
        path: Path to YAML file

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


def read_sprint(path: Path) -> CommentedMap:
    """Read sprint YAML file, merging sharded epic files.

    When the epics list contains string references (sharded format),
    loads each epic-{ref}.yaml shard file and replaces the strings
    with full epic CommentedMaps.

    Also discovers unindexed shard files on disk (epic-*.yaml files not
    referenced in the epics list) and appends them so orphan shards are
    never invisible to the CLI.

    Args:
        path: Path to sprint YAML index file

    Returns:
        CommentedMap with full epic data merged in

    Raises:
        FileNotFoundError: If path doesn't exist
        ValueError: If YAML is malformed or empty
    """
    data = _read_yaml_file(path)

    epics = data.get("epics", [])
    if not epics or not isinstance(epics[0], str):
        return data

    sprint_dir = path.parent

    # Track loaded epic identities to prevent duplicates
    loaded_shard_files: set[Path] = set()
    loaded_epic_ids: set[str] = set()
    merged_epics = CommentedSeq()
    for ref in epics:
        if isinstance(ref, str):
            shard_file = sprint_dir / f"epic-{ref}.yaml"
            if shard_file.exists():
                epic_data = _read_yaml_file(shard_file)
                merged_epics.append(epic_data)
                loaded_shard_files.add(shard_file.resolve())
                # Track both id and jira key (normalized) for dedup
                eid = str(epic_data.get("id", "")).replace("epic-", "")
                if eid:
                    loaded_epic_ids.add(eid)
                jira_key = str(epic_data.get("jira", ""))
                if jira_key:
                    loaded_epic_ids.add(jira_key)
        else:
            merged_epics.append(ref)

    # Log unindexed shard files on disk (but do NOT auto-merge them —
    # orphan shards may belong to future initiatives and should not be
    # pulled into the current sprint automatically).
    for shard_file in sorted(sprint_dir.glob("epic-*.yaml")):
        if shard_file.resolve() in loaded_shard_files:
            continue
        try:
            epic_data = _read_yaml_file(shard_file)
        except (FileNotFoundError, ValueError):
            continue
        if not isinstance(epic_data, Mapping) or "id" not in epic_data:
            continue
        eid = str(epic_data.get("id", "")).replace("epic-", "")
        jira_key = str(epic_data.get("jira", ""))
        if eid in loaded_epic_ids or (jira_key and jira_key in loaded_epic_ids):
            continue
        # Warn but don't merge — these are intentionally excluded
        import sys
        print(
            f"  NOTE: Unindexed shard {shard_file.name} (epic {eid}) "
            f"not in epics list — skipping",
            file=sys.stderr,
        )

    data["epics"] = merged_epics
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


def _get_epic_ref(epic: Mapping) -> str:
    """Get the canonical reference ID for an epic shard file.

    Priority: Jira key > numeric ID extracted from epic-N > raw ID.
    Strips 'epic-' prefix from IDs to prevent double-prefix filenames
    (e.g., epic-epic-94.yaml). See ADR-0022.
    """
    jira = epic.get("jira")
    epic_id = str(epic.get("id", ""))

    if jira and JIRA_PATTERN.match(str(jira)):
        return str(jira)
    if JIRA_PATTERN.match(epic_id):
        return epic_id

    # Strip epic- prefix to prevent double-prefix filenames
    # e.g., "epic-94" -> "94" so file becomes "epic-94.yaml" not "epic-epic-94.yaml"
    stripped = epic_id
    while stripped.startswith("epic-"):
        stripped = stripped[5:]
    return stripped or epic_id


def _write_yaml_file(path: Path, data: Any) -> None:
    """Write data to a single YAML file atomically.

    Uses temp file + os.replace() for atomic writes on POSIX.
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
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def _is_sharded_on_disk(path: Path) -> bool:
    """Check if the on-disk index file uses sharded epic references."""
    if not path.exists():
        return False
    yml = _make_yaml()
    try:
        with open(path) as f:
            on_disk = yml.load(f)
    except Exception:
        return False
    if on_disk is None or not isinstance(on_disk, Mapping):
        return False
    epics = on_disk.get("epics", [])
    return bool(epics) and isinstance(epics[0], str)


def write_sprint(path: Path, data: Any) -> None:
    """Write sprint data to YAML file(s) atomically.

    If the on-disk index uses sharded format (epics as string refs),
    writes each epic to its shard file and the index with string refs.
    Otherwise writes the full data to a single file.

    Args:
        path: Destination path (the index file)
        data: Sprint data (CommentedMap or dict)

    Raises:
        TypeError: If data is not a valid mapping type
        OSError: If write fails
    """
    if not isinstance(data, Mapping):
        raise TypeError(f"Expected mapping type, got {type(data).__name__}")

    if not _is_sharded_on_disk(path):
        _write_yaml_file(path, data)
        return

    # Sharded write: each epic goes to its own file
    sprint_dir = path.parent
    epic_refs = CommentedSeq()

    for epic in data.get("epics", []):
        if isinstance(epic, Mapping):
            ref = _get_epic_ref(epic)
            shard_file = sprint_dir / f"epic-{ref}.yaml"
            _write_yaml_file(shard_file, epic)
            epic_refs.append(ref)
        else:
            epic_refs.append(epic)

    # Write index with string refs instead of full epic dicts
    index = CommentedMap()
    for key in data:
        if key == "epics":
            index["epics"] = epic_refs
        else:
            index[key] = data[key]

    _write_yaml_file(path, index)
