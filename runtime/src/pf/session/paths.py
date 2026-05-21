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

import re
from pathlib import Path
from typing import TypedDict

__all__ = [
    "MigrationResult",
    "canonical_session_path",
    "find_legacy_sessions",
    "migrate_legacy_sessions",
]


_SESSION_DIR_NAME = ".session"
_SPRINT_DIR_NAME = "sprint"
_SESSION_SUFFIX = "-session.md"

# Story IDs must contain only ASCII letters, digits, hyphen, and underscore.
# This blocks path traversal (`..`, `/`, `\`), null bytes (CWE-158),
# Windows drive letters (`C:foo`), and Unicode homoglyphs.
_STORY_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


class MigrationResult(TypedDict):
    """Result of a ``migrate_legacy_sessions`` invocation.

    - ``migrated``: legacy files relocated to the canonical path (or, in
      ``dry_run`` mode, that would be relocated).
    - ``cleaned``: legacy files removed because the canonical path already
      contained byte-identical content (or, in ``dry_run`` mode, that would
      be removed).
    - ``skipped``: legacy files left alone because the canonical path
      already contains DIFFERENT content. Caller must reconcile.
    - ``errors``: per-file failures encountered during migration. When this
      list is non-empty the run completed but is partial — some legacy
      files may remain unmigrated. Inspect the strings for context.
    """

    migrated: list[Path]
    cleaned: list[Path]
    skipped: list[str]
    errors: list[str]


def canonical_session_path(root: Path, story_id: str) -> Path:
    """Return the canonical session file path for ``story_id`` under ``root``.

    Always resolves to ``<root>/.session/<story_id>-session.md``.

    ``story_id`` must match ``[A-Za-z0-9_-]+`` (ASCII letters, digits,
    hyphen, underscore). This allowlist blocks path traversal (``..``,
    ``/``, ``\\``), null bytes (CWE-158), Windows drive letters
    (``C:foo``), and Unicode homoglyphs — collectively CWE-22 hardening.
    """
    if not story_id:
        raise ValueError("story_id must be non-empty")
    if not _STORY_ID_RE.match(story_id):
        raise ValueError(
            f"story_id must match [A-Za-z0-9_-]+; got {story_id!r}"
        )

    return Path(root) / _SESSION_DIR_NAME / f"{story_id}{_SESSION_SUFFIX}"


def find_legacy_sessions(root: Path) -> list[Path]:
    """Return session files mistakenly written to ``<root>/sprint/``.

    Only regular files (not symlinks — CWE-59) named ``*-session.md``
    directly under ``sprint/`` are returned. ``sprint/archive/`` is
    skipped (archive is the intentional home for archived sessions). If
    ``sprint/`` does not exist, returns an empty list.
    """
    sprint_dir = Path(root) / _SPRINT_DIR_NAME
    if not sprint_dir.is_dir():
        return []

    legacy: list[Path] = []
    for entry in sprint_dir.iterdir():
        # Skip symlinks first — `is_file()` follows symlinks, which would
        # allow an attacker-controlled symlink in sprint/ to redirect
        # cleanup or content-copy operations.
        if entry.is_symlink():
            continue
        if not entry.is_file():
            continue
        if not entry.name.endswith(_SESSION_SUFFIX):
            continue
        legacy.append(entry)
    return legacy


def migrate_legacy_sessions(
    root: Path, *, dry_run: bool = False
) -> MigrationResult:
    """Relocate legacy ``sprint/*-session.md`` files into ``.session/``.

    Per-file outcomes:

    - **Canonical does not exist**: the legacy file is moved. Reported
      under ``migrated``.
    - **Canonical exists, byte-identical**: the legacy duplicate is
      removed. Reported under ``cleaned``.
    - **Canonical exists, different content**: the legacy file is left
      in place and the conflict is reported under ``skipped``. Caller
      must reconcile.

    With ``dry_run=True`` the filesystem is not touched, but the same
    classifications are reported so callers can preview the plan.

    The migration is **idempotent** — a second invocation on the same
    tree is a no-op once all legacy files have been resolved.

    **Partial completion**: per-file failures (``OSError``,
    ``UnicodeDecodeError``, etc.) are caught and appended to ``errors``;
    the loop continues with the remaining files. A non-empty ``errors``
    list therefore signals that the run completed but did NOT process
    every legacy file — inspect the strings and retry as needed.
    """
    result: MigrationResult = {
        "migrated": [],
        "cleaned": [],
        "skipped": [],
        "errors": [],
    }

    legacy_files = find_legacy_sessions(root)
    if not legacy_files:
        return result

    canonical_dir = Path(root) / _SESSION_DIR_NAME

    for legacy in legacy_files:
        canonical = canonical_dir / legacy.name
        try:
            if canonical.exists():
                # True byte compare — avoids decoding either side, so
                # non-UTF-8 legacy files don't trip a UnicodeDecodeError
                # mid-loop.
                if legacy.read_bytes() == canonical.read_bytes():
                    # Safe duplicate — clean up the legacy copy.
                    if not dry_run:
                        legacy.unlink()
                    result["cleaned"].append(legacy)
                else:
                    # Conflict — leave both files, report it.
                    result["skipped"].append(
                        f"{legacy}: canonical {canonical} exists with different content"
                    )
                continue

            # Canonical does not exist: move legacy into place.
            if not dry_run:
                canonical_dir.mkdir(parents=True, exist_ok=True)
                # Byte copy preserves arbitrary content (any encoding).
                canonical.write_bytes(legacy.read_bytes())
                legacy.unlink()
            result["migrated"].append(legacy)
        except (OSError, UnicodeDecodeError) as exc:
            # UnicodeDecodeError is a ValueError subclass, NOT an OSError,
            # so it must be caught explicitly to keep one bad file from
            # aborting the whole migration.
            result["errors"].append(f"{legacy}: {exc}")

    return result
