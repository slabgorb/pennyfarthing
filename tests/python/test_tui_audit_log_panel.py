"""Tests for Frame TUI TUI AuditLogPanel — Real-time tool event audit log (Story 110-8).

Uses native Textual DataTable widget (not Rich Table renderables).

Verifies:
  AC1: Audit log panel renders tool events with timestamp, tool name, and result
  AC2: Events stream in real-time via WebSocket from /ws/spans channel
  AC3: Panel accessible via keybinding (consistent with other panels)
  AC4: Scrollable history with newest events at bottom

Run with: python -m pytest tests/python/test_tui_audit_log_panel.py -v
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

from pf.tui.audit_log_panel import AuditLogPanel
from pf.tui.base_panel import PANEL_ICONS, BasePanel
from pf.tui.client import FrameClient
from textual.widgets import DataTable, Static

# ---------------------------------------------------------------------------
# Test data fixtures — matching Frame /ws/spans wire format
# ---------------------------------------------------------------------------

SAMPLE_TOOL_EVENT: dict[str, Any] = {
    "toolName": "Edit",
    "input": "file_path: src/server.ts, old_string: ..., new_string: ...",
    "success": True,
    "workingDirectory": "/Users/dev/project",
    "timestamp": 1739500000000,
}

SAMPLE_FAILED_EVENT: dict[str, Any] = {
    "toolName": "Bash",
    "input": "npm test -- --run",
    "success": False,
    "workingDirectory": "/Users/dev/project",
    "timestamp": 1739500060000,
}

SAMPLE_READ_EVENT: dict[str, Any] = {
    "toolName": "Read",
    "input": "file_path: /Users/dev/project/README.md",
    "success": True,
    "timestamp": 1739500120000,
}

SAMPLE_GLOB_EVENT: dict[str, Any] = {
    "toolName": "Glob",
    "input": "pattern: **/*.ts",
    "success": True,
    "timestamp": 1739500180000,
}

SAMPLE_INIT_MESSAGE: dict[str, Any] = {
    "type": "init",
    "spans": [SAMPLE_TOOL_EVENT, SAMPLE_FAILED_EVENT, SAMPLE_READ_EVENT],
}

SAMPLE_SPAN_MESSAGE: dict[str, Any] = {
    "type": "span",
    "span": SAMPLE_GLOB_EVENT,
}

SAMPLE_EMPTY_INIT: dict[str, Any] = {
    "type": "init",
    "spans": [],
}


# ---------------------------------------------------------------------------
# AC1: Audit log panel renders tool events with timestamp, tool name, result
# ---------------------------------------------------------------------------


class TestAuditLogPanelExists:
    """AC1: AuditLogPanel implementation exists and follows panel conventions."""

    def test_audit_log_panel_exists_and_importable(self):
        """AuditLogPanel should be importable from tui.audit_log_panel."""
        assert AuditLogPanel is not None

    def test_inherits_from_base_panel(self):
        """AuditLogPanel should inherit from BasePanel for WebSocket plumbing."""
        assert issubclass(AuditLogPanel, BasePanel)

    def test_is_textual_widget(self):
        """AuditLogPanel should be a Textual widget."""
        assert issubclass(AuditLogPanel, Static)

    def test_channel_is_spans(self):
        """AuditLogPanel.channel should be 'spans' (tool events via /ws/spans)."""
        assert AuditLogPanel.channel == "spans"

    def test_panel_name_is_audit_log(self):
        """AuditLogPanel.panel_name should be 'Audit Log'."""
        assert AuditLogPanel.panel_name == "Audit Log"

    def test_has_icon_from_registry(self):
        """AuditLogPanel.icon should match the PANEL_ICONS registry."""
        assert AuditLogPanel.icon == PANEL_ICONS["audit-log"][0]


class TestAuditLogPanelDataTable:
    """AC1: Panel uses native Textual DataTable widget for rendering."""

    def test_has_data_table_attribute(self):
        """AuditLogPanel should have a DataTable instance for rendering events."""
        panel = AuditLogPanel(client=MagicMock())
        # Panel should expose a DataTable, either as attribute or composable child
        assert hasattr(panel, "_table") or hasattr(panel, "table"), (
            "AuditLogPanel should have a _table or table attribute (DataTable)"
        )

    def test_data_table_is_textual_datatable(self):
        """The table attribute should be a Textual DataTable instance."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert isinstance(table, DataTable), (
            f"Expected DataTable, got {type(table).__name__}"
        )

    def test_data_table_has_timestamp_column(self):
        """DataTable should have a 'Time' or 'Timestamp' column."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        col_labels = [str(col.label) for col in table.columns.values()]
        has_time = any("time" in label.lower() or "stamp" in label.lower() for label in col_labels)
        assert has_time, (
            f"DataTable should have a Time/Timestamp column. Got: {col_labels}"
        )

    def test_data_table_has_tool_column(self):
        """DataTable should have a 'Tool' column."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        col_labels = [str(col.label) for col in table.columns.values()]
        has_tool = any("tool" in label.lower() for label in col_labels)
        assert has_tool, (
            f"DataTable should have a Tool column. Got: {col_labels}"
        )

    def test_data_table_has_input_column(self):
        """DataTable should have an 'Input' column for input excerpts."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        col_labels = [str(col.label) for col in table.columns.values()]
        has_input = any("input" in label.lower() for label in col_labels)
        assert has_input, (
            f"DataTable should have an Input column. Got: {col_labels}"
        )

    def test_data_table_has_result_column(self):
        """DataTable should have a 'Result' or 'Status' column."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        col_labels = [str(col.label) for col in table.columns.values()]
        has_result = any(
            word in label.lower()
            for label in col_labels
            for word in ["result", "status"]
        )
        assert has_result, (
            f"DataTable should have a Result/Status column. Got: {col_labels}"
        )


