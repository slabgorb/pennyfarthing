"""
Output formatters for complexity analysis results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict

from pf.complexity.models import ComplexityResult, FileComplexity


def format_file_table(files: list[FileComplexity], top_n: int = 20) -> str:
    """Format complexity results as column-aligned table."""
    if not files:
        return "  No complexity results found."

    items = files[:top_n]

    hdr = f"{'Complexity':>11}  {'Longest Fn':>11}  {'Nesting':>8}  {'Functions':>10}  {'Lines':>6}  File"
    sep = f"{'-----------':>11}  {'-----------':>11}  {'--------':>8}  {'----------':>10}  {'------':>6}  ----"

    lines = [hdr, sep]
    for f in items:
        lines.append(
            f"{f.avg_cyclomatic_complexity:>11.1f}  {f.longest_function:>11}  "
            f"{f.max_nesting_depth:>8}  {f.function_count:>10}  "
            f"{f.total_lines:>6}  {f.path}"
        )

    return "\n".join(lines)


def export_json(result: ComplexityResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(asdict(result), indent=2, default=str)


def export_csv(files: list[FileComplexity]) -> str:
    """Export file complexity data as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "path",
            "total_lines",
            "longest_function",
            "avg_cyclomatic_complexity",
            "max_nesting_depth",
            "function_count",
        ]
    )
    for f in files:
        writer.writerow(
            [
                f.path,
                f.total_lines,
                f.longest_function,
                f.avg_cyclomatic_complexity,
                f.max_nesting_depth,
                f.function_count,
            ]
        )
    return buf.getvalue()
