"""ContextMeterFooter — Persistent context usage footer bar for BikeRack TUI.

Story 110-5: Context meter footer bar. Displays context window usage
percentage with color-coded tier thresholds, always visible at the
bottom of the layout.

Story 110-12: Periodic refresh timer, event-driven redraws, and
throttling for more frequent updates without performance degradation.

Subscribes to /ws/context WebSocket channel.
"""

from __future__ import annotations

import time
from typing import Any

from rich.text import Text
from textual.message import Message
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.base_panel import render_progress_bar


class ContextMeterFooter(Static):
    """Persistent footer bar showing context window usage.

    Not a Footer subclass — this is a Static widget mounted between
    #main-content and BindingFooter in the app layout.
    """

    class MeterUpdate(Message, bubble=False):
        """Context meter data received — routed through Textual message system."""

        def __init__(self, content: Any) -> None:
            super().__init__()
            self.content = content

    #: WebSocket channel this footer subscribes to
    channel: str = "context"

    #: Seconds between periodic refresh redraws
    refresh_interval: float = 5.0

    #: Minimum seconds between redraws (throttle)
    min_redraw_interval: float = 0.25

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client
        self._context_data: dict[str, Any] | None = None
        self._mounted = False
        self._refresh_timer: Any = None
        self._last_redraw_time: float = 0.0
        self.last_update_time: float = 0.0

    @property
    def is_stale(self) -> bool:
        """True if no context data has been received."""
        return self._context_data is None

    def on_mount(self) -> None:
        """Subscribe to context channel and start periodic refresh on mount."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("context", self.handle_context_message)
            self._client.on_state_change(self.on_connection_state_change)
        try:
            self._refresh_timer = self.set_interval(
                self.refresh_interval, self.request_refresh
            )
        except RuntimeError:
            # No running event loop (e.g. unit tests calling on_mount directly)
            pass

    def on_unmount(self) -> None:
        """Stop timer and mark as unmounted so further messages are ignored."""
        self._mounted = False
        if self._refresh_timer is not None:
            self._refresh_timer.stop()

    def on_context_meter_footer_meter_update(self, event: MeterUpdate) -> None:
        """Process MeterUpdate in Textual message context — triggers repaint."""
        self.update(event.content)

    def request_refresh(self) -> None:
        """Redraw from cached context data. Safe to call at any time."""
        if not self._mounted or self._context_data is None:
            return
        try:
            rendered = self.render_meter(self._context_data)
            self.post_message(self.MeterUpdate(rendered))
        except Exception:
            pass

    def on_connection_state_change(self, state: Any) -> None:
        """Redraw on WebSocket reconnection."""
        self.request_refresh()

    def handle_context_message(self, msg: dict[str, Any] | None) -> None:
        """Process incoming /ws/context message with throttling."""
        if not self._mounted or msg is None:
            return
        ctx = msg.get("context")
        if ctx is None:
            return
        self._context_data = ctx
        self.last_update_time = time.monotonic()

        # Throttle: skip redraw if too soon after last one
        now = time.monotonic()
        if now - self._last_redraw_time < self.min_redraw_interval:
            return
        self._last_redraw_time = now

        try:
            rendered = self.render_meter(ctx)
            self.post_message(self.MeterUpdate(rendered))
        except Exception:
            pass

    def render_meter(self, ctx: dict[str, Any]) -> Text:
        """Render a compact context usage bar with percentage and tier badge."""
        percent = ctx.get("percent", 0)
        tier = ctx.get("tier", "")

        bar = render_progress_bar(percent, warn_high=True)

        if tier:
            if percent < 50:
                tier_style = "green"
            elif percent <= 80:
                tier_style = "yellow"
            else:
                tier_style = "red"
            bar.append(f" {tier}", style=f"bold {tier_style}")

        return bar
