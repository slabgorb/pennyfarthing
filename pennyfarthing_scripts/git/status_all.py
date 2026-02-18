"""
Git status for all repos - async parallel execution.

Story: MSSCI-12402 - Port git utility scripts to Python

Replaces: pennyfarthing-dist/scripts/git/git-status-all.sh

Features:
- asyncio.gather for true parallel git operations
- Structured RepoStatus dataclass for programmatic access
- Both brief and full output formatting
- Cross-platform compatible
"""

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RepoStatus:
    """Status information for a single repository."""

    name: str
    path: Path
    branch: str
    changes: list[str]  # List of changed files (git status --short lines)
    unpushed_commits: list[str]  # List of unpushed commit messages
    error: str | None = None  # Error message if status check failed

    @property
    def is_clean(self) -> bool:
        """Return True if repo has no uncommitted changes."""
        return len(self.changes) == 0

    @property
    def has_unpushed(self) -> bool:
        """Return True if repo has unpushed commits."""
        return len(self.unpushed_commits) > 0


async def _run_git_command(args: list[str], cwd: Path) -> tuple[str, str, int]:
    """Run a git command asynchronously.

    Args:
        args: Git command arguments (without 'git')
        cwd: Working directory for the command

    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        stdout.decode("utf-8", errors="replace").strip(),
        stderr.decode("utf-8", errors="replace").strip(),
        proc.returncode or 0,
    )


async def get_repo_status(
    name: str, path: Path, upstream_ref: str = "origin/develop"
) -> RepoStatus:
    """Get git status for a single repository.

    Args:
        name: Display name for the repo
        path: Path to the repository
        upstream_ref: Remote ref to compare for unpushed commits (default: origin/develop)

    Returns:
        RepoStatus with current branch, changes, and unpushed commits
    """
    # Check if path exists
    if not path.exists():
        return RepoStatus(
            name=name,
            path=path,
            branch="",
            changes=[],
            unpushed_commits=[],
            error=f"Path not found: {path}",
        )

    # Check if it's a git repo
    git_dir = path / ".git"
    if not git_dir.exists() and not (path / "..").joinpath(".git").exists():
        # Also check if path itself is a git dir (bare repo or worktree)
        try:
            _, _, rc = await _run_git_command(["rev-parse", "--git-dir"], path)
            if rc != 0:
                return RepoStatus(
                    name=name,
                    path=path,
                    branch="",
                    changes=[],
                    unpushed_commits=[],
                    error=f"Not a git repository: {path}",
                )
        except Exception as e:
            return RepoStatus(
                name=name,
                path=path,
                branch="",
                changes=[],
                unpushed_commits=[],
                error=f"Git command failed: {e}",
            )

    try:
        # Get current branch
        branch_out, _, branch_rc = await _run_git_command(
            ["branch", "--show-current"], path
        )
        if branch_rc != 0 or not branch_out:
            # Might be in detached HEAD state
            branch_out = "detached"

        # Get status (uncommitted changes)
        status_out, _, _ = await _run_git_command(["status", "--short"], path)
        changes = [line for line in status_out.split("\n") if line.strip()]

        # Get unpushed commits (comparing to upstream ref)
        unpushed_out, _, unpushed_rc = await _run_git_command(
            ["log", f"{upstream_ref}..HEAD", "--oneline"], path
        )
        if unpushed_rc == 0 and unpushed_out:
            unpushed_commits = [
                line for line in unpushed_out.split("\n") if line.strip()
            ]
        else:
            unpushed_commits = []

        return RepoStatus(
            name=name,
            path=path,
            branch=branch_out,
            changes=changes,
            unpushed_commits=unpushed_commits,
        )

    except Exception as e:
        return RepoStatus(
            name=name,
            path=path,
            branch="",
            changes=[],
            unpushed_commits=[],
            error=f"Error getting status: {e}",
        )


async def get_all_repo_status(
    repos: Sequence[tuple[str, Path, str] | tuple[str, Path]],
) -> list[RepoStatus]:
    """Get git status for all repos in parallel using asyncio.gather.

    Args:
        repos: Sequence of (name, path) or (name, path, upstream_ref) tuples

    Returns:
        List of RepoStatus objects in same order as input
    """
    if not repos:
        return []

    tasks = []
    for entry in repos:
        if len(entry) == 3:
            name, path, upstream_ref = entry  # type: ignore[misc]
            tasks.append(get_repo_status(name, path, upstream_ref))
        else:
            name, path = entry  # type: ignore[misc]
            tasks.append(get_repo_status(name, path))
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return list(results)


def format_status_brief(statuses: Sequence[RepoStatus]) -> str:
    """Format repo statuses as brief one-line-per-repo output.

    Format: "repo_name: branch_name [M] [↑N]"
    - M = has modifications
    - ↑N = N unpushed commits

    Args:
        statuses: Sequence of RepoStatus objects

    Returns:
        Multi-line string with brief status for each repo
    """
    lines = []
    for status in statuses:
        indicators = []

        # Modification indicator
        if not status.is_clean:
            indicators.append("M")
        else:
            indicators.append("✓")

        # Unpushed indicator
        if status.has_unpushed:
            indicators.append(f"↑{len(status.unpushed_commits)}")

        indicator_str = " ".join(indicators)
        lines.append(f"{status.name}: {status.branch} {indicator_str}")

    return "\n".join(lines)


def format_status_full(statuses: Sequence[RepoStatus]) -> str:
    """Format repo statuses as full detailed output.

    Shows branch, changes (up to 10), and unpushed commits (up to 5).

    Args:
        statuses: Sequence of RepoStatus objects

    Returns:
        Multi-line string with detailed status for each repo
    """
    sections = []

    for status in statuses:
        lines = []
        lines.append(f"=== {status.name} ===")
        lines.append(f"Branch: {status.branch}")

        if status.error:
            lines.append(f"Error: {status.error}")
        elif status.changes:
            lines.append("Changes:")
            for change in status.changes[:10]:
                lines.append(f"  {change}")
            if len(status.changes) > 10:
                lines.append(f"  ... and {len(status.changes) - 10} more")
        else:
            lines.append("Clean")

        if status.unpushed_commits:
            lines.append(f"Unpushed ({len(status.unpushed_commits)}):")
            for commit in status.unpushed_commits[:5]:
                lines.append(f"  {commit}")
            if len(status.unpushed_commits) > 5:
                lines.append(f"  ... and {len(status.unpushed_commits) - 5} more")

        lines.append("")
        sections.append("\n".join(lines))

    return "\n".join(sections)


def format_summary(statuses: Sequence[RepoStatus]) -> str:
    """Format summary of all repo statuses.

    Args:
        statuses: Sequence of RepoStatus objects

    Returns:
        Summary string with total changes and unpushed counts
    """
    total_changes = sum(len(s.changes) for s in statuses)
    total_unpushed = sum(len(s.unpushed_commits) for s in statuses)

    if total_changes == 0 and total_unpushed == 0:
        return "✅ All repos clean and pushed"

    parts = []
    if total_changes > 0:
        parts.append(f"{total_changes} uncommitted change(s)")
    if total_unpushed > 0:
        parts.append(f"{total_unpushed} unpushed commit(s)")

    return " | ".join(parts)


async def main(brief: bool = False) -> int:
    """CLI entry point for git-status-all.

    Args:
        brief: If True, use brief output format

    Returns:
        0 if all repos clean, 1 if any have changes/unpushed
    """
    from pennyfarthing_scripts.git.repos import get_repo_paths, load_repos_config

    repos_with_upstream: list[tuple[str, Path, str]] = []
    repo_paths = get_repo_paths()
    config = load_repos_config()

    for name, path in repo_paths:
        upstream = config[name].upstream_ref if name in config else "origin/develop"
        repos_with_upstream.append((name, path, upstream))

    statuses = await get_all_repo_status(repos_with_upstream)

    if brief:
        print(format_status_brief(statuses))
    else:
        print("━" * 40)
        print("  Git Status - All Repos")
        print("━" * 40)
        print()
        print(format_status_full(statuses))
        print("━" * 40)
        print(format_summary(statuses))

    # Return 1 if any repo has changes or unpushed
    has_issues = any(not s.is_clean or s.has_unpushed for s in statuses)
    return 1 if has_issues else 0


if __name__ == "__main__":
    import sys

    brief_mode = "--brief" in sys.argv or "-b" in sys.argv
    sys.exit(asyncio.run(main(brief=brief_mode)))
