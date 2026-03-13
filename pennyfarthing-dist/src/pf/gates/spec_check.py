"""Spec-check validation gate.

Validates that implementation aligns with the story context and acceptance criteria.
Checks for specification drift: features added that weren't in spec, ACs not addressed,
assumptions violated, and undocumented deviations.

Structural checks only — semantic judgment is the gate subagent's responsibility.

Delegates deviation format validation to pf.gates.deviations (144-1) — does not
re-implement that logic.

Story: 144-6
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.gates.deviations import validate_deviations

_AC_RE = re.compile(r"^\s*-\s*(AC-\d+)", re.IGNORECASE)
_IMPL_COMPLETE_RE = re.compile(
    r"\*\*Implementation\s+Complete:\*\*\s*(Yes|No)", re.IGNORECASE
)


def validate_spec_alignment(
    session_path: str | Path,
    context_path: str | Path,
) -> dict:
    """Validate implementation alignment with story context and acceptance criteria.

    Args:
        session_path: Path to the session markdown file.
        context_path: Path to the story context markdown file.

    Returns:
        dict with keys:
            success: bool
            data: dict with checks array
            error: str | None
    """
    checks: list[dict] = []
    errors: list[str] = []

    # --- File existence ---
    session = Path(session_path)
    if not session.exists():
        return _fail(f"Session file not found: {session}", [
            _check("file-exists", "fail", f"Session file not found: {session}"),
        ])

    context = Path(context_path)
    if not context.exists():
        return _fail(f"Context file not found: {context}", [
            _check("file-exists", "fail", f"Context file not found: {context}"),
        ])

    session_content = session.read_text()
    context_content = context.read_text()

    if not session_content.strip():
        return _fail("Session file is empty", [
            _check("file-exists", "fail", "Session file is empty"),
        ])

    if not context_content.strip():
        return _fail("Context file is empty", [
            _check("file-exists", "fail", "Context file is empty"),
        ])

    # --- Check 1: AC coverage ---
    context_acs = _extract_acs(context_content)
    if not context_acs:
        checks.append(_check("ac-coverage", "fail", "No acceptance criteria found in context file"))
        errors.append("Context file has no ## Acceptance Criteria section or no AC items")
    else:
        session_acs = _extract_session_ac_coverage(session_content)
        if session_acs is None:
            checks.append(_check(
                "ac-coverage", "fail",
                "No AC Coverage found in Dev Assessment section",
            ))
            errors.append("Session file has no Dev Assessment or no AC Coverage listing")
        else:
            missing = []
            for ac_id in context_acs:
                if not any(ac_id.lower() == s.lower() for s in session_acs):
                    missing.append(ac_id)

            if missing:
                missing_str = ", ".join(missing)
                checks.append(_check(
                    "ac-coverage", "fail",
                    f"Missing AC coverage: {missing_str}",
                ))
                errors.append(f"Missing AC coverage: {missing_str}")
            else:
                checks.append(_check(
                    "ac-coverage", "pass",
                    f"All {len(context_acs)} ACs addressed in Dev Assessment",
                ))

    # --- Check 2: Implementation complete flag ---
    impl_check = _check_implementation_complete(session_content)
    checks.append(impl_check)
    if impl_check["status"] == "fail":
        errors.append(impl_check["detail"])

    # --- Check 3: Deviation logging (TEA + Dev) ---
    for agent in ("tea", "dev"):
        dev_result = validate_deviations(session_path, agent)
        if dev_result["status"] == "fail":
            agent_label = "TEA" if agent == "tea" else "Dev"
            err_msgs = [e["message"] for e in dev_result["errors"]]
            detail = f"{agent_label} deviations: {'; '.join(err_msgs)}"
            checks.append(_check(f"deviations-{agent}", "fail", detail))
            errors.append(detail)
        else:
            agent_label = "TEA" if agent == "tea" else "Dev"
            checks.append(_check(
                f"deviations-{agent}", "pass",
                f"{agent_label} deviations properly logged",
            ))

    # --- Aggregate ---
    if errors:
        return _fail("; ".join(errors), checks)

    return {
        "success": True,
        "data": {"checks": checks},
        "error": None,
    }


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


def _extract_acs(content: str) -> list[str]:
    """Extract AC identifiers from the ## Acceptance Criteria section of a context file."""
    lines = content.split("\n")
    in_section = False
    acs: list[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("## Acceptance Criteria"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section:
            match = _AC_RE.match(line)
            if match:
                acs.append(match.group(1).upper())

    return acs


def _extract_session_ac_coverage(content: str) -> list[str] | None:
    """Extract AC identifiers from the Dev Assessment's AC Coverage listing.

    Returns None if no Dev Assessment or no AC Coverage section found.
    """
    lines = content.split("\n")

    # Find ## Dev Assessment
    in_assessment = False
    in_coverage = False
    acs: list[str] = []

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("## Dev Assessment"):
            in_assessment = True
            continue
        if in_assessment and stripped.startswith("## "):
            break

        if in_assessment and "**AC Coverage:**" in stripped:
            in_coverage = True
            continue
        if in_coverage and stripped.startswith("**") and "AC Coverage" not in stripped:
            break

        if in_coverage:
            match = _AC_RE.match(line)
            if match:
                acs.append(match.group(1).upper())

    if not in_assessment:
        return None
    if not in_coverage:
        return None

    return acs


def _check_implementation_complete(content: str) -> dict:
    """Check the Implementation Complete flag in Dev Assessment."""
    match = _IMPL_COMPLETE_RE.search(content)
    if not match:
        return _check(
            "implementation-complete", "fail",
            "No Dev Assessment section or missing Implementation Complete flag",
        )

    if match.group(1).lower() == "yes":
        return _check("implementation-complete", "pass", "Implementation marked complete")

    return _check(
        "implementation-complete", "fail",
        "Implementation Complete flag is 'No' — Dev has not finished",
    )
