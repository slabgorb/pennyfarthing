"""DebugPanel — Context usage and token stats for BikeRack TUI.

Story 103-17: Port of the React DebugPanel. Subscribes to /ws/context
and /ws/token-stats, renders context usage (tokens, percent, tier) and
token consumption stats (input, output, cache, cost).

Story 121-2: Interactive code quality tool triggers (hotspots, dead code,
health score) with keybinding-driven view switching.
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
        # Story 121-2: View state for code quality tool triggers
        self.current_view: str = "normal"
        self.last_results: Any = None
        self._loading_message: str = ""
        self._error_message: str = ""
        # Story 136-5: Loading timeout (seconds) before showing error
        self._loading_timeout: int = 10

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
            # If WheelHub sent an error, try local Python fallback
            if ctx.get("error"):
                ctx = self._local_context_fallback() or ctx
            self._context_data = ctx
            pct = _safe_int(ctx.get("percent"))
            if pct is not None:
                self._sparkline_history.append(pct)
        else:
            self._context_data = {}
        self._rerender()

    def _local_context_fallback(self) -> dict[str, Any] | None:
        """Call context_window.check_context() directly as fallback."""
        try:
            from pf.context_window import check_context
            result = check_context()
            if result.error:
                return None
            return {
                "percent": result.percent,
                "tokens": result.tokens,
                "status": result.status,
                "baseline": result.baseline,
                "usableTokens": result.usable_tokens,
                "usablePercent": result.usable_percent,
                "available": result.available,
                "tier": (
                    "MINIMAL" if result.usable_percent >= 85
                    else "HANDOFF" if result.usable_percent >= 65
                    else "REFRESH" if result.usable_percent >= 50
                    else "FULL"
                ),
                "error": None,
            }
        except Exception:
            return None

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

    # -- Story 121-2: View state management ----------------------------------

    def show_loading(self, message: str) -> None:
        """Display loading state while analysis runs."""
        self.loading = True
        self._loading_message = message
        self._rerender()

    def show_normal_view(self) -> None:
        """Return to normal token/context display."""
        self.current_view = "normal"
        self.loading = False
        self._loading_message = ""
        self._error_message = ""
        self._rerender()

    def show_error(self, message: str) -> None:
        """Display an error message with retry option."""
        self.loading = False
        self._error_message = message
        self.current_view = "error"
        self._rerender()

    def display_hotspots_results(self, result: Any) -> None:
        """Show hotspots analysis results as a table."""
        self.current_view = "hotspots"
        self.last_results = result
        self.loading = False
        self._rerender()

    def display_dead_code_results(self, stale_result: Any, exports_result: Any = None) -> None:
        """Show dead code analysis results (stale files + unused exports)."""
        self.current_view = "deadcode"
        self.last_results = (stale_result, exports_result)
        self.loading = False
        self._rerender()

    def display_health_score_results(self, result: Any) -> None:
        """Show health score analysis results with dimension breakdown."""
        self.current_view = "healthscore"
        self.last_results = result
        self.loading = False
        self._rerender()

    async def run_hotspots_analysis(self) -> None:
        """Trigger hotspots analysis in a background worker."""
        from pathlib import Path

        from pf.hotspots.analyze import analyze_all_repos

        self.show_loading("Analyzing hotspots...")
        try:
            project_root = Path.cwd()
            result = await analyze_all_repos(project_root)
            self.display_hotspots_results(result)
        except Exception as e:
            self.show_error(f"Hotspots failed: {e}")

    async def run_dead_code_analysis(self) -> None:
        """Trigger dead code analysis in a background worker."""
        from pathlib import Path

        from pf.deadcode.analyze import analyze_repo, find_unused_exports

        self.show_loading("Analyzing dead code...")
        try:
            project_root = Path.cwd()
            stale_result = await analyze_repo("project", project_root)
            exports_result = await find_unused_exports(project_root)
            self.display_dead_code_results(stale_result, exports_result)
        except Exception as e:
            self.show_error(f"Dead code failed: {e}")

    async def run_health_score_analysis(self) -> None:
        """Trigger health score analysis in a background worker."""
        from pathlib import Path

        from pf.healthscore.analyze import analyze_healthscore

        self.show_loading("Analyzing health score...")
        try:
            project_root = Path.cwd()
            result = await analyze_healthscore(project_root)
            self.display_health_score_results(result)
        except Exception as e:
            self.show_error(f"Health score failed: {e}")

    # -- Render dispatch -------------------------------------------------------

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render panel content based on current view state."""
        if self.loading:
            return Text(self._loading_message or "Analyzing...", style="bold yellow")

        if self.current_view == "error":
            return _render_error(self._error_message)

        if self.current_view == "hotspots":
            return _render_hotspots(self.last_results)

        if self.current_view == "deadcode":
            stale, exports = self.last_results if self.last_results else (None, None)
            return _render_dead_code(stale, exports)

        if self.current_view == "healthscore":
            return _render_health_score(self.last_results)

        # Default: normal context/token view
        return self._render_normal(payload)


    def _render_normal(self, payload: dict[str, Any]) -> Any:
        """Render the normal context usage and token stats view."""
        parts: list[Any] = []

        ctx = self._context_data
        if ctx:
            # Story 136-5: Check for error in context channel data
            error = ctx.get("error")
            if error and isinstance(error, str):
                error_text = Text()
                error_text.append(f"Context error: {error}", style="bold red")
                parts.append(error_text)
            else:
                parts.append(_render_context(ctx))
                if len(self._sparkline_history) >= 2:
                    parts.append(_render_sparkline(self._sparkline_history))
        elif not self._token_stats:
            return Text("No context data", style="dim italic")

        if self._token_stats:
            if parts:
                parts.append(Text(""))
            parts.append(_render_token_stats(self._token_stats))

        if not parts:
            return Text("No context data", style="dim italic")

        return Group(*parts)


