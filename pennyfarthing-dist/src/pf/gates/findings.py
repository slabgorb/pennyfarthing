"""Finding format validation gate.

Validates that all Delivery Findings in a session file conform to the R1 format:
  - **{Type}** ({urgency}): {description}. Affects `{path}` ({action}). *Found by {Agent} during {phase}.*

Valid types: Gap, Conflict, Question, Improvement
Valid urgencies: blocking, non-blocking

Exit codes:
  0 — pass (all valid, or no section, or explicit no-findings)
  1 — fail (malformed findings)

Story: 133-3
"""

from __future__ import annotations

import re
from pathlib import Path

VALID_TYPES = frozenset({"Gap", "Conflict", "Question", "Improvement"})
VALID_URGENCIES = frozenset({"blocking", "non-blocking"})

# Matches: - **Type** (urgency): description. Affects `path` (action). *Found by Agent during phase.*
_FINDING_RE = re.compile(
    r"^-\s+"
    r"\*\*(?P<type>[^*]*)\*\*"  # bold type
    r"\s+\((?P<urgency>[^)]*)\)"  # (urgency)
    r":\s+(?P<description>.+?)"  # : description
    r"\.\s+Affects\s+`(?P<path>[^`]+)`"  # Affects `path`
    r"\s+\([^)]+\)"  # (action)
    r"\.\s+\*Found by\s+.+?\*"  # *Found by Agent during phase.*
)

_NO_FINDINGS_RE = re.compile(r"^-\s+No upstream findings\b", re.IGNORECASE)


def validate_findings(session_path: str | Path) -> dict:
    """Validate Delivery Findings in a session file against R1 format.

    Args:
        session_path: Path to the session markdown file.

    Returns:
        dict with keys:
            status: "pass" | "fail"
            findings_count: int
            errors: list[dict] (each with line, finding, field, message)
    """
    path = Path(session_path)
    if not path.exists():
        return {
            "status": "fail",
            "findings_count": 0,
            "errors": [{"line": 0, "finding": "", "field": "file", "message": f"File not found: {path}"}],
        }

    content = path.read_text()
    section = _extract_section(content)
    if section is None:
        return {"status": "pass", "findings_count": 0, "errors": []}

    findings_count = 0
    errors: list[dict] = []

    for line_num, line in section:
        stripped = line.strip()
        if not stripped or stripped.startswith("<!--") or not stripped.startswith("-"):
            continue
        if _NO_FINDINGS_RE.match(stripped):
            continue

        findings_count += 1
        line_errors = _validate_finding(line_num, stripped)
        errors.extend(line_errors)

    status = "fail" if errors else "pass"
    return {"status": status, "findings_count": findings_count, "errors": errors}


def _extract_section(content: str) -> list[tuple[int, str]] | None:
    """Extract lines under ## Delivery Findings, stopping at next ##."""
    lines = content.split("\n")
    in_section = False
    section_lines: list[tuple[int, str]] = []

    for i, line in enumerate(lines, start=1):
        if line.strip().startswith("## Delivery Findings"):
            in_section = True
            continue
        if in_section and line.strip().startswith("## "):
            break
        if in_section:
            section_lines.append((i, line))

    return section_lines if in_section else None


def _validate_finding(line_num: int, text: str) -> list[dict]:
    """Validate a single finding line against R1 format."""
    errors: list[dict] = []

    # Check bold type
    type_match = re.match(r"^-\s+\*\*([^*]*)\*\*", text)
    if not type_match:
        errors.append({"line": line_num, "finding": text, "field": "type", "message": "Missing bold **Type** marker"})
        return errors

    found_type = type_match.group(1)
    if not found_type:
        errors.append({"line": line_num, "finding": text, "field": "type", "message": "Empty type value"})
        return errors
    if found_type not in VALID_TYPES:
        errors.append({"line": line_num, "finding": text, "field": "type", "message": f"Invalid type '{found_type}'. Must be one of: {', '.join(sorted(VALID_TYPES))}"})
        return errors

    # Check urgency in parentheses
    urgency_match = re.search(r"\*\*\s+\(([^)]*)\)", text)
    if not urgency_match:
        errors.append({"line": line_num, "finding": text, "field": "urgency", "message": "Missing (urgency) after type"})
        return errors

    found_urgency = urgency_match.group(1)
    if found_urgency not in VALID_URGENCIES:
        errors.append({"line": line_num, "finding": text, "field": "urgency", "message": f"Invalid urgency '{found_urgency}'. Must be one of: {', '.join(sorted(VALID_URGENCIES))}"})
        return errors

    # Check Affects `path`
    if not re.search(r"Affects\s+`[^`]+`", text):
        errors.append({"line": line_num, "finding": text, "field": "affects", "message": "Missing Affects `path` reference"})
        return errors

    # Check *Found by ... during ...*
    if not re.search(r"\*Found by\s+.+?\*", text):
        errors.append({"line": line_num, "finding": text, "field": "attribution", "message": "Missing *Found by Agent during phase.* attribution"})
        return errors

    return errors
