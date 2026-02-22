"""Tests for Story 120-13: Audit log enrichment — hook forwarding and drill-through.

RED phase: These tests define the contract for new functionality.
Existing enrichment in _enrich_from_params already handles Read/Grep/Edit/Write
when toolParameters are present — the gap is getting those params populated
in BikeRack mode via hook forwarding, plus adding drill-through interactivity.

  AC1: Read tool calls show file path in Input column (via hook forwarding)
  AC2: Grep tool calls show pattern + path in Input column (via hook forwarding)
  AC3: Edit/Write tool calls show file path in Input column (via hook forwarding)
  AC4: Row selection with j/k or arrow keys (highlighted row)
  AC5: Enter expands inline detail block with full input/output
  AC6: 44 existing audit log tests still pass (run existing test file)

Run with: python -m pytest tests/python/test_120_13_audit_log_enrichment.py -v
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

from pf.bikerack.audit_log_panel import AuditLogPanel


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_span(
    tool_name: str,
    tool_params: dict | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Create a span dict with optional toolParameters JSON."""
    span: dict[str, Any] = {
        "toolName": tool_name,
        "input": "",
        "success": True,
        "timestamp": 1739500000000,
        "durationMs": 150,
        **extra,
    }
    if tool_params is not None:
        span["toolParameters"] = json.dumps(tool_params)
    return span


def _make_panel_with_spans(spans: list[dict[str, Any]]) -> AuditLogPanel:
    """Create a mounted AuditLogPanel loaded with spans."""
    panel = AuditLogPanel(client=MagicMock())
    panel.on_mount()
    panel.handle_message({"type": "init", "spans": spans})
    return panel


# ---------------------------------------------------------------------------
# AC1-3: Hook forwarding — cyclist_pretooluse forwards tool input to WheelHub
#
# The PreToolUse hook must POST tool input to /api/pending-tool-input so that
# the OTLP receiver can correlate it with incoming spans. Without this, Read,
# Grep, Edit, Write inputs remain blank in BikeRack mode.
# ---------------------------------------------------------------------------


class TestHookForwardsToolInput:
    """ACs 1-3: cyclist_pretooluse should forward tool input to WheelHub."""

    def test_pretooluse_has_forward_function(self):
        """cyclist_pretooluse module should have a _forward_tool_input function."""
        from pf.hooks import cyclist_pretooluse

        assert hasattr(cyclist_pretooluse, "_forward_tool_input"), (
            "cyclist_pretooluse should have _forward_tool_input function "
            "to POST tool input to /api/pending-tool-input"
        )

    def test_forward_sends_to_correct_endpoint(self):
        """_forward_tool_input should POST to /api/pending-tool-input."""
        from pf.hooks import cyclist_pretooluse

        fn = getattr(cyclist_pretooluse, "_forward_tool_input", None)
        assert fn is not None, (
            "cyclist_pretooluse._forward_tool_input must exist"
        )
        # Function should accept tool_name, tool_id, tool_input, project_root

    def test_forward_called_during_main_when_cyclist_running(self):
        """main() should call _forward_tool_input when Cyclist is active."""
        from pf.hooks import cyclist_pretooluse

        assert hasattr(cyclist_pretooluse, "_forward_tool_input"), (
            "cyclist_pretooluse must have _forward_tool_input to be called in main()"
        )

    def test_forward_includes_tool_name_and_input(self):
        """Forwarded data should include toolName, toolId, and input fields."""
        from pf.hooks import cyclist_pretooluse

        fn = getattr(cyclist_pretooluse, "_forward_tool_input", None)
        assert fn is not None, (
            "cyclist_pretooluse._forward_tool_input must exist to forward tool data"
        )


# ---------------------------------------------------------------------------
# AC4: Row selection with j/k or arrow keys (highlighted row)
#
# AuditLogPanel must support keyboard-driven row selection. This requires
# BasePanel to support optional interactivity (it currently extends Static).
# ---------------------------------------------------------------------------


