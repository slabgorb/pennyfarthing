"""Deviation traceability — link every deviation to spec source.

Parses Design Deviations from session files into a traceability matrix
that maps each deviation to its spec source document and forward-impact
affected stories.

Delegates to pf.gates.deviations for entry parsing; adds structured
extraction of Spec source and Forward impact fields.

Story: 150-4
"""

from __future__ import annotations

import re
from pathlib import Path

from pf.gates.deviations import (
    AGENT_SUBSECTIONS,
    _extract_section,
    _extract_subsection,
    _get_field_value,
    _parse_entries,
)

# Regex for extracting document path from Spec source
_DOC_RE = re.compile(r"(\S+\.\w+)")

# Regex for extracting story IDs from Forward impact
_STORY_ID_RE = re.compile(r"\b(\d+-\d+)\b")

# Valid forward impact levels
_VALID_LEVELS = frozenset({"none", "minor", "breaking"})


def parse_spec_source(spec_source: str) -> dict:
    """Parse a Spec source field into a structured reference.

    Args:
        spec_source: Raw Spec source field value (e.g., "context-story-99-1.md, AC-1")

    Returns:
        dict with keys:
            document: str — file path or document name
            ref_type: "file" | "unknown"
            location: str — specific location within document (AC, section, etc.)
    """
    if not spec_source or not spec_source.strip():
        return {"document": "", "ref_type": "unknown", "location": ""}

    text = spec_source.strip()

    # Extract document (first thing that looks like a file path)
    doc_match = _DOC_RE.search(text)
    document = doc_match.group(1) if doc_match else ""
    ref_type = "file" if document else "unknown"

    # Extract location — everything after the first comma
    location = ""
    if "," in text:
        location = text.split(",", 1)[1].strip()

    return {"document": document, "ref_type": ref_type, "location": location}


def parse_forward_impact(forward_impact: str) -> dict:
    """Parse a Forward impact field into level and affected stories.

    Args:
        forward_impact: Raw Forward impact value (e.g., "breaking — 99-2, 99-3")

    Returns:
        dict with keys:
            level: "none" | "minor" | "breaking" | "unknown"
            affected_stories: list[str] — story IDs affected
    """
    if not forward_impact or not forward_impact.strip():
        return {"level": "unknown", "affected_stories": []}

    text = forward_impact.strip()

    # Extract level — first word before any em-dash
    level_text = text.split("—")[0].split(" — ")[0].strip().lower()
    level = level_text if level_text in _VALID_LEVELS else "unknown"

    # Extract story IDs after the em-dash
    affected_stories: list[str] = []
    if "—" in text:
        after_dash = text.split("—", 1)[1]
        affected_stories = _STORY_ID_RE.findall(after_dash)

    return {"level": level, "affected_stories": affected_stories}


def build_traceability_matrix(session_path: str | Path) -> dict:
    """Build a traceability matrix from session deviations.

    Reads all agent subsections from the Design Deviations section,
    parses each deviation's Spec source and Forward impact fields,
    and aggregates into a matrix with affected stories and breaking summary.

    Args:
        session_path: Path to the session markdown file.

    Returns:
        dict with keys:
            success: bool
            data: dict with matrix, affected_stories, breaking_deviations
            error: str | None
    """
    try:
        path = Path(session_path)
        if not path.exists():
            return _result(False, error=f"Session file not found: {session_path}")

        content = path.read_text()
        if not content.strip():
            return _result(True)

        section_lines = _extract_section(content)
        if section_lines is None:
            return _result(True)

        matrix: list[dict] = []
        all_affected: list[str] = []
        breaking: list[dict] = []

        for agent_key in AGENT_SUBSECTIONS:
            subsection_lines = _extract_subsection(section_lines, agent_key)
            if subsection_lines is None:
                continue

            entries = _parse_entries(subsection_lines)
            for entry in entries:
                if entry["is_no_deviations"]:
                    continue

                spec_source_raw = _get_field_value(entry["fields"], "Spec source") or ""
                forward_impact_raw = _get_field_value(entry["fields"], "Forward impact") or ""

                spec_source = parse_spec_source(spec_source_raw)
                forward_impact = parse_forward_impact(forward_impact_raw)

                row = {
                    "deviation": entry["description"],
                    "agent": agent_key,
                    "spec_source": spec_source,
                    "forward_impact": forward_impact,
                }
                matrix.append(row)

                for story_id in forward_impact["affected_stories"]:
                    if story_id not in all_affected:
                        all_affected.append(story_id)

                if forward_impact["level"] == "breaking":
                    breaking.append(row)

        return _result(
            True,
            matrix=matrix,
            affected_stories=all_affected,
            breaking_deviations=breaking,
        )

    except Exception as e:
        return _result(False, error=f"Unexpected error: {e}")


def _result(
    success: bool,
    *,
    matrix: list[dict] | None = None,
    affected_stories: list[str] | None = None,
    breaking_deviations: list[dict] | None = None,
    error: str | None = None,
) -> dict:
    """Build a standard result dict."""
    return {
        "success": success,
        "data": {
            "matrix": matrix or [],
            "affected_stories": affected_stories or [],
            "breaking_deviations": breaking_deviations or [],
        },
        "error": error,
    }
