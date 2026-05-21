"""
SWE-bench utilities for Pennyfarthing scripts.

Provides shared functionality for SWE-bench scenario evaluation:
- Patch parsing and analysis
- Ground truth data loading
- Scenario lookup

Consolidates duplicate code from:
- pennyfarthing-dist/scripts/test/ground-truth-judge.py
- pennyfarthing-dist/scripts/test/swebench-judge.py
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Default cache location for SWE-bench data
DEFAULT_CACHE_PATH = "/tmp/swebench_all.json"


@dataclass
class PatchInfo:
    """Structured information extracted from a git diff patch."""

    files: list[str] = field(default_factory=list)
    """Files modified in the patch (e.g., 'src/flask/app.py')"""

    functions: list[str] = field(default_factory=list)
    """Function/class context from @@ headers (e.g., 'def create_app')"""

    additions: list[str] = field(default_factory=list)
    """Lines added (without leading +), excluding comments"""

    deletions: list[str] = field(default_factory=list)
    """Lines deleted (without leading -), excluding comments"""

    key_patterns: list[str] = field(default_factory=list)
    """Unique identifier patterns extracted from additions"""


def extract_patch_info(patch_text: str) -> PatchInfo:
    """Extract structured information from a git diff patch.

    Parses unified diff format to extract:
    - Modified files from 'diff --git' lines
    - Function/class context from @@ headers
    - Added and deleted lines (excluding diff markers and comments)
    - Key code patterns (identifiers) from additions

    Args:
        patch_text: Raw patch text in unified diff format

    Returns:
        PatchInfo dataclass with extracted elements
    """
    info = PatchInfo()

    for line in patch_text.split("\n"):
        # File changes: diff --git a/path b/path
        if line.startswith("diff --git"):
            match = re.search(r"b/(.+)$", line)
            if match:
                info.files.append(match.group(1))

        # Function/class context: @@ -10,5 +10,7 @@ def some_function
        elif line.startswith("@@"):
            match = re.search(r"@@.*@@\s*(.+)$", line)
            if match:
                info.functions.append(match.group(1).strip())

        # Additions (skip +++ header lines and comments)
        elif line.startswith("+") and not line.startswith("+++"):
            clean_line = line[1:].strip()
            if clean_line and not clean_line.startswith("#"):
                info.additions.append(clean_line)
                # Extract identifier patterns
                patterns = re.findall(r"\b\w+\b", clean_line)
                info.key_patterns.extend(patterns)

        # Deletions (skip --- header lines and comments)
        elif line.startswith("-") and not line.startswith("---"):
            clean_line = line[1:].strip()
            if clean_line and not clean_line.startswith("#"):
                info.deletions.append(clean_line)

    # Deduplicate key patterns
    info.key_patterns = list(set(info.key_patterns))

    return info


def load_swebench_data(cache_path: str | Path = DEFAULT_CACHE_PATH) -> list[dict[str, Any]]:
    """Load SWE-bench dataset from cache file.

    Args:
        cache_path: Path to the cached JSON file

    Returns:
        List of SWE-bench scenario dicts

    Raises:
        FileNotFoundError: If cache file doesn't exist
        json.JSONDecodeError: If cache file is invalid JSON
    """
    with open(cache_path) as f:
        return json.load(f)


def find_scenario(
    data: list[dict[str, Any]],
    scenario_name: str,
) -> dict[str, Any] | None:
    """Find a scenario in SWE-bench data by name.

    Handles various naming formats:
    - 'flask-5014' matches 'pallets__flask-5014'
    - 'pallets__flask-5014' matches directly

    Args:
        data: List of SWE-bench scenario dicts
        scenario_name: Scenario name to find (flexible matching)

    Returns:
        Scenario dict if found, None otherwise
    """
    for item in data:
        instance_id = item.get("instance_id", "")

        # Try various matching strategies
        # Match against normalized ID (pallets__flask-5014 -> pallets-flask-5014)
        if scenario_name in instance_id.replace("__", "-"):
            return item

        # Match with __ separator (flask-5014 -> flask__5014)
        if scenario_name.replace("-", "__") in instance_id:
            return item

        # Direct match
        if scenario_name == instance_id:
            return item

    return None


def extract_problem_keywords(problem_statement: str) -> list[str]:
    """Extract key technical terms from a problem statement.

    Finds:
    - Quoted strings (backticks, single/double quotes)
    - CamelCase identifiers
    - snake_case identifiers
    - Error/Exception class names

    Args:
        problem_statement: The problem description text

    Returns:
        List of unique keywords (max 10)
    """
    if not problem_statement:
        return []

    keywords = []

    # Find quoted terms
    quoted = re.findall(r"[`'\"]([^`'\"]+)[`'\"]", problem_statement)
    keywords.extend(quoted)

    # Find CamelCase identifiers (e.g., TypeError, RequestContext)
    camel_case = re.findall(r"\b[A-Z][a-z]+[A-Z]\w*\b", problem_statement)
    keywords.extend(camel_case)

    # Find snake_case identifiers (e.g., request_context, app_config)
    snake_case = re.findall(r"\b\w+_\w+\b", problem_statement)
    keywords.extend(snake_case)

    # Find Error/Exception class names
    errors = re.findall(r"\b\w+Error\b|\b\w+Exception\b", problem_statement)
    keywords.extend(errors)

    # Deduplicate and limit
    return list(set(keywords))[:10]


def get_meaningful_patterns(
    key_patterns: list[str],
    exclude_common: bool = True,
) -> list[str]:
    """Filter key patterns to meaningful identifiers.

    Removes common Python keywords and short tokens that aren't
    useful for matching.

    Args:
        key_patterns: Raw patterns from patch analysis
        exclude_common: Whether to exclude common words (default True)

    Returns:
        Filtered list of meaningful patterns
    """
    common_words = {
        "if",
        "else",
        "elif",
        "return",
        "self",
        "def",
        "class",
        "for",
        "in",
        "not",
        "and",
        "or",
        "is",
        "none",
        "true",
        "false",
        "import",
        "from",
        "as",
        "with",
        "try",
        "except",
        "finally",
        "raise",
        "pass",
        "break",
        "continue",
        "while",
    }

    if exclude_common:
        return [p for p in key_patterns if p.lower() not in common_words and len(p) > 2]
    return key_patterns
