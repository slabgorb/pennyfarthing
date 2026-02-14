"""BackgroundPanel — Background task status display for BikeRack TUI.

Story 103-16: Subscribes to /ws/background-tasks, renders background task
list with status indicators (running, completed, failed).
"""

from __future__ import annotations

from typing import Any

from pennyfarthing_scripts.bikerack.base_panel import BasePanel


class BackgroundPanel(BasePanel):
    """Background task status panel.

    Subscribes to the ``background-tasks`` WebSocket channel and renders
    a list of background tasks with status indicators.
    """

    channel: str = ""
    panel_name: str = ""
    icon: str = ""

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render background task data from WebSocket payload."""
        raise NotImplementedError("Not yet implemented")
