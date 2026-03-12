"""Deviation format validation gate.

Validates that Design Deviations in a session file conform to the 6-field format:
  - **{Short description}**
    - Spec source: {document path, section/AC reference}
    - Spec text: "{quoted original specification}"
    - Implementation: {what was actually built/tested}
    - Rationale: {why the deviation was made}
    - Severity: {minor | major}
    - Forward impact: {none | minor | breaking} — {affected story IDs}

Agent-specific subsections:
  - ### TEA (test design)
  - ### Dev (implementation)
  - ### Architect (reconcile)

Story: 144-1
"""

from __future__ import annotations

import re
from pathlib import Path

REQUIRED_FIELDS = (
    "Spec source",
    "Spec text",
    "Implementation",
    "Rationale",
    "Severity",
    "Forward impact",
)

VALID_SEVERITIES = frozenset({"minor", "major"})
VALID_FORWARD_IMPACTS = frozenset({"none", "minor", "breaking"})

AGENT_SUBSECTIONS = {
    "tea": "### TEA (test design)",
    "dev": "### Dev (implementation)",
    "architect": "### Architect (reconcile)",
}

_NO_DEVIATIONS_RE = re.compile(r"no deviations from spec", re.IGNORECASE)
_ENTRY_RE = re.compile(r"^-\s+\*\*(?P<desc>.+?)\*\*")
_ENTRY_NO_BOLD_RE = re.compile(r"^-\s+\S")
_FIELD_RE = re.compile(r"^\s+-\s+(?P<name>[^:]+):\s*(?P<value>.*)$")


def validate_deviations(session_path: str | Path, agent: str) -> dict:
    """Validate Design Deviations in a session file against the 6-field format.

    Args:
        session_path: Path to the session markdown file.
        agent: Agent identifier ('tea', 'dev', or 'architect').

    Returns:
        dict with keys:
            status: "pass" | "fail"
            entries_count: int
            errors: list[dict] (each with entry, missing_fields, message)
    """
    path = Path(session_path)
    if not path.exists():
        return {
            "status": "fail",
            "entries_count": 0,
            "errors": [
                {"entry": "", "missing_fields": [], "message": f"File not found: {path}"}
            ],
        }

    content = path.read_text()

    # Check for ## Design Deviations section
    section_lines = _extract_section(content)
    if section_lines is None:
        return {
            "status": "fail",
            "entries_count": 0,
            "errors": [
                {
                    "entry": "",
                    "missing_fields": [],
                    "message": "Missing '## Design Deviations' section in session file",
                }
            ],
        }

    # Check for the agent-specific subsection
    subsection_lines = _extract_subsection(section_lines, agent)
    if subsection_lines is None:
        heading = AGENT_SUBSECTIONS.get(agent, f"### {agent}")
        return {
            "status": "fail",
            "entries_count": 0,
            "errors": [
                {
                    "entry": "",
                    "missing_fields": [],
                    "message": f"Missing '{heading}' subsection in Design Deviations",
                }
            ],
        }

    # Parse entries from the subsection
    entries = _parse_entries(subsection_lines)

    # Check for empty subsection
    if not entries:
        heading = AGENT_SUBSECTIONS.get(agent, f"### {agent}")
        return {
            "status": "fail",
            "entries_count": 0,
            "errors": [
                {
                    "entry": "",
                    "missing_fields": [],
                    "message": f"Empty '{heading}' subsection — write entries or '- No deviations from spec.'",
                }
            ],
        }

    # Validate each entry
    entries_count = 0
    errors: list[dict] = []

    for entry in entries:
        if entry["is_no_deviations"]:
            continue

        entries_count += 1
        entry_errors = _validate_entry(entry)
        errors.extend(entry_errors)

    status = "fail" if errors else "pass"
    return {"status": status, "entries_count": entries_count, "errors": errors}


