"""Isolated, RUN_ID-keyed cache for ``testing-runner`` test results.

Background (gh #53): the ``testing-runner`` subagent used to write its
test-result summary to ``<root>/.session/<story_id>-session.md`` — the SAME
path as the live workflow session file. Run with the active story's
``STORY_ID`` (the normal case during a TDD GREEN/verify run) it overwrote the
live session, destroying the SM/TEA/Dev assessments, Delivery Findings, Design
Deviations and Workflow Tracking that the handoff gates parse. The session file
is gitignored, so the clobber was unrecoverable.

This module gives the runner a safe, separate namespace:

- ``test_run_cache_path`` — resolve ``<root>/.session/test-runs/<run_id>.md``.
  Keyed on the unique ``RUN_ID`` (not ``STORY_ID``), so concurrent or repeated
  runs of one story never collide with each other or with the live session.
- ``is_live_session_file`` — detect a live workflow session file, so callers
  never mistake one for a cache target.
- ``write_test_run_cache`` — write a run summary to the namespaced path and
  return a result object. As a defensive backstop it refuses to write if the
  resolved target is a live session file.

A thin ``python -m pf.session.test_cache <run_id>`` entrypoint lets the
bash-driven ``testing-runner`` agent route its cache through this single source
of truth instead of hand-rolling a path (SOUL #2, #11).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import TypedDict

from pf.common.config import get_project_root

__all__ = [
    "CacheWriteResult",
    "is_live_session_file",
    "main",
    "test_run_cache_path",
    "write_test_run_cache",
]


_SESSION_DIR_NAME = ".session"
_TEST_RUNS_DIR_NAME = "test-runs"
_CACHE_SUFFIX = ".md"

# RUN_IDs must contain only ASCII letters, digits, hyphen, and underscore.
# This blocks path traversal (`..`, `/`, `\`), null bytes (CWE-158),
# Windows drive letters (`C:foo`), and Unicode homoglyphs — same allowlist as
# pf.session.paths so the two stay consistent.
_RUN_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# A live workflow session file carries YAML frontmatter with a ``story_id:``
# key, or at least one agent assessment heading (``## ... Assessment``).
_ASSESSMENT_HEADING_RE = re.compile(r"(?m)^##\s+.*\bAssessment\b")
_FRONTMATTER_STORY_ID_RE = re.compile(r"(?m)^story_id:")


class CacheWriteResult(TypedDict, total=False):
    """Result of a ``write_test_run_cache`` call (SOUL #10).

    - ``success``: True iff the summary was written.
    - ``path``: the cache file written (present on success).
    - ``error``: human-readable failure reason (present on failure).
    """

    success: bool
    path: Path
    error: str


def test_run_cache_path(root: Path, run_id: str) -> Path:
    """Return the cache file path for ``run_id`` under ``root``.

    Always resolves to ``<root>/.session/test-runs/<run_id>.md`` — never the
    live session file ``<root>/.session/<story_id>-session.md``.

    ``run_id`` must match ``[A-Za-z0-9_-]+`` (ASCII letters, digits, hyphen,
    underscore); anything else raises ``ValueError`` (rejects path traversal,
    NUL bytes, etc.).
    """
    if not run_id:
        raise ValueError("run_id must be non-empty")
    if not _RUN_ID_RE.match(run_id):
        raise ValueError(f"run_id must match [A-Za-z0-9_-]+; got {run_id!r}")

    return (
        Path(root) / _SESSION_DIR_NAME / _TEST_RUNS_DIR_NAME / f"{run_id}{_CACHE_SUFFIX}"
    )


def is_live_session_file(path: Path) -> bool:
    """Return True if ``path`` is an existing live workflow session file.

    A live session has ``story_id:`` frontmatter or an ``## ... Assessment``
    heading. Missing/unreadable files and plain test-result caches return False.
    """
    p = Path(path)
    if not p.is_file():
        return False
    try:
        content = p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False

    return bool(
        _FRONTMATTER_STORY_ID_RE.search(content)
        or _ASSESSMENT_HEADING_RE.search(content)
    )


def write_test_run_cache(root: Path, run_id: str, content: str) -> CacheWriteResult:
    """Write ``content`` to the namespaced cache path for ``run_id``.

    Returns a result object instead of raising (SOUL #10). Creates the
    ``test-runs/`` parent directory as needed. As a defensive backstop, refuses
    to write if the resolved target is a live workflow session file — the
    namespacing already guarantees it never is, but the guard means a future
    caller cannot reintroduce the gh #53 clobber.
    """
    try:
        target = test_run_cache_path(root, run_id)
    except ValueError as exc:
        return {"success": False, "error": str(exc)}

    if is_live_session_file(target):
        return {
            "success": False,
            "error": (
                f"refusing to overwrite live session file: {target}. "
                "Test-result caches must use a test-runs/ path."
            ),
        }

    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    except OSError as exc:
        return {"success": False, "error": f"failed to write {target}: {exc}"}

    return {"success": True, "path": target}


def main(argv: list[str] | None = None) -> int:
    """``python -m pf.session.test_cache <run_id>`` — write stdin to the cache.

    Reads the run summary from stdin, writes it to the RUN_ID-keyed cache under
    the resolved project root, and prints the cache path on success. Returns a
    non-zero exit code (and writes to stderr) on failure, per SOUL #10.
    """
    import argparse

    parser = argparse.ArgumentParser(
        prog="pf.session.test_cache",
        description="Write a testing-runner result summary to an isolated, "
        "RUN_ID-keyed cache (never the live session file).",
    )
    parser.add_argument("run_id", help="Unique RUN_ID for this test run")
    args = parser.parse_args(argv)

    content = sys.stdin.read()
    result = write_test_run_cache(get_project_root(), args.run_id, content)

    if result.get("success"):
        print(result["path"])
        return 0

    print(f"error: {result.get('error')}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
