"""
Output formatters for dead code analysis results.

Supports table, JSON, and CSV output formats.
"""

from __future__ import annotations

from pennyfarthing_scripts.deadcode.models import DeadCodeResult, StaleFile


def format_table(stale_files: list[StaleFile], top_n: int = 20) -> str:
    """Format stale files as a human-readable table. Stub — not yet implemented."""
    raise NotImplementedError("format_table not implemented")


def export_json(result: DeadCodeResult) -> str:
    """Export result as JSON. Stub — not yet implemented."""
    raise NotImplementedError("export_json not implemented")


def export_csv(stale_files: list[StaleFile]) -> str:
    """Export stale files as CSV. Stub — not yet implemented."""
    raise NotImplementedError("export_csv not implemented")
