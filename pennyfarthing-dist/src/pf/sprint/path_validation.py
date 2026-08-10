"""Shared path-traversal guard for sprint archive filenames (CWE-22, 155-7).

Centralises the charset + containment checks that were originally inlined in
``archive_epic.py::get_archive_path``.  All sites that interpolate a
user-controlled or metadata-derived string into a sprint archive filename
(epic shard refs, sprint ids) must route through one of these functions.

Functions raise ``ValueError`` on invalid input (fail-closed) and return the
ref unchanged on success so callers can use them inline::

    ref = validate_shard_filename(raw_ref)
    sprint_id = validate_sprint_id(raw_sprint_id)
"""

from __future__ import annotations

import re

_SAFE_CHARSET = re.compile(r"[A-Za-z0-9._-]+")
_INVALID_MSG = (
    "Invalid ref {ref!r}: only [A-Za-z0-9._-] characters "
    "(and no '..') are allowed. Traversal or unsafe characters detected."
)


def _validate_ref(ref: str, label: str) -> str:
    """Core validation: charset fullmatch + explicit '..' rejection.

    Args:
        ref: The string to validate.
        label: Human-readable label for error messages (e.g. 'sprint id').

    Returns:
        *ref* unchanged when valid.

    Raises:
        ValueError: When *ref* contains characters outside ``[A-Za-z0-9._-]``,
            contains ``..``, or is empty.
    """
    if not ref:
        raise ValueError(f"Invalid {label} {ref!r}: must not be empty.")

    if not _SAFE_CHARSET.fullmatch(ref):
        raise ValueError(
            f"Invalid {label} {ref!r}: only [A-Za-z0-9._-] characters are allowed. "
            "Traversal or unsafe characters detected."
        )

    if ".." in ref:
        raise ValueError(
            f"Invalid {label} {ref!r}: '..' parent reference is not allowed. "
            "Traversal attempt detected."
        )

    return ref


def validate_shard_filename(ref: str) -> str:
    """Validate an epic shard filename ref (the stem used in ``epic-{ref}.yaml``).

    Args:
        ref: Raw epic reference string (e.g. ``"164"``, ``"OP-42"``).

    Returns:
        *ref* unchanged when valid.

    Raises:
        ValueError: When *ref* contains traversal characters or patterns.
    """
    return _validate_ref(ref, "shard filename ref")


def validate_sprint_id(sprint_id: str) -> str:
    """Validate a sprint id used in archive filenames (``sprint-{id}-completed.yaml``).

    Args:
        sprint_id: Raw sprint id string (e.g. ``"2607"``, ``"release-1.0"``).

    Returns:
        *sprint_id* unchanged when valid.

    Raises:
        ValueError: When *sprint_id* contains traversal characters or patterns.
    """
    return _validate_ref(sprint_id, "sprint id")
