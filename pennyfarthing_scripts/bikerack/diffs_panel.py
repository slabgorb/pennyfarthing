"""DiffsPanel — Rich diff rendering with syntax highlighting for BikeRack TUI.

Story 103-18: Subscribes to /ws/diffs, renders file diffs with syntax
highlighting using Rich. File headers, added/removed line coloring, line numbers.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel


class DiffsPanel(BasePanel):
    """Diff rendering panel with syntax highlighting.

    Subscribes to the ``diffs`` WebSocket channel and renders
    file diffs with syntax highlighting, colored added/removed lines,
    file headers, and line numbers.
    """

    channel: str = "diffs"
    panel_name: str = "Diffs"
    icon: str = PANEL_ICONS["diffs"][0]

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render diff data from WebSocket payload.

        Stub — returns placeholder. Dev implements full rendering.
        """
        return Text("No diffs")
