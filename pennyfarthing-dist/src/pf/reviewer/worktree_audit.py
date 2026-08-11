"""Working-tree audit for reviewer mutation-testing subagents.

Provides a mechanical check that the live working tree has no unexpected source
changes after reviewer subagents run. Catches a left-behind mutation (the 162-48
incident: reviewer-test-analyzer deleted a guard clause and never restored it).

Usage:
    from pf.reviewer.worktree_audit import check_working_tree_clean

    result = check_working_tree_clean()
    if not result["success"]:
        # FAIL LOUD — mutation left in working tree
        print(result["dirty_files"])

CLI exposure: ``pf reviewer audit-tree``
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def check_working_tree_clean(cwd: Path | None = None) -> dict:
    """Check whether the git working tree has unexpected source changes.

    Runs ``git status --porcelain`` and reports any modified, deleted, added, or
    untracked files.  A non-empty result means a subagent left a mutation applied
    to the live tree — the caller must FAIL LOUD.

    Args:
        cwd: Directory to run the check in.  Defaults to ``Path.cwd()``.

    Returns:
        ``{success: bool, dirty_files: list[str], error: str | None}``

        - ``success`` is ``True`` only when the tree is perfectly clean.
        - ``dirty_files`` is the list of ``<XY> <path>`` lines from
          ``git status --porcelain``.  Empty when ``success`` is ``True``.
        - ``error`` is set (and ``success`` is ``False``) when the git command
          itself fails (not a git repo, git not installed, etc.).
    """
    work_dir = Path(cwd) if cwd is not None else Path.cwd()

    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=work_dir,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return {
            "success": False,
            "dirty_files": [],
            "error": "git executable not found",
        }

    if result.returncode != 0:
        stderr = result.stderr.strip()
        return {
            "success": False,
            "dirty_files": [],
            "error": stderr or f"git status exited {result.returncode}",
        }

    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if lines:
        return {
            "success": False,
            "dirty_files": lines,
            "error": None,
        }

    return {
        "success": True,
        "dirty_files": [],
        "error": None,
    }
