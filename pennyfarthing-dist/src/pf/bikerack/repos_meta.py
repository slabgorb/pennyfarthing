"""Repo field metadata registry for BikeRack TUI Repos panel.

Maps each known repo field to a RepoFieldSpec that describes its UI widget type,
group, and options. Used by ReposPanel to render per-repo settings.

Story 147-4: Stub — not yet implemented.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class RepoFieldSpec:
    """Describes how a single repo field should render in the TUI.

    Stub — fields defined but registry not yet populated.
    """

    field: str
    label: str
    widget_type: str  # "switch" | "select" | "input" | "readonly"
    group: str = "General"
    options: list[tuple[str, Any]] | None = None
    description: str = ""
    read_only: bool = False


# Explicit metadata for known repo fields — NOT YET POPULATED
REPO_FIELDS_META: dict[str, RepoFieldSpec] = {}

# Global (top-level) repo fields — NOT YET POPULATED
GLOBAL_REPO_FIELDS: list[str] = []


def build_repo_field_specs() -> list[RepoFieldSpec]:
    """Build the ordered list of RepoFieldSpecs.

    Stub — returns empty list until implemented.
    """
    return []
