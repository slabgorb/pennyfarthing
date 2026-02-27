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

from pathlib import Path

VALID_TYPES = frozenset({"Gap", "Conflict", "Question", "Improvement"})
VALID_URGENCIES = frozenset({"blocking", "non-blocking"})


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
    # Stub — not yet implemented
    return {"status": "pass", "findings_count": 0, "errors": []}
