"""
Output formatters for dependency analysis results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

from pennyfarthing_scripts.dependencies.models import (
    OutdatedPackage,
    SecurityAdvisory,
    DependenciesResult,
)


def format_outdated_table(packages: list[OutdatedPackage]) -> str:
    """Format outdated packages as column-aligned table. Stub."""
    raise NotImplementedError("format_outdated_table not implemented")


def format_audit_table(advisories: list[SecurityAdvisory]) -> str:
    """Format security advisories as table. Stub."""
    raise NotImplementedError("format_audit_table not implemented")


def export_json(result: DependenciesResult) -> str:
    """Serialize result to JSON string. Stub."""
    raise NotImplementedError("export_json not implemented")


def export_csv(packages: list[OutdatedPackage]) -> str:
    """Export outdated packages as CSV. Stub."""
    raise NotImplementedError("export_csv not implemented")
