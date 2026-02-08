"""
Output formatters for dependency analysis results.

Supports table, JSON, and CSV output — no external dependencies.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict

from pennyfarthing_scripts.dependencies.models import (
    OutdatedPackage,
    SecurityAdvisory,
    DependenciesResult,
)


def format_outdated_table(packages: list[OutdatedPackage]) -> str:
    """Format outdated packages as column-aligned table."""
    if not packages:
        return "  No outdated packages found."

    hdr = f"{'Package':<30}  {'Current':<12}  {'Wanted':<12}  {'Latest':<12}  Type"
    sep = f"{'-' * 30}  {'-' * 12}  {'-' * 12}  {'-' * 12}  ----"

    lines = [hdr, sep]
    for p in packages:
        lines.append(
            f"{p.name:<30}  {p.current:<12}  {p.wanted:<12}  {p.latest:<12}  {p.type}"
        )
    return "\n".join(lines)


def format_audit_table(advisories: list[SecurityAdvisory]) -> str:
    """Format security advisories as table."""
    if not advisories:
        return "  No vulnerabilities found."

    hdr = f"{'Severity':<12}  {'Count':>6}"
    sep = f"{'-' * 12}  {'-' * 6}"

    lines = [hdr, sep]
    for a in advisories:
        lines.append(f"{a.severity:<12}  {a.count:>6}")
    return "\n".join(lines)


def export_json(result: DependenciesResult) -> str:
    """Serialize result to JSON string."""
    return json.dumps(asdict(result), indent=2, default=str)


def export_csv(packages: list[OutdatedPackage]) -> str:
    """Export outdated packages as CSV."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["name", "current", "wanted", "latest", "type"])
    for p in packages:
        writer.writerow([p.name, p.current, p.wanted, p.latest, p.type])
    return buf.getvalue()
