"""
Code marker analysis — TODO, FIXME, HACK, XXX detection with git blame.

Story 80-1: Python codemarkers module.
Story 80-2: @deprecated detection and caller cross-reference.
"""

from pennyfarthing_scripts.codemarkers.models import (
    CodeMarker,
    CodeMarkersResult,
    DeprecationMarker,
    MarkerSummary,
)
from pennyfarthing_scripts.codemarkers.analyze import analyze_deprecations, analyze_repo

__all__ = [
    "CodeMarker",
    "CodeMarkersResult",
    "DeprecationMarker",
    "MarkerSummary",
    "analyze_deprecations",
    "analyze_repo",
]
