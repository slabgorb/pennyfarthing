"""
Output formatters for health score results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict

from pennyfarthing_scripts.healthscore.models import HealthscoreResult


def format_table(result: HealthscoreResult) -> str:
    """Format health score results as column-aligned table."""
    lines = [
        f"Health Score: {result.composite_score:.1f} / 100",
        "",
        f"{'Dimension':<30}  {'Score':>6}  {'Weight':>6}",
        f"{'-' * 30}  {'------':>6}  {'------':>6}",
    ]

    for dim in result.dimensions:
        score_str = f"{dim.score:.1f}" if dim.score is not None else "N/A"
        weight_pct = f"{dim.weight * 100:.0f}%"
        lines.append(f"{dim.name:<30}  {score_str:>6}  {weight_pct:>6}")

    return "\n".join(lines)


def export_json(result: HealthscoreResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(asdict(result), indent=2, default=str)


def export_csv(result: HealthscoreResult) -> str:
    """Export dimension scores as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["dimension", "score", "weight", "error"])
    for dim in result.dimensions:
        writer.writerow([dim.name, dim.score, dim.weight, dim.error or ""])
    return buf.getvalue()
