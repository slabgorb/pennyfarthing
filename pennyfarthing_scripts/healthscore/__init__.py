"""
Composite health score for codebase analysis.

Aggregates 8 dimensions into a single 0-100 weighted score:
churn, TODO density, complexity, test gaps, dead code,
deprecation debt, dependency freshness, agent context efficiency.
"""

from pennyfarthing_scripts.healthscore.analyze import analyze_healthscore
from pennyfarthing_scripts.healthscore.models import (
    DEFAULT_WEIGHTS,
    DimensionScore,
    HealthscoreResult,
)

__all__ = [
    "DimensionScore",
    "HealthscoreResult",
    "DEFAULT_WEIGHTS",
    "analyze_healthscore",
]
