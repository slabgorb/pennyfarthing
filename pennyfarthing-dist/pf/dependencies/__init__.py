"""
Dependency staleness and security analysis for Node.js projects.

Wraps npm outdated and npm audit to detect outdated packages
and security vulnerabilities.
"""

from pf.dependencies.analyze import analyze_dependencies
from pf.dependencies.models import (
    DependenciesResult,
    OutdatedPackage,
    SecurityAdvisory,
)

__all__ = [
    "OutdatedPackage",
    "SecurityAdvisory",
    "DependenciesResult",
    "analyze_dependencies",
]
