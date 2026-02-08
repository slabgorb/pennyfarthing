"""
Data models for code marker analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CodeMarker:
    """A single code marker (TODO, FIXME, HACK, XXX) found in source."""

    path: str
    line: int
    marker_type: str  # TODO, FIXME, HACK, XXX
    text: str  # Full comment text
    author: str = ""  # From git blame
    date: str = ""  # ISO date from git blame
    age_days: float = 0.0  # Computed from blame date
    is_stale: bool = False  # age_days > stale_threshold


@dataclass
class MarkerSummary:
    """Aggregate counts of markers by type."""

    total_markers: int = 0
    stale_markers: int = 0
    by_type: dict[str, int] = field(default_factory=dict)


@dataclass
class CodeMarkersResult:
    """Analysis result for a single repository."""

    success: bool
    repo_name: str
    repo_path: str
    stale_threshold_days: int
    markers: list[CodeMarker] = field(default_factory=list)
    summary: MarkerSummary | None = None
    error: str | None = None
