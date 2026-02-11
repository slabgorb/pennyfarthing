"""
Data models for health score analysis results.

Follows ADR-0008 result pattern — structured dataclasses with success/error fields.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Default weights for each dimension (must sum to 1.0)
DEFAULT_WEIGHTS: dict[str, float] = {
    "churn": 0.15,
    "todo_density": 0.15,
    "complexity": 0.15,
    "test_gaps": 0.15,
    "dead_code": 0.10,
    "deprecation_debt": 0.10,
    "dependency_freshness": 0.10,
    "agent_context_efficiency": 0.10,
}


@dataclass
class DimensionScore:
    """Score for a single health dimension."""

    name: str
    score: float | None = None  # 0-100, None if unavailable
    weight: float = 0.0
    error: str | None = None


@dataclass
class HealthscoreResult:
    """Composite health score following ADR-0008 pattern."""

    success: bool
    composite_score: float = 0.0  # 0-100 weighted average
    target_path: str = ""
    dimensions: list[DimensionScore] = field(default_factory=list)
    cached: bool = False
    error: str | None = None
