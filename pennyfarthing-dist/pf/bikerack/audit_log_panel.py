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
        input_text = span.get("input", "")
        success = span.get("success")

        time_str = _format_timestamp(timestamp)

        if len(input_text) > MAX_INPUT_LENGTH:
            input_text = input_text[: MAX_INPUT_LENGTH - 1] + "\u2026"

        if success is True:
            result = "\u2713"
        elif success is False:
            result = "\u2717"
        else:
            result = "\u2014"

        self._table.add_row(time_str, tool_name, input_text, result)

    def render_panel(self, payload: dict[str, Any]) -> Any:
        """Render current DataTable rows as a Rich Table renderable."""
        from rich.table import Table as RichTable
        from rich.text import Text

        if self._table.row_count == 0:
            return Text("No audit events yet", style="dim italic")

        rich_table = RichTable(show_header=True, expand=True, box=None)
        rich_table.add_column("Time", style="dim", no_wrap=True)
        rich_table.add_column("Tool", no_wrap=True)
        rich_table.add_column("Input")
        rich_table.add_column("Result", justify="center", no_wrap=True)

        for row_key in reversed(list(self._table.rows)):
            row_data = self._table.get_row(row_key)
            time_str, tool_name, input_text, result = (str(c) for c in row_data)
            tool_style = _TOOL_COLORS.get(tool_name.lower(), "bold cyan")
            result_style = "green" if result == "\u2713" else "red" if result == "\u2717" else "dim"
            rich_table.add_row(
                time_str,
                Text(tool_name, style=f"bold {tool_style}"),
                Text(input_text, style="dim") if input_text else Text(""),
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
