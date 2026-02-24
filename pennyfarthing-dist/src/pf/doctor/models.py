"""Data models for doctor health checks.

Story 126-8: Reduce doctor to ~10 health checks with --fix mode.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from collections.abc import Callable


@dataclass
class CheckResult:
    """Result of a single health check."""

    name: str
    status: str  # "pass", "warn", "fail"
    detail: str = ""
    fix_fn: Callable[[], bool] | None = None


@dataclass
class DoctorReport:
    """Aggregate report from all health checks. Follows ADR-0008."""

    success: bool = False
    checks: list[CheckResult] = field(default_factory=list)
    fixed: int = 0
    error: str | None = None
