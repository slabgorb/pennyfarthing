"""
Git snapshot — safety-first branch + commit for all repos.

Creates timestamped snapshot branches and commits all dirty files
(tracked and untracked) so nothing is lost. Designed for quick
preservation before risky operations.

Usage:
    from pf.git.snapshot import snapshot_all_repos
    results = snapshot_all_repos(label="benchmark-work")
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pf.git.repos import get_repo_paths, load_repos_config


@dataclass
class SnapshotResult:
    """Result of snapshotting a single repo."""

    repo_name: str
    path: Path
    branch: str
    commit_sha: str
    file_count: int
    original_branch: str
    skipped: bool = False
    skip_reason: str = ""
    error: str = ""


def _run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def _is_dirty(repo_path: Path) -> bool:
    """Check if repo has any uncommitted or untracked changes."""
    status = _run(["git", "status", "--porcelain"], cwd=repo_path)
    return bool(status.stdout.strip())


def _current_branch(repo_path: Path) -> str:
    result = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_path)
    return result.stdout.strip()


def _file_count(repo_path: Path) -> int:
    """Count dirty files (modified + untracked)."""
    status = _run(["git", "status", "--porcelain"], cwd=repo_path)
    return len([line for line in status.stdout.strip().splitlines() if line.strip()])


def snapshot_repo(
    repo_name: str,
    repo_path: Path,
    label: str = "",
    timestamp: str = "",
) -> SnapshotResult:
    """Snapshot a single repo: create branch, stage all, commit.

    Args:
        repo_name: Name of the repo (e.g., "orchestrator", "pennyfarthing").
        repo_path: Absolute path to the repo.
        label: Optional label for the branch name.
        timestamp: ISO date string (auto-generated if not provided).

    Returns:
        SnapshotResult with branch name and commit SHA.
    """
    if not timestamp:
        timestamp = datetime.now().strftime("%Y-%m-%d")

    original_branch = _current_branch(repo_path)

    if not _is_dirty(repo_path):
        return SnapshotResult(
            repo_name=repo_name,
            path=repo_path,
            branch="",
            commit_sha="",
            file_count=0,
            original_branch=original_branch,
            skipped=True,
            skip_reason="clean working tree",
        )

    count = _file_count(repo_path)
    slug = f"-{label}" if label else ""
    branch = f"snapshot/{repo_name}{slug}-{timestamp}"

    # Create branch
    result = _run(["git", "checkout", "-b", branch], cwd=repo_path)
    if result.returncode != 0:
        # Branch may already exist — try with a suffix
        branch = f"{branch}-{datetime.now().strftime('%H%M%S')}"
        result = _run(["git", "checkout", "-b", branch], cwd=repo_path)
        if result.returncode != 0:
            return SnapshotResult(
                repo_name=repo_name,
                path=repo_path,
                branch=branch,
                commit_sha="",
                file_count=count,
                original_branch=original_branch,
                error=f"Failed to create branch: {result.stderr.strip()}",
            )

    # Stage everything
    _run(["git", "add", "-A"], cwd=repo_path)

    # Commit
    msg = f"snapshot: preserve {repo_name} work"
    if label:
        msg = f"snapshot: preserve {label} work in {repo_name}"

    result = _run(
        ["git", "commit", "-m", msg],
        cwd=repo_path,
    )
    if result.returncode != 0:
        return SnapshotResult(
            repo_name=repo_name,
            path=repo_path,
            branch=branch,
            commit_sha="",
            file_count=count,
            original_branch=original_branch,
            error=f"Commit failed: {result.stderr.strip()}",
        )

    # Get SHA
    sha_result = _run(["git", "rev-parse", "--short", "HEAD"], cwd=repo_path)
    sha = sha_result.stdout.strip()

    return SnapshotResult(
        repo_name=repo_name,
        path=repo_path,
        branch=branch,
        commit_sha=sha,
        file_count=count,
        original_branch=original_branch,
    )


def snapshot_all_repos(
    label: str = "",
    project_root: Path | None = None,
) -> list[SnapshotResult]:
    """Snapshot all configured repos that have dirty changes.

    Args:
        label: Optional label for branch names (e.g., "benchmark-work").
        project_root: Project root directory. Auto-detected if not provided.

    Returns:
        List of SnapshotResult for each repo.
    """
    repo_paths = get_repo_paths(project_root)
    timestamp = datetime.now().strftime("%Y-%m-%d")

    results = []
    for name, path in repo_paths:
        result = snapshot_repo(name, path, label=label, timestamp=timestamp)
        results.append(result)

    return results


def format_snapshot_results(results: list[SnapshotResult]) -> str:
    """Format snapshot results for display."""
    lines = []

    snapped = [r for r in results if not r.skipped and not r.error]
    skipped = [r for r in results if r.skipped]
    errored = [r for r in results if r.error]

    if snapped:
        lines.append("Snapshots created:")
        for r in snapped:
            lines.append(f"  {r.repo_name}: {r.commit_sha} on {r.branch} ({r.file_count} files)")

    if skipped:
        lines.append("\nSkipped (clean):")
        for r in skipped:
            lines.append(f"  {r.repo_name}: {r.skip_reason}")

    if errored:
        lines.append("\nErrors:")
        for r in errored:
            lines.append(f"  {r.repo_name}: {r.error}")

    if snapped:
        lines.append("\nTo return to previous branches:")
        for r in snapped:
            lines.append(f"  cd {r.path} && git checkout {r.original_branch}")

    return "\n".join(lines)
