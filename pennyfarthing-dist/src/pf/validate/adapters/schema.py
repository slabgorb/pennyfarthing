"""XML schema validator adapter.

Delegates to migration/validate.validate_all() for session, skill, and workflow step files.
"""

from __future__ import annotations

from pathlib import Path

from pf.validate import ValidateReport


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate XML schema files (sessions, skills, workflow steps)."""
    from pf.migration.validate import validate_all

    summary = validate_all(root, file_type="all", strict=strict)

    report = ValidateReport(validator="schema")
    report.passed = summary.passed
    report.warnings = summary.warnings

    for result in summary.results:
        for e in result.errors:
            msg = f"{result.file_path.name}: {e}"
            report.errors.append(msg)
            report.details.append(f"[ERROR] {msg}")
        for w in result.warnings:
            report.details.append(f"[WARN] {result.file_path.name}: {w}")

    return report
