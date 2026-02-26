"""Context validator adapter — validates context sources against schema.

Story: MSSCI-15683 (129-3) — Build Context Validator Python Module and CLI
"""

from __future__ import annotations

from pathlib import Path

from pf.validate import ValidateReport


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate context sources against the context schema."""
    from pf.context.validator import validate_context_sources

    result = validate_context_sources(root)

    report = ValidateReport(validator="context")
    report.passed = result.components_checked

    for err in result.errors:
        report.errors += 1
        report.details.append(f"[ERROR] {err.component}: {err.message}")

    for warn in result.warnings:
        if strict:
            report.errors += 1
            report.details.append(f"[ERROR] {warn.component}: {warn.message}")
        else:
            report.warnings += 1
            report.details.append(f"[WARN] {warn.component}: {warn.message}")

    return report
