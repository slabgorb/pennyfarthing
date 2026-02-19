"""
Data models for dependency analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class OutdatedPackage:
    """A package with available updates."""

    name: str = ""
    current: str = ""
    wanted: str = ""
    latest: str = ""
    type: str = ""


@dataclass
class SecurityAdvisory:
    """Aggregated vulnerability count per severity level."""

    severity: str = ""
    count: int = 0


@dataclass
class DependenciesResult:
    """Analysis result following ADR-0008 pattern."""

    success: bool = False
    target_path: str = ""
    outdated: list[OutdatedPackage] = field(default_factory=list)
    advisories: list[SecurityAdvisory] = field(default_factory=list)
    error: str | None = None
