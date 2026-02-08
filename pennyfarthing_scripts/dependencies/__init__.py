"""
Dependency staleness and security analysis for Node.js projects.

Wraps npm outdated and npm audit to detect outdated packages
and security vulnerabilities.
"""

from pennyfarthing_scripts.dependencies.models import (
    OutdatedPackage,
    SecurityAdvisory,
    DependenciesResult,
)
from pennyfarthing_scripts.dependencies.analyze import analyze_dependencies

__all__ = [
    "OutdatedPackage",
    "SecurityAdvisory",
    "DependenciesResult",
    "analyze_dependencies",
]
