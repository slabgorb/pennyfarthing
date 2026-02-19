"""
Core dead code detection engine.

Layer 1: Compares git ls-files against git log --since to find files with no recent commits.
Layer 2: Runs ts-prune to find unused TypeScript exports.
"""

from __future__ import annotations

import asyncio
import fnmatch
import re
from datetime import UTC, datetime
from pathlib import Path

from pf.deadcode.models import (
    DeadCodeResult,
    StaleFile,
    UnusedExport,
    UnusedExportResult,
)

# Default file patterns to exclude from analysis
DEFAULT_EXCLUDES = [
    "node_modules/*",
    "dist/*",
    "build/*",
    "*.lock",
    "*.min.js",
    "*.min.css",
    "package-lock.json",
    "pnpm-lock.yaml",
]

# Source file extensions to include
SOURCE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs",
    ".java", ".kt", ".swift", ".rb", ".sh", ".bash",
    ".css", ".scss", ".less", ".html", ".md", ".yaml", ".yml",
    ".json", ".toml",
}


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


def _should_exclude(path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any exclusion pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        if fnmatch.fnmatch(path.split("/")[-1], pattern):
            return True
    return False


def _is_source_file(path: str) -> bool:
    """Check if a file has a recognized source extension."""
    suffix = Path(path).suffix.lower()
    return suffix in SOURCE_EXTENSIONS


async def find_stale_files(
    repo_path: Path,
    days: int = 180,
    excludes: list[str] | None = None,
    branch: str = "--all",
) -> DeadCodeResult:
    """Find files with no commits in the given time window.

    Args:
        repo_path: Path to the git repository
        days: Time window in days
        excludes: Additional file patterns to exclude
        branch: Branch spec (default --all)

    Returns:
        DeadCodeResult with stale files
    """
    all_excludes = DEFAULT_EXCLUDES + (excludes or [])
    resolved = Path(repo_path).resolve()

    # Get all tracked files
    ls_stdout, ls_stderr, ls_rc = await _run_git_command(["ls-files"], resolved)

    if ls_rc != 0:
        return DeadCodeResult(
            success=False,
            repo_name=resolved.name,
            repo_path=str(resolved),
            time_window_days=days,
            error=f"git ls-files failed: {ls_stderr}",
        )

    all_files = set()
    for line in ls_stdout.split("\n"):
        line = line.strip()
        if line:
            all_files.add(line)

    if not all_files:
        return DeadCodeResult(
            success=True,
            repo_name=resolved.name,
            repo_path=str(resolved),
            time_window_days=days,
            total_files=0,
        )

    # Get recently touched files
    log_stdout, log_stderr, log_rc = await _run_git_command(
        ["log", f"--since={days} days ago", branch, "--name-only", "--pretty=format:"],
        resolved,
    )

    recent_files = set()
    if log_rc == 0 and log_stdout:
        for line in log_stdout.split("\n"):
            line = line.strip()
            if line:
                recent_files.add(line)

    # Set difference: stale = all - recent
    candidate_stale = all_files - recent_files

    # Filter: exclude patterns and non-source files
    filtered = []
    for fpath in candidate_stale:
        if _should_exclude(fpath, all_excludes):
            continue
        if not _is_source_file(fpath):
            continue
        filtered.append(fpath)

    # Enrich each stale file
    now = datetime.now(UTC)
    stale_files = []
    for fpath in sorted(filtered):
        # Get last commit date
        date_stdout, _, _ = await _run_git_command(
            ["log", "-1", "--format=%aI", "--", fpath],
            resolved,
        )
        last_commit_date = date_stdout.strip()

        # Calculate days since last commit
        days_since = 0
        if last_commit_date:
            try:
                last_dt = datetime.fromisoformat(last_commit_date)
                days_since = int((now - last_dt).total_seconds() / 86400)
            except (ValueError, TypeError):
                pass

        # Get file size
        size_bytes = 0
        try:
            full_path = resolved / fpath
            size_bytes = full_path.stat().st_size
        except (OSError, FileNotFoundError):
            pass

        stale_files.append(
            StaleFile(
                path=fpath,
                last_commit_date=last_commit_date,
                days_since_last_commit=days_since,
                size_bytes=size_bytes,
            )
        )

    return DeadCodeResult(
        success=True,
        repo_name=resolved.name,
        repo_path=str(resolved),
        time_window_days=days,
        stale_files=stale_files,
        total_files=len(all_files),
    )


async def analyze_repo(
    name: str,
    path: Path,
    days: int = 180,
    excludes: list[str] | None = None,
    branch: str = "--all",
) -> DeadCodeResult:
    """Analyze a single repository for stale files.

    Args:
        name: Display name for the repository
        path: Path to the git repository
        days: Time window in days
        excludes: Additional file patterns to exclude
        branch: Branch spec (default --all)

    Returns:
        DeadCodeResult with stale files
    """
    resolved = Path(path).resolve()

    if not resolved.exists():
        return DeadCodeResult(
            success=False,
            repo_name=name,
            repo_path=str(resolved),
            time_window_days=days,
            error=f"Path not found: {resolved}",
        )

    result = await find_stale_files(resolved, days, excludes, branch)
    # Override repo_name with the provided name
    result.repo_name = name
    return result


# ts-prune output line pattern: "path/to/file.ts:line - symbolName"
_TS_PRUNE_LINE_RE = re.compile(r"^(.+):(\d+) - (.+)$")


def _parse_ts_prune_output(output: str) -> list[UnusedExport]:
    """Parse ts-prune stdout into UnusedExport instances.

    ts-prune format: ``path/to/file.ts:10 - symbolName``
    Lines ending with ``(used in module)`` are skipped (not truly unused).
    """
    exports: list[UnusedExport] = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        # Skip "used in module" markers — these are re-exported and consumed
        if line.endswith("(used in module)"):
            continue

        m = _TS_PRUNE_LINE_RE.match(line)
        if not m:
            continue

        file_path, line_no, symbol = m.group(1), int(m.group(2)), m.group(3).strip()
        export_type = "default" if symbol == "default" else "named"
        exports.append(
            UnusedExport(
                symbol=symbol,
                file=file_path,
                line=line_no,
                export_type=export_type,
            )
        )
    return exports


async def find_unused_exports(repo_path: Path) -> UnusedExportResult:
    """Find unused TypeScript exports via ts-prune.

    Runs ``npx ts-prune`` in the repo and parses the output.

    Args:
        repo_path: Path to a TypeScript project with tsconfig.json

    Returns:
        UnusedExportResult with unused exports
    """
    resolved = Path(repo_path).resolve()

    if not resolved.exists():
        return UnusedExportResult(
            success=False,
            repo_name=resolved.name,
            repo_path=str(resolved),
            error=f"Path not found: {resolved}",
        )

    proc = await asyncio.create_subprocess_exec(
        "npx", "ts-prune",
        cwd=resolved,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await proc.communicate()
    stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
    stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

    if proc.returncode and proc.returncode != 0:
        return UnusedExportResult(
            success=False,
            repo_name=resolved.name,
            repo_path=str(resolved),
            error=f"ts-prune failed (exit {proc.returncode}): {stderr}",
        )

    exports = _parse_ts_prune_output(stdout)
    return UnusedExportResult(
        success=True,
        repo_name=resolved.name,
        repo_path=str(resolved),
        unused_exports=exports,
        total_exports_scanned=0,  # ts-prune doesn't report total count
    )
