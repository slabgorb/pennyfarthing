"""Base panel abstraction for BikeRack TUI.

Story 103-5: Base panel class that panels inherit from. Handles:
subscribe to WebSocket channel by key, receive JSON payload, call
render method, display Rich output in main content area.
"""

from __future__ import annotations

from typing import Any

from textual.widgets import Static


class BasePanel(Static):
    """Base class for BikeRack TUI panels.

    Subclasses set ``channel`` as a class attribute and implement
    ``render_panel(payload)`` to return a Rich renderable.
    """

    #: WebSocket channel this panel subscribes to (override in subclass)
    channel: str = ""

    def __init__(self, client=None, **kwargs):
        super().__init__(**kwargs)
        self._client = client
        self._last_payload: dict[str, Any] | None = None
        self._mounted = False

    def on_mount(self) -> None:
        """Subscribe to channel via client on mount."""
        self._mounted = True
        if self._client is not None and self.channel:
            self._client.subscribe(self.channel, self.handle_message)

    def on_unmount(self) -> None:
        """Mark panel as unmounted — messages ignored after this."""
        self._mounted = False

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket message.

        Stores payload, calls render_panel, updates widget display.
        No-op after unmount or if message is None.
        """
        if not self._mounted or message is None:
            return
        self._last_payload = message
        rendered = self.render_panel(message)
        try:
            self.update(rendered)
        except Exception:
            pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render panel content from payload.

        Subclasses override this to return Rich renderables
        (Table, Tree, Text, etc.).
        """
        raise NotImplementedError("Subclasses must implement render_panel()")
