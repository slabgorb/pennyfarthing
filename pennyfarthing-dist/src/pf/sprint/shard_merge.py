"""Canonical shard merging for sprint YAML files.

Provides a single merge_epic_shards() implementation used by both:
- yaml_io.py (ruamel.yaml, preserves comments/ordering)
- loader.py (yaml.safe_load, plain dicts)

The caller passes a `load_file` callable so each consumer keeps
its preferred YAML library.
"""

import warnings
from collections.abc import Callable, Iterator, Mapping
from pathlib import Path
from typing import Any

from pf.sprint.path_validation import validate_shard_filename


def is_safe_shard_path(candidate: Path, base_dir: Path) -> bool:
    """Return True if ``candidate`` resolves to a path inside ``base_dir``.

    Guards against path traversal (CWE-22). Epic refs read from sprint YAML are
    interpolated into shard paths (``epic-{ref}.yaml``); a crafted ref — e.g.
    one routed through a symlink that lives inside the sprint directory — can
    escape ``base_dir`` and cause an out-of-bounds read. ``resolve()`` is used so
    symlink traversal is caught (a purely lexical ``..`` check would not be).

    On any resolution error the path is treated as unsafe (fail closed).

    DELIBERATE DEFERRAL — TOCTOU / ``O_NOFOLLOW`` (story 162-44, Deliverable E):
    this is a check-then-open containment test, so an attacker who can swap a
    symlink between ``resolve()`` here and the caller's ``open()``/``unlink()``
    defeats it. That is accepted for now: the threat model is *local,
    metadata-derived refs* (epic ids and shard names read out of sprint YAML),
    not a concurrent attacker holding write access to the sprint directory.
    Closing the race would require ``O_NOFOLLOW`` plus ``openat()`` against a
    held directory fd (or re-verifying containment via ``os.fstat`` after open)
    and threading a file-descriptor API through every call site — tracked as a
    follow-up story rather than scope creep here.
    """
    try:
        return candidate.resolve().is_relative_to(base_dir.resolve())
    except (OSError, ValueError, RuntimeError):
        return False


def safe_ref_path(
    base_dir: Path,
    ref: str,
    *,
    prefix: str = "epic-",
    suffix: str = ".yaml",
) -> Path:
    """Build ``base_dir/{prefix}{ref}{suffix}``, fail-closed on traversal.

    The one guarded replacement for every raw ``base_dir / f"epic-{ref}.yaml"``
    interpolation. Applies BOTH layers of the convention:

    1. charset — :func:`~pf.sprint.path_validation.validate_shard_filename`
       (``[A-Za-z0-9._-]``, no ``..``, non-empty);
    2. containment — :func:`is_safe_shard_path` on the built path, which catches
       a charset-clean ref whose shard file is a symlink pointing outside
       ``base_dir``.

    Args:
        base_dir: Directory the built path must stay inside.
        ref: Raw, possibly hostile ref (epic id, jira key, initiative slug).
        prefix: Filename prefix (``epic-``, ``initiative-``, ``context-epic-``).
        suffix: Filename suffix (``.yaml``, ``.md``).

    Returns:
        The built path (unresolved, so it compares equal to the raw
        interpolation it replaces).

    Raises:
        ValueError: When *ref* fails the charset check or the built path
            escapes *base_dir*. Callers whose contract is a result object must
            translate this to ``{"success": False, "error": ...}``.
    """
    validate_shard_filename(str(ref))
    candidate = Path(base_dir) / f"{prefix}{ref}{suffix}"
    if not is_safe_shard_path(candidate, Path(base_dir)):
        raise ValueError(
            f"Invalid shard filename ref {ref!r}: {candidate} escapes {base_dir}. "
            "Traversal attempt detected."
        )
    return candidate