class TestAuditLogPanelRendering:
    """AC1: Tool events render as rows in the DataTable."""

    def test_render_init_populates_rows(self):
        """Init message with spans should populate DataTable rows."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 3, (
            f"Expected 3 rows for 3 spans, got {table.row_count}"
        )

    def test_tool_name_appears_in_row(self):
        """Tool name from event should appear in the DataTable."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        # Get all cell values as strings
        all_text = _get_all_table_text(table)
        assert "Edit" in all_text, f"Tool name 'Edit' not found in table. Content: {all_text}"

    def test_input_excerpt_appears_in_row(self):
        """Input excerpt from event should appear in the DataTable."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        # Input should be truncated but contain recognizable content
        assert "server.ts" in all_text or "file_path" in all_text, (
            f"Input excerpt not found in table. Content: {all_text}"
        )

    def test_success_indicator_for_successful_event(self):
        """Successful events should show a success indicator (✓ or similar)."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        # Send single successful event
        panel.handle_message({"type": "init", "spans": [SAMPLE_TOOL_EVENT]})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        has_success = any(
            indicator in all_text
            for indicator in ["✓", "✔", "pass", "ok", "success", "✅", "True"]
        )
        assert has_success, (
            f"Successful event should have success indicator. Content: {all_text}"
        )

    def test_failure_indicator_for_failed_event(self):
        """Failed events should show a failure indicator (✗ or similar)."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "init", "spans": [SAMPLE_FAILED_EVENT]})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        has_failure = any(
            indicator in all_text
            for indicator in ["✗", "✘", "fail", "error", "❌", "False"]
        )
        assert has_failure, (
            f"Failed event should have failure indicator. Content: {all_text}"
        )

    def test_timestamp_appears_in_row(self):
        """Timestamp should appear in the DataTable (formatted, not raw ms)."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "init", "spans": [SAMPLE_TOOL_EVENT]})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        # Should contain formatted time (HH:MM:SS or similar), not raw ms
        assert "1739500000000" not in all_text, (
            "Timestamp should be formatted, not raw milliseconds"
        )
        # Should have some time-like content
        assert len(all_text) > 0, "Table should have content"


# ---------------------------------------------------------------------------
# AC2: Events stream in real-time via WebSocket from /ws/spans channel
# ---------------------------------------------------------------------------


class TestAuditLogPanelSubscription:
    """AC2: AuditLogPanel subscribes to /ws/spans channel for real-time events."""

    def test_subscribes_to_spans_channel_on_mount(self):
        """AuditLogPanel should subscribe to 'spans' channel on mount."""
        client = MagicMock(spec=FrameClient)
        panel = AuditLogPanel(client=client)
        panel.on_mount()
        client.subscribe.assert_called_once_with("spans", panel.handle_message)

    def test_accepts_client_parameter(self):
        """AuditLogPanel constructor should accept a client parameter."""
        client = MagicMock(spec=FrameClient)
        panel = AuditLogPanel(client=client)
        assert panel._client is client


