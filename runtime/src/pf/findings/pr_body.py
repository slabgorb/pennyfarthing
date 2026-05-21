"""
PR body generation from session files.

Generates a boss-readable PR description by extracting story metadata,
assessments, and Impact Summary from the session file. Translates all
framework jargon into plain language.
"""

from __future__ import annotations

import re
from pathlib import Path


def generate_pr_body(session_path: Path | str) -> dict:
    """Generate a boss-readable PR body from a session file.

    Args:
        session_path: Path to session markdown file.

    Returns:
        {success: True, data: {pr_body_markdown: str}}
        or {success: False, error: str}
    """
    session_path = Path(session_path)
    if not session_path.exists():
        return {
            "success": False,
            "error": f"Session file not found: {session_path}",
            "data": None,
        }

    content = session_path.read_text()
    if not content.strip():
        return {"success": True, "data": {"pr_body_markdown": _build_minimal_body()}}

    frontmatter = _parse_frontmatter(content)
    body = _strip_frontmatter(content)
    sections = _extract_sections(body)

    title = frontmatter.get("title", "")

    parts = [
        _build_summary(title),
        _build_what_was_done(sections),
        _build_impact_section(sections),
        _build_docs_section(sections),
        _build_details_section(sections),
    ]

    deviations = _build_deviations_section(sections)
    if deviations:
        parts.append(deviations)

    md = "\n\n".join(parts)
    md = _strip_html_comments(md)

    return {"success": True, "data": {"pr_body_markdown": md}}


def _parse_frontmatter(content: str) -> dict:
    """Parse YAML frontmatter from session file."""
    if not content.startswith("---"):
        return {}
    end = content.find("---", 3)
    if end == -1:
        return {}
    result = {}
    for line in content[3:end].strip().split("\n"):
        if ":" in line:
            key, _, value = line.partition(":")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def _strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from content."""
    if not content.startswith("---"):
        return content
    end = content.find("---", 3)
    if end == -1:
        return content
    return content[end + 3 :].lstrip("\n")


def _extract_sections(content: str) -> dict[str, str]:
    """Extract ## sections from markdown content."""
    sections: dict[str, str] = {}
    pattern = re.compile(r"^## (.+?)$", re.MULTILINE)
    matches = list(pattern.finditer(content))
    for i, match in enumerate(matches):
        header = match.group(1).strip()
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        sections[header] = content[start:end].strip()
    return sections


def _build_summary(title: str) -> str:
    if title:
        return f"## Summary\n\n{title}"
    return "## Summary\n\nNo summary available."


def _build_what_was_done(sections: dict) -> str:
    lines = ["## What Was Done", ""]
    dev = sections.get("Dev Assessment", "")
    if dev:
        for raw_line in dev.split("\n"):
            stripped = raw_line.strip()
            if not stripped:
                continue
            # Skip metadata-style lines from assessment template
            if re.match(
                r"^\*\*(Implementation Complete|Files Changed|Tests:|Branch:|Handoff:|PR:)",
                stripped,
            ):
                continue
            # Remove leading bold markers like **Implementation complete.**
            cleaned = re.sub(r"^\*\*[^*]+\*\*\s*", "", stripped)
            if cleaned:
                lines.append(f"- {cleaned}")
    if len(lines) == 2:
        lines.append("- Implementation completed")
    return "\n".join(lines)


def _build_impact_section(sections: dict) -> str:
    lines = ["## What This Work Revealed (Impact Summary)", ""]
    impact = sections.get("Impact Summary", "")
    if impact:
        lines.append(impact)
    else:
        lines.append("No upstream effects noted during delivery.")
    return "\n".join(lines)


def _build_docs_section(sections: dict) -> str:
    lines = ["## Docs That May Need Updating"]
    paths: list[str] = []
    for key in ("Impact Summary", "Delivery Findings"):
        text = sections.get(key, "")
        for m in re.finditer(r"Affects `([^`]+)`", text):
            p = m.group(1)
            if p not in paths:
                paths.append(p)
    if paths:
        for p in paths:
            lines.append(f"- `{p}`")
    else:
        lines.append("\nNone identified.")
    return "\n".join(lines)


