"""AuditLogPanel — Real-time tool event audit log for BikeRack TUI.

Story 110-8: Subscribes to /ws/spans, displays tool events in a native
Textual DataTable with timestamp, tool name, input excerpt, and result.

Uses native Textual widgets (DataTable) instead of Rich renderables.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from rich.console import Console
from textual._context import NoActiveAppError
from textual.widgets import DataTable

from pf.bikerack.base_panel import PANEL_ICONS, BasePanel

MAX_INPUT_LENGTH = 80


def _enrich_input(tool_name: str, input_text: str, span: dict[str, Any]) -> str:
    """Enrich blank input fields using raw tool parameters from the span.

    Falls back to parsing ``toolParameters`` / ``tool_parameters`` JSON
    when the server-side input extraction didn't populate the field.
    """
    if input_text:
        return input_text

    # Try raw tool parameters stored in span
    import json
    import os.path

    raw = span.get("toolParameters") or span.get("tool_parameters") or ""
    if not raw:
        return ""

    try:
        params = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return ""

    if not isinstance(params, dict):
        return ""

    tool_lower = tool_name.lower()

    if tool_lower == "read":
        fp = params.get("file_path", "")
        if fp:
            basename = os.path.basename(fp)
            offset = params.get("offset")
            limit = params.get("limit")
            if offset and limit:
                return f"{basename}  L{offset}\u2013{int(offset) + int(limit)}"
            return basename

    if tool_lower == "task":
        return params.get("description", "") or params.get("prompt", "")[:60]

    if tool_lower == "grep":
        pattern = params.get("pattern", "")
        file_filter = params.get("glob") or params.get("type") or ""
        if pattern and file_filter:
            return f'"{pattern}"  {file_filter}'
        return pattern

    if tool_lower == "glob":
        return params.get("pattern", "")

    if tool_lower == "edit":
        fp = params.get("file_path", "")
        return os.path.basename(fp) if fp else ""

    if tool_lower == "write":
        fp = params.get("file_path", "")
        return os.path.basename(fp) if fp else ""

    # Generic: take first string value
    for v in params.values():
        if isinstance(v, str) and v:
            return v[:80]

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


class AuditLogPanel(BasePanel):
    """Audit log panel — real-time tool event display via DataTable.

    Subscribes to the 'spans' WebSocket channel and renders tool events
    in a native Textual DataTable with columns: Time, Tool, Input, Result.
    """

    channel: str = "spans"
    panel_name: str = "Audit Log"
    icon: str = PANEL_ICONS["audit-log"][0]

    def __init__(self, client=None, **kwargs):
        super().__init__(client=client, **kwargs)
        self._table = _OfflineDataTable()
        self._table.add_columns("Time", "Tool", "Input", "Result")

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
        """Add a single tool event row to the DataTable."""
        timestamp = span.get("timestamp")
        tool_name = span.get("toolName", "")
        input_text = _enrich_input(tool_name, span.get("input", ""), span)
        success = span.get("success")
        duration_ms = span.get("durationMs") or span.get("duration_ms")

        time_str = _format_timestamp(timestamp)

        if len(input_text) > MAX_INPUT_LENGTH:
            input_text = input_text[: MAX_INPUT_LENGTH - 1] + "\u2026"

        if success is True:
            result = "\u2713"
        elif success is False:
            result = "\u2717"
        else:
            result = "\u2014"

        # Append duration inline with result
        if duration_ms is not None:
            try:
                ms = float(duration_ms)
                if ms >= 1000:
                    result += f" {ms / 1000:.1f}s"
                else:
                    result += f" {int(ms)}ms"
            except (ValueError, TypeError):
                pass

        self._table.add_row(time_str, tool_name, input_text, result)

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render current DataTable rows as a Rich Table renderable."""
        from rich.table import Table as RichTable
        from rich.text import Text

        if self._table.row_count == 0:
            return Text("No audit events yet", style="dim italic")

        rich_table = RichTable(show_header=True, expand=True, box=None)
        rich_table.add_column("Time", style="dim", no_wrap=True, width=8)
        rich_table.add_column("Tool", no_wrap=True, width=6)
        rich_table.add_column("Input", no_wrap=True, overflow="ellipsis", ratio=1)
        rich_table.add_column("Result", justify="center", no_wrap=True, width=10)

        for row_key in reversed(list(self._table.rows)):
            row_data = self._table.get_row(row_key)
            time_str, tool_name, input_text, result = (str(c) for c in row_data)
            tool_style = _TOOL_COLORS.get(tool_name.lower(), "bold cyan")
            if result.startswith("\u2713"):
                result_style = "green"
            elif result.startswith("\u2717"):
                result_style = "red"
            else:
                result_style = "dim"
            # Flag slow calls (>5s) with yellow
            if "s" in result and result_style == "green":
                try:
                    dur_part = result.split(" ", 1)[1] if " " in result else ""
                    if dur_part.endswith("s") and float(dur_part[:-1]) > 5:
                        result_style = "yellow"
                except (ValueError, IndexError):
                    pass
            rich_table.add_row(
                time_str,
                Text(tool_name, style=f"bold {tool_style}"),
                Text(input_text, style="dim", no_wrap=True, overflow="ellipsis") if input_text else Text(""),
                Text(result, style=result_style),
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
