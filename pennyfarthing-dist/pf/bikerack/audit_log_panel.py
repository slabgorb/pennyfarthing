"""AuditLogPanel — Real-time tool event audit log for BikeRack TUI.

Story 110-8: Subscribes to /ws/spans, displays tool events in a native
Textual DataTable with timestamp, tool name, input excerpt, and result.

Uses native Textual widgets (DataTable) instead of Rich renderables.
Visual rendering uses Tufte-inspired data density: no chartjunk checkmarks,
logarithmic sparkline bars for duration, relative timestamps, and enriched
input summaries for every tool type.
"""

from __future__ import annotations

import json
import math
import os.path
from datetime import UTC, datetime
from time import time
from typing import Any

from rich.console import Console
from textual._context import NoActiveAppError
from textual.widgets import DataTable

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel

MAX_INPUT_LENGTH = 90
MAX_SPANS = 200

# Sparkline bar characters (8 levels of fill)
_BARS = "▏▎▍▌▋▊▉█"


def _shorten_path(fp: str) -> str:
    """Shorten an absolute file path to project-relative form.

    Finds known project structure markers and strips the prefix,
    falling back to the last 3 path components.
    """
    if not fp:
        return ""
    for marker in ("/pennyfarthing-dist/", "/packages/", "/.pennyfarthing/", "/.session/"):
        idx = fp.find(marker)
        if idx >= 0:
            return fp[idx + 1:]
    parts = fp.rstrip("/").split("/")
    return "/".join(parts[-3:]) if len(parts) > 3 else fp


def _enrich_input(tool_name: str, input_text: str, span: dict[str, Any]) -> str:
    """Extract meaningful input summary for any tool type.

    Three enrichment sources, checked in priority order:
    1. ``toolParameters`` JSON — raw tool inputs (available when OTEL includes them)
    2. Span-level enrichment fields — ``filePath``, ``command``, ``promptSummary``
       (set by Cyclist's span correlation from the Claude message stream)
    3. Server-populated ``input`` string — basic fallback
    """
    # Source 1: Parse toolParameters JSON
    raw = span.get("toolParameters") or span.get("tool_parameters") or ""
    params: dict[str, Any] | None = None
    if raw:
        try:
            params = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(params, dict):
                params = None
        except (json.JSONDecodeError, TypeError):
            params = None

    tool_lower = tool_name.lower()

    # --- Per-tool enrichment from toolParameters ---
    if params is not None:
        result = _enrich_from_params(tool_lower, params)
        if result:
            return result

    # --- Source 2: Span-level enrichment fields (from Cyclist correlation) ---
    result = _enrich_from_span_fields(tool_lower, span)
    if result:
        return result

    # --- Source 3: Server input fallback ---
    if input_text:
        # Shorten absolute paths in server-provided input
        if input_text.startswith("/") and "/" in input_text[1:]:
            return _shorten_path(input_text)
        return input_text

    # Last resort: first string value from params
    if params is not None:
        for v in params.values():
            if isinstance(v, str) and v:
                return v[:80]

    return ""


def _enrich_from_params(tool_lower: str, params: dict[str, Any]) -> str:
    """Extract formatted input from parsed toolParameters dict."""
    if tool_lower == "read":
        fp = params.get("file_path", "")
        if fp:
            short = _shorten_path(fp)
            offset = params.get("offset")
            limit = params.get("limit")
            if offset and limit:
                return f"{short}  L{offset}\u2013{int(offset) + int(limit)}"
            return short

    if tool_lower == "bash":
        desc = params.get("description", "")
        if desc:
            return desc
        cmd = params.get("command", "")
        return cmd[:80] if cmd else ""

    if tool_lower == "task":
        desc = params.get("description", "")
        stype = params.get("subagent_type", "")
        if desc and stype:
            return f"{stype}: {desc}"
        return desc or params.get("prompt", "")[:60]

    if tool_lower == "grep":
        pattern = params.get("pattern", "")
        path = params.get("path", "")
        file_filter = params.get("glob") or params.get("type") or ""
        parts: list[str] = []
        if pattern:
            parts.append(f'"{pattern}"')
        if file_filter:
            parts.append(file_filter)
        elif path:
            parts.append(_shorten_path(path))
        return "  ".join(parts)

    if tool_lower == "glob":
        pattern = params.get("pattern", "")
        path = params.get("path", "")
        if pattern and path:
            return f"{pattern}  {_shorten_path(path)}"
        return pattern

    if tool_lower == "edit":
        fp = params.get("file_path", "")
        old = params.get("old_string", "")
        base = _shorten_path(fp) if fp else ""
        if old:
            excerpt = old.strip().split("\n")[0][:30]
            return f"{base}  \u00ab{excerpt}\u00bb" if base else f"\u00ab{excerpt}\u00bb"
        return base

    if tool_lower == "write":
        fp = params.get("file_path", "")
        return _shorten_path(fp) if fp else ""

    if tool_lower == "taskcreate":
        return params.get("subject", "")

    if tool_lower == "taskupdate":
        tid = params.get("taskId", "")
        status = params.get("status", "")
        if tid and status:
            return f"#{tid} \u2192 {status}"
        return f"#{tid}" if tid else ""

    if tool_lower == "tasklist":
        return "list tasks"

    if tool_lower == "taskget":
        return f"#{params.get('taskId', '')}"

    if tool_lower == "sendmessage":
        recipient = params.get("recipient", "")
        content = params.get("content", "")
        msg_type = params.get("type", "")
        if msg_type == "shutdown_request":
            return f"shutdown \u2192 {recipient}"
        if recipient and content:
            return f"\u2192 {recipient}: {content[:40]}"
        return f"\u2192 {recipient}" if recipient else content[:50]

    if tool_lower in ("teamcreate", "teamdelete"):
        return params.get("team_name", "")

    return ""


