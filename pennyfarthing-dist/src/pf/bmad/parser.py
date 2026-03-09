"""
BMAD markdown parser for Pennyfarthing sprint adapter.

Reads BMAD story and epic markdown files and returns PF-compatible dicts.
Story files: implementation-artifacts/{epic}-{story}-{slug}.md
Epic files:  planning-artifacts/epics/epic-{nn}-{slug}.md
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

# =============================================================================
# Status Mapping
# =============================================================================

BMAD_TO_PF_STATUS: dict[str, str] = {
    "draft": "planning",
    "ready-for-dev": "ready",
    "in-progress": "in_progress",
    "in-review": "in_progress",
    "completed": "done",
    "blocked": "backlog",
}

PF_TO_BMAD_STATUS: dict[str, str] = {
    "planning": "draft",
    "ready": "ready-for-dev",
    "in_progress": "in-progress",
    "done": "completed",
    "backlog": "blocked",
    "canceled": "completed",
}


def map_bmad_to_pf(bmad_status: str) -> str:
    """Map a BMAD status string to a PF status."""
    return BMAD_TO_PF_STATUS.get(bmad_status.strip().lower(), "planning")


def map_pf_to_bmad(pf_status: str) -> str:
    """Map a PF status string to a BMAD status."""
    return PF_TO_BMAD_STATUS.get(pf_status.strip().lower(), "draft")


# =============================================================================
# Story Parsing
# =============================================================================

# Header patterns: flat Key: value lines after the # title
_HEADER_PATTERNS: dict[str, re.Pattern[str]] = {
    "status": re.compile(r"^Status:\s*(.+)$", re.MULTILINE),
    "story_key": re.compile(r"^Story-Key:\s*(.+)$", re.MULTILINE),
    "jira": re.compile(r"^Jira:\s*(.+)$", re.MULTILINE),
    "epic_line": re.compile(r"^Epic:\s*(.+)$", re.MULTILINE),
    "date": re.compile(r"^Date:\s*(.+)$", re.MULTILINE),
}

_TITLE_RE = re.compile(r"^#\s+Story\s+\d+\.\d+(?:\.\d+)?:\s*(.+)$", re.MULTILINE)

# AC block: everything between ## Acceptance Criteria and the next ## heading
_AC_RE = re.compile(r"## Acceptance Criteria\s*\n(.*?)(?=\n## |\Z)", re.DOTALL)


def parse_bmad_story(path: Path) -> dict[str, Any]:
    """Parse a single BMAD story markdown file.

    Args:
        path: Path to the .md file in implementation-artifacts/

    Returns:
        PF-compatible story dict with extra bmad_key and bmad_path fields.
    """
    content = path.read_text()

    # Extract header fields
    fields: dict[str, str] = {}
    for name, pattern in _HEADER_PATTERNS.items():
        match = pattern.search(content)
        if match:
            fields[name] = match.group(1).strip()

    story_key = fields.get("story_key", "")
    # Consume all leading numeric segments as the ID
    # e.g. "1-5-testing-framework" → "1-5", "2-8-1-claroty-plugin" → "2-8-1"
    key_parts = story_key.split("-")
    id_segments: list[str] = []
    for seg in key_parts:
        if seg.isdigit():
            id_segments.append(seg)
        else:
            break
    pf_id = "-".join(id_segments) if len(id_segments) >= 2 else "0-0"
    epic_num = id_segments[0] if id_segments else "0"

    # Title from # heading
    title_match = _TITLE_RE.search(content)
    title = title_match.group(1).strip() if title_match else path.stem

    # BMAD status → PF status
    bmad_status = fields.get("status", "draft")
    pf_status = map_bmad_to_pf(bmad_status)

    # Jira references (format: "DPGD-14 / DPGD-21")
    jira_raw = fields.get("jira", "")

    # Acceptance criteria summary
    ac_match = _AC_RE.search(content)
    ac_text = ac_match.group(1).strip() if ac_match else ""

    return {
        "id": pf_id,
        "title": title,
        "status": pf_status,
        "points": 3,  # Default; BMAD stories don't carry points in impl artifacts
        "priority": "P1",
        "workflow": "tdd",
        "bmad_key": story_key,
        "bmad_status": bmad_status,
        "bmad_path": str(path),
        "jira": jira_raw,
        "epic_num": epic_num,
        "acceptance_criteria": ac_text,
    }


# =============================================================================
# Epic Parsing
# =============================================================================


def parse_bmad_epic(path: Path) -> dict[str, Any]:
    """Parse a BMAD epic markdown file with YAML frontmatter.

    Args:
        path: Path to epic-{nn}-{slug}.md in planning-artifacts/epics/

    Returns:
        Dict with epicNumber, title, phase, status, storyCount.
    """
    content = path.read_text()

    # Extract YAML frontmatter between --- markers
    fm_match = re.match(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if not fm_match:
        return {
            "epicNumber": 0,
            "title": path.stem,
            "phase": "MVP",
            "status": "draft",
            "storyCount": 0,
        }

    fm = yaml.safe_load(fm_match.group(1)) or {}
    return {
        "epicNumber": fm.get("epicNumber", 0),
        "title": fm.get("title", path.stem),
        "phase": fm.get("phase", "MVP"),
        "status": fm.get("status", "draft"),
        "storyCount": fm.get("storyCount", 0),
    }


# =============================================================================
# Discovery
# =============================================================================


def discover_bmad_stories(
    source_root: Path,
    story_dir: str = "implementation-artifacts",
) -> list[dict[str, Any]]:
    """Scan BMAD implementation-artifacts/ and return parsed stories.

    Args:
        source_root: Path to _bmad-output/ (or equivalent)
        story_dir: Subdirectory name for story files

    Returns:
        List of parsed story dicts, sorted by (epic_num, story_num).
    """
    artifacts_dir = source_root / story_dir
    if not artifacts_dir.is_dir():
        return []

    stories: list[dict[str, Any]] = []
    for md_file in sorted(artifacts_dir.glob("*.md")):
        # Skip non-story files (e.g. 0-1-bmad-method-lifecycle.md is meta)
        if md_file.name.startswith("0-"):
            continue
        # Must match {digit}-{digit}-*.md pattern
        if not re.match(r"^\d+-\d+-", md_file.name):
            continue
        story = parse_bmad_story(md_file)
        stories.append(story)

    # Sort by epic number, then story number (supports variable-length IDs like 2-8-1)
    def sort_key(s: dict) -> tuple[int, ...]:
        return tuple(int(p) for p in s["id"].split("-"))

    stories.sort(key=sort_key)
    return stories


def discover_bmad_epics(
    source_root: Path,
    epic_dir: str = "planning-artifacts/epics",
) -> list[dict[str, Any]]:
    """Scan BMAD planning-artifacts/epics/ and return parsed epics.

    Args:
        source_root: Path to _bmad-output/ (or equivalent)
        epic_dir: Subdirectory path for epic files

    Returns:
        List of parsed epic dicts, sorted by epicNumber.
    """
    epics_dir = source_root / epic_dir
    if not epics_dir.is_dir():
        return []

    epics: list[dict[str, Any]] = []
    for md_file in sorted(epics_dir.glob("epic-*.md")):
        # Skip index.md or non-epic files
        if md_file.name == "index.md":
            continue
        epic = parse_bmad_epic(md_file)
        if epic["epicNumber"] > 0:
            epics.append(epic)

    epics.sort(key=lambda e: e["epicNumber"])
    return epics
