"""Spec-drift pre-check for review phase entry.

Runs at the start of the review phase to detect specification drift —
deviations between what was specified (story context + acceptance criteria)
and what was actually implemented (session file + git diff).

Unlike spec_check.py (which runs in the Architect spec-check phase),
this pre-check is internal to the review phase and produces a drift report
that the Reviewer uses as a first-pass checklist.

Story: 150-3
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.gates.deviations import (
    validate_deviations,
    _extract_section as _extract_deviations_section,
    _extract_subsection,
    _parse_entries,
    _get_field_value,
)

_STOP_WORDS = frozenset({
    "the", "and", "for", "with", "not", "any", "from", "that", "this",
    "are", "was", "has", "had", "have", "been", "will", "does", "did",
    "its", "all", "can", "but", "also", "when", "into", "out", "new",
    "adds", "uses", "used", "using", "get", "set", "via", "spec",
})

SEVERITY_WEIGHTS = {"low": 1, "medium": 2, "high": 3}


def run_spec_drift_precheck(
    session_path: str | Path,
    context_path: str | Path,
) -> dict:
    """Run spec-drift pre-check for review phase.

    Args:
        session_path: Path to the session markdown file.
        context_path: Path to the story context markdown file.

    Returns:
        dict with keys:
            success: bool
            data: dict with findings array, drift_score, summary
            error: str | None
    """
    try:
        findings: list[dict] = []

        # Read session file
        session_content = _read_file(session_path)
        if session_content is None:
            return _error_result(f"Session file not found or unreadable: {session_path}")

        # Read context file
        context_content = _read_file(context_path)
        if context_content is None:
            return _error_result(f"Context file not found or unreadable: {context_path}")

        if not session_content.strip():
            return _error_result("Session file is empty")

        if not context_content.strip():
            return _error_result("Context file is empty")

        # 1. Parse ACs from context
        acs = _parse_acs(context_content)
        if not acs:
            findings.append({
                "category": "missing-ac",
                "severity": "high",
                "detail": "No acceptance criteria found in context file (missing ## Acceptance Criteria)",
            })

        # 2. Check AC coverage in session
        if acs:
            covered = _parse_ac_coverage(session_content)
            for ac_id, ac_text in acs.items():
                if ac_id not in covered:
                    findings.append({
                        "category": "missing-ac",
                        "severity": "high",
                        "detail": f"{ac_id} not addressed in Dev Assessment: {ac_text}",
                    })

        # 3. Check deviations format (delegates to pf.gates.deviations)
        dev_validation = validate_deviations(session_path, "dev")
        if dev_validation["status"] == "fail":
            for error in dev_validation["errors"]:
                msg = error.get("message", "")
                if "Design Deviations" in msg or "subsection" in msg:
                    cat = "missing-deviations"
                else:
                    cat = "malformed-deviation"
                findings.append({"category": cat, "severity": "medium", "detail": msg})

        # 4. Check for major/breaking deviations
        findings.extend(_check_major_deviations(session_content))

        # 5. Check scope creep
        if acs:
            findings.extend(_check_scope_creep(session_content, acs))

        # 6. Check implementation complete
        if not _check_impl_complete(session_content):
            findings.append({
                "category": "implementation-incomplete",
                "severity": "high",
                "detail": "Implementation Complete flag is not 'Yes'",
            })

        # Calculate drift score
        drift_score = sum(SEVERITY_WEIGHTS.get(f["severity"], 1) for f in findings)

        success = len(findings) == 0
        summary = (
            "No specification drift detected"
            if success
            else f"{len(findings)} drift finding(s) detected"
        )
        error = (
            None
            if success
            else f"Spec drift detected: {len(findings)} finding(s) across session"
        )

        return {
            "success": success,
            "data": {"findings": findings, "drift_score": drift_score, "summary": summary},
            "error": error,
        }
    except Exception as e:
        return {
            "success": False,
            "data": {"findings": [], "drift_score": 0, "summary": "Pre-check error"},
            "error": f"Unexpected error: {e}",
        }


def _error_result(message: str) -> dict:
    """Build a standard error result."""
    return {
        "success": False,
        "data": {"findings": [], "drift_score": 0, "summary": message},
        "error": message,
    }


def _read_file(path: str | Path) -> str | None:
    """Read a file, returning None if it doesn't exist or can't be read."""
    p = Path(path)
    if not p.exists():
        return None
    try:
        return p.read_text()
    except Exception:
        return None


def _parse_acs(content: str) -> dict[str, str]:
    """Parse AC-N entries from context's ## Acceptance Criteria section."""
    lines = content.split("\n")
    in_section = False
    acs: dict[str, str] = {}

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("## Acceptance Criteria"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section:
            match = re.match(r"^-\s+(AC-\d+):\s*(.+)$", stripped)
            if match:
                acs[match.group(1)] = match.group(2).strip()

    return acs


def _parse_ac_coverage(content: str) -> set[str]:
    """Parse covered ACs from Dev Assessment's AC Coverage section."""
    covered: set[str] = set()
    lines = content.split("\n")
    in_coverage = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("**AC Coverage:**"):
            in_coverage = True
            continue
        if in_coverage and (stripped.startswith("**") or stripped.startswith("## ")):
            break
        if in_coverage:
            match = re.match(r"^-\s+(AC-\d+):", stripped)
            if match:
                covered.add(match.group(1))

    return covered


def _check_major_deviations(content: str) -> list[dict]:
    """Flag major-severity or breaking-impact deviations for reviewer attention."""
    findings: list[dict] = []

    section_lines = _extract_deviations_section(content)
    if section_lines is None:
        return findings

    subsection_lines = _extract_subsection(section_lines, "dev")
    if subsection_lines is None:
        return findings

    entries = _parse_entries(subsection_lines)

    for entry in entries:
        if entry["is_no_deviations"]:
            continue

        severity = _get_field_value(entry["fields"], "Severity")
        impact = _get_field_value(entry["fields"], "Forward impact")

        is_major = severity and severity.strip().lower() == "major"
        is_breaking = impact and "breaking" in impact.lower()

        if is_major or is_breaking:
            desc = entry["description"]
            findings.append({
                "category": "major-deviation",
                "severity": "high",
                "detail": f"Major deviation requires reviewer attention: {desc}",
            })

    return findings


def _check_scope_creep(content: str, acs: dict[str, str]) -> list[dict]:
    """Check for files not traceable to any acceptance criteria."""
    findings: list[dict] = []

    # Build keyword set from all AC texts
    ac_words: set[str] = set()
    for ac_text in acs.values():
        ac_words.update(_tokenize(ac_text))

    # Parse Files Changed from Dev Assessment
    files = _parse_files_changed(content)

    for filepath, description in files:
        desc_words = _tokenize(description)
        if not desc_words & ac_words:
            findings.append({
                "category": "scope-creep",
                "severity": "medium",
                "detail": f"File `{filepath}` not traceable to any acceptance criteria: {description}",
            })

    return findings


def _parse_files_changed(content: str) -> list[tuple[str, str]]:
    """Parse Files Changed entries from Dev Assessment."""
    files: list[tuple[str, str]] = []
    lines = content.split("\n")
    in_section = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("**Files Changed:**"):
            in_section = True
            continue
        if in_section and (stripped.startswith("**") or stripped.startswith("## ")):
            break
        if in_section:
            match = re.match(r"^-\s+`([^`]+)`\s*[—–\-]\s*(.+)$", stripped)
            if match:
                files.append((match.group(1), match.group(2).strip()))

    return files


def _tokenize(text: str) -> set[str]:
    """Extract meaningful word tokens from text for keyword matching."""
    words = set()
    for word in re.findall(r"[a-zA-Z_]\w*", text.lower()):
        if len(word) >= 3 and word not in _STOP_WORDS:
            words.add(word)
    return words


def _check_impl_complete(content: str) -> bool:
    """Check if Implementation Complete flag is Yes."""
    match = re.search(r"\*\*Implementation Complete:\*\*\s*(\w+)", content)
    if not match:
        return False
    return match.group(1).strip().lower() == "yes"
