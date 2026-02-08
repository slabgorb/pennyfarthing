"""
Core complexity analysis engine.

Wraps eslint --format json with complexity/max-depth/max-lines-per-function rules.
Stub implementation — to be completed by Dev.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from pennyfarthing_scripts.complexity.models import FileComplexity, ComplexityResult


def _find_eslint(target_path: Path) -> Path | None:
    """Find eslint binary in node_modules/.bin/."""
    raise NotImplementedError("_find_eslint not implemented")


def _parse_eslint_output(output: str, target_path: Path) -> list[FileComplexity]:
    """Parse eslint JSON output into FileComplexity models."""
    raise NotImplementedError("_parse_eslint_output not implemented")


async def _run_eslint(eslint_bin: Path, target_path: Path) -> tuple[str, str, int]:
    """Run eslint subprocess with complexity rules."""
    raise NotImplementedError("_run_eslint not implemented")


async def _count_file_lines(file_path: Path) -> int:
    """Count lines in a file."""
    raise NotImplementedError("_count_file_lines not implemented")


async def analyze_complexity(
    target_path: Path,
    excludes: list[str] | None = None,
) -> ComplexityResult:
    """Analyze complexity of files in the target directory."""
    raise NotImplementedError("analyze_complexity not implemented")
