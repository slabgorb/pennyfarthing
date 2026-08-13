"""Shared session-field parser (164-13).

Extracted from pf.sprint.story_finish._parse_session (hardened in 164-11 / 164-12).

Public surface: ``parse_session(session_path: Path) -> dict[str, str]``.

Resolution order (155-40): the ``## Story Details`` section is authoritative
for ``branch``/``pr``.  Lines inside triple-backtick fences are skipped.
First-wins semantics: later duplicate field lines are ignored.
"""

from __future__ import annotations

import re
from pathlib import Path

#: Anchored to line start (155-40). The optional list-bullet prefix keeps the
#: sm-setup template's ``- **Branch:** ...`` Story Details shape parsing.
#: Hyphens are allowed inside the key (162-33) so a repo-qualified field keeps
#: the repo's real ``repos.yaml`` name: ``- **PR my-repo:** #227`` parses to the
#: key ``pr my-repo``. Hyphenated repo names are the norm, and a documented
#: syntax that silently fails to parse is worse than no syntax.
SESSION_FIELD_RE = re.compile(r"^\s*(?:[-*]\s+)?\*\*(\w[\w\s-]*):\*\*\s*(.*)")

#: The section this parser treats as authoritative for branch/pr (155-40).
STORY_DETAILS_SECTION = "story details"


def normalize_section_heading(heading_text: str) -> str:
    """Normalize a ``## `` heading's text for section comparison.

    Agents write both ``## Story Details`` and ``## Story Details:`` and the
    schema-validation hook accepts both (162-43), so this parser must grant
    Story Details authority to both — a hook looser than its consumer is the
    155-32 failure class (gate says OK, finish then resolves branch/pr from a
    stale placeholder in an earlier section).

    Exactly ONE trailing colon is stripped: ``## Story Details::`` and
    ``## Story Details Extra`` stay different sections.

    ``schema_validation._normalize_section_heading`` is this function,
    duplicated (the PreToolUse hook must not import ``pf.sprint``); the 162-43
    suite pins the two to identical behavior over a heading corpus.
    """
    heading = heading_text.strip().lower()
    if heading.endswith(":"):
        heading = heading[:-1].strip()
    return heading


def _parse_session_lines(lines: list[str]) -> dict[str, str]:
    """Core anchored parser on a pre-split list of lines.

    - Anchored regex: skips mid-prose field mentions
    - Fence-skip: skips lines inside triple-backtick code blocks
    - Story Details authority: branch/pr from ``## Story Details`` win
    - First-wins: later duplicate field lines ignored
    """
    fields: dict[str, str] = {}
    detail_fields: dict[str, str] = {}
    section: str | None = None
    in_fence = False
    seen_story_details = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.startswith("## "):
            candidate = normalize_section_heading(line[3:])
            if candidate == STORY_DETAILS_SECTION:
                if not seen_story_details:
                    seen_story_details = True
                    section = candidate
                # Second (and later) occurrences: do NOT update section —
                # those lines must never contribute to detail_fields.
            else:
                section = candidate
            continue
        m = SESSION_FIELD_RE.search(line)
        if not m:
            continue
        key = m.group(1).strip().lower()
        value = m.group(2).strip()
        # First-wins: with anchored matching, a later duplicate field line is
        # a stray record, not a correction.
        fields.setdefault(key, value)
        if section == STORY_DETAILS_SECTION:
            detail_fields.setdefault(key, value)
    # Story Details authority for the merge-target fields (155-40).
    for key in ("branch", "pr"):
        if key in detail_fields:
            fields[key] = detail_fields[key]
    return fields


def parse_session(session_path: Path) -> dict[str, str]:
    """Extract metadata fields from a session markdown file.

    Anchored, fence-aware, Story-Details-authoritative parser.
    Propagates ``OSError`` and ``UnicodeDecodeError`` to callers.
    """
    if not session_path.exists():
        return {}
    lines = session_path.read_text(encoding="utf-8").splitlines()
    return _parse_session_lines(lines)
