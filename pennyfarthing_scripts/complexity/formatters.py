"""
Output formatters for complexity analysis results.

Supports table, JSON, and CSV output.
Stub implementation — to be completed by Dev.
"""

from __future__ import annotations

from pennyfarthing_scripts.complexity.models import FileComplexity, ComplexityResult


def format_file_table(files: list[FileComplexity], top_n: int = 20) -> str:
    """Format complexity results as column-aligned table."""
    raise NotImplementedError("format_file_table not implemented")


def export_json(result: ComplexityResult) -> str:
    """Serialize result to JSON string."""
    raise NotImplementedError("export_json not implemented")


def export_csv(files: list[FileComplexity]) -> str:
    """Export file complexity data as CSV."""
    raise NotImplementedError("export_csv not implemented")
