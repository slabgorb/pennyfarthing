"""
Output formatters for hotspot analysis results.

Supports table, JSON, and CSV output — no external dependencies.
Uses common/output.py for colored terminal output.
"""

from __future__ import annotations

import csv
import io
import json
import sys
from dataclasses import asdict
from typing import TextIO

from pf.common.output import header, info
from pf.hotspots.models import (
    DirectoryHotspot,
    FileHotspot,
    HotspotResult,
    MultiRepoHotspotResult,
)


def format_file_table(hotspots: list[FileHotspot], top_n: int = 20) -> str:
    """Format file hotspots as a column-aligned table."""
    if not hotspots:
        return "  No file hotspots found."

    items = hotspots[:top_n]

    # Column headers and widths
    hdr = f"{'Score':>6}  {'Changes':>8}  {'Fixes':>6}  {'Authors':>8}  {'Churn':>8}  File"
    sep = f"{'------':>6}  {'--------':>8}  {'------':>6}  {'--------':>8}  {'--------':>8}  ----"

    lines = [hdr, sep]
    for h in items:
        lines.append(
            f"{h.hotspot_score:>6.1f}  {h.change_count:>8}  {h.bug_fix_count:>6}  "
            f"{h.author_count:>8}  {h.churn:>8}  {h.path}"
        )

    return "\n".join(lines)


def format_dir_table(hotspots: list[DirectoryHotspot], top_n: int = 20) -> str:
    """Format directory hotspots as a column-aligned table."""
    if not hotspots:
        return "  No directory hotspots found."

    items = hotspots[:top_n]

    hdr = f"{'Score':>6}  {'Files':>6}  {'Changes':>8}  {'Fixes':>6}  {'Avg Auth':>9}  Directory"
    sep = f"{'------':>6}  {'------':>6}  {'--------':>8}  {'------':>6}  {'---------':>9}  ---------"

    lines = [hdr, sep]
    for d in items:
        lines.append(
            f"{d.hotspot_score:>6.1f}  {d.file_count:>6}  {d.total_changes:>8}  "
            f"{d.total_bug_fixes:>6}  {d.avg_author_count:>9.1f}  {d.path}"
        )

    return "\n".join(lines)


def format_summary(result: HotspotResult, file: TextIO = sys.stderr) -> None:
    """Print a summary header for a single repo result."""
    header(f"  Hotspots: {result.repo_name}", char="=", width=60, file=file)
    info(f"Path: {result.repo_path}", file=file)
    info(f"Time window: {result.time_window_days} days", file=file)
    info(f"Commits analyzed: {result.commit_count}", file=file)
    info(f"File hotspots: {len(result.file_hotspots)}", file=file)
    info(f"Directory hotspots: {len(result.directory_hotspots)}", file=file)


def export_json(result: HotspotResult | MultiRepoHotspotResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(asdict(result), indent=2, default=str)


def export_csv(hotspots: list[FileHotspot]) -> str:
    """Export file hotspots as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "path",
        "change_count",
        "bug_fix_count",
        "author_count",
        "lines_added",
        "lines_deleted",
        "churn",
        "last_changed",
        "hotspot_score",
    ])
    for h in hotspots:
        writer.writerow([
            h.path,
            h.change_count,
            h.bug_fix_count,
            h.author_count,
            h.lines_added,
            h.lines_deleted,
            h.churn,
            h.last_changed,
            h.hotspot_score,
        ])
    return buf.getvalue()
