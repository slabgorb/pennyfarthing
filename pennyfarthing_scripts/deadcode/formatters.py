"""
Output formatters for dead code analysis results.

Supports table, JSON, and CSV output formats.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict

from pennyfarthing_scripts.deadcode.models import (
    DeadCodeResult,
    StaleFile,
    UnusedExport,
    UnusedExportResult,
)


def format_table(stale_files: list[StaleFile], top_n: int = 20) -> str:
    """Format stale files as a human-readable table."""
    if not stale_files:
        return "No stale files found."

    files = stale_files[:top_n]

    # Column widths
    path_width = max(len("Path"), max(len(f.path) for f in files))
    header = f"{'Path':<{path_width}}  {'Days':>6}  {'Size':>10}  {'Last Commit'}"
    separator = "-" * len(header)

    lines = [header, separator]
    for f in files:
        size_str = _format_size(f.size_bytes)
        date_str = f.last_commit_date[:10] if f.last_commit_date else "unknown"
        lines.append(
            f"{f.path:<{path_width}}  {f.days_since_last_commit:>6}  {size_str:>10}  {date_str}"
        )

    return "\n".join(lines)


def _format_size(size_bytes: int) -> str:
    """Format bytes as human-readable size."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def export_json(result: DeadCodeResult) -> str:
    """Export result as JSON."""
    return json.dumps(asdict(result), indent=2)


def export_csv(stale_files: list[StaleFile]) -> str:
    """Export stale files as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["path", "last_commit_date", "days_since_last_commit", "size_bytes"])
    for f in stale_files:
        writer.writerow([f.path, f.last_commit_date, f.days_since_last_commit, f.size_bytes])
    return output.getvalue()


# ---- Unused export formatters ----


def format_exports_table(unused_exports: list[UnusedExport], top_n: int = 20) -> str:
    """Format unused exports as a human-readable table."""
    if not unused_exports:
        return "No unused exports found."

    exports = unused_exports[:top_n]

    file_width = max(len("File"), max(len(ue.file) for ue in exports))
    symbol_width = max(len("Symbol"), max(len(ue.symbol) for ue in exports))
    header = f"{'File':<{file_width}}  {'Line':>5}  {'Symbol':<{symbol_width}}  {'Type'}"
    separator = "-" * len(header)

    lines = [header, separator]
    for ue in exports:
        lines.append(
            f"{ue.file:<{file_width}}  {ue.line:>5}  {ue.symbol:<{symbol_width}}  {ue.export_type}"
        )

    return "\n".join(lines)


def export_exports_json(result: UnusedExportResult) -> str:
    """Export unused export result as JSON."""
    return json.dumps(asdict(result), indent=2)


def export_exports_csv(unused_exports: list[UnusedExport]) -> str:
    """Export unused exports as CSV."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["symbol", "file", "line", "export_type"])
    for ue in unused_exports:
        writer.writerow([ue.symbol, ue.file, ue.line, ue.export_type])
    return output.getvalue()
