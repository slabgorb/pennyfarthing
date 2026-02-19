"""DebugPanel — Context usage and token stats for BikeRack TUI.

Story 103-17: Port of the React DebugPanel. Subscribes to /ws/context
and /ws/token-stats, renders context usage (tokens, percent, tier) and
token consumption stats (input, output, cache, cost).
"""

from __future__ import annotations

from collections import deque
from typing import Any

from rich.console import Group
from rich.table import Table
from rich.text import Text

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel, render_progress_bar

# Tier → Rich style mapping
_TIER_STYLES: dict[str, str] = {
    "FULL": "bold green",
    "REFRESH": "bold yellow",
    "HANDOFF": "bold cyan",
    "MINIMAL": "bold red",
}


def _safe_int(value: Any) -> int | None:
    """Safely convert a value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value: Any) -> float | None:
    """Safely convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _format_tokens(value: Any) -> str:
    """Format a token count with comma separators."""
    n = _safe_int(value)
    if n is None:
        return "—"
    return f"{n:,}"


class DebugPanel(BasePanel):
    """Context usage and token stats panel.

    Subscribes to both ``context`` and ``token-stats`` WebSocket channels.
    Renders context usage (tokens, percentage, tier) and token consumption
    stats (input, output, cache read/write, cost).
    """

    channel: str = "context"
    panel_name: str = "Debug"
    icon: str = PANEL_ICONS["debug"][0]

    def __init__(self, client: Any = None, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._context_data: dict[str, Any] | None = None
        self._token_stats: dict[str, Any] | None = None
        self._sparkline_history: deque[int] = deque(maxlen=20)

    def on_mount(self) -> None:
        """Subscribe to both context and token-stats channels."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("context", self._handle_context_message)
            self._client.subscribe("token-stats", self._handle_token_stats_message)

    def _handle_context_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming context channel message."""
        if message is None:
            return
        ctx = message.get("context")
        if isinstance(ctx, dict):
            self._context_data = ctx
            pct = _safe_int(ctx.get("percent"))
            if pct is not None:
                self._sparkline_history.append(pct)
        else:
            self._context_data = {}
        self._rerender()

    def _handle_token_stats_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming token-stats channel message."""
        if message is None:
            return
        self._token_stats = message
        self._rerender()

    def _rerender(self) -> None:
        """Re-render with the latest data from both channels."""
        rendered = self.render_panel(self._context_data or {})
        try:
            self._thread_safe_update(rendered)
        except Exception:
            pass

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render combined context usage and token stats."""
        parts: list[Any] = []

        # --- Context Usage Section ---
        ctx = self._context_data
        if ctx:
            parts.append(_render_context(ctx))
            if len(self._sparkline_history) >= 2:
                parts.append(_render_sparkline(self._sparkline_history))
        elif not self._token_stats:
            return Text("No context data", style="dim italic")

        # --- Token Stats Section ---
        if self._token_stats:
            if parts:
                parts.append(Text(""))  # spacer
            parts.append(_render_token_stats(self._token_stats))

        if not parts:
            return Text("No context data", style="dim italic")

        return Group(*parts)


def _render_context(ctx: dict[str, Any]) -> Any:
    """Render context usage section."""
    parts: list[Any] = []

    # Tier badge
    tier = ctx.get("tier")
    if tier and isinstance(tier, str):
        style = _TIER_STYLES.get(tier, "bold")
        tier_text = Text()
        tier_text.append(tier, style=style)
        savings = _tier_savings(tier)
        if savings > 0:
            tier_text.append(f" {savings}% savings", style="dim")
        parts.append(tier_text)

    # Token usage
    tokens = _safe_int(ctx.get("tokens"))
    percent = _safe_int(ctx.get("percent"))
    baseline = _safe_int(ctx.get("baseline"))
    available = _safe_int(ctx.get("available"))

    if tokens is not None:
        usage_text = Text()
        usage_text.append(f"{tokens:,}", style="bold")
        if baseline is not None and available is not None:
            total = baseline + available
            usage_text.append(f" / {total:,}")
        usage_text.append(" tokens")
        if percent is not None:
            usage_text.append(f" ({percent}%)")
        parts.append(usage_text)

    # Context usage progress bar
    if percent is not None:
        parts.append(render_progress_bar(percent, warn_high=True))

    # Breakdown: baseline / conversation / available
    if baseline is not None:
        breakdown = Table(show_header=False, show_edge=False, pad_edge=False, box=None)
        breakdown.add_column("Label", style="dim")
        breakdown.add_column("Value", justify="right")
        breakdown.add_row("System Prompt", _format_tokens(baseline))
        usable = _safe_int(ctx.get("usableTokens"))
        if usable is not None:
            breakdown.add_row("Conversation", _format_tokens(usable))
        if available is not None:
            breakdown.add_row("Available", _format_tokens(available))
        parts.append(breakdown)

    if not parts:
        return Text("No context data", style="dim italic")

    return Group(*parts)


_SPARKLINE_CHARS = "▁▂▃▄▅▆▇█"


def _render_sparkline(history: deque[int]) -> Text:
    """Render a Unicode sparkline from context usage history."""
    text = Text()
    text.append("Context trend: ", style="dim")
    for pct in history:
        level = min(7, max(0, int(pct / 100 * 7.99)))
        if pct < 50:
            style = "green"
        elif pct <= 80:
            style = "yellow"
        else:
            style = "red"
        text.append(_SPARKLINE_CHARS[level], style=style)
    return text


def _render_token_stats(stats: dict[str, Any]) -> Any:
    """Render token stats section."""
    table = Table(show_header=False, show_edge=False, pad_edge=False, box=None)
    table.add_column("Stat", style="dim")
    table.add_column("Value", justify="right")

    rows: list[tuple[str, str]] = []

    input_t = _safe_int(stats.get("inputTokens"))
    if input_t is not None:
        rows.append(("Input", f"{input_t:,}"))

    output_t = _safe_int(stats.get("outputTokens"))
    if output_t is not None:
        rows.append(("Output", f"{output_t:,}"))

    cache_read = _safe_int(stats.get("cacheReadTokens"))
    if cache_read is not None:
        rows.append(("Cache Read", f"{cache_read:,}"))

    cache_write = _safe_int(stats.get("cacheCreationTokens"))
    if cache_write is not None:
        rows.append(("Cache Write", f"{cache_write:,}"))

    cost = _safe_float(stats.get("totalCostUsd"))
    if cost is not None and cost > 0:
        rows.append(("Cost", f"${cost:.4f}"))

    if not rows:
        return Text("No token stats", style="dim italic")

    for label, value in rows:
        table.add_row(label, value)

    return table


def _tier_savings(tier: str) -> int:
    """Calculate token savings percentage for a tier vs FULL."""
    return {"FULL": 0, "REFRESH": 85, "HANDOFF": 82, "MINIMAL": 95}.get(tier, 0)