class TestAuditLogPanelRealTimeUpdates:
    """AC2: Panel updates in real-time when new tool events arrive."""

    def test_span_message_adds_row(self):
        """A 'span' type message should add a new row to the DataTable."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        # Start with empty init
        panel.handle_message(SAMPLE_EMPTY_INIT)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0, "Should start empty"

        # Send a span update
        panel.handle_message(SAMPLE_SPAN_MESSAGE)
        assert table.row_count == 1, (
            f"Span message should add a row. Got {table.row_count}"
        )

    def test_consecutive_spans_accumulate(self):
        """Multiple span messages should accumulate rows."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_EMPTY_INIT)

        panel.handle_message({"type": "span", "span": SAMPLE_TOOL_EVENT})
        panel.handle_message({"type": "span", "span": SAMPLE_FAILED_EVENT})
        panel.handle_message({"type": "span", "span": SAMPLE_READ_EVENT})

        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 3, (
            f"Expected 3 accumulated rows, got {table.row_count}"
        )

    def test_init_replaces_existing_rows(self):
        """An 'init' message should replace all existing rows."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()

        # First init with 3 spans
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 3

        # New init with empty — should clear
        panel.handle_message(SAMPLE_EMPTY_INIT)
        assert table.row_count == 0, (
            f"Init should replace rows, expected 0 after empty init, got {table.row_count}"
        )

    def test_span_after_init_appends(self):
        """A span message after init should append to existing rows."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)  # 3 rows
        panel.handle_message(SAMPLE_SPAN_MESSAGE)  # +1 row

        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 4, (
            f"Expected 4 rows (3 init + 1 span), got {table.row_count}"
        )

    def test_new_span_tool_name_visible(self):
        """Newly added span's tool name should appear in the table."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_EMPTY_INIT)
        panel.handle_message(SAMPLE_SPAN_MESSAGE)

        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        assert "Glob" in all_text, (
            f"Newly added span tool name 'Glob' not found. Content: {all_text}"
        )

    def test_handle_none_message(self):
        """None message should not crash or add rows."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(None)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0

    def test_unmount_stops_updates(self):
        """After unmount, messages should not add rows."""
        client = MagicMock(spec=FrameClient)
        panel = AuditLogPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        panel.handle_message(SAMPLE_SPAN_MESSAGE)
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0, (
            "Messages after unmount should not add rows"
        )


# ---------------------------------------------------------------------------
# AC3: Panel accessible via keybinding (consistent with other panels)
# ---------------------------------------------------------------------------


class TestAuditLogPanelRegistration:
    """AC3: Panel registered in PANEL_REGISTRY with keybinding."""

    def test_panel_in_registry(self):
        """AuditLogPanel should be listed in PANEL_REGISTRY in tui.py."""
        from pf.tui.app import PANEL_REGISTRY

        panel_keys = [key for key, _ in PANEL_REGISTRY]
        assert "audit-log" in panel_keys, (
            f"'audit-log' not in PANEL_REGISTRY. Keys: {panel_keys}"
        )

    def test_panel_has_keybinding(self):
        """AuditLogPanel should have a numeric keybinding in TuiApp.BINDINGS."""
        from pf.tui.app import TuiApp

        binding_actions = [b.action for b in TuiApp.BINDINGS]
        has_audit_binding = any("audit-log" in action for action in binding_actions)
        assert has_audit_binding, (
            f"No keybinding for audit-log panel. Actions: {binding_actions}"
        )

    def test_panel_in_display_names(self):
        """Panel should have an entry in PANEL_DISPLAY_NAMES."""
        from pf.tui.app import PANEL_DISPLAY_NAMES

        assert "audit-log" in PANEL_DISPLAY_NAMES, (
            "'audit-log' not in PANEL_DISPLAY_NAMES"
        )
        assert PANEL_DISPLAY_NAMES["audit-log"] == "Audit Log"

    def test_panel_icon_in_registry(self):
        """Panel should have an icon entry in PANEL_ICONS."""
        assert "audit-log" in PANEL_ICONS, (
            "'audit-log' not in PANEL_ICONS"
        )


# ---------------------------------------------------------------------------
# AC4: Scrollable history with newest events at bottom
# ---------------------------------------------------------------------------