def _enrich_from_span_fields(tool_lower: str, span: dict[str, Any]) -> str:
    """Extract input from Cyclist's span-level enrichment fields.

    These fields are set by Cyclist's span correlation engine which
    captures tool inputs from the Claude message stream (not OTEL).
    """
    if tool_lower in ("read", "edit", "write"):
        fp = span.get("filePath", "")
        if fp:
            short = _shorten_path(fp)
            lang = span.get("language", "")
            if lang:
                return f"{short}  ({lang})"
            return short

    if tool_lower == "bash":
        cmd = span.get("command", "")
        if cmd:
            return cmd[:80]

    if tool_lower == "task":
        prompt = span.get("promptSummary", "")
        stype = span.get("subagentType", "")
        if prompt and stype:
            return f"{stype}: {prompt}"
        return prompt or ""

    if tool_lower == "grep":
        # Grep tool parameters might be in the input field from correlation
        inp = span.get("input", "")
        if inp and '"' in inp:
            return inp  # Already formatted pattern
        return ""

    return ""


# Tool name → Rich style (matches GUI CSS custom properties)
_TOOL_COLORS: dict[str, str] = {
    "read": "blue",
    "write": "dark_orange",
    "bash": "green",
    "glob": "medium_purple1",
    "grep": "dark_cyan",
    "edit": "yellow",
    "task": "hot_pink",
    "skill": "dim",
    "taskcreate": "hot_pink",
    "taskupdate": "hot_pink",
    "tasklist": "hot_pink",
    "taskget": "hot_pink",
    "teamcreate": "medium_purple1",
    "teamdelete": "medium_purple1",
    "sendmessage": "dark_cyan",
}

# Shared fallback console for offline column/cell measurement
_FALLBACK_CONSOLE = Console()


class _OfflineDataTable(DataTable):
    """DataTable subclass that works without an active Textual app.

    Textual's DataTable.add_columns/add_row need self.app.console for
    column width measurement. This subclass provides a fallback Rich Console
    so the table can be constructed and populated in unit tests.
    """

    @property
    def app(self):
        try:
            return super().app
        except NoActiveAppError:
            return type("_Stub", (), {"console": _FALLBACK_CONSOLE})()


def _format_relative_time(ts: Any) -> str:
    """Format timestamp as relative time (e.g., '3m ago', '42s ago').

    Falls back to absolute HH:MM:SS for entries older than 1 hour.
    """
    if ts is None:
        return "\u2014"
    try:
        epoch_s = float(ts) / 1000
        delta = time() - epoch_s
        if delta < 0:
            delta = 0
        if delta < 10:
            return "just now"
        if delta < 60:
            return f"{int(delta)}s ago"
        if delta < 3600:
            return f"{int(delta / 60)}m ago"
        dt = datetime.fromtimestamp(epoch_s, tz=UTC)
        return dt.strftime("%H:%M:%S")
    except (ValueError, TypeError, OSError):
        return "\u2014"


def _format_duration(ms: float | None) -> str:
    """Format duration in milliseconds to compact string."""
    if ms is None:
        return ""
    try:
        ms = float(ms)
        if ms < 1:
            return "<1ms"
        if ms >= 1000:
            return f"{ms / 1000:.1f}s"
        return f"{int(ms)}ms"
    except (ValueError, TypeError):
        return ""


def _sparkline(ms: float | None, max_ms: float) -> str:
    """Generate a sparkline bar scaled logarithmically to max duration."""
    if ms is None or max_ms <= 0:
        return " "
    try:
        ms_f = float(ms)
        if ms_f <= 0:
            return " "
        log_val = math.log10(max(1, ms_f))
        log_max = math.log10(max(1, max_ms))
        ratio = log_val / log_max if log_max > 0 else 0
        idx = min(int(ratio * (len(_BARS) - 1)), len(_BARS) - 1)
        return _BARS[idx]
    except (ValueError, TypeError):
        return " "


