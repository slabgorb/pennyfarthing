"""Structured finding documentation for reviewer assessments.

Every finding from every specialist must be documented with a clear
disposition: FIX (blocks approval) or RECORD (acknowledged, not blocking).

Story: 150-20
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

VALID_SEVERITIES = frozenset({"HIGH", "MEDIUM", "LOW"})
VALID_DISPOSITIONS = frozenset({"FIX", "RECORD"})


@dataclass
class Finding:
    """A single reviewer finding with go/no-go disposition.

    Fields:
        id: Unique finding identifier (e.g. F001)
        source: Subagent name that produced the finding
        severity: HIGH, MEDIUM, or LOW
        description: What was found
        disposition: FIX (blocks approval) or RECORD (acknowledged)
        rationale: Why this disposition was chosen
    """

    id: str
    source: str
    severity: str
    description: str
    disposition: str
    rationale: str

    def __post_init__(self) -> None:
        if self.severity not in VALID_SEVERITIES:
            raise ValueError(
                f"Invalid severity '{self.severity}'. Must be one of: {', '.join(sorted(VALID_SEVERITIES))}"
            )
        if self.disposition not in VALID_DISPOSITIONS:
            raise ValueError(
                f"Invalid disposition '{self.disposition}'. Must be one of: {', '.join(sorted(VALID_DISPOSITIONS))}"
            )


def _is_separator_row(row: str) -> bool:
    """Check if a markdown table row is a separator (all dashes/pipes)."""
    cleaned = row.strip().strip("|").strip()
    return bool(cleaned) and all(c in "-| " for c in cleaned)


def parse_findings_from_assessment(assessment: str) -> list[Finding]:
    """Parse findings from a reviewer assessment markdown section.

    Expects a markdown table with columns:
    ID | Source | Severity | Description | Disposition | Rationale

    Returns an empty list if no findings table is found.
    """
    lines = assessment.strip().split("\n")

    # Find the table header row containing "ID" and "Source"
    header_idx = None
    for i, line in enumerate(lines):
        if "|" in line and "ID" in line and "Source" in line:
            header_idx = i
            break

    if header_idx is None:
        return []

    findings: list[Finding] = []

    # Process rows after the header (skip separator row)
    for line in lines[header_idx + 1 :]:
        line = line.strip()
        if not line or not line.startswith("|"):
            continue
        if _is_separator_row(line):
            continue

        # Split on pipe, strip whitespace, drop empty first/last from leading/trailing |
        cells = [c.strip() for c in line.split("|")]
        # Remove empty strings from leading/trailing pipes
        cells = [c for c in cells if c or cells.index(c) not in (0, len(cells) - 1)]
        # Filter out truly empty entries from split
        cells = [c for c in cells if c]

        if len(cells) < 6:
            continue

        finding_id, source, severity, description, disposition, rationale = (
            cells[0],
            cells[1],
            cells[2],
            cells[3],
            cells[4],
            cells[5],
        )

        try:
            findings.append(
                Finding(
                    id=finding_id,
                    source=source,
                    severity=severity,
                    description=description,
                    disposition=disposition,
                    rationale=rationale,
                )
            )
        except ValueError:
            # Skip rows with invalid severity/disposition
            continue

    return findings


def validate_findings_completeness(findings: list[Finding]) -> dict:
    """Check that findings meet documentation requirements.

    Rules:
    - Every finding must have a disposition (FIX or RECORD)
    - HIGH severity findings must be FIX (not RECORD)

    Returns:
        {"valid": bool, "errors": [str]}
    """
    errors: list[str] = []

    for f in findings:
        if f.severity == "HIGH" and f.disposition == "RECORD":
            errors.append(
                f"Finding {f.id}: HIGH severity must have disposition FIX, not RECORD"
            )

    return {"valid": len(errors) == 0, "errors": errors}


def format_findings_table(findings: list[Finding]) -> str:
    """Render findings as a markdown table.

    Returns a complete markdown table with header, separator, and data rows.
    For empty findings, returns a header-only table.
    """
    header = "| ID | Source | Severity | Description | Disposition | Rationale |"
    separator = "|----|--------|----------|-------------|-------------|-----------|"

    if not findings:
        return f"{header}\n{separator}\n"

    rows = []
    for f in findings:
        rows.append(
            f"| {f.id} | {f.source} | {f.severity} | {f.description} | {f.disposition} | {f.rationale} |"
        )

    return f"{header}\n{separator}\n" + "\n".join(rows) + "\n"
