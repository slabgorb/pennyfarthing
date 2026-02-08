"""
Data models for dead code analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StaleFile:
    """A file detected as stale (no commits within time window)."""

    path: str
    last_commit_date: str = ""  # ISO 8601
    days_since_last_commit: int = 0
    size_bytes: int = 0


@dataclass
class DeadCodeResult:
    """Analysis result for stale file detection in a single repository."""

    success: bool
    repo_name: str
    repo_path: str
    time_window_days: int
    stale_files: list[StaleFile] = field(default_factory=list)
    total_files: int = 0
    error: str | None = None


@dataclass
class UnusedExport:
    """An exported symbol with no importers, detected by ts-prune."""

    symbol: str
    file: str
    line: int
    export_type: str = "named"  # named, default, re-export


@dataclass
class UnusedExportResult:
    """Analysis result for unused export detection in a single repository."""

    success: bool
    repo_name: str
    repo_path: str
    unused_exports: list[UnusedExport] = field(default_factory=list)
    total_exports_scanned: int = 0
    error: str | None = None