class AuditLogPanel(BasePanel):
    """Audit log panel — real-time tool event display via DataTable.

    Subscribes to the 'spans' WebSocket channel and renders tool events
    in a native Textual DataTable with columns: Time, Tool, Input, Status.
    Visual rendering applies Tufte-inspired density: duration sparklines,
    relative timestamps, and no-chartjunk status display.
    """

    channel: str = "spans"
    panel_name: str = "Audit Log"
    icon: str = PANEL_ICONS["audit-log"][0]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._table = _OfflineDataTable()
        self._table.add_columns("Time", "Tool", "Input", "Status")
        self._spans: list[dict[str, Any]] = []

    def handle_message(self, message: dict[str, Any] | None) -> None:
        """Handle incoming WebSocket messages for tool events.

        Mutates the internal DataTable then delegates to
        super().handle_message() which calls render_panel() →
        post_message(DataReceived) for thread-safe Textual repaint.
        """
        if not self._mounted or message is None:
            return
        if not isinstance(message, dict):
            return

        msg_type = message.get("type")

        if msg_type == "init":
            spans = message.get("spans")
            if not isinstance(spans, list):
                return
            self._table.clear()
            self._spans.clear()
            for span in spans:
                if isinstance(span, dict):
                    self._add_row(span)

        elif msg_type == "span":
            span = message.get("span")
            if isinstance(span, dict):
                self._add_row(span)
        else:
            return

        # Trigger repaint through BasePanel's message system
        super().handle_message(message)

    def _add_row(self, span: dict[str, Any]) -> None:
        """Add a single tool event row to the DataTable and span store."""
        tool_name = span.get("toolName", "")
        input_text = _enrich_input(tool_name, span.get("input", ""), span)
        success = span.get("success")

        time_str = _format_timestamp(span.get("timestamp"))

        if len(input_text) > MAX_INPUT_LENGTH:
            input_text = input_text[: MAX_INPUT_LENGTH - 1] + "\u2026"

        # Status for DataTable storage (tests check for these indicators)
        if success is True:
            status = "True"
        elif success is False:
            status = "\u2717"
        else:
            status = "\u2014"

        self._table.add_row(time_str, tool_name, input_text, status)
        self._spans.append(span)

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render tool events as a Tufte-style Rich Table.

        Layout: Time | Dur | ▇ | Tool | Input
        - Time: relative (``3m ago``, ``just now``)
        - Dur: right-aligned duration text; errors show ``✗`` prefix
        - ▇: logarithmic sparkline bar scaled to max visible duration
        - Tool: full name (11 chars, no truncation)
        - Input: enriched per-tool summary
        """
        from rich.table import Table as RichTable
        from rich.text import Text

        if not self._spans:
            return Text("No audit events yet", style="dim italic")

        # Compute max duration for sparkline scaling
        max_dur = 0.0
        for s in self._spans:
            d = s.get("durationMs") or s.get("duration_ms")
            if d is not None:
                try:
                    max_dur = max(max_dur, float(d))
                except (ValueError, TypeError):
                    pass

        rich_table = RichTable(show_header=True, expand=True, box=None, pad_edge=False)
        rich_table.add_column("Time", style="dim", no_wrap=True, width=8)
        rich_table.add_column("Dur", no_wrap=True, justify="right", width=7)
        rich_table.add_column("\u2587", no_wrap=True, width=2)
        rich_table.add_column("Tool", no_wrap=True, width=11)
        rich_table.add_column("Input", no_wrap=True, overflow="ellipsis", ratio=1)

        for span in reversed(self._spans):
            tool_name = span.get("toolName", "")
            input_text = _enrich_input(tool_name, span.get("input", ""), span)
            success = span.get("success")
            duration_ms = span.get("durationMs") or span.get("duration_ms")

            if len(input_text) > MAX_INPUT_LENGTH:
                input_text = input_text[: MAX_INPUT_LENGTH - 1] + "\u2026"

            # Relative time
            time_str = _format_relative_time(span.get("timestamp"))

            # Duration + status (Tufte: no ✓ for success, only ✗ for errors)
            dur_str = _format_duration(duration_ms)
            if success is False:
                dur_text = Text(f"\u2717 {dur_str}" if dur_str else "\u2717", style="red")
            else:
                if dur_str:
                    try:
                        ms_val = float(duration_ms)
                        dur_style = "yellow" if ms_val > 5000 else "dim"
                    except (ValueError, TypeError):
                        dur_style = "dim"
                    dur_text = Text(dur_str, style=dur_style)
                else:
                    dur_text = Text("<1ms", style="dim")

            # Sparkline bar
            try:
                bar_char = _sparkline(
                    float(duration_ms) if duration_ms is not None else None,
                    max_dur,
                )
            except (ValueError, TypeError):
                bar_char = " "
            bar_style = "red" if success is False else "blue"
            bar_text = Text(bar_char, style=bar_style)

            # Tool name with color
            tool_style = _TOOL_COLORS.get(tool_name.lower(), "bold cyan")

            rich_table.add_row(
                time_str,
                dur_text,
                bar_text,
                Text(tool_name, style=f"bold {tool_style}"),
                Text(input_text, style="dim", no_wrap=True, overflow="ellipsis")
                if input_text
                else Text(""),
            )

        return rich_table


def _format_timestamp(ts: Any) -> str:
    """Format millisecond timestamp to HH:MM:SS."""
    if ts is None:
        return "\u2014"
    try:
        dt = datetime.fromtimestamp(float(ts) / 1000, tz=UTC)
        return dt.strftime("%H:%M:%S")
    except (ValueError, TypeError, OSError):
        return "\u2014"
