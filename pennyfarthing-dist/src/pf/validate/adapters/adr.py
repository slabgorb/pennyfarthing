"""ADR (Architecture Decision Record) structural validator adapter.

Validates ADR files in docs/adr/ against consistent formatting conventions.
Checks required fields, section structure, status values, and file naming.
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.common.config import get_project_root
from pf.validate import ValidateReport

# Valid ADR status values
VALID_STATUSES = {"Proposed", "Accepted", "Deprecated", "Superseded"}

# Regex patterns
_TITLE_RE = re.compile(r"^#\s+ADR-(\d+):", re.MULTILINE)
_STATUS_RE = re.compile(r"\*\*Status:\*\*\s*(.+)", re.IGNORECASE)
_DATE_RE = re.compile(r"\*\*Date:\*\*\s*(\S+)", re.IGNORECASE)
_AUTHOR_RE = re.compile(r"\*\*Author:\*\*\s*(.+)", re.IGNORECASE)
_DATE_FORMAT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SECTION_RE = re.compile(r"^##\s+(.+)", re.MULTILINE)
_FILE_NAME_RE = re.compile(r"^(\d{4})-.+\.md$")

# Required sections (at least one from each group)
REQUIRED_SECTION_GROUPS = [
    ({"Context"}, "## Context"),
    (
        {"Decision", "Decision Outcome", "Considered Options"},
        "## Decision, ## Decision Outcome, or ## Considered Options",
    ),
]

RECOMMENDED_SECTION_GROUPS = [
    (
        {"Consequences", "Decision Drivers"},
        "## Consequences or ## Decision Drivers",
    ),
]


def _validate_adr(path: Path) -> tuple[list[str], list[str]]:
    """Validate a single ADR file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    # Title heading: # ADR-NNNN: ...
    title_match = _TITLE_RE.search(content)
    if not title_match:
        errors.append("Missing required '# ADR-NNNN:' title heading")
    else:
        adr_number = title_match.group(1)

        # File naming consistency
        file_match = _FILE_NAME_RE.match(path.name)
        if file_match:
            file_number = file_match.group(1)
            if file_number != adr_number:
                errors.append(
                    f"File number ({file_number}) doesn't match heading number ({adr_number})"
                )

    # Status field
    status_match = _STATUS_RE.search(content)
    if not status_match:
        errors.append("Missing required **Status:** field")
    else:
        status_val = status_match.group(1).strip()
        # Extract base status (first word) to handle "Superseded by ADR-0028" etc.
        base_status = status_val.split()[0].rstrip(",") if status_val else ""
        if base_status not in VALID_STATUSES:
            errors.append(
                f"Invalid status '{status_val}' "
                f"(must be one of: {', '.join(sorted(VALID_STATUSES))})"
            )

    # Date field
    date_match = _DATE_RE.search(content)
    if not date_match:
        errors.append("Missing required **Date:** field")
    else:
        date_val = date_match.group(1).strip()
        if not _DATE_FORMAT_RE.match(date_val):
            errors.append(f"Invalid date format '{date_val}' (expected YYYY-MM-DD)")

    # Author field
    author_match = _AUTHOR_RE.search(content)
    if not author_match:
        errors.append("Missing required **Author:** field")

    # Section headings
    sections = {m.group(1).strip() for m in _SECTION_RE.finditer(content)}

    for required_set, description in REQUIRED_SECTION_GROUPS:
        if not sections & required_set:
            errors.append(f"Missing required section: {description}")

    for recommended_set, description in RECOMMENDED_SECTION_GROUPS:
        if not sections & recommended_set:
            warnings.append(f"Missing recommended section: {description}")

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all ADR files."""
    report = ValidateReport(validator="adr")

    # ADRs live at {project_root}/docs/adr/ (orchestrator level)
    # Also check inside pennyfarthing/ for framework-level ADRs
    adr_dirs: list[Path] = []

    try:
        project_root = get_project_root(start_dir=root)
    except FileNotFoundError:
        project_root = root

    # Primary: orchestrator docs/adr/
    orch_adr = project_root / "docs" / "adr"
    if orch_adr.is_dir():
        adr_dirs.append(orch_adr)

    # Also check root/docs/adr/ if root != project_root
    if root != project_root:
        root_adr = root / "docs" / "adr"
        if root_adr.is_dir() and root_adr not in adr_dirs:
            adr_dirs.append(root_adr)

    if not adr_dirs:
        report.details.append("[WARN] No docs/adr/ directory found")
        report.warnings += 1
        return report

    for adr_dir in adr_dirs:
        for path in sorted(adr_dir.glob("*.md")):
            if path.name == "README.md":
                continue

            file_errors, file_warnings = _validate_adr(path)

            for e in file_errors:
                report.errors.append(f"{path.name}: {e}")
                report.details.append(f"[ERROR] {path.name}: {e}")

            for w in file_warnings:
                if strict:
                    report.errors.append(f"{path.name}: {w}")
                    report.details.append(f"[ERROR] {path.name}: {w}")
                else:
                    report.warnings += 1
                    report.details.append(f"[WARN] {path.name}: {w}")

            if not file_errors:
                report.passed += 1

    return report
