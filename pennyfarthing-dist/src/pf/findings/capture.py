"""
Finding capture — format, parse, and append delivery findings.

Stubs for TDD RED phase. Dev implements the real logic.
"""

from __future__ import annotations

from pathlib import Path

VALID_TYPES = ("Gap", "Conflict", "Question", "Improvement")
VALID_URGENCIES = ("blocking", "non-blocking")

PHASE_NAMES = {
    "red": "test design",
    "green": "implementation",
    "review": "code review",
}


def format_finding(
    finding_type: str,
    urgency: str,
    description: str,
    path: str,
    what_changes: str,
    agent: str,
    phase: str,
) -> str:
    """Format a single finding as R1 markdown list item.

    Returns:
        R1-formatted string like:
        - **Gap** (blocking): Description. Affects `path` (what). *Found by TEA during test design.*
    """
    # Stub — returns empty string until implemented
    return ""


def parse_delivery_findings(content: str) -> list[dict]:
    """Parse the Delivery Findings section from session markdown.

    Returns:
        List of dicts with keys: type, urgency, description, path, what_changes, agent, phase.
        Returns empty list if section missing or empty.
        Entries with "No upstream findings" return as: {"type": "none", "agent": agent_name}
    """
    # Stub — returns empty list until implemented
    return []


def append_findings_to_session(
    session_path: Path,
    agent: str,
    phase: str,
    findings: list[str],
) -> dict:
    """Append findings to the Delivery Findings section of a session file.

    Args:
        session_path: Path to the session markdown file
        agent: Agent name (e.g., "TEA", "Dev", "Reviewer")
        phase: Phase name (e.g., "red", "green", "review")
        findings: List of R1-formatted finding strings, or empty for "no findings"

    Returns:
        {"success": True/False, "error": str|None}
    """
    # Stub — does nothing until implemented
    return {"success": False, "error": "not implemented"}
