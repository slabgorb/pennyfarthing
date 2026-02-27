"""
Impact Summary compilation from Delivery Findings.

Compiles parsed R1-format findings into a ## Impact Summary section
for the session file. Used by SM's finish flow.
"""

from __future__ import annotations

from pathlib import Path


def compile_impact_summary(findings: list[dict]) -> dict:
    """Compile parsed findings into Impact Summary markdown.

    Args:
        findings: List of finding dicts from parse_delivery_findings().
            Each dict has keys: type, urgency, description, path, what_changes, agent, phase.
            Entries with type="none" represent agents with no findings and are excluded.

    Returns:
        {success: True, data: {markdown: str, finding_count: int, blocking_count: int}}
        or {success: False, error: str}
    """
    raise NotImplementedError("compile_impact_summary not yet implemented")


def write_impact_summary_to_session(session_path: Path) -> dict:
    """Read session file, compile Impact Summary from Delivery Findings, write it back.

    Places the ## Impact Summary section after ## Delivery Findings and
    before any agent assessment sections.

    Args:
        session_path: Path to session markdown file.

    Returns:
        {success: True, data: {finding_count: int, blocking_count: int}}
        or {success: False, error: str}
    """
    raise NotImplementedError("write_impact_summary_to_session not yet implemented")
