"""Spec-reconcile validation gate.

Validates that the Architect has completed the spec-reconcile phase by checking
for the `### Architect (reconcile)` subsection in `## Design Deviations`.

Accepts both "No additional deviations found." (reconcile-specific) and
"No deviations from spec." (standard phrase) as valid content.

Delegates deviation format validation to pf.gates.deviations (144-1) — does not
re-implement that logic.

Story: 144-7
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.gates.deviations import validate_deviations

_FAIL_MESSAGE = "Architect reconcile section required — run spec-reconcile phase"

_NO_ADDITIONAL_RE = re.compile(r"no additional deviations found", re.IGNORECASE)
_NO_DEVIATIONS_RE = re.compile(r"no deviations from spec", re.IGNORECASE)

_SUBSECTION_HEADING = "### Architect (reconcile)"


def validate_spec_reconcile(session_path: str | Path) -> dict:
    """Validate that the Architect spec-reconcile section exists and is valid.

    Checks:
    1. Session file exists and is non-empty
    2. ## Design Deviations section exists
    3. ### Architect (reconcile) subsection exists and is non-empty
    4. Content is either a no-deviations phrase or properly formatted entries

    Args:
        session_path: Path to the session markdown file.

    Returns:
        dict with keys:
            success: bool
            data: dict with checks array
            error: str | None
    """
    path = Path(session_path)
    if not path.exists():
        return _fail(_FAIL_MESSAGE, [
            _check("file-exists", "fail", f"Session file not found: {path}"),
        ])

    content = path.read_text()
    if not content.strip():
        return _fail(_FAIL_MESSAGE, [
            _check("file-exists", "fail", "Session file is empty"),
        ])

    # Check for ## Design Deviations section
    section_lines = _extract_section(content)
    if section_lines is None:
        return _fail(_FAIL_MESSAGE, [
            _check("design-deviations", "fail",
                   "Missing '## Design Deviations' section in session file"),
        ])

    # Check for ### Architect (reconcile) subsection
    subsection_lines = _extract_subsection(section_lines)
    if subsection_lines is None:
        return _fail(_FAIL_MESSAGE, [
            _check("reconcile-section", "fail",
                   f"Missing '{_SUBSECTION_HEADING}' subsection in Design Deviations"),
        ])

    # Check subsection is non-empty
    non_blank = [line for _, line in subsection_lines if line.strip()]
    if not non_blank:
        return _fail(_FAIL_MESSAGE, [
            _check("reconcile-section", "fail",
                   f"Empty '{_SUBSECTION_HEADING}' subsection — write entries or "
                   "'- No additional deviations found.'"),
        ])

    # Check if content is just a no-deviations phrase (either variant)
    content_text = "\n".join(line for _, line in subsection_lines)
    if _is_only_no_deviations(content_text):
        return {
            "success": True,
            "data": {"checks": [
                _check("reconcile-section", "pass",
                       "Architect reconcile section present — no additional deviations"),
            ]},
            "error": None,
        }

    # Delegate format validation of actual entries to deviations module
    dev_result = validate_deviations(session_path, "architect")
    if dev_result["status"] == "pass":
        return {
            "success": True,
            "data": {"checks": [
                _check("reconcile-section", "pass",
                       "Architect reconcile section present"),
                _check("reconcile-format", "pass",
                       f"{dev_result['entries_count']} entries validated"),
            ]},
            "error": None,
        }

    # Deviations validation failed — translate to our result format
    err_msgs = [e["message"] for e in dev_result["errors"]]
    return _fail(
        "; ".join(err_msgs),
        [_check("reconcile-format", "fail", "; ".join(err_msgs))],
    )


def _check(name: str, status: str, detail: str) -> dict:
    """Build a single check result."""
    return {"name": name, "status": status, "detail": detail}


def _fail(error: str, checks: list[dict]) -> dict:
    """Build a failure result."""
    return {
        "success": False,
        "data": {"checks": checks},
        "error": error,
    }


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
    section_lines: list[tuple[int, str]],
) -> list[tuple[int, str]] | None:
    """Extract lines under ### Architect (reconcile)."""
    in_subsection = False
    subsection_lines: list[tuple[int, str]] = []

    for i, line in section_lines:
        stripped = line.strip()
        if stripped == _SUBSECTION_HEADING:
            in_subsection = True
            continue
        if in_subsection and stripped.startswith("### "):
            break
        if in_subsection:
            subsection_lines.append((i, line))

    return subsection_lines if in_subsection else None


def _is_only_no_deviations(content: str) -> bool:
    """Check if content contains only no-deviations phrases (no actual entries)."""
    for line in content.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("<!--"):
            continue
        if stripped.startswith("-") and (
            _NO_ADDITIONAL_RE.search(stripped)
            or _NO_DEVIATIONS_RE.search(stripped)
        ):
            continue
        # Found a line that is not blank, comment, or no-deviations phrase
        return False
    return True
