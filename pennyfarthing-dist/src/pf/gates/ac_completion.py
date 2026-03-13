"""AC-completion gate — validates all acceptance criteria are accounted for.

Reads ACs from a story context document's ## AC Context section, checks each
AC's status in the session file (DONE, DEFERRED, or DESCOPED), and prompts the
operator for approval on DEFERRED/DESCOPED entries.

Story: 144-3
"""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path

# Status values recognized in the session file
VALID_STATUSES = frozenset({"DONE", "DEFERRED", "DESCOPED"})

_AC_HEADING_RE = re.compile(r"^###\s+(AC-\d+):\s+(.+)$")
_AC_STATUS_RE = re.compile(r"^-\s+(AC-\d+):\s+(.+)$")


def _default_prompt(ac_id: str, status: str, justification: str) -> bool:
    """Interactive operator prompt. Default action is reject (N)."""
    response = input(
        f"{ac_id} {status.lower()}: '{justification}'. "
        f"Default action: complete it. Approve {status.lower()}? [y/N] "
    )
    return response.strip().lower() == "y"


def validate_ac_completion(
    context_file: str | Path,
    session_file: str | Path,
    *,
    prompt_fn: Callable[[str, str, str], bool] | None = None,
) -> dict:
    """Validate that all ACs in the context document are accounted for.

    Args:
        context_file: Path to the story context document.
        session_file: Path to the session file.
        prompt_fn: Optional callback for operator approval prompts.
            Signature: prompt_fn(ac_id, status, justification) -> bool
            If None, uses interactive input.

    Returns:
        dict with keys:
            status: "pass" | "fail"
            ac_count: int
            accountability_table: list[dict]
            errors: list[dict]
    """
    if prompt_fn is None:
        prompt_fn = _default_prompt

    ctx_path = Path(context_file)
    ses_path = Path(session_file)

    # Validate files exist
    if not ctx_path.exists():
        return _fail(f"Story context document not found at {ctx_path}")

    if not ses_path.exists():
        return _fail(f"Session file not found at {ses_path}")

    # Parse ACs from context document
    ac_list = _extract_acs(ctx_path.read_text())
    if ac_list is None:
        return _fail("No AC Context section found in story context. Cannot determine AC list.")

    if not ac_list:
        return _fail("No AC Context section found in story context. Cannot determine AC list.")

    # Parse AC statuses from session file
    status_map = _extract_statuses(ses_path.read_text())

    # Evaluate each AC
    accountability_table: list[dict] = []
    errors: list[dict] = []

    for ac_id, _title in ac_list:
        raw_status = status_map.get(ac_id)

        if raw_status is None:
            errors.append({
                "message": (
                    f"{ac_id} has no status. "
                    f"Mark as DONE, DEFERRED, or DESCOPED."
                ),
            })
            continue

        # Parse status keyword and justification
        status_keyword, justification = _parse_status_value(raw_status)

        if status_keyword not in VALID_STATUSES:
            errors.append({
                "message": (
                    f"{ac_id} has no status. "
                    f"Mark as DONE, DEFERRED, or DESCOPED."
                ),
            })
            continue

        if status_keyword == "DONE":
            accountability_table.append({
                "ac_id": ac_id,
                "status": "DONE",
            })
        elif status_keyword in ("DEFERRED", "DESCOPED"):
            approved = prompt_fn(ac_id, status_keyword, justification)
            if approved:
                accountability_table.append({
                    "ac_id": ac_id,
                    "status": status_keyword,
                    "operator_approved": True,
                    "justification": justification,
                })
            else:
                errors.append({
                    "message": (
                        f"{ac_id} deferral rejected by operator. "
                        f"Implement {ac_id} or provide stronger justification for deferral."
                    ),
                })
                # Fail immediately on first rejection
                return {
                    "status": "fail",
                    "ac_count": len(ac_list),
                    "accountability_table": accountability_table,
                    "errors": errors,
                }

    if errors:
        return {
            "status": "fail",
            "ac_count": len(ac_list),
            "accountability_table": accountability_table,
            "errors": errors,
        }

    return {
        "status": "pass",
        "ac_count": len(ac_list),
        "accountability_table": accountability_table,
        "errors": [],
    }


def _fail(message: str) -> dict:
    """Return a standard failure result."""
    return {
        "status": "fail",
        "ac_count": 0,
        "accountability_table": [],
        "errors": [{"message": message}],
    }


def _extract_acs(content: str) -> list[tuple[str, str]] | None:
    """Extract AC identifiers and titles from ## AC Context section.

    Returns list of (ac_id, title) tuples, or None if section not found.
    """
    lines = content.split("\n")
    in_section = False
    found_section = False
    acs: list[tuple[str, str]] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("## AC Context"):
            in_section = True
            found_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section:
            match = _AC_HEADING_RE.match(stripped)
            if match:
                acs.append((match.group(1), match.group(2)))

    return acs if found_section else None


def _extract_statuses(content: str) -> dict[str, str]:
    """Extract AC status markers from session file.

    Scans for lines matching `- AC-N: STATUS [justification]`.
    Returns dict mapping AC ID to raw status string.
    """
    statuses: dict[str, str] = {}
    for line in content.split("\n"):
        match = _AC_STATUS_RE.match(line.strip())
        if match:
            statuses[match.group(1)] = match.group(2)
    return statuses


def _parse_status_value(raw: str) -> tuple[str, str]:
    """Parse a raw status string into (keyword, justification).

    Examples:
        "DONE" -> ("DONE", "")
        "DEFERRED Some reason" -> ("DEFERRED", "Some reason")
        "DESCOPED Out of scope" -> ("DESCOPED", "Out of scope")
    """
    parts = raw.split(None, 1)
    keyword = parts[0] if parts else ""
    justification = parts[1] if len(parts) > 1 else ""
    return keyword, justification