def _extract_section(content: str) -> list[tuple[int, str]] | None:
    """Extract lines under ## Design Deviations, stopping at next ##."""
    lines = content.split("\n")
    in_section = False
    section_lines: list[tuple[int, str]] = []

    for i, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped.startswith("## Design Deviations"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section:
            section_lines.append((i, line))

    return section_lines if in_section else None


def _extract_subsection(
    section_lines: list[tuple[int, str]], agent: str
) -> list[tuple[int, str]] | None:
    """Extract lines under the agent-specific ### subsection."""
    heading = AGENT_SUBSECTIONS.get(agent)
    if not heading:
        return None

    in_subsection = False
    subsection_lines: list[tuple[int, str]] = []

    for i, line in section_lines:
        stripped = line.strip()
        if stripped == heading:
            in_subsection = True
            continue
        if in_subsection and stripped.startswith("### "):
            break
        if in_subsection:
            subsection_lines.append((i, line))

    return subsection_lines if in_subsection else None


def _parse_entries(
    subsection_lines: list[tuple[int, str]],
) -> list[dict]:
    """Parse deviation entries from subsection lines.

    Each entry starts with a `- **description**` or `- text` bullet.
    Subsequent indented `- Field: value` lines are fields of that entry.
    """
    entries: list[dict] = []
    current_entry: dict | None = None

    for _line_num, line in subsection_lines:
        stripped = line.strip()

        # Skip blank lines and HTML comments
        if not stripped or stripped.startswith("<!--"):
            continue

        # Check for no-deviations phrase
        if stripped.startswith("-") and _NO_DEVIATIONS_RE.search(stripped):
            entries.append({"is_no_deviations": True, "description": "", "fields": {}})
            current_entry = None
            continue

        # Check for entry start (bold description)
        bold_match = _ENTRY_RE.match(stripped)
        if bold_match:
            current_entry = {
                "is_no_deviations": False,
                "description": bold_match.group("desc"),
                "fields": {},
            }
            entries.append(current_entry)
            continue

        # Check for entry start without bold (malformed)
        if _ENTRY_NO_BOLD_RE.match(stripped) and not stripped.startswith("- "):
            # Indented field line
            pass
        elif stripped.startswith("- ") and current_entry is None:
            # A top-level bullet without bold markers — malformed entry
            current_entry = {
                "is_no_deviations": False,
                "description": stripped.lstrip("- ").strip(),
                "fields": {},
            }
            entries.append(current_entry)
            continue

        # Check for field line (indented `- Field: value`)
        field_match = _FIELD_RE.match(line)
        if field_match and current_entry is not None:
            field_name = field_match.group("name").strip()
            field_value = field_match.group("value").strip()
            current_entry["fields"][field_name] = field_value

    return entries


def _validate_entry(entry: dict) -> list[dict]:
    """Validate a single deviation entry has all 6 required fields."""
    errors: list[dict] = []
    description = entry["description"]
    fields = entry["fields"]

    # Check for missing fields
    missing = []
    for required in REQUIRED_FIELDS:
        if not any(f.lower() == required.lower() for f in fields):
            missing.append(required)

    if missing:
        missing_str = ", ".join(missing)
        errors.append({
            "entry": description,
            "missing_fields": missing,
            "message": f"Entry '{description}' missing: {missing_str}",
        })
        return errors

    # Validate Severity value
    severity_value = _get_field_value(fields, "Severity")
    if severity_value and severity_value not in VALID_SEVERITIES:
        errors.append({
            "entry": description,
            "missing_fields": [],
            "message": f"Entry '{description}' has invalid Severity '{severity_value}'. Must be: minor, major",
        })

    # Validate Forward impact value
    impact_value = _get_field_value(fields, "Forward impact")
    if impact_value:
        # Extract the first word (before any em-dash)
        impact_base = impact_value.split("—")[0].split(" — ")[0].strip()
        if impact_base not in VALID_FORWARD_IMPACTS:
            errors.append({
                "entry": description,
                "missing_fields": [],
                "message": (
                    f"Entry '{description}' has invalid Forward impact '{impact_base}'. "
                    "Must be: none, minor, breaking"
                ),
            })

    return errors


def _get_field_value(fields: dict, target: str) -> str | None:
    """Get field value by case-insensitive name match."""
    for name, value in fields.items():
        if name.lower() == target.lower():
            return value
    return None
