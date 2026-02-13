"""SprintPanel — Sprint status panel for BikeRack TUI.

Story 103-6: First panel implementation proving the BasePanel vertical slice.
Subscribes to /ws/sprint, renders sprint status as Rich table.

STUB: Tests should FAIL until implementation is complete.
"""

from __future__ import annotations

from typing import Any

from pennyfarthing_scripts.bikerack.base_panel import BasePanel


class SprintPanel(BasePanel):
    """Sprint status panel.

    Subscribes to the ``sprint`` WebSocket channel and renders
    sprint status as a Rich table with story list, points, and velocity.
    """

    channel: str = "sprint"

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render sprint data as Rich table.

        Not yet implemented — returns empty string as stub.
        """
        return ""