def safe_shards(base_dir: Path, pattern: str = "epic-*.yaml") -> Iterator[Path]:
    """Yield the shard files matching ``pattern`` in ``base_dir`` that are contained.

    The guarded replacement for every raw ``base_dir.glob("epic-*.yaml")`` read
    loop. A glob match is a *name* match, so an in-dir symlink pointing outside
    ``base_dir`` matches happily; such entries are skipped and each skip is
    surfaced with :func:`warnings.warn` (never silently swallowed).

    A missing ``base_dir`` yields nothing rather than raising — several call
    sites glob archive directories that may not exist yet.

    Args:
        base_dir: Directory to glob.
        pattern: Glob pattern (``epic-*.yaml``, ``initiative-*.yaml``,
            ``sprint-*-completed.yaml``).

    Yields:
        Contained matches, sorted by path.
    """
    base = Path(base_dir)
    try:
        matches = sorted(base.glob(pattern))
    except (OSError, ValueError):
        return
    for match in matches:
        if not is_safe_shard_path(match, base):
            warnings.warn(
                f"Shard {match.name} escapes {base} ({match}) — skipping",
                stacklevel=2,
            )
            continue
        yield match


def merge_epic_shards(
    data: Any,
    sprint_dir: Path,
    *,
    load_file: Callable[[Path], Any],
    make_list: Callable[[], Any] | None = None,
) -> Any:
    """Merge sharded epic files into sprint data.

    When the epics list contains string references (e.g. "PROJ-14298"
    or "epic-40"), loads each epic-{ref}.yaml shard and replaces the
    string with the full epic data.

    Also detects unindexed shard files on disk. Shards owned by
    initiatives (initiative-*.yaml) are silently skipped; truly
    orphaned shards emit a warning.

    Args:
        data: Sprint data with possible string refs in epics.
        sprint_dir: Directory containing shard files.
        load_file: Callable that reads a YAML file and returns parsed data.
            For ruamel.yaml callers this returns CommentedMap;
            for yaml.safe_load callers this returns plain dicts.
        make_list: Optional callable returning an empty list-like container.
            Defaults to ``list``. Pass ``CommentedSeq`` for ruamel.yaml.

    Returns:
        Sprint data with full epic dicts merged in.
    """
    epics = data.get("epics", [])
    if not epics or not isinstance(epics[0], str):
        return data

    if make_list is None:
        make_list = list

    loaded_shard_files: set[Path] = set()
    loaded_epic_ids: set[str] = set()
    merged_epics = make_list()

    for ref in epics:
        if not isinstance(ref, str):
            merged_epics.append(ref)
            continue

        shard_file = sprint_dir / f"epic-{ref}.yaml"
        if not is_safe_shard_path(shard_file, sprint_dir):
            warnings.warn(
                f"Sprint epic ref '{ref}' escapes the sprint directory "
                f"({shard_file}) — skipping",
                stacklevel=2,
            )
            continue
        if shard_file.exists():
            try:
                epic_data = load_file(shard_file)
            except Exception:
                warnings.warn(
                    f"Failed to load shard {shard_file.name}",
                    stacklevel=2,
                )
                continue

            if epic_data is None:
                continue

            merged_epics.append(epic_data)
            loaded_shard_files.add(shard_file.resolve())

            eid = str(epic_data.get("id", "")).replace("epic-", "")
            if eid:
                loaded_epic_ids.add(eid)
            jira_key = str(epic_data.get("jira", ""))
            if jira_key:
                loaded_epic_ids.add(jira_key)
        else:
            warnings.warn(
                f"Sprint epic ref '{ref}' not found: {shard_file}",
                stacklevel=2,
            )

    # Collect epic refs owned by initiatives so we don't warn about them.
    initiative_refs: set[str] = set()
    for init_file in sorted(sprint_dir.glob("initiative-*.yaml")):
        if not is_safe_shard_path(init_file, sprint_dir):
            warnings.warn(
                f"Initiative shard {init_file.name} escapes the sprint directory "
                f"({init_file}) — skipping",
                stacklevel=2,
            )
            continue
        try:
            init_data = load_file(init_file)
        except Exception:
            continue
        if init_data and isinstance(init_data, Mapping):
            for ref in init_data.get("epics", []):
                if isinstance(ref, str):
                    initiative_refs.add(ref)
                    initiative_refs.add(ref.replace("epic-", ""))

    # Warn about truly orphaned shard files (not in index, not in initiatives).
    for shard_file in sorted(sprint_dir.glob("epic-*.yaml")):
        if not is_safe_shard_path(shard_file, sprint_dir):
            warnings.warn(
                f"Sprint shard {shard_file.name} escapes the sprint directory "
                f"({shard_file}) — skipping",
                stacklevel=2,
            )
            continue
        if shard_file.resolve() in loaded_shard_files:
            continue
        try:
            epic_data = load_file(shard_file)
        except Exception:
            continue
        if epic_data is None or not isinstance(epic_data, Mapping) or "id" not in epic_data:
            continue
        eid = str(epic_data.get("id", "")).replace("epic-", "")
        jira_key = str(epic_data.get("jira", ""))
        if eid in loaded_epic_ids or (jira_key and jira_key in loaded_epic_ids):
            continue
        if eid in initiative_refs or jira_key in initiative_refs:
            continue
        warnings.warn(
            f"Unindexed shard {shard_file.name} (epic {eid}) not in epics list — skipping",
            stacklevel=2,
        )

    data["epics"] = merged_epics
    return data


