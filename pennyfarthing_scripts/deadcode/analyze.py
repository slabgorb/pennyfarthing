"""
Core stale file detection engine.

Compares git ls-files against git log --since to find files with no recent commits.
"""

from __future__ import annotations

from pathlib import Path

from pennyfarthing_scripts.deadcode.models import DeadCodeResult, StaleFile

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
    """Run a git command asynchronously. Stub — not yet implemented."""
    raise NotImplementedError("_run_git_command not implemented")


def _should_exclude(path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any exclusion pattern. Stub — not yet implemented."""
    raise NotImplementedError("_should_exclude not implemented")


def _is_source_file(path: str) -> bool:
    """Check if a file has a recognized source extension. Stub — not yet implemented."""
    raise NotImplementedError("_is_source_file not implemented")


async def find_stale_files(
    repo_path: Path,
    days: int = 180,
    excludes: list[str] | None = None,
    branch: str = "--all",
) -> DeadCodeResult:
    """Find files with no commits in the given time window. Stub — not yet implemented."""
    raise NotImplementedError("find_stale_files not implemented")


async def analyze_repo(
    name: str,
    path: Path,
    days: int = 180,
    excludes: list[str] | None = None,
    branch: str = "--all",
) -> DeadCodeResult:
    """Analyze a single repository for stale files. Stub — not yet implemented."""
    raise NotImplementedError("analyze_repo not implemented")
