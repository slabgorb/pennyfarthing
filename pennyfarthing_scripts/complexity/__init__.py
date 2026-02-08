"""
Code complexity analysis for TypeScript/JavaScript projects.

Wraps eslint with complexity rules to extract per-file metrics:
cyclomatic complexity, function length, nesting depth, and line counts.
"""

from pennyfarthing_scripts.complexity.models import FileComplexity, ComplexityResult
from pennyfarthing_scripts.complexity.analyze import analyze_complexity

__all__ = [
    "FileComplexity",
    "ComplexityResult",
    "analyze_complexity",
]
