"""Base panel abstraction for BikeRack TUI.

Story 103-5: Base panel class that panels inherit from. Handles:
subscribe to WebSocket channel by key, receive JSON payload, call
render method, display Rich output in main content area.

STUB: Awaiting implementation in green phase.
"""

from __future__ import annotations

from typing import Any

from textual.widgets import Static


class BasePanel(Static):
    """Base class for BikeRack TUI panels.

    Stub implementation — all methods raise NotImplementedError
    until green phase.
    """

    #: WebSocket channel this panel subscribes to (override in subclass)
    channel: str = ""

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
        self._last_payload: dict[str, Any] | None = None

    def on_mount(self) -> None:
        """Subscribe to channel on mount — STUB."""
        raise NotImplementedError("BasePanel.on_mount not implemented")

    def on_unmount(self) -> None:
        """Unsubscribe from channel on unmount — STUB."""
        raise NotImplementedError("BasePanel.on_unmount not implemented")

    def handle_message(self, message: dict[str, Any]) -> None:
        """Handle incoming WebSocket message — STUB."""
        raise NotImplementedError("BasePanel.handle_message not implemented")

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render panel content from payload — STUB.

        Subclasses override this to return Rich renderables
        (Table, Tree, Text, etc.).
        """
        raise NotImplementedError("BasePanel.render_panel not implemented")
