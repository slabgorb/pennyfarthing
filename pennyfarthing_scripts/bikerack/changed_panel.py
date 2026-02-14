"""ChangedPanel — Changed file list with status for BikeRack TUI.

Story 103-14: Subscribes to /ws/git, extracts dirtyFiles from all repos,
renders Rich table with file path, change type icon, and status.
"""

from __future__ import annotations

from typing import Any

from pennyfarthing_scripts.bikerack.base_panel import BasePanel


class ChangedPanel(BasePanel):
    """Changed file list panel — stub for TDD RED phase."""

    channel: str = ""
    panel_name: str = ""
    icon: str = ""

    def render_panel(self, payload: dict[str, Any]) -> Any:
        raise NotImplementedError("RED phase stub")
