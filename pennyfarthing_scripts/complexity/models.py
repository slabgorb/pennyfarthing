"""
Data models for complexity analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FileComplexity:
    """Complexity metrics for a single file."""

    path: str
    total_lines: int = 0
    longest_function: int = 0
    avg_cyclomatic_complexity: float = 0.0
    max_nesting_depth: int = 0
    function_count: int = 0


@dataclass
class ComplexityResult:
    """Analysis result following ADR-0008 pattern."""

    success: bool
    target_path: str = ""
    file_count: int = 0
    files: list[FileComplexity] = field(default_factory=list)
    error: str | None = None
