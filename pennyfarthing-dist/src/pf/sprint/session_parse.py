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
SESSION_FIELD_RE = re.compile(r"^\s*(?:[-*]\s+)?\*\*(\w[\w\s]*):\*\*\s*(.*)")


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
            candidate = line[3:].strip().lower()
            if candidate == "story details":
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
        if section == "story details":
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
