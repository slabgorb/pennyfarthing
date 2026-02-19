"""
Data models for hotspot analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FileHotspot:
    """Hotspot data for a single file."""

    path: str
    change_count: int = 0
    bug_fix_count: int = 0
    author_count: int = 0
    lines_added: int = 0
    lines_deleted: int = 0
    churn: int = 0  # lines_added + lines_deleted
    last_changed: str = ""  # ISO date string
    hotspot_score: float = 0.0  # 0–100 composite score


@dataclass
class DirectoryHotspot:
    """Hotspot data aggregated to directory level."""

    path: str
    file_count: int = 0
    total_changes: int = 0
    total_bug_fixes: int = 0
    avg_author_count: float = 0.0
    hotspot_score: float = 0.0


@dataclass
class HotspotResult:
    """Analysis result for a single repository."""

    success: bool
    repo_name: str
    repo_path: str
    time_window_days: int
    commit_count: int = 0
    file_hotspots: list[FileHotspot] = field(default_factory=list)
    directory_hotspots: list[DirectoryHotspot] = field(default_factory=list)
    error: str | None = None


@dataclass
class MultiRepoHotspotResult:
    """Analysis result spanning multiple repositories."""

    success: bool
    repo_results: list[HotspotResult] = field(default_factory=list)
    error: str | None = None
