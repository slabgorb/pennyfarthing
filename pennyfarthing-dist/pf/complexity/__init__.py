"""
Code complexity analysis for TypeScript/JavaScript projects.

Wraps eslint with complexity rules to extract per-file metrics:
cyclomatic complexity, function length, nesting depth, and line counts.
"""

from pf.complexity.analyze import analyze_complexity
from pf.complexity.models import ComplexityResult, FileComplexity

__all__ = [
    "FileComplexity",
    "ComplexityResult",
    "analyze_complexity",
]