def _build_details_section(sections: dict) -> str:
    lines = ["## Details"]

    # Test Design (from TEA Assessment)
    lines += ["", "### Test Design", ""]
    tea = sections.get("TEA Assessment", "")
    lines.append(_sanitize(tea) if tea else "No test design information available.")

    # Implementation (from Dev Assessment)
    lines += ["", "### Implementation", ""]
    dev = sections.get("Dev Assessment", "")
    lines.append(_sanitize(dev) if dev else "No implementation details available.")

    # Code Review (from Reviewer Assessment)
    lines += ["", "### Code Review", ""]
    reviewer = sections.get("Reviewer Assessment", "")
    lines.append(_sanitize(reviewer) if reviewer else "No code review information available.")

    # Full Findings (only when real findings exist)
    findings = sections.get("Delivery Findings", "")
    if findings and _has_real_findings(findings):
        lines += ["", "### Full Findings", ""]
        lines.append(_sanitize(findings))

    return "\n".join(lines)


def _sanitize(text: str) -> str:
    """Remove framework jargon from text."""
    text = text.replace("TEA Assessment", "Test Design")
    text = text.replace("Dev Assessment", "Implementation Summary")
    text = text.replace("Reviewer Assessment", "Code Review Summary")
    text = text.replace("SM Assessment", "Story Summary")
    text = text.replace("SM agent", "story management")
    text = re.sub(r"\bRED phase\b", "test design phase", text)
    text = re.sub(r"\bGREEN phase\b", "implementation phase", text)
    text = re.sub(r"\bRed Phase\b", "Test Design Phase", text)
    text = re.sub(r"\bGreen Phase\b", "Implementation Phase", text)
    text = text.replace("Phase Log", "Timeline")
    # Clean ### agent subheadings in findings
    text = re.sub(r"^### TEA\b.*$", "**Test Design:**", text, flags=re.MULTILINE)
    text = re.sub(r"^### Dev\b.*$", "**Implementation:**", text, flags=re.MULTILINE)
    text = re.sub(r"^### Reviewer\b.*$", "**Code Review:**", text, flags=re.MULTILINE)
    text = re.sub(r"^### SM\b.*$", "**Story Completion:**", text, flags=re.MULTILINE)
    return text


def _has_real_findings(findings_text: str) -> bool:
    """Check if findings text has actual structured findings."""
    for line in findings_text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- **") and "no upstream" not in stripped.lower():
            return True
    return False


def _strip_html_comments(text: str) -> str:
    """Remove HTML comments from text."""
    return re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()


def _build_deviations_section(sections: dict) -> str | None:
    """Build Design Deviations section from session data.

    Returns None if no real deviations exist.
    """
    raw = sections.get("Design Deviations", "")
    if not raw:
        return None

    # Parse deviation entries by agent subsection
    deviations = _parse_deviations(raw)
    if not deviations:
        return None

    # Count summary
    total = len(deviations)
    major_count = sum(1 for d in deviations if d.get("severity") == "major")
    breaking_count = sum(
        1 for d in deviations if "breaking" in d.get("forward_impact", "").lower()
    )

    lines = ["## Design Deviations", ""]

    # Summary line
    summary_parts = [f"{total} deviation{'s' if total != 1 else ''}"]
    if major_count:
        summary_parts.append(f"{major_count} major")
    if breaking_count:
        summary_parts.append(f"{breaking_count} breaking")
    lines.append(f"**{', '.join(summary_parts)}**")
    lines.append("")

    for d in deviations:
        prefix = ""
        if "breaking" in d.get("forward_impact", "").lower():
            prefix = "**BREAKING** — "
        lines.append(f"- {prefix}**{d['description']}**")
        if d.get("severity"):
            lines.append(f"  - Severity: {d['severity']}")
        if d.get("rationale"):
            lines.append(f"  - Rationale: {d['rationale']}")
        if d.get("forward_impact"):
            lines.append(f"  - Forward impact: {d['forward_impact']}")

    return "\n".join(lines)


def _parse_deviations(text: str) -> list[dict]:
    """Parse deviation entries from the Design Deviations section."""
    deviations: list[dict] = []
    current: dict | None = None

    for line in text.split("\n"):
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


def _build_minimal_body() -> str:
    return "\n\n".join(
        [
            "## Summary\n\nNo summary available.",
            "## What Was Done\n\n- Implementation completed",
            "## What This Work Revealed (Impact Summary)\n\n"
            "No upstream effects noted during delivery.",
            "## Docs That May Need Updating\n\nNone identified.",
            "## Details\n\n### Test Design\n\n"
            "No test design information available.\n\n"
            "### Implementation\n\n"
            "No implementation details available.\n\n"
            "### Code Review\n\n"
            "No code review information available.",
        ]
    )
