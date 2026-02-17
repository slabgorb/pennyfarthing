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

from pennyfarthing_scripts.bikerack.base_panel import PANEL_ICONS, BasePanel

MAX_INPUT_LENGTH = 80

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

        Overrides BasePanel.handle_message to manipulate DataTable directly
        instead of going through render_panel/post_message.
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
        """Not used — handle_message manages DataTable directly."""
        return self._table


def _format_timestamp(ts: Any) -> str:
    """Format millisecond timestamp to HH:MM:SS."""
    if ts is None:
        return "\u2014"
    try:
        dt = datetime.fromtimestamp(float(ts) / 1000, tz=UTC)
        return dt.strftime("%H:%M:%S")
    except (ValueError, TypeError, OSError):
        return "\u2014"