def _render_error(message: str) -> Any:
    """Render an error message with retry hint."""
    parts: list[Any] = []
    parts.append(Text(f"Error: {message}", style="bold red"))
    parts.append(Text("Press escape to return", style="dim"))
    return Group(*parts)


def _render_hotspots(result: Any) -> Any:
    """Render hotspots analysis results as a Rich Table."""
    if result is None:
        return Text("No hotspots data", style="dim italic")

    table = Table(title="Hotspots Analysis", show_edge=False, pad_edge=False)
    table.add_column("File", style="cyan")
    table.add_column("Churn", justify="right")
    table.add_column("Changes", justify="right")
    table.add_column("Score", justify="right")

    all_hotspots = []
    for repo_result in result.repo_results:
        for h in repo_result.file_hotspots:
            all_hotspots.append(h)

    all_hotspots.sort(key=lambda h: h.churn, reverse=True)

    for h in all_hotspots:
        table.add_row(h.path, str(h.churn), str(h.change_count), f"{h.hotspot_score:.1f}")

    return table


def _render_dead_code(stale_result: Any, exports_result: Any) -> Any:
    """Render dead code analysis with stale files and unused exports sections."""
    parts: list[Any] = []

    if stale_result and stale_result.stale_files:
        stale_table = Table(title="Stale Files", show_edge=False, pad_edge=False)
        stale_table.add_column("File", style="cyan")
        stale_table.add_column("Days Stale", justify="right")
        for f in stale_result.stale_files:
            stale_table.add_row(f.path, str(f.days_since_last_commit))
        parts.append(stale_table)

    if exports_result and exports_result.unused_exports:
        if parts:
            parts.append(Text(""))
        exports_table = Table(title="Unused Exports", show_edge=False, pad_edge=False)
        exports_table.add_column("Symbol", style="cyan")
        exports_table.add_column("File")
        exports_table.add_column("Line", justify="right")
        for e in exports_result.unused_exports:
            exports_table.add_row(e.symbol, e.file, str(e.line))
        parts.append(exports_table)

    if not parts:
        return Text("No dead code found", style="dim italic")

    return Group(*parts)


def _render_health_score(result: Any) -> Any:
    """Render health score with composite score and per-dimension breakdown."""
    if result is None:
        return Text("No health score data", style="dim italic")

    parts: list[Any] = []

    composite = Text()
    composite.append("Health Score: ", style="bold")
    composite.append(f"{result.composite_score:.1f}", style="bold green")
    parts.append(composite)

    if result.dimensions:
        dim_table = Table(title="Dimensions", show_edge=False, pad_edge=False)
        dim_table.add_column("Dimension", style="cyan")
        dim_table.add_column("Score", justify="right")
        dim_table.add_column("Weight", justify="right", style="dim")
        for d in result.dimensions:
            score_str = f"{d.score:.0f}" if d.score is not None else "—"
            dim_table.add_row(d.name, score_str, f"{d.weight:.0%}")
        parts.append(dim_table)

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
        if pct <= 70:
            style = "green"
        elif pct <= 85:
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
