"""
Core complexity analysis engine.

Wraps eslint --format json with complexity/max-depth/max-lines-per-function rules.
Parses output into per-file metrics following ADR-0008 result pattern.
"""

from __future__ import annotations

import asyncio
import fnmatch
import json
import re
from pathlib import Path

from pf.complexity.models import ComplexityResult, FileComplexity

# Regex patterns for extracting numeric values from ESLint messages
COMPLEXITY_RE = re.compile(r"complexity of (\d+)")
MAX_DEPTH_RE = re.compile(r"too deeply \((\d+)\)")
MAX_LINES_RE = re.compile(r"too many lines \((\d+)\)")


def _find_eslint(target_path: Path) -> Path | None:
    """Find eslint binary in node_modules/.bin/.

    Walks up from target_path looking for node_modules/.bin/eslint.
    """
    candidate = target_path / "node_modules" / ".bin" / "eslint"
    if candidate.exists():
        return candidate

    for parent in target_path.parents:
        candidate = parent / "node_modules" / ".bin" / "eslint"
        if candidate.exists():
            return candidate

    return None


def _parse_eslint_output(output: str, target_path: Path) -> list[FileComplexity]:
    """Parse eslint JSON output into FileComplexity models.

    Extracts per-file metrics from ESLint rule violations:
    - complexity rule → cyclomatic complexity per function
    - max-depth rule → nesting depth
    - max-lines-per-function rule → function line count
    """
    try:
        data = json.loads(output)
    except (json.JSONDecodeError, TypeError):
        return []

    if not data:
        return []

    target_str = str(target_path)
    if not target_str.endswith("/"):
        target_str += "/"

    files = []
    for file_entry in data:
        file_path = file_entry.get("filePath", "")
        messages = file_entry.get("messages", [])

        # Make path relative to target directory
        if file_path.startswith(target_str):
            rel_path = file_path[len(target_str) :]
        else:
            rel_path = file_path

        complexities = []
        depths = []
        line_counts = []

        for msg in messages:
            rule_id = msg.get("ruleId", "")
            message = msg.get("message", "")

            if rule_id == "complexity":
                m = COMPLEXITY_RE.search(message)
                if m:
                    complexities.append(int(m.group(1)))

            elif rule_id == "max-depth":
                m = MAX_DEPTH_RE.search(message)
                if m:
                    depths.append(int(m.group(1)))

            elif rule_id == "max-lines-per-function":
                m = MAX_LINES_RE.search(message)
                if m:
                    line_counts.append(int(m.group(1)))

        function_count = len(complexities)
        avg_complexity = sum(complexities) / len(complexities) if complexities else 0.0
        max_nesting = max(depths) if depths else 0
        longest_fn = max(line_counts) if line_counts else 0

        files.append(
            FileComplexity(
                path=rel_path,
                total_lines=0,  # populated by _count_file_lines
                longest_function=longest_fn,
                avg_cyclomatic_complexity=round(avg_complexity, 1),
                max_nesting_depth=max_nesting,
                function_count=function_count,
            )
        )

    return files


async def _run_eslint(eslint_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run eslint subprocess with complexity rules enabled."""
    proc = await asyncio.create_subprocess_exec(
        str(eslint_bin),
        str(target_path),
        "--format",
        "json",
        "--no-config-lookup",
        "--rule",
        'complexity: ["warn", 1]',
        "--rule",
        'max-depth: ["warn", 1]',
        "--rule",
        'max-lines-per-function: ["warn", 1]',
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
        proc.returncode or 0,
    )


async def _count_file_lines(file_path: Path) -> int:
    """Count lines in a file."""
    try:
        content = file_path.read_bytes()
        return content.count(b"\n") + (1 if content and not content.endswith(b"\n") else 0)
    except OSError:
        return 0


def _should_exclude(path: str, patterns: list[str]) -> bool:
    """Check if a file path matches any exclusion pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
        # Check basename
        if fnmatch.fnmatch(path.split("/")[-1], pattern):
            return True
        # Check if any parent directory matches (e.g. node_modules/* matches node_modules/lib/foo.ts)
        parts = path.split("/")
        for i in range(len(parts)):
            partial = "/".join(parts[: i + 1])
            if fnmatch.fnmatch(partial, pattern):
                return True
    return False


async def analyze_complexity(
    target_path: Path,
    excludes: list[str] | None = None,
) -> ComplexityResult:
    """Analyze complexity of files in the target directory."""
    resolved = target_path.resolve()

    eslint_bin = _find_eslint(resolved)
    if eslint_bin is None:
        return ComplexityResult(
            success=False,
            target_path=str(resolved),
            error="eslint not found. Install with: npm install -D eslint",
        )

    stdout, stderr, rc = await _run_eslint(eslint_bin, resolved)

    # Try resolved path first, fall back to original (handles /tmp → /private/tmp on macOS)
    files = _parse_eslint_output(stdout, resolved)
    if not files or (files and files[0].path.startswith("/")):
        alt_files = _parse_eslint_output(stdout, target_path)
        if alt_files and (not files or not alt_files[0].path.startswith("/")):
            files = alt_files

    if not files:
        return ComplexityResult(
            success=True,
            target_path=str(resolved),
            file_count=0,
            files=[],
        )

    # Apply exclude filters
    if excludes:
        files = [f for f in files if not _should_exclude(f.path, excludes)]

    # Count lines for each file
    for fc in files:
        full_path = resolved / fc.path
        fc.total_lines = await _count_file_lines(full_path)

    return ComplexityResult(
        success=True,
        target_path=str(resolved),
        file_count=len(files),
        files=files,
    )