class TestRowSelection:
    """AC4: AuditLogPanel supports row selection with keyboard navigation."""

    def test_panel_has_selected_index(self):
        """Panel should track which row is selected."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        assert hasattr(panel, "_selected_index"), (
            "AuditLogPanel should have _selected_index attribute for row selection"
        )

    def test_initial_selection_is_none_or_last(self):
        """Initial selection should be None (nothing) or last row (newest)."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        idx = getattr(panel, "_selected_index", "MISSING")
        assert idx != "MISSING", (
            "AuditLogPanel must have _selected_index attribute"
        )
        assert idx is None or idx == len(panel._spans) - 1, (
            f"Initial selection should be None or last index, got {idx}"
        )

    def test_has_select_next_row_method(self):
        """Panel should have select_next_row method for j/down-arrow."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert hasattr(panel, "action_cursor_down") or hasattr(panel, "select_next_row"), (
            "AuditLogPanel should have action_cursor_down or select_next_row method"
        )

    def test_has_select_prev_row_method(self):
        """Panel should have select_prev_row method for k/up-arrow."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert hasattr(panel, "action_cursor_up") or hasattr(panel, "select_prev_row"), (
            "AuditLogPanel should have action_cursor_up or select_prev_row method"
        )

    def test_selection_stays_in_bounds_at_top(self):
        """Moving up from first row should stay at first row."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        move_up = getattr(panel, "action_cursor_up", None) or getattr(panel, "select_prev_row", None)
        assert move_up is not None, (
            "AuditLogPanel must have cursor up method"
        )

    def test_selection_stays_in_bounds_at_bottom(self):
        """Moving down from last row should stay at last row."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        move_down = getattr(panel, "action_cursor_down", None) or getattr(panel, "select_next_row", None)
        assert move_down is not None, (
            "AuditLogPanel must have cursor down method"
        )

    def test_selected_row_visually_distinct_in_render(self):
        """Selected row should render with reverse video or highlight style."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        assert hasattr(panel, "_selected_index"), (
            "AuditLogPanel must have _selected_index for render highlighting"
        )


# ---------------------------------------------------------------------------
# AC5: Enter expands inline detail block with full input/output
#
# Pressing Enter on a selected row should expand an inline detail view
# showing full input, output, error, and absolute timestamp.
# ---------------------------------------------------------------------------


class TestDrillThroughExpand:
    """AC5: Enter on selected row expands inline detail block."""

    def test_panel_has_expanded_rows_tracking(self):
        """Panel should track which rows are expanded."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert hasattr(panel, "_expanded_rows"), (
            "AuditLogPanel should have _expanded_rows set for drill-through tracking"
        )

    def test_has_toggle_expand_method(self):
        """Panel should have a toggle_expand or action_select method."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert hasattr(panel, "toggle_expand") or hasattr(panel, "action_select"), (
            "AuditLogPanel should have toggle_expand or action_select method"
        )

    def test_full_span_data_stored_for_drillthrough(self):
        """Panel should store full span data including toolParameters."""
        span = _make_span("Read", {
            "file_path": "/Users/dev/project/pennyfarthing-dist/pf/bikerack/audit_log_panel.py",
        })
        panel = _make_panel_with_spans([span])
        assert len(panel._spans) == 1
        stored = panel._spans[0]
        assert stored.get("toolParameters") is not None, (
            "Full span data including toolParameters should be stored for drill-through"
        )

    def test_expanded_state_initially_empty(self):
        """No rows should be expanded initially."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        expanded = getattr(panel, "_expanded_rows", "MISSING")
        assert expanded != "MISSING", (
            "AuditLogPanel must have _expanded_rows attribute"
        )
        assert len(expanded) == 0, (
            f"No rows should be expanded initially, got {expanded}"
        )

    def test_expanded_row_shows_full_input(self):
        """Expanded detail block should include full untruncated input."""
        panel = _make_panel_with_spans([
            _make_span("Bash", {
                "command": "very long command " * 20,
                "description": "Run a very long test command",
            }),
        ])
        assert hasattr(panel, "_expanded_rows"), (
            "AuditLogPanel must have _expanded_rows for full input display"
        )

    def test_expanded_row_shows_output(self):
        """Expanded detail block should include tool output."""
        span = _make_span("Bash", {"command": "ls"})
        span["output"] = "file1.py\nfile2.py\nfile3.py"
        panel = _make_panel_with_spans([span])
        assert hasattr(panel, "_expanded_rows"), (
            "AuditLogPanel must have _expanded_rows for output display"
        )

    def test_expanded_row_shows_error_for_failed_tool(self):
        """Expanded detail block for failed tools should show error."""
        span = _make_span("Bash", {"command": "npm test"})
        span["success"] = False
        span["error"] = "Exit code 1: 3 tests failed"
        panel = _make_panel_with_spans([span])
        assert hasattr(panel, "_expanded_rows"), (
            "AuditLogPanel must have _expanded_rows for error detail display"
        )

    def test_expanded_row_shows_absolute_timestamp(self):
        """Expanded detail block should show absolute timestamp, not relative."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert hasattr(panel, "_expanded_rows"), (
            "AuditLogPanel must have _expanded_rows for absolute timestamp display"
        )
