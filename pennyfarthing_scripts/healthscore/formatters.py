"""
Output formatters for health score results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

from pennyfarthing_scripts.healthscore.models import HealthscoreResult


def format_table(result: HealthscoreResult) -> str:
    """Format health score results as column-aligned table."""
    raise NotImplementedError("format_table not yet implemented")


def export_json(result: HealthscoreResult) -> str:
    """Serialize result to JSON string."""
    raise NotImplementedError("export_json not yet implemented")


def export_csv(result: HealthscoreResult) -> str:
    """Export dimension scores as CSV."""
    raise NotImplementedError("export_csv not yet implemented")
