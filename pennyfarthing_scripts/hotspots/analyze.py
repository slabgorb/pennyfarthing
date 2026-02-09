"""
Core hotspot analysis engine.

Parses git log history, computes per-file metrics, and produces scored hotspot results.
Reuses async git subprocess pattern from git/status_all.py.
"""

from __future__ import annotations

import asyncio
import fnmatch
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pennyfarthing_scripts.hotspots.models import (
    DirectoryHotspot,
    FileHotspot,
    HotspotResult,
    MultiRepoHotspotResult,
)

# Scoring weights (must sum to 1.0)
WEIGHT_BUG_FIXES = 0.35
WEIGHT_CHANGES = 0.30
WEIGHT_AUTHORS = 0.20
WEIGHT_CHURN = 0.10
WEIGHT_RECENCY = 0.05

# Default file patterns to exclude from analysis
DEFAULT_EXCLUDES = [
    "node_modules/*",
    "dist/*",
    "build/*",
    "*.lock",
    "*.min.js",
    "*.min.css",
    "*.map",
    "package-lock.json",
    "pnpm-lock.yaml",
    # Dotfiles
    ".*",
    # Images
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.svg",
    "*.ico",
    # Fonts
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot",
    # Generated files
    "*.d.ts",
    "*.snap",
    "*.d.ts.map",
    # CI config
    ".github/*",
    # Sprint/session operational files (not code quality signals)
    "sprint/*",
    ".session/*",
]

# Regex for identifying bug-fix commits
BUG_FIX_PATTERN = re.compile(
    r"\b(fix|bug|patch|hotfix|regression|resolve[ds]?)\b", re.IGNORECASE
)


