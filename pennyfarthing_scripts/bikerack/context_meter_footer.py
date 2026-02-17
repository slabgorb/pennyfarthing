"""ContextMeterFooter — Persistent context usage footer bar for BikeRack TUI.

Story 110-5: Context meter footer bar. Displays context window usage
percentage with color-coded tier thresholds, always visible at the
bottom of the layout.

Subscribes to /ws/context WebSocket channel.
"""

from __future__ import annotations

from typing import Any

from rich.text import Text
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.base_panel import render_progress_bar


class ContextMeterFooter(Static):
    """Persistent footer bar showing context window usage.

    Not a Footer subclass — this is a Static widget mounted between
    #main-content and BindingFooter in the app layout.
    """

    #: WebSocket channel this footer subscribes to
    channel: str = "context"

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client
        self._context_data: dict[str, Any] | None = None
        self._mounted = False

    def on_mount(self) -> None:
        """Subscribe to context channel on mount."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("context", self.handle_context_message)

    def on_unmount(self) -> None:
        """Mark as unmounted so further messages are ignored."""
        self._mounted = False

    def handle_context_message(self, msg: dict[str, Any] | None) -> None:
        """Process incoming /ws/context message."""
        if not self._mounted or msg is None:
            return
        ctx = msg.get("context")
        if ctx is None:
            return
        self._context_data = ctx
        try:
            rendered = self.render_meter(ctx)
            self.app.call_from_thread(self.update, rendered)
        except RuntimeError:
            try:
                self.update(rendered)
            except Exception:
                pass
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
