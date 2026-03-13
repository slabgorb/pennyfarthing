"""Spec-check validation gate.

Validates that implementation aligns with the story context and acceptance criteria.
Checks for specification drift: features added that weren't in spec, ACs not addressed,
assumptions violated, and undocumented deviations.

Structural checks only — semantic judgment is the gate subagent's responsibility.

Story: 144-6
"""

from __future__ import annotations

from pathlib import Path


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
            data: dict (when success=True) with checks array
            error: str (when success=False) with specific findings
    """
    # Stub: returns wrong result so tests fail on assertion, not import
    return {"success": True, "data": {"checks": []}}
