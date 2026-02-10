"""
Core code marker analysis engine.

Greps source files for TODO/FIXME/HACK/XXX markers, runs git blame for
author and age data, and computes staleness.
"""

from __future__ import annotations

import asyncio
import fnmatch
import re
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

from pennyfarthing_scripts.codemarkers.models import (
    CodeMarker,
    CodeMarkersResult,
    DeprecationMarker,
    MarkerSummary,
)

# Marker types to detect (case-sensitive, uppercase only)
MARKER_PATTERN = re.compile(r"\b(TODO|FIXME|HACK|XXX)\b")

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
]

# Binary file extensions to skip
_BINARY_EXTENSIONS = frozenset({
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".gz", ".tar", ".bz2", ".7z", ".rar",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".exe", ".dll", ".so", ".dylib", ".o", ".a",
    ".pyc", ".pyo", ".class", ".jar",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".sqlite", ".db",
})


def _should_exclude(path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any exclusion pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        # Also check the basename for patterns like "*.lock"
        if fnmatch.fnmatch(path.split("/")[-1], pattern):
            return True
    return False


def _grep_markers(root: Path, excludes: list[str]) -> list[dict]:
    """Scan files under root for TODO/FIXME/HACK/XXX markers.

    Args:
        root: Directory to scan recursively
        excludes: Glob patterns for files/dirs to skip

    Returns:
        List of dicts: {path, line, marker_type, text}
    """
    results: list[dict] = []

    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue

        # Skip binary files by extension
        if file_path.suffix.lower() in _BINARY_EXTENSIONS:
            continue

        # Get relative path for exclusion matching
        rel_path = str(file_path.relative_to(root))

        if _should_exclude(rel_path, excludes):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, OSError):
            continue

        for line_num, line_text in enumerate(content.split("\n"), start=1):
            match = MARKER_PATTERN.search(line_text)
            if match:
                results.append({
                    "path": rel_path,
                    "line": line_num,
                    "marker_type": match.group(1),
                    "text": line_text.strip(),
                })

    return results


def _parse_blame_porcelain(output: str, line: int) -> dict:
    """Parse git blame --porcelain output for a specific line.

    Extracts author name and author-time (Unix timestamp).

    Args:
        output: Raw porcelain output from git blame
        line: Line number to extract (used for context)

    Returns:
        Dict with 'author' and 'author_time' keys, or empty dict
    """
    if not output.strip():
        return {}

    author = ""
    author_time = 0

    for raw_line in output.split("\n"):
        if raw_line.startswith("author "):
            author = raw_line[7:]
        elif raw_line.startswith("author-time "):
            try:
                author_time = int(raw_line[12:])
            except ValueError:
                pass

    if not author:
        return {}

    return {"author": author, "author_time": author_time}


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


async def _batch_blame_file(
    repo_path: Path, file_path: str, lines: list[int]
) -> dict[int, dict]:
    """Blame an entire file once and extract data for requested lines.

    Args:
        repo_path: Root of the git repository
        file_path: Relative path to file within repo
        lines: Line numbers to extract blame data for

    Returns:
        Dict mapping line number -> {author, author_time}
    """
    stdout, stderr, rc = await _run_git_command(
        ["blame", "--porcelain", file_path], repo_path
    )

    if rc != 0:
        return {}

    # Parse porcelain: each block starts with "<hash> <orig_line> <final_line> <count>"
    results: dict[int, dict] = {}
    current_line = 0
    current_author = ""
    current_time = 0
    lines_set = set(lines)

    for raw_line in stdout.split("\n"):
        # Header line: hash orig_line final_line [count]
        # Detect by checking that parts[1] is a digit (orig_line number)
        parts = raw_line.split(" ")
        if len(parts) >= 3 and len(parts[0]) >= 6 and parts[1].isdigit():
            try:
                current_line = int(parts[2])
            except (ValueError, IndexError):
                pass
            current_author = ""
            current_time = 0
        elif raw_line.startswith("author "):
            current_author = raw_line[7:]
        elif raw_line.startswith("author-time "):
            try:
                current_time = int(raw_line[12:])
            except ValueError:
                pass
        elif raw_line.startswith("\t"):
            # Content line — end of this block
            if current_line in lines_set:
                results[current_line] = {
                    "author": current_author,
                    "author_time": current_time,
                }

    return results


