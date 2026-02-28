"""
Impact Summary compilation from Delivery Findings.

Compiles parsed R1-format findings into a ## Impact Summary section
for the session file. Used by SM's finish flow.
"""

from __future__ import annotations

import re
import tempfile
from pathlib import Path

from pf.findings.capture import VALID_TYPES, parse_delivery_findings

_IMPACT_HEADER = "## Impact Summary"
_DELIVERY_HEADER = "## Delivery Findings"


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
    structured = [f for f in findings if f.get("type") != "none"]

    finding_count = len(structured)
    blocking = [f for f in structured if f.get("urgency") == "blocking"]
    nonblocking = [f for f in structured if f.get("urgency") != "blocking"]
    blocking_count = len(blocking)

    lines = [_IMPACT_HEADER, ""]

    if finding_count == 0:
        lines.append("**Upstream Effects:** No upstream effects noted")
        lines.append("**Blocking:** None")
    else:
        # Count by type in canonical order
        type_counts = dict.fromkeys(VALID_TYPES, 0)
        for f in structured:
            if f["type"] in type_counts:
                type_counts[f["type"]] += 1

        count_parts = ", ".join(f"{c} {t}" for t, c in type_counts.items())
        lines.append(
            f"**Upstream Effects:** {finding_count} findings ({count_parts})"
        )

        if blocking_count > 0:
            lines.append(
                f"**Blocking:** {blocking_count} BLOCKING items — see below"
            )
            lines.append("")
            lines.append("**BLOCKING:**")
            for f in blocking:
                lines.append(
                    f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`."
                )
            lines.append("")
            for f in nonblocking:
                lines.append(
                    f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`."
                )
        else:
            lines.append("**Blocking:** None")
            lines.append("")
            for f in structured:
                lines.append(
                    f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`."
                )

    markdown = "\n".join(lines)

    return {
        "success": True,
        "data": {
            "markdown": markdown,
            "finding_count": finding_count,
            "blocking_count": blocking_count,
        },
    }


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
    session_path = Path(session_path)
    if not session_path.exists():
        return {"success": False, "error": "Session file not found"}

    content = session_path.read_text()

    # Parse findings (returns [] if no Delivery Findings section)
    findings = parse_delivery_findings(content)

    # Compile
    result = compile_impact_summary(findings)
    if not result["success"]:
        return result

    summary_md = result["data"]["markdown"]

    # Remove existing Impact Summary section (idempotency)
    content = _remove_existing_impact_summary(content)

    # Find insertion point
    insert_pos = _find_insert_position(content)

    # Insert with surrounding whitespace
    new_content = content[:insert_pos] + summary_md + "\n\n" + content[insert_pos:]

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

    return {
        "success": True,
        "error": None,
        "data": {
            "finding_count": result["data"]["finding_count"],
            "blocking_count": result["data"]["blocking_count"],
        },
    }


def _remove_existing_impact_summary(content: str) -> str:
    """Remove existing ## Impact Summary section from content."""
    match = re.search(r"^## Impact Summary$", content, re.MULTILINE)
    if not match:
        return content

    start = match.start()

    # Find end: next ## heading or end of content
    rest = content[match.end():]
    next_heading = re.search(r"^## ", rest, re.MULTILINE)
    end = match.end() + next_heading.start() if next_heading else len(content)

    # Trim trailing blank lines before the removed section
    while start > 0 and content[start - 1] == "\n":
        start -= 1
    # Keep one newline as separator
    if start > 0:
        start += 1

    return content[:start] + content[end:]


def _find_insert_position(content: str) -> int:
    """Find character position where Impact Summary should be inserted."""
    # Strategy 1: After ## Delivery Findings section (before next ## heading)
    df_match = re.search(r"^## Delivery Findings\b", content, re.MULTILINE)
    if df_match:
        rest = content[df_match.end():]
        next_h2 = re.search(r"^## ", rest, re.MULTILINE)
        if next_h2:
            return df_match.end() + next_h2.start()
        return len(content)

    # Strategy 2: Before first Assessment heading
    assess_match = re.search(r"^## \w+ Assessment\b", content, re.MULTILINE)
    if assess_match:
        return assess_match.start()

    # Fallback: end of content
    return len(content)
