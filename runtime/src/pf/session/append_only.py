"""Append-only validation for session files — Story 150-10.

Enforces that session files maintain a chronological audit trail by ensuring
existing section content is never modified or deleted, only appended to.

Exempt sections (legitimate edits allowed):
- YAML frontmatter (between --- markers)
- Workflow Tracking (phase updates by complete-phase)
- Story Details (PR field additions)
- Phase History (table rows added by workflow tooling)
"""

from __future__ import annotations

import re

# Sections exempt from append-only enforcement.
EXEMPT_SECTIONS = frozenset({
    "Workflow Tracking",
    "Story Details",
    "Phase History",
})


def _parse_frontmatter(content: str) -> tuple[str, str]:
    """Split content into YAML frontmatter and body.

    Returns (frontmatter, body). If no frontmatter, returns ("", content).
    """
    match = re.match(r"^---\n(.*?\n)---\n", content, re.DOTALL)
    if match:
        return match.group(0), content[match.end():]
    return "", content


def _parse_sections(body: str) -> list[tuple[str, str]]:
    """Parse markdown body into a list of (heading, content) tuples.

    Splits on ## headings. Content before any heading gets heading "".
    Content includes everything after the heading line up to the next heading.
    """
    sections: list[tuple[str, str]] = []
    # Split on ## headings, keeping the heading text
    parts = re.split(r"^(## .+)$", body, flags=re.MULTILINE)

    # parts[0] is content before first heading (preamble)
    if parts[0].strip():
        sections.append(("", parts[0]))

    # Remaining parts alternate: heading, content, heading, content, ...
    for i in range(1, len(parts), 2):
        heading_line = parts[i]
        heading = heading_line.lstrip("# ").strip()
        content = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append((heading, content))

    return sections


def validate_session_append_only(
    old_content: str, new_content: str,
) -> dict:
    """Validate that new_content is an append-only update of old_content.

    Returns {"valid": True/False, "violations": [...]}.
    Each violation: {"section": str, "type": str, "detail": str}.
    """
    violations: list[dict] = []

    # Initial write is always valid
    if not old_content or not old_content.strip():
        return {"valid": True, "violations": []}

    # Parse frontmatter (exempt) and body
    _old_fm, old_body = _parse_frontmatter(old_content)
    _new_fm, new_body = _parse_frontmatter(new_content)

    # Parse sections
    old_sections = _parse_sections(old_body)
    new_sections = _parse_sections(new_body)

    # Build lookup of new sections by heading
    new_section_map: dict[str, str] = {}
    for heading, content in new_sections:
        new_section_map[heading] = content

    # Check each old section
    for heading, old_section_content in old_sections:
        # Skip exempt sections
        if heading in EXEMPT_SECTIONS:
            continue

        # Skip preamble (content before any heading)
        if heading == "":
            continue

        # Check if section still exists
        if heading not in new_section_map:
            violations.append({
                "section": heading,
                "type": "deleted",
                "detail": f"Section '## {heading}' was deleted",
            })
            continue

        new_section_content = new_section_map[heading]

        # Normalize: strip trailing whitespace from both for comparison
        old_stripped = old_section_content.rstrip()
        new_stripped = new_section_content.rstrip()

        # New content must start with old content (append-only)
        if not new_stripped.startswith(old_stripped):
            violations.append({
                "section": heading,
                "type": "modified",
                "detail": f"Content in '## {heading}' was modified, not appended",
            })

    return {"valid": len(violations) == 0, "violations": violations}
