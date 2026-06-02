"""Reviewer subagent diff mode discrimination.

Maps each reviewer subagent to its diff mode and builds
the corresponding git diff command.
"""

from __future__ import annotations

import subprocess

from pf.git.repos import get_default_branch

SUBAGENT_DIFF_MODES: dict[str, str] = {
    # Full base-branch diff — cross-file analysis specialists
    "reviewer-security": "full-base",
    "reviewer-edge-hunter": "full-base",
    "reviewer-test-analyzer": "full-base",
    "reviewer-rule-checker": "full-base",
    # Incremental diff — localized analysis specialists
    "reviewer-simplifier": "incremental",
    "reviewer-comment-analyzer": "incremental",
    "reviewer-type-design": "incremental",
    "reviewer-silent-failure-hunter": "incremental",
    # No diff — runs tools, not diff analysis
    "reviewer-preflight": "none",
}

SUBAGENT_FILE_CONTEXT: dict[str, bool] = {
    # Full file context — cross-file pattern analysis
    "reviewer-security": True,
    "reviewer-edge-hunter": True,
    "reviewer-test-analyzer": True,
    "reviewer-rule-checker": True,
    # Diff-only — localized analysis
    "reviewer-simplifier": False,
    "reviewer-comment-analyzer": False,
    "reviewer-type-design": False,
    "reviewer-silent-failure-hunter": False,
    "reviewer-preflight": False,
}


def needs_file_context(name: str) -> bool:
    """Check whether a subagent needs full file context.

    Args:
        name: Subagent name (must be in SUBAGENT_FILE_CONTEXT).

    Returns:
        True if the subagent needs full file contents for changed files.

    Raises:
        KeyError: If name is not a known subagent.
    """
    return SUBAGENT_FILE_CONTEXT[name]


def get_changed_files(
    base_branch: str,
    repo_path: str | None = None,
) -> list[str]:
    """Get list of files changed between base branch and HEAD.

    Runs ``git diff --name-only {base_branch}...HEAD`` and returns
    the resulting file paths, filtering out empty lines.

    Args:
        base_branch: The base branch to diff against.
        repo_path: Working directory for the git command. If None,
            uses the current working directory.

    Returns:
        List of changed file paths relative to repo root.

    Raises:
        subprocess.CalledProcessError: If the git command fails.
    """
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base_branch}...HEAD"],
        capture_output=True,
        text=True,
        check=True,
        cwd=repo_path,
    )
    return [line for line in result.stdout.split("\n") if line]


def get_diff_command(mode: str, base_branch: str) -> list[str] | None:
    """Build a git diff command for the given mode.

    Args:
        mode: One of "full-base", "incremental", "none".
        base_branch: The base branch for full-base diffs.

    Returns:
        A list of command arguments, or None for "none" mode.

    Raises:
        ValueError: If mode is not recognized.
    """
    if mode == "full-base":
        return ["git", "diff", f"{base_branch}...HEAD"]
    if mode == "incremental":
        return ["git", "diff", "HEAD~1"]
    if mode == "none":
        return None
    raise ValueError(f"Invalid diff mode '{mode}'")


def get_diff_for_subagent(
    name: str,
    base_branch: str | None = None,
    repo_name: str | None = None,
) -> list[str] | None:
    """Get the diff command for a reviewer subagent.

    Args:
        name: Subagent name (must be in SUBAGENT_DIFF_MODES).
        base_branch: Explicit base branch. If None, resolved from repo_name.
        repo_name: Repo name for repos.yaml lookup. Ignored if base_branch is set.

    Returns:
        A list of command arguments, or None for subagents with no diff.

    Raises:
        KeyError: If name is not a known subagent.
    """
    mode = SUBAGENT_DIFF_MODES[name]
    if base_branch is None:
        if repo_name is not None:
            base_branch = get_default_branch(repo_name)
        else:
            base_branch = "main"
    return get_diff_command(mode, base_branch)