async def _run_git_command(args: list[str], cwd: Path) -> tuple[str, str, int]:
    """Run a git command asynchronously.

    Args:
        args: Git command arguments (without 'git')
        cwd: Working directory

    Returns:
        (stdout, stderr, return_code)
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


async def _run_git_log(
    repo_path: Path, since_days: int, branch: str = "--all"
) -> tuple[str, str, int]:
    """Run git log with numstat for hotspot analysis."""
    args = [
        "log",
        f"--since={since_days} days ago",
        branch,
        "--numstat",
        "--pretty=format:COMMIT:%H|%an|%aI|%s",
    ]
    return await _run_git_command(args, repo_path)


def is_bug_fix_commit(message: str) -> bool:
    """Check if a commit message indicates a bug fix."""
    return bool(BUG_FIX_PATTERN.search(message))


def _parse_git_log(output: str) -> list[dict]:
    """Parse git log --numstat output into structured commit dicts.

    Each dict has: hash, author, date, message, files (list of {path, added, deleted}).

    Handles binary files (numstat shows '-' for added/deleted).
    """
    if not output.strip():
        return []

    commits = []
    current_commit: dict | None = None

    for line in output.split("\n"):
        line = line.rstrip()

        if line.startswith("COMMIT:"):
            # Save previous commit
            if current_commit is not None:
                commits.append(current_commit)

            parts = line[7:].split("|", 3)
            if len(parts) >= 4:
                current_commit = {
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3],
                    "files": [],
                }
            else:
                current_commit = None
            continue

        if current_commit is None:
            continue

        # Numstat lines: "added\tdeleted\tpath" or "-\t-\tpath" for binary
        if "\t" in line:
            parts = line.split("\t", 2)
            if len(parts) == 3:
                added_str, deleted_str, path = parts
                # Binary files show "-" for numstat
                added = int(added_str) if added_str != "-" else 0
                deleted = int(deleted_str) if deleted_str != "-" else 0
                current_commit["files"].append(
                    {"path": path, "added": added, "deleted": deleted}
                )

    # Don't forget the last commit
    if current_commit is not None:
        commits.append(current_commit)

    return commits


def calculate_hotspot_score(
    change_count: int,
    bug_fix_count: int,
    author_count: int,
    churn: int,
    age_days: float,
    *,
    max_changes: int = 1,
    max_bugs: int = 1,
    max_authors: int = 1,
    max_churn: int = 1,
    window_days: int = 90,
) -> float:
    """Compute weighted composite hotspot score (0–100).

    Each dimension is normalized against the max value seen in the dataset,
    then weighted and summed.

    Args:
        change_count: Number of commits touching this file
        bug_fix_count: Number of bug-fix commits touching this file
        author_count: Distinct authors who changed this file
        churn: Total lines added + deleted
        age_days: Days since last change
        max_changes: Max change_count in dataset (for normalization)
        max_bugs: Max bug_fix_count in dataset
        max_authors: Max author_count in dataset
        max_churn: Max churn in dataset
        window_days: Analysis time window in days

    Returns:
        Score between 0.0 and 100.0
    """
    norm_changes = change_count / max_changes if max_changes > 0 else 0
    norm_bugs = bug_fix_count / max_bugs if max_bugs > 0 else 0
    norm_authors = author_count / max_authors if max_authors > 0 else 0
    norm_churn = churn / max_churn if max_churn > 0 else 0
    # Recency: recently changed files score higher
    recency = max(0.0, 1.0 - (age_days / window_days)) if window_days > 0 else 0

    raw = (
        WEIGHT_BUG_FIXES * norm_bugs
        + WEIGHT_CHANGES * norm_changes
        + WEIGHT_AUTHORS * norm_authors
        + WEIGHT_CHURN * norm_churn
        + WEIGHT_RECENCY * recency
    )

    return round(min(raw * 100, 100.0), 1)


def _should_exclude(path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any exclusion pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        # Also check the basename for patterns like "*.lock"
        if fnmatch.fnmatch(path.split("/")[-1], pattern):
            return True
    return False


def _aggregate_by_directory(file_hotspots: list[FileHotspot]) -> list[DirectoryHotspot]:
    """Roll up file-level hotspots to parent directories."""
    dir_data: dict[str, dict] = defaultdict(
        lambda: {
            "file_count": 0,
            "total_changes": 0,
            "total_bug_fixes": 0,
            "author_counts": [],
            "scores": [],
        }
    )

    for fh in file_hotspots:
        parent = str(Path(fh.path).parent)
        if parent == ".":
            parent = "/"
        entry = dir_data[parent]
        entry["file_count"] += 1
        entry["total_changes"] += fh.change_count
        entry["total_bug_fixes"] += fh.bug_fix_count
        entry["author_counts"].append(fh.author_count)
        entry["scores"].append(fh.hotspot_score)

    result = []
    for path, data in dir_data.items():
        avg_authors = (
            sum(data["author_counts"]) / len(data["author_counts"])
            if data["author_counts"]
            else 0
        )
        avg_score = (
            sum(data["scores"]) / len(data["scores"]) if data["scores"] else 0
        )
        result.append(
            DirectoryHotspot(
                path=path,
                file_count=data["file_count"],
                total_changes=data["total_changes"],
                total_bug_fixes=data["total_bug_fixes"],
                avg_author_count=round(avg_authors, 1),
                hotspot_score=round(avg_score, 1),
            )
        )

    result.sort(key=lambda d: d.hotspot_score, reverse=True)
    return result


async def analyze_repo(
    name: str,
    path: Path,
    days: int = 90,
    excludes: list[str] | None = None,
    branch: str = "--all",
) -> HotspotResult:
    """Analyze a single repository for code hotspots.

    Args:
        name: Display name for the repository
        path: Path to the git repository
        days: Time window in days
        excludes: Additional file patterns to exclude
        branch: Branch spec (default --all)

    Returns:
        HotspotResult with file and directory hotspots
    """
    all_excludes = DEFAULT_EXCLUDES + (excludes or [])
    resolved = Path(path).resolve()

    if not resolved.exists():
        return HotspotResult(
            success=False,
            repo_name=name,
            repo_path=str(resolved),
            time_window_days=days,
            error=f"Path not found: {resolved}",
        )

    stdout, stderr, rc = await _run_git_log(resolved, days, branch)

    if rc != 0:
        return HotspotResult(
            success=False,
            repo_name=name,
            repo_path=str(resolved),
            time_window_days=days,
            error=f"git log failed: {stderr}",
        )

    commits = _parse_git_log(stdout)

    if not commits:
        return HotspotResult(
            success=True,
            repo_name=name,
            repo_path=str(resolved),
            time_window_days=days,
            commit_count=0,
        )

    # Aggregate per-file metrics
    file_metrics: dict[str, dict] = defaultdict(
        lambda: {
            "change_count": 0,
            "bug_fix_count": 0,
            "authors": set(),
            "lines_added": 0,
            "lines_deleted": 0,
            "last_changed": "",
        }
    )

    now = datetime.now(timezone.utc)

    for commit in commits:
        is_fix = is_bug_fix_commit(commit["message"])
        for file_info in commit["files"]:
            fpath = file_info["path"]
            if _should_exclude(fpath, all_excludes):
                continue

            m = file_metrics[fpath]
            m["change_count"] += 1
            if is_fix:
                m["bug_fix_count"] += 1
            m["authors"].add(commit["author"])
            m["lines_added"] += file_info["added"]
            m["lines_deleted"] += file_info["deleted"]
            # Track most recent change date
            if not m["last_changed"] or commit["date"] > m["last_changed"]:
                m["last_changed"] = commit["date"]

    if not file_metrics:
        return HotspotResult(
            success=True,
            repo_name=name,
            repo_path=str(resolved),
            time_window_days=days,
            commit_count=len(commits),
        )

    # Compute normalization maximums
    max_changes = max(m["change_count"] for m in file_metrics.values())
    max_bugs = max(m["bug_fix_count"] for m in file_metrics.values()) or 1
    max_authors = max(len(m["authors"]) for m in file_metrics.values())
    max_churn = max(
        m["lines_added"] + m["lines_deleted"] for m in file_metrics.values()
    ) or 1

    # Build FileHotspot list with scores
    file_hotspots = []
    for fpath, m in file_metrics.items():
        churn = m["lines_added"] + m["lines_deleted"]

        # Compute age in days
        age_days = days  # default to full window
        if m["last_changed"]:
            try:
                last_dt = datetime.fromisoformat(m["last_changed"])
                age_days = max(0, (now - last_dt).total_seconds() / 86400)
            except (ValueError, TypeError):
                pass

        score = calculate_hotspot_score(
            change_count=m["change_count"],
            bug_fix_count=m["bug_fix_count"],
            author_count=len(m["authors"]),
            churn=churn,
            age_days=age_days,
            max_changes=max_changes,
            max_bugs=max_bugs,
            max_authors=max_authors,
            max_churn=max_churn,
            window_days=days,
        )

        file_hotspots.append(
            FileHotspot(
                path=fpath,
                change_count=m["change_count"],
                bug_fix_count=m["bug_fix_count"],
                author_count=len(m["authors"]),
                lines_added=m["lines_added"],
                lines_deleted=m["lines_deleted"],
                churn=churn,
                last_changed=m["last_changed"],
                hotspot_score=score,
            )
        )

    # Sort by score descending
    file_hotspots.sort(key=lambda h: h.hotspot_score, reverse=True)

    # Aggregate directories
    directory_hotspots = _aggregate_by_directory(file_hotspots)

    return HotspotResult(
        success=True,
        repo_name=name,
        repo_path=str(resolved),
        time_window_days=days,
        commit_count=len(commits),
        file_hotspots=file_hotspots,
        directory_hotspots=directory_hotspots,
    )


async def analyze_all_repos(
    project_root: Path,
    days: int = 90,
    excludes: list[str] | None = None,
    branch: str = "--all",
    skip_types: list[str] | None = None,
) -> MultiRepoHotspotResult:
    """Analyze all repos found under project root in parallel.

    Discovers repos via repos.yaml if available, otherwise analyzes project_root itself.

    Args:
        project_root: Root directory of the project
        days: Time window in days
        excludes: Additional file patterns to exclude
        branch: Branch spec
        skip_types: Repo types to exclude (e.g. ["orchestrator"])

    Returns:
        MultiRepoHotspotResult with per-repo results
    """
    from pennyfarthing_scripts.common.config import load_yaml_config

    repos_yaml = load_yaml_config(project_root / ".pennyfarthing" / "repos.yaml")

    repos: list[tuple[str, Path]] = []

    if repos_yaml and isinstance(repos_yaml, dict):
        # Extract repos from repos.yaml
        for repo_name, repo_config in repos_yaml.items():
            if isinstance(repo_config, dict):
                # Filter by type if skip_types is provided
                if skip_types:
                    repo_type = repo_config.get("type")
                    if repo_type and repo_type in skip_types:
                        continue
                repo_path = repo_config.get("path", repo_name)
            else:
                repo_path = str(repo_config)
            full_path = project_root / repo_path
            if full_path.exists() and (full_path / ".git").exists():
                repos.append((repo_name, full_path))
    else:
        # No repos.yaml — analyze the project root itself if it's a git repo
        if (project_root / ".git").exists():
            repos.append((project_root.name, project_root))

    if not repos:
        return MultiRepoHotspotResult(
            success=False,
            error="No git repositories found to analyze",
        )

    tasks = [analyze_repo(name, path, days, excludes, branch) for name, path in repos]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    return MultiRepoHotspotResult(
        success=True,
        repo_results=list(results),
    )