def detect_orphan_shards(
    data: Any,
    sprint_dir: Path,
    *,
    load_file: Callable[[Path], Any],
) -> list[dict[str, str]]:
    """Detect orphaned epic shard files not referenced by the sprint index.

    Returns structured orphan entries instead of emitting warnings.
    Skips shards owned by initiatives.

    Args:
        data: Sprint data after merging (with full epic dicts in epics list).
        sprint_dir: Directory containing shard files.
        load_file: Callable that reads a YAML file and returns parsed data.

    Returns:
        List of orphan dicts with id, jira, file, and reason fields.
    """
    loaded_epic_ids: set[str] = set()
    loaded_shard_files: set[Path] = set()

    for epic in data.get("epics", []):
        if not isinstance(epic, Mapping):
            continue
        eid = str(epic.get("id", "")).replace("epic-", "")
        if eid:
            loaded_epic_ids.add(eid)
        jira_key = str(epic.get("jira", ""))
        if jira_key:
            loaded_epic_ids.add(jira_key)
        # Reconstruct which shard files were loaded
        for ref in (eid, jira_key):
            if ref:
                shard_file = sprint_dir / f"epic-{ref}.yaml"
                if not is_safe_shard_path(shard_file, sprint_dir):
                    warnings.warn(
                        f"Sprint epic ref '{ref}' escapes the sprint directory "
                        f"({shard_file}) — skipping",
                        stacklevel=2,
                    )
                    continue
                if shard_file.exists():
                    loaded_shard_files.add(shard_file.resolve())

    # Collect initiative-owned refs
    initiative_refs: set[str] = set()
    for init_file in sorted(sprint_dir.glob("initiative-*.yaml")):
        if not is_safe_shard_path(init_file, sprint_dir):
            warnings.warn(
                f"Initiative shard {init_file.name} escapes the sprint directory "
                f"({init_file}) — skipping",
                stacklevel=2,
            )
            continue
        try:
            init_data = load_file(init_file)
        except Exception:
            continue
        if init_data and isinstance(init_data, Mapping):
            for ref in init_data.get("epics", []):
                if isinstance(ref, str):
                    initiative_refs.add(ref)
                    initiative_refs.add(ref.replace("epic-", ""))

    orphans: list[dict[str, str]] = []
    for shard_file in sorted(sprint_dir.glob("epic-*.yaml")):
        if not is_safe_shard_path(shard_file, sprint_dir):
            warnings.warn(
                f"Sprint shard {shard_file.name} escapes the sprint directory "
                f"({shard_file}) — skipping",
                stacklevel=2,
            )
            continue
        if shard_file.resolve() in loaded_shard_files:
            continue
        try:
            epic_data = load_file(shard_file)
        except Exception:
            continue
        if epic_data is None or not isinstance(epic_data, Mapping) or "id" not in epic_data:
            continue
        eid = str(epic_data.get("id", "")).replace("epic-", "")
        jira_key = str(epic_data.get("jira", ""))
        if eid in loaded_epic_ids or (jira_key and jira_key in loaded_epic_ids):
            continue
        if eid in initiative_refs or jira_key in initiative_refs:
            continue
        entry: dict[str, str] = {
            "id": str(epic_data.get("id", "")),
            "file": shard_file.name,
            "reason": "unindexed (not in current-sprint.yaml, not in initiative shards)",
        }
        if jira_key:
            entry["jira"] = jira_key
        orphans.append(entry)

    return orphans
