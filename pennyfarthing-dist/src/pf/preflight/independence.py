"""
File-overlap independence check for batch fan-out.

Validates that parallel work units have no shared files,
preventing the worst failure mode of concurrent modification.

Usage:
    pf preflight independence --units '<json>'
    pf preflight independence --session <story-id>
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class UnitDefinition:
    """A work unit with its file boundaries."""

    id: str
    files: list[str]
    description: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> UnitDefinition:
        """Create from dictionary."""
        return cls(
            id=str(data["id"]),
            files=[str(f) for f in data.get("files", [])],
            description=str(data.get("description", "")),
        )


@dataclass
class FileOverlap:
    """A file shared by multiple units."""

    file: str
    units: list[str]


@dataclass
class IndependenceResult:
    """Result of the file-overlap independence check."""

    status: str  # "pass" or "fail"
    independent: bool
    overlaps: list[FileOverlap] = field(default_factory=list)
    unit_count: int = 0
    file_count: int = 0
    message: str = ""
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON/YAML output."""
        result: dict[str, Any] = {
            "status": self.status,
            "independent": self.independent,
            "unit_count": self.unit_count,
            "file_count": self.file_count,
            "message": self.message,
        }

        if self.overlaps:
            result["overlaps"] = [{"file": o.file, "units": o.units} for o in self.overlaps]

        if self.error:
            result["error"] = self.error

        return result


def check_independence(units: list[UnitDefinition]) -> IndependenceResult:
    """
    Check that no file appears in more than one unit's file list.

    Args:
        units: List of unit definitions with file boundaries.

    Returns:
        IndependenceResult indicating pass/fail with overlap details.
    """
    if not units:
        return IndependenceResult(
            status="pass",
            independent=True,
            message="No units to check.",
        )

    if len(units) < 2:
        return IndependenceResult(
            status="pass",
            independent=True,
            unit_count=1,
            file_count=len(units[0].files),
            message="Single unit — no overlaps possible.",
        )

    # Build file → units map
    file_to_units: dict[str, list[str]] = {}
    all_files: set[str] = set()

    for unit in units:
        for file_path in unit.files:
            normalized = _normalize_path(file_path)
            all_files.add(normalized)
            file_to_units.setdefault(normalized, []).append(unit.id)

    # Find overlaps (files claimed by 2+ units)
    overlaps = [
        FileOverlap(file=file_path, units=sorted(unit_ids))
        for file_path, unit_ids in sorted(file_to_units.items())
        if len(unit_ids) > 1
    ]

    independent = len(overlaps) == 0

    if independent:
        message = f"All {len(units)} units are independent. {len(all_files)} files, zero overlaps."
    else:
        overlap_details = "; ".join(f"`{o.file}` in [{', '.join(o.units)}]" for o in overlaps[:5])
        message = (
            f"{len(overlaps)} file(s) shared across units. "
            f"To fix: Assign each overlapping file to exactly one unit, or extract shared code "
            f"into a separate module. Overlaps: {overlap_details}"
        )

    return IndependenceResult(
        status="pass" if independent else "fail",
        independent=independent,
        overlaps=overlaps,
        unit_count=len(units),
        file_count=len(all_files),
        message=message,
    )


def parse_units_from_json(json_str: str) -> list[UnitDefinition]:
    """
    Parse unit definitions from JSON string.

    Expected format:
        {
            "units": [
                {"id": "1", "files": ["a.ts", "b.ts"], "description": "..."},
                {"id": "2", "files": ["c.ts"], "description": "..."}
            ]
        }
    """
    data = json.loads(json_str)

    if isinstance(data, list):
        raw_units = data
    elif isinstance(data, dict) and "units" in data:
        raw_units = data["units"]
    else:
        raise ValueError("Expected JSON with 'units' array or a bare array of units.")

    return [UnitDefinition.from_dict(u) for u in raw_units]


def parse_units_from_session(
    story_id: str, project_root: Path | None = None
) -> list[UnitDefinition]:
    """
    Parse unit definitions from a session file's <units> XML.

    Extracts unit IDs and descriptions. File lists must be provided
    separately (session XML tracks status, not file boundaries).

    Returns empty list if no units found — callers should fall back
    to --units JSON input from the architect's decomposition output.
    """
    root = project_root or Path.cwd()
    session_path = root / ".session" / f"{story_id}-session.md"

    if not session_path.exists():
        return []

    content = session_path.read_text()

    # Extract <unit> elements
    unit_pattern = re.compile(r'<unit\s+id="([^"]+)"[^>]*>([^<]*)</unit>', re.MULTILINE)

    units = []
    for match in unit_pattern.finditer(content):
        unit_id = match.group(1)
        description = match.group(2).strip()
        units.append(UnitDefinition(id=unit_id, description=description))

    return units


def _normalize_path(file_path: str) -> str:
    """Normalize a file path for comparison."""
    # Strip leading ./ and trailing whitespace
    path = file_path.strip()
    if path.startswith("./"):
        path = path[2:]
    return path
