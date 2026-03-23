"""
Impact Summary compilation from Delivery Findings.

Compiles parsed R1-format findings into a ## Impact Summary section
for the session file. Used by SM's finish flow.
"""

from __future__ import annotations

import re
import tempfile
from collections import defaultdict
from pathlib import Path, PurePosixPath

from pf.findings.capture import VALID_TYPES, parse_delivery_findings

_IMPACT_HEADER = "## Impact Summary"
_DELIVERY_HEADER = "## Delivery Findings"
_DEVIATIONS_HEADER = "## Design Deviations"


def _group_by_module(findings: list[dict]) -> list[dict]:
    """Group findings by parent directory of affected path.

    Returns list of dicts sorted by count descending:
        [{module: str, count: int, findings: list[dict]}, ...]
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for f in findings:
        path = f.get("path", "")
        module = str(PurePosixPath(path).parent)
        groups[module].append(f)

    result = [
        {"module": module, "count": len(items), "findings": items}
        for module, items in groups.items()
    ]
    result.sort(key=lambda g: (-g["count"], g["module"]))
    return result


def compile_impact_summary(
    findings: list[dict], deviations: list[dict] | None = None
) -> dict:
    """Compile parsed findings into Impact Summary markdown.

    Args:
        findings: List of finding dicts from parse_delivery_findings().
            Each dict has keys: type, urgency, description, path, what_changes, agent, phase.
            Entries with type="none" represent agents with no findings and are excluded.
        deviations: Optional list of deviation dicts parsed from Design Deviations.
            Each dict has keys: description, rationale, severity, forward_impact.
            Additional keys (spec_source, spec_text, implementation) are optional.

    Returns:
        {success: True, data: {markdown: str, finding_count: int, blocking_count: int,
         downstream_effects: list[dict], deviation_count: int, breaking_deviation_count: int}}
        or {success: False, error: str}
    """
    if deviations is None:
        deviations = []

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
        lines.append(f"**Upstream Effects:** {finding_count} findings ({count_parts})")

        if blocking_count > 0:
            lines.append(f"**Blocking:** {blocking_count} BLOCKING items — see below")
            lines.append("")
            lines.append("**BLOCKING:**")
            for f in blocking:
                lines.append(f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`.")
            lines.append("")
            for f in nonblocking:
                lines.append(f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`.")
        else:
            lines.append("**Blocking:** None")
            lines.append("")
            for f in structured:
                lines.append(f"- **{f['type']}:** {f['description']}. Affects `{f['path']}`.")

    # Downstream effects: group findings by module
    downstream_effects = _group_by_module(structured)
    if downstream_effects:
        lines.append("")
        lines.append("### Downstream Effects")
        lines.append("")
        module_count = len(downstream_effects)
        if module_count > 1:
            lines.append(
                f"Cross-module impact: {finding_count} findings across {module_count} modules"
            )
            lines.append("")
        for group in downstream_effects:
            count = group["count"]
            lines.append(
                f"- **`{group['module']}`** — {count} finding{'s' if count != 1 else ''}"
            )

    # Deviation justifications
    deviation_count = len(deviations)
    breaking_deviation_count = sum(
        1
        for d in deviations
        if "breaking" in d.get("forward_impact", "").lower()
    )

    if deviations:
        lines.append("")
        lines.append("### Deviation Justifications")
        lines.append("")
        lines.append(f"{deviation_count} deviation{'s' if deviation_count != 1 else ''}")
        if breaking_deviation_count:
            lines.append(
                f"**{breaking_deviation_count} BREAKING**"
            )
        lines.append("")
        for d in deviations:
            prefix = ""
            if "breaking" in d.get("forward_impact", "").lower():
                prefix = "**BREAKING** — "
            lines.append(f"- {prefix}**{d['description']}**")
            if d.get("rationale"):
                lines.append(f"  - Rationale: {d['rationale']}")
            if d.get("severity"):
                lines.append(f"  - Severity: {d['severity']}")
            forward = d.get("forward_impact", "")
            if forward and forward.lower() != "none":
                lines.append(f"  - Forward impact: {forward}")

    markdown = "\n".join(lines)

    return {
        "success": True,
        "data": {
            "markdown": markdown,
            "finding_count": finding_count,
            "blocking_count": blocking_count,
            "downstream_effects": downstream_effects,
            "deviation_count": deviation_count,
            "breaking_deviation_count": breaking_deviation_count,
        },
    }


def _parse_session_deviations(content: str) -> list[dict]:
    """Parse Design Deviations section from session markdown.

    Returns list of deviation dicts with keys: description, rationale,
    severity, forward_impact, and optional spec_source, spec_text, implementation.
    Entries that are "No deviations from spec" markers are excluded.
    """
    lines = content.split("\n")

    # Find section start
    section_start = None
    for i, line in enumerate(lines):
        if line.strip().startswith(_DEVIATIONS_HEADER):
            section_start = i
            break

    if section_start is None:
        return []

    # Find section end (next ## heading)
    section_end = len(lines)
    for i in range(section_start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith("## ") and not stripped.startswith(_DEVIATIONS_HEADER):
            section_end = i
            break

    section_lines = lines[section_start:section_end]
    deviations: list[dict] = []
    current: dict | None = None

    for line in section_lines:
        stripped = line.strip()

        # Skip HTML comments, blank lines, agent headers
        if stripped.startswith("<!--") or not stripped:
            continue
        if stripped.startswith("### "):
            continue

        # Skip "No deviations from spec" markers
        if "no deviations from spec" in stripped.lower():
            continue

        # New deviation entry: - **description**
        m = re.match(r"^- \*\*(.+?)\*\*\s*$", stripped)
        if m:
            if current:
                deviations.append(current)
            current = {"description": m.group(1)}
            continue

        # Deviation fields
        if current and stripped.startswith("- "):
            field_match = re.match(r"^- (.+?):\s*(.+)$", stripped)
            if field_match:
                key = field_match.group(1).strip().lower().replace(" ", "_")
                value = field_match.group(2).strip()
                current[key] = value

    if current:
        deviations.append(current)

    return deviations


def write_impact_summary_to_session(session_path: Path) -> dict:
    """Read session file, compile Impact Summary from Delivery Findings, write it back.

    Places the ## Impact Summary section after ## Delivery Findings and
    before any agent assessment sections. Reads Design Deviations from the
    session to include deviation justifications in the summary.

    Args:
        session_path: Path to session markdown file.

    Returns:
        {success: True, data: {finding_count: int, blocking_count: int,
         deviation_count: int, downstream_module_count: int}}
        or {success: False, error: str}
    """
    session_path = Path(session_path)
    if not session_path.exists():
        return {"success": False, "error": "Session file not found"}

    content = session_path.read_text()

    # Parse findings (returns [] if no Delivery Findings section)
    findings = parse_delivery_findings(content)

    # Parse deviations (returns [] if no Design Deviations section)
    deviations = _parse_session_deviations(content)

    # Compile
    result = compile_impact_summary(findings, deviations=deviations)
    if not result["success"]:
        return result

    summary_md = result["data"]["markdown"]

    # Remove existing Impact Summary section (idempotency)
    content = _remove_existing_impact_summary(content)

    # Find insertion point
    insert_pos = _find_insert_position(content)

    # Insert with surrounding whitespace — ensure blank line before and after
    before = content[:insert_pos].rstrip("\n")
    after = content[insert_pos:].lstrip("\n")
    new_content = before + "\n\n" + summary_md + "\n\n" + after

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
            "deviation_count": result["data"]["deviation_count"],
            "downstream_module_count": len(result["data"]["downstream_effects"]),
        },
    }


def _remove_existing_impact_summary(content: str) -> str:
    """Remove existing ## Impact Summary section from content."""
    match = re.search(r"^## Impact Summary$", content, re.MULTILINE)
    if not match:
        return content

    start = match.start()

    # Find end: next ## heading or end of content
    rest = content[match.end() :]
    next_heading = re.search(r"^## ", rest, re.MULTILINE)
    end = match.end() + next_heading.start() if next_heading else len(content)

    # Trim blank lines before the removed section, keeping one newline
    while start > 0 and content[start - 1] == "\n":
        start -= 1
    if start > 0:
        start += 1

    # Trim blank lines after the removed section (before next ## heading)
    while end < len(content) and content[end] == "\n":
        end += 1

    return content[:start] + content[end:]


def _find_insert_position(content: str) -> int:
    """Find character position where Impact Summary should be inserted."""
    # Strategy 1: After ## Delivery Findings section (before next ## heading)
    df_match = re.search(r"^## Delivery Findings\b", content, re.MULTILINE)
    if df_match:
        rest = content[df_match.end() :]
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