async def analyze_repo(
    name: str,
    path: Path,
    days: int = 90,
    excludes: list[str] | None = None,
) -> CodeMarkersResult:
    """Analyze a repository for code markers.

    Args:
        name: Display name for the repository
        path: Path to the git repository
        days: Stale threshold in days
        excludes: Additional file patterns to exclude

    Returns:
        CodeMarkersResult with markers and summary
    """
    resolved = Path(path).resolve()

    if not resolved.exists():
        return CodeMarkersResult(
            success=False,
            repo_name=name,
            repo_path=str(resolved),
            stale_threshold_days=days,
            error=f"Path not found: {resolved}",
        )

    all_excludes = DEFAULT_EXCLUDES + (excludes or [])

    # Grep for markers
    raw_markers = _grep_markers(resolved, all_excludes)

    if not raw_markers:
        return CodeMarkersResult(
            success=True,
            repo_name=name,
            repo_path=str(resolved),
            stale_threshold_days=days,
            markers=[],
            summary=MarkerSummary(),
        )

    # Group markers by file for batch blame
    by_file: dict[str, list[dict]] = defaultdict(list)
    for m in raw_markers:
        by_file[m["path"]].append(m)

    # Blame each file once
    now = time.time()
    markers: list[CodeMarker] = []
    stale_count = 0
    type_counts: dict[str, int] = defaultdict(int)

    for file_path, file_markers in by_file.items():
        line_numbers = [m["line"] for m in file_markers]
        blame_data = await _batch_blame_file(resolved, file_path, line_numbers)

        for m in file_markers:
            blame = blame_data.get(m["line"], {})
            author = blame.get("author", "")
            author_time = blame.get("author_time", 0)

            # Compute age
            if author_time > 0:
                age_days = (now - author_time) / 86400
                date_str = datetime.fromtimestamp(
                    author_time, tz=UTC
                ).isoformat()
            else:
                age_days = 0.0
                date_str = ""

            is_stale = age_days > days

            marker = CodeMarker(
                path=m["path"],
                line=m["line"],
                marker_type=m["marker_type"],
                text=m["text"],
                author=author,
                date=date_str,
                age_days=round(age_days, 1),
                is_stale=is_stale,
            )
            markers.append(marker)

            type_counts[m["marker_type"]] += 1
            if is_stale:
                stale_count += 1

    summary = MarkerSummary(
        total_markers=len(markers),
        stale_markers=stale_count,
        by_type=dict(type_counts),
    )

    return CodeMarkersResult(
        success=True,
        repo_name=name,
        repo_path=str(resolved),
        stale_threshold_days=days,
        markers=markers,
        summary=summary,
    )


# =============================================================================
# @deprecated detection (Story 80-2)
# =============================================================================

# File extensions to scan for @deprecated JSDoc tags
_DEPRECATION_EXTENSIONS = frozenset({".ts", ".tsx", ".js"})

# Pattern to find @deprecated in JSDoc comments
_DEPRECATED_PATTERN = re.compile(r"@deprecated\b(.*)")

# Pattern to extract symbol name from export declarations
_SYMBOL_PATTERN = re.compile(
    r"export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)"
)


def _grep_deprecations(root: Path, excludes: list[str]) -> list[dict]:
    """Scan TypeScript/JS files for @deprecated JSDoc tags.

    For each @deprecated tag found, extracts the symbol name from the
    next export declaration line following the JSDoc block.

    Args:
        root: Directory to scan recursively
        excludes: Glob patterns for files/dirs to skip

    Returns:
        List of dicts: {path, line, symbol, text}
    """
    results: list[dict] = []

    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue

        if file_path.suffix.lower() not in _DEPRECATION_EXTENSIONS:
            continue

        rel_path = str(file_path.relative_to(root))

        if _should_exclude(rel_path, excludes):
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, OSError):
            continue

        lines = content.split("\n")
        for line_num, line_text in enumerate(lines, start=1):
            match = _DEPRECATED_PATTERN.search(line_text)
            if not match:
                continue

            # Extract the @deprecated text
            deprecated_text = line_text.strip()

            # Look ahead for the symbol declaration
            symbol = ""
            for ahead in lines[line_num:]:  # line_num is already 1-indexed, so lines[line_num:] starts after current
                sym_match = _SYMBOL_PATTERN.search(ahead)
                if sym_match:
                    symbol = sym_match.group(1)
                    break
                # Stop looking if we hit another JSDoc or a blank line after the block closes
                stripped = ahead.strip()
                if stripped and not stripped.startswith("*") and not stripped.startswith("/") and not stripped == "":
                    break

            if symbol:
                results.append({
                    "path": rel_path,
                    "line": line_num,
                    "symbol": symbol,
                    "text": deprecated_text,
                })

    return results


def _count_callers(
    symbol: str, root: Path, defining_file: str
) -> tuple[int, list[str]]:
    """Count files that import/reference a deprecated symbol.

    Greps all TypeScript/JS files for the symbol name, excluding
    the file that defines it.

    Args:
        symbol: The deprecated symbol name to search for
        root: Directory to scan
        defining_file: Relative path of the file defining the symbol (excluded)

    Returns:
        (caller_count, list_of_caller_paths)
    """
    callers: list[str] = []

    for file_path in sorted(root.rglob("*")):
        if not file_path.is_file():
            continue

        if file_path.suffix.lower() not in _DEPRECATION_EXTENSIONS:
            continue

        rel_path = str(file_path.relative_to(root))

        if rel_path == defining_file:
            continue

        try:
            content = file_path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, OSError):
            continue

        if symbol in content:
            callers.append(rel_path)

    return len(callers), callers


async def analyze_deprecations(
    path: Path,
    excludes: list[str] | None = None,
) -> dict:
    """Analyze a directory for @deprecated symbols and their callers.

    Args:
        path: Directory to scan
        excludes: Additional file patterns to exclude

    Returns:
        Dict with success, deprecations (list of DeprecationMarker),
        summary (total_deprecations, deprecations_with_callers), and
        optionally error.
    """
    resolved = Path(path).resolve()

    if not resolved.exists():
        return {
            "success": False,
            "error": f"Path not found: {resolved}",
        }

    all_excludes = DEFAULT_EXCLUDES + (excludes or [])

    raw = _grep_deprecations(resolved, all_excludes)

    markers: list[DeprecationMarker] = []
    for item in raw:
        count, caller_list = _count_callers(
            item["symbol"], resolved, item["path"]
        )
        markers.append(DeprecationMarker(
            path=item["path"],
            line=item["line"],
            symbol=item["symbol"],
            text=item["text"],
            caller_count=count,
            callers=caller_list,
        ))

    with_callers = sum(1 for m in markers if m.caller_count > 0)

    return {
        "success": True,
        "deprecations": markers,
        "summary": {
            "total_deprecations": len(markers),
            "deprecations_with_callers": with_callers,
        },
    }
