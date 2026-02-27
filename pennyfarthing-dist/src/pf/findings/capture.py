"""
Finding capture — format, parse, and append delivery findings.

Functions for R1-format finding management in session files.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

VALID_TYPES = ("Gap", "Conflict", "Question", "Improvement")
VALID_URGENCIES = ("blocking", "non-blocking")

PHASE_NAMES = {
    "red": "test design",
    "green": "implementation",
    "review": "code review",
}

# Regex matching R1 format findings
_R1_RE = re.compile(
    r"^- \*\*(?P<type>Gap|Conflict|Question|Improvement)\*\* "
    r"\((?P<urgency>blocking|non-blocking)\): "
    r"(?P<description>.+?)\. "
    r"Affects `(?P<path>[^`]+)` \((?P<what>[^)]+)\)\. "
    r"\*Found by (?P<agent>\w+) during (?P<phase>[^.]+)\.\*$"
)

_MARKER_COMMENT = "<!-- Agents: append findings below this line. Do not edit other agents' entries. -->"
_SECTION_HEADER = "## Delivery Findings"


def format_finding(
    finding_type: str,
    urgency: str,
    description: str,
    path: str,
    what_changes: str,
    agent: str,
    phase: str,
) -> str:
    """Format a single finding as R1 markdown list item."""
    if finding_type not in VALID_TYPES:
        raise ValueError(f"Invalid finding type: {finding_type!r}. Must be one of {VALID_TYPES}")
    if urgency not in VALID_URGENCIES:
        raise ValueError(f"Invalid urgency: {urgency!r}. Must be one of {VALID_URGENCIES}")
    if not description or not description.strip():
        raise ValueError("Finding description must not be empty")

    human_phase = PHASE_NAMES.get(phase, phase)
    return (
        f"- **{finding_type}** ({urgency}): {description}. "
        f"Affects `{path}` ({what_changes}). "
        f"*Found by {agent} during {human_phase}.*"
    )


def parse_delivery_findings(content: str) -> list[dict]:
    """Parse the Delivery Findings section from session markdown."""
    lines = content.split("\n")

    # Find section start
    section_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith(_SECTION_HEADER):
            section_start = i
            break

    if section_start is None:
        return []

    # Find section end (next ## heading)
    section_end = len(lines)
    for i in range(section_start + 1, len(lines)):
        if lines[i].strip().startswith("## ") and not lines[i].strip().startswith(_SECTION_HEADER):
            section_end = i
            break

    section_lines = lines[section_start:section_end]
    findings: list[dict] = []
    current_agent = None

    for line in section_lines:
        stripped = line.strip()

        # Agent header: ### TEA (test design)
        if stripped.startswith("### "):
            agent_match = re.match(r"^### (\w+)", stripped)
            if agent_match:
                current_agent = agent_match.group(1)

        # No-findings entry
        elif stripped.lower().startswith("- no upstream findings") or stripped.lower() == "- no upstream findings.":
            if current_agent:
                findings.append({"type": "none", "agent": current_agent})

        # R1 finding
        elif stripped.startswith("- **"):
            m = _R1_RE.match(stripped)
            if m:
                findings.append({
                    "type": m.group("type"),
                    "urgency": m.group("urgency"),
                    "description": m.group("description"),
                    "path": m.group("path"),
                    "what_changes": m.group("what"),
                    "agent": m.group("agent"),
                    "phase": m.group("phase"),
                })

    return findings


def append_findings_to_session(
    session_path: Path,
    agent: str,
    phase: str,
    findings: list[str],
) -> dict:
    """Append findings to the Delivery Findings section of a session file."""
    session_path = Path(session_path)
    if not session_path.exists():
        return {"success": False, "error": "Session file not found"}

    content = session_path.read_text()

    if _SECTION_HEADER not in content:
        return {"success": False, "error": "Delivery Findings section not found in session file"}

    marker_pos = content.find(_MARKER_COMMENT)
    if marker_pos == -1:
        return {"success": False, "error": "Delivery Findings marker comment not found"}

    # Find the end of the marker line
    marker_end = content.index("\n", marker_pos) + 1

    # Find the next ## section after marker
    rest = content[marker_end:]
    next_section_match = re.search(r"^## ", rest, re.MULTILINE)
    insert_pos = marker_end + next_section_match.start() if next_section_match else len(content)

    # Build the findings block
    human_phase = PHASE_NAMES.get(phase, phase)
    block_lines = [f"\n### {agent} ({human_phase})"]
    if findings:
        for f in findings:
            block_lines.append(f)
    else:
        block_lines.append("- No upstream findings.")
    block_lines.append("")

    block = "\n".join(block_lines) + "\n"

    # Insert before the next section
    new_content = content[:insert_pos] + block + content[insert_pos:]

    # Atomic write via temp file + rename
    tmp_fd = tempfile.NamedTemporaryFile(
        mode="w",
        dir=session_path.parent,
        suffix=".tmp",
        delete=False,
    )
    try:
        tmp_fd.write(new_content)
        tmp_fd.close()
        Path(tmp_fd.name).replace(session_path)
    except Exception as e:
        Path(tmp_fd.name).unlink(missing_ok=True)
        return {"success": False, "error": str(e)}

    return {"success": True, "error": None}
