"""ContextMeterFooter — Persistent context usage footer bar for BikeRack TUI.

Story 110-5: Context meter footer bar. Displays context window usage
percentage with color-coded tier thresholds, always visible at the
bottom of the layout.

Subscribes to /ws/context WebSocket channel.
"""

from __future__ import annotations

from typing import Any

from textual.widgets import Static


class ContextMeterFooter(Static):
    """Persistent footer bar showing context window usage.

    Stub — not yet implemented. Tests should fail on assertions.
    """

    #: WebSocket channel this footer subscribes to
    channel: str = ""

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client
        self._context_data: dict[str, Any] | None = None
        self._mounted = False

    def on_mount(self) -> None:
        """Subscribe to context channel on mount — stub."""
        self._mounted = True

    def on_unmount(self) -> None:
        """Mark as unmounted."""
        self._mounted = False

    def render_meter(self, ctx: dict[str, Any]) -> Any:
        """Render the context meter bar — stub returns placeholder."""
        return "Not implemented"