class TestAuditLogPanelScrolling:
    """AC4: Scrollable history with newest events at bottom."""

    def test_events_ordered_chronologically(self):
        """Events should appear in chronological order (oldest first, newest last)."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)

        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        # The init message has events in order: Edit (ts 0), Bash (ts 60000), Read (ts 120000)
        # First row should be Edit, last should be Read
        rows = _get_table_rows(table)
        assert len(rows) == 3
        # First row tool should be Edit
        assert "Edit" in rows[0], f"First row should be Edit. Got: {rows[0]}"
        # Last row tool should be Read
        assert "Read" in rows[2], f"Last row should be Read. Got: {rows[2]}"

    def test_new_event_appended_at_bottom(self):
        """New span events should be appended at the bottom of the table."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message(SAMPLE_INIT_MESSAGE)  # 3 rows
        panel.handle_message(SAMPLE_SPAN_MESSAGE)  # Glob event at end

        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        rows = _get_table_rows(table)
        assert len(rows) == 4
        # Last row should be the Glob event
        assert "Glob" in rows[3], f"Last row should be Glob. Got: {rows[3]}"

    def test_data_table_allows_scrolling(self):
        """DataTable should be scrollable (not fixed height that clips)."""
        panel = AuditLogPanel(client=MagicMock())
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        # DataTable inherits from ScrollView — it's inherently scrollable
        assert isinstance(table, DataTable), (
            "Table should be a DataTable (which is scrollable by default)"
        )


# ---------------------------------------------------------------------------
# Error handling: Malformed/missing data
# ---------------------------------------------------------------------------


class TestAuditLogPanelErrorHandling:
    """Handles malformed/missing data gracefully."""

    def test_missing_spans_field(self):
        """Init message without 'spans' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "init"})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0

    def test_missing_span_field_in_update(self):
        """Span message without 'span' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "span"})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0

    def test_empty_dict_payload(self):
        """Empty dict payload should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0

    def test_span_missing_tool_name(self):
        """Span without 'toolName' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({
            "type": "span",
            "span": {
                "input": "some input",
                "success": True,
                "timestamp": 1739500000000,
            },
        })
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        # Should still add a row (with fallback for missing tool name)
        assert table.row_count == 1

    def test_span_missing_input(self):
        """Span without 'input' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({
            "type": "span",
            "span": {
                "toolName": "Bash",
                "success": True,
                "timestamp": 1739500000000,
            },
        })
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 1

    def test_span_missing_success(self):
        """Span without 'success' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({
            "type": "span",
            "span": {
                "toolName": "Read",
                "input": "some file",
                "timestamp": 1739500000000,
            },
        })
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 1

    def test_span_missing_timestamp(self):
        """Span without 'timestamp' field should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({
            "type": "span",
            "span": {
                "toolName": "Write",
                "input": "file content",
                "success": True,
            },
        })
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 1

    def test_completely_empty_span_object(self):
        """Completely empty span dict should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "span", "span": {}})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 1

    def test_spans_field_is_not_a_list(self):
        """If 'spans' is not a list, should not crash."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({"type": "init", "spans": "not a list"})
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        assert table.row_count == 0

    def test_input_truncation_for_long_input(self):
        """Long input strings should be truncated to prevent table overflow."""
        long_input = "x" * 500
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.handle_message({
            "type": "span",
            "span": {
                "toolName": "Bash",
                "input": long_input,
                "success": True,
                "timestamp": 1739500000000,
            },
        })
        table = getattr(panel, "_table", None) or getattr(panel, "table", None)
        all_text = _get_all_table_text(table)
        # Input should be truncated — not contain the full 500-char string
        assert len(long_input) > len(all_text) or "…" in all_text or "..." in all_text, (
            "Long input should be truncated with ellipsis"
        )


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _get_all_table_text(table: DataTable) -> str:
    """Extract all cell values from a DataTable as a single string."""
    parts: list[str] = []
    for row_key in table.rows:
        row_data = table.get_row(row_key)
        for cell in row_data:
            parts.append(str(cell))
    return " ".join(parts)


def _get_table_rows(table: DataTable) -> list[str]:
    """Extract each row from a DataTable as a concatenated string."""
    rows: list[str] = []
    for row_key in table.rows:
        row_data = table.get_row(row_key)
        row_text = " ".join(str(cell) for cell in row_data)
        rows.append(row_text)
    return rows
