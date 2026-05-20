"""Canonical session-file path helpers and legacy migration.

The canonical location for an active session file is
``<project_root>/.session/<story_id>-session.md``.

Historically, ``sm-setup`` sometimes wrote session files to
``<project_root>/sprint/<story_id>-session.md``. This module provides:

- ``canonical_session_path`` — resolve the correct path for a story id.
- ``find_legacy_sessions`` — surface files written to the wrong location.
- ``migrate_legacy_sessions`` — relocate them, idempotently and
  non-destructively.

Sprint archive files (``sprint/archive/*-session.md``) are intentional and
left alone.
"""

from __future__ import annotations

from pathlib import Path


_SESSION_DIR_NAME = ".session"
_SPRINT_DIR_NAME = "sprint"
_ARCHIVE_DIR_NAME = "archive"
_SESSION_SUFFIX = "-session.md"


def canonical_session_path(root: Path, story_id: str) -> Path:
    """Return the canonical session file path for ``story_id`` under ``root``.

    Always resolves to ``<root>/.session/<story_id>-session.md``.

    Rejects empty story ids and any id containing path-traversal characters
    (``/``, ``\\``, ``..``) — CWE-22.
    """
    if not story_id:
        raise ValueError("story_id must be non-empty")
    if ".." in story_id or "/" in story_id or "\\" in story_id:
        raise ValueError(f"story_id contains illegal path characters: {story_id!r}")

    return Path(root) / _SESSION_DIR_NAME / f"{story_id}{_SESSION_SUFFIX}"


def find_legacy_sessions(root: Path) -> list[Path]:
    """Return session files mistakenly written to ``<root>/sprint/``.

    Only files matching ``*-session.md`` directly under ``sprint/`` are
    returned. ``sprint/archive/`` is skipped (archive is the intentional
    home for archived sessions). If ``sprint/`` does not exist, returns
    an empty list.
    """
    sprint_dir = Path(root) / _SPRINT_DIR_NAME
    if not sprint_dir.is_dir():
        return []

    legacy: list[Path] = []
    for entry in sprint_dir.iterdir():
        if not entry.is_file():
            continue
        if not entry.name.endswith(_SESSION_SUFFIX):
            continue
        legacy.append(entry)
    return legacy


def migrate_legacy_sessions(root: Path, *, dry_run: bool = False) -> dict:
    """Relocate legacy ``sprint/*-session.md`` files into ``.session/``.

    Idempotent and non-destructive:

    - If the canonical path does not exist, the legacy file is moved.
    - If the canonical path exists with identical content, the legacy
      duplicate is removed (cleanup).
    - If the canonical path exists with different content, the legacy
      file is left in place and reported under ``skipped``.

    With ``dry_run=True`` the filesystem is not touched, but planned
    migrations are still reported.

    Returns a dict with keys ``migrated``, ``skipped``, ``errors``
    (each a list of strings/Paths).
    """
    result: dict[str, list] = {"migrated": [], "skipped": [], "errors": []}

    legacy_files = find_legacy_sessions(root)
    if not legacy_files:
        return result

    canonical_dir = Path(root) / _SESSION_DIR_NAME

    for legacy in legacy_files:
        canonical = canonical_dir / legacy.name
        try:
            if canonical.exists():
                # Compare content byte-for-byte using utf-8 to match how the
                # files are written.
                legacy_content = legacy.read_text(encoding="utf-8")
                canonical_content = canonical.read_text(encoding="utf-8")
                if legacy_content == canonical_content:
                    # Safe duplicate — clean up the legacy copy.
                    if not dry_run:
                        legacy.unlink()
                    result["migrated"].append(legacy)
                else:
                    # Conflict — leave both files, report it.
                    result["skipped"].append(
                        f"{legacy}: canonical {canonical} exists with different content"
                    )
                continue

            # Canonical does not exist: move legacy into place.
            if not dry_run:
                canonical_dir.mkdir(parents=True, exist_ok=True)
                content = legacy.read_text(encoding="utf-8")
                canonical.write_text(content, encoding="utf-8")
                legacy.unlink()
            result["migrated"].append(legacy)
        except OSError as exc:
            result["errors"].append(f"{legacy}: {exc}")

    return result
