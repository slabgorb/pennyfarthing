"""StatusFooter — Unified status bar for BikeRack TUI.

Consolidates project name, model indicator, and context usage into a
single footer line.  Progress bar is right-aligned.

Story 121-3: Replaces BindingFooter + ContextMeterFooter + #project-dir.

Subscribes to:
  /ws/context — context window usage percentage and tier
  /ws/stats   — current model name
"""

from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any

from rich.text import Text
from textual.message import Message
from textual.widgets import Static

from pf.bikerack.base_panel import render_progress_bar
from pf.bikerack.colors import warn_style


def _get_story_id(project_root: str) -> str:
    """Find active story ID from session files."""
    session_dir = Path(project_root) / ".session"
    if not session_dir.is_dir():
        return ""
    sessions = list(session_dir.glob("*-session.md"))
    if not sessions:
        return ""
    name = sessions[0].stem  # e.g. "120-12-session"
    return name.replace("-session", "")


def _clean_model_name(model_raw: str) -> str:
    """Clean model name: strip 'claude-' prefix and trailing date stamp."""
    model = re.sub(r"^claude-", "", model_raw)
    model = re.sub(r"-\d+$", "", model)
    return model[:12]


class StatusFooter(Static):
    """Single-line status bar: project │ model │ right-aligned context bar.

    Replaces the old BindingFooter, ContextMeterFooter, and #project-dir
    widgets with one consolidated footer.
    """

    class MeterUpdate(Message, bubble=False):
        """Trigger a repaint from Textual message context."""

        def __init__(self, content: Any) -> None:
            super().__init__()
            self.content = content

    #: WebSocket channel (kept for backward compat with tests)
    channel: str = "context"

    #: Seconds between periodic refresh redraws
    refresh_interval: float = 5.0

    #: Minimum seconds between redraws (throttle)
    min_redraw_interval: float = 0.25

    def __init__(
        self,
        project_dir: str = "",
        client: Any = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._project_dir = project_dir
        self._client = client
        self._context_data: dict[str, Any] | None = None
        self._model: str = ""
        self._mounted = False
        self._refresh_timer: Any = None
        self._last_redraw_time: float = 0.0
        self.last_update_time: float = 0.0
        self._pwd: str = ""
        self._project_root = (
            os.environ.get("WHEELHUB_PROJECT_DIR")
            or os.environ.get("CLAUDE_PROJECT_DIR")
            or os.getcwd()
        )
        self._story_id = _get_story_id(self._project_root)
        # Story 136-5: Loading timeout (seconds) before showing error
        self._loading_timeout: int = 10

    # -- Convenience properties kept for backward compat with tests ----------

    @property
    def is_stale(self) -> bool:
        """True if no context data has been received."""
        return self._context_data is None

    # -- Lifecycle -----------------------------------------------------------

    def on_mount(self) -> None:
        """Subscribe to context + stats channels; start periodic refresh."""
        self._mounted = True
        if self._client is not None:
            self._client.subscribe("context", self._handle_context_message)
            self._client.subscribe("stats", self._handle_stats_message)
            self._client.on_state_change(self._on_connection_state_change)
        try:
            self._refresh_timer = self.set_interval(
                self.refresh_interval, self.request_refresh
            )
        except RuntimeError:
            pass

    def on_unmount(self) -> None:
        self._mounted = False
        if self._refresh_timer is not None:
            self._refresh_timer.stop()

    # -- Message handlers (Textual thread) -----------------------------------

    def on_status_footer_meter_update(self, event: MeterUpdate) -> None:
        self.update(event.content)

    def request_refresh(self) -> None:
        """Redraw from cached data. Safe to call at any time."""
        if not self._mounted:
            return
        try:
            rendered = self._render_status()
            self.post_message(self.MeterUpdate(rendered))
        except Exception:
            pass

    def _on_connection_state_change(self, _state: Any) -> None:
        self.request_refresh()

    # -- Backward compat aliases ---------------------------------------------

    def render_meter(self, ctx: dict[str, Any]) -> Text:
        """Compat: render context bar from raw context data."""
        self._context_data = ctx
        return self._render_context_bar()

    def handle_context_message(self, msg: dict[str, Any] | None) -> None:
        """Compat: public alias for the context WS handler."""
        self._handle_context_message(msg)

    def on_connection_state_change(self, state: Any) -> None:
        """Compat: public alias for connection state handler."""
        self._on_connection_state_change(state)

    # -- WS handlers (called from WS reader thread) -------------------------

    def _handle_context_message(self, msg: dict[str, Any] | None) -> None:
        if not self._mounted or msg is None:
            return
        ctx = msg.get("context")
        if ctx is None:
            return
        # If WheelHub sent an error, try local Python fallback
        if isinstance(ctx, dict) and ctx.get("error"):
            local = self._local_context_fallback()
            if local:
                ctx = local
        self._context_data = ctx
        self.last_update_time = time.monotonic()
        self._throttled_redraw()

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

    def _handle_stats_message(self, msg: dict[str, Any] | None) -> None:
        if not self._mounted or msg is None:
            return
        model_raw = msg.get("model", "")
        if model_raw and model_raw != "—":
            self._model = _clean_model_name(str(model_raw))
        pwd_raw = msg.get("pwd", "")
        if pwd_raw:
            self._pwd = pwd_raw
        self._throttled_redraw()

    def _throttled_redraw(self) -> None:
        now = time.monotonic()
        if now - self._last_redraw_time < self.min_redraw_interval:
            return
        self._last_redraw_time = now
        try:
            rendered = self._render_status()
            self.post_message(self.MeterUpdate(rendered))
        except Exception:
            pass

    # -- Rendering -----------------------------------------------------------

    def _render_status(self) -> Text:
        """Build the full-width status line."""
        width = self.size.width if self.size else 80

        # Refresh story ID on each render (session may start/end)
        new_story_id = _get_story_id(self._project_root)
        if new_story_id:
            self._story_id = new_story_id

        # Resolve relative cwd from pwd
        rel_cwd = ""
        if self._pwd and self._project_root:
            try:
                rel = Path(self._pwd).relative_to(self._project_root)
                rel_str = str(rel)
                if rel_str != ".":
                    rel_cwd = rel_str[:20]
            except ValueError:
                pass

        # Left section: project + story + cwd + model
        left = Text()
        left.append(f" {self._project_dir}", style="bold cyan")

        if self._story_id:
            left.append("  ", style="dim")
            left.append(self._story_id, style="bold yellow")

        if rel_cwd:
            left.append("  ", style="dim")
            left.append(rel_cwd, style="cyan")

        if self._model:
            left.append("  ", style="dim")
            left.append(self._model, style="dim")

        # Right section: context bar
        right = self._render_context_bar()

        # Pad to push right section flush-right
        left_len = len(left.plain)
        right_len = len(right.plain)
        padding = max(1, width - left_len - right_len)

        result = Text()
        result.append_text(left)
        result.append(" " * padding)
        result.append_text(right)
        return result

    def _render_context_bar(self) -> Text:
        """Compact context bar for the right side of the footer."""
        if self._context_data is None:
            bar = Text()
            bar.append("ctx ", style="dim")
            bar.append("░" * 10, style="dim")
            bar.append(" --%", style="dim")
            return bar

        # Story 136-5: Check for error in context data
        error = self._context_data.get("error")
        if error and isinstance(error, str):
            bar = Text()
            bar.append("ctx ", style="dim")
            bar.append("[err] ", style="bold red")
            bar.append(error[:30], style="red")
            return bar

        percent = self._context_data.get("percent") or 0
        tier = self._context_data.get("tier") or ""

        bar = Text()
        bar.append("ctx ", style="dim")
        bar.append_text(render_progress_bar(percent, width=10, warn_high=True))

        if tier:
            bar.append(f" {tier}", style=f"bold {warn_style(percent)}")

        return bar


# Backward compat alias for existing tests
ContextMeterFooter = StatusFooter
