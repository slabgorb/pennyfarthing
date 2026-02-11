"""
Output formatters for code marker analysis results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

import csv
import io
import json
import sys
from dataclasses import asdict
from typing import TextIO

from pennyfarthing_scripts.codemarkers.models import (
    CodeMarker,
    CodeMarkersResult,
)


def format_marker_table(markers: list[CodeMarker], top_n: int = 20) -> str:
    """Format code markers as a column-aligned table."""
    if not markers:
        return "  No markers found."

    items = markers[:top_n]

    hdr = f"{'Type':>6}  {'Age':>6}  {'Stale':>5}  {'Author':>12}  {'Line':>5}  File"
    sep = f"{'------':>6}  {'------':>6}  {'-----':>5}  {'------------':>12}  {'-----':>5}  ----"

    lines = [hdr, sep]
    for m in items:
        stale = "YES" if m.is_stale else ""
        age = f"{m.age_days:.0f}d" if m.age_days > 0 else ""
        author = (m.author[:12] if len(m.author) > 12 else m.author) if m.author else ""
        lines.append(
            f"{m.marker_type:>6}  {age:>6}  {stale:>5}  {author:>12}  {m.line:>5}  {m.path}"
        )

    return "\n".join(lines)


def format_summary(result: CodeMarkersResult, file: TextIO = sys.stderr) -> None:
    """Print a summary header for a single repo result."""
    from pennyfarthing_scripts.common.output import header, info

    header(f"  Code Markers: {result.repo_name}", char="=", width=60, file=file)
    info(f"Path: {result.repo_path}", file=file)
    info(f"Stale threshold: {result.stale_threshold_days} days", file=file)
    if result.summary:
        info(f"Total markers: {result.summary.total_markers}", file=file)
        info(f"Stale markers: {result.summary.stale_markers}", file=file)
        for mtype, count in sorted(result.summary.by_type.items()):
            info(f"  {mtype}: {count}", file=file)


def export_json(result: CodeMarkersResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(asdict(result), indent=2, default=str)


def export_csv(markers: list[CodeMarker]) -> str:
    """Export markers as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "path",
        "line",
        "marker_type",
        "text",
        "author",
        "date",
        "age_days",
        "is_stale",
    ])
    for m in markers:
        writer.writerow([
            m.path,
            m.line,
            m.marker_type,
            m.text,
            m.author,
            m.date,
            m.age_days,
            m.is_stale,
        ])
    return buf.getvalue()
