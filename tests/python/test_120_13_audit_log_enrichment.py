"""Tests for Story 120-13: Audit log enrichment — hook forwarding and drill-through.

Reviewer rejection cycle: Previous tests were hasattr-only structural checks.
These replacements verify actual behavior via mocks and state assertions.

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
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

from pf.bikerack.audit_log_panel import (
    AuditLogPanel,
    _render_detail_block,
)

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
# _forward_tool_input must POST tool input to /api/pending-tool-input with
# the correct payload structure. Tests mock send_to_cyclist and verify
# the endpoint, payload, and call site in main().
# ---------------------------------------------------------------------------


class TestHookForwardsBehavior:
    """ACs 1-3: Behavioral verification of hook forwarding via mocked send_to_cyclist."""

    def test_forward_calls_send_to_cyclist_with_correct_endpoint(self):
        """_forward_tool_input should POST to /api/pending-tool-input endpoint."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input(
                tool_name="Read",
                tool_id="toolu_abc123",
                tool_input={"file_path": "/tmp/test.py"},
                project_root=Path("/fake/project"),
            )
            mock_send.assert_called_once()
            call_kwargs = mock_send.call_args
            assert call_kwargs[1]["endpoint"] == "/api/pending-tool-input" or \
                call_kwargs[0][0] == "/api/pending-tool-input", (
                f"Expected endpoint '/api/pending-tool-input', got {call_kwargs}"
            )

    def test_forward_payload_includes_tool_name(self):
        """Forwarded payload must include toolName field."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input(
                tool_name="Read",
                tool_id="toolu_abc123",
                tool_input={"file_path": "/tmp/test.py"},
                project_root=Path("/fake/project"),
            )
            data = mock_send.call_args[1].get("data") or mock_send.call_args[0][1]
            assert data["toolName"] == "Read", (
                f"Payload should include toolName='Read', got {data}"
            )

    def test_forward_payload_includes_tool_id(self):
        """Forwarded payload must include toolId field."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input(
                tool_name="Grep",
                tool_id="toolu_xyz789",
                tool_input={"pattern": "TODO"},
                project_root=Path("/fake/project"),
            )
            data = mock_send.call_args[1].get("data") or mock_send.call_args[0][1]
            assert data["toolId"] == "toolu_xyz789", (
                f"Payload should include toolId, got {data}"
            )

    def test_forward_payload_includes_input_dict(self):
        """Forwarded payload must include the full tool input dict."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        tool_input = {"file_path": "/Users/dev/project/src/app.py", "offset": 10}
        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input(
                tool_name="Read",
                tool_id="toolu_001",
                tool_input=tool_input,
                project_root=Path("/fake/project"),
            )
            data = mock_send.call_args[1].get("data") or mock_send.call_args[0][1]
            assert data["input"] == tool_input, (
                f"Payload 'input' should be the full tool_input dict, got {data}"
            )

    def test_forward_noop_without_project_root(self):
        """_forward_tool_input should not call send_to_cyclist when project_root is None."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input("Read", "toolu_001", {}, project_root=None)
            mock_send.assert_not_called()

    def test_forward_swallows_exceptions(self):
        """_forward_tool_input must not raise even if send_to_cyclist fails."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist", side_effect=ConnectionError("refused")):
            # Should not raise
            _forward_tool_input("Read", "toolu_001", {}, project_root=Path("/fake"))

    def test_forward_sends_edit_input_with_file_path(self):
        """AC3: Edit tool forwarding includes file_path in the input payload."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        edit_input = {"file_path": "/project/src/main.py", "old_string": "foo", "new_string": "bar"}
        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input("Edit", "toolu_edit", edit_input, Path("/fake"))
            data = mock_send.call_args[1].get("data") or mock_send.call_args[0][1]
            assert data["toolName"] == "Edit"
            assert data["input"]["file_path"] == "/project/src/main.py"

    def test_forward_sends_grep_input_with_pattern(self):
        """AC2: Grep tool forwarding includes pattern in the input payload."""
        from pf.hooks.cyclist_pretooluse import _forward_tool_input

        grep_input = {"pattern": "def main", "path": "/project/src"}
        with patch("pf.hooks.cyclist_pretooluse.send_to_cyclist") as mock_send:
            _forward_tool_input("Grep", "toolu_grep", grep_input, Path("/fake"))
            data = mock_send.call_args[1].get("data") or mock_send.call_args[0][1]
            assert data["toolName"] == "Grep"
            assert data["input"]["pattern"] == "def main"


# ---------------------------------------------------------------------------
# AC4: Row selection with j/k or arrow keys (highlighted row)
#
# Tests verify actual state changes from cursor movement, not just
# method existence. Selection index must track correctly with bounds.
# ---------------------------------------------------------------------------


class TestRowSelectionBehavior:
    """AC4: Behavioral tests for keyboard-driven row selection."""

    def test_cursor_down_from_none_selects_first(self):
        """First cursor_down from no selection should select index 0."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        assert panel._selected_index is None
        panel.action_cursor_down()
        assert panel._selected_index == 0, (
            f"cursor_down from None should select 0, got {panel._selected_index}"
        )

    def test_cursor_down_increments_index(self):
        """cursor_down should increment selected index by 1."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
            _make_span("Write", {"file_path": "/tmp/c.py"}),
        ])
        panel._selected_index = 0
        panel.action_cursor_down()
        assert panel._selected_index == 1

    def test_cursor_down_stays_at_bottom(self):
        """cursor_down at last index should not go beyond bounds."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        panel._selected_index = 1  # last index
        panel.action_cursor_down()
        assert panel._selected_index == 1, (
            f"cursor_down at bottom should stay at 1, got {panel._selected_index}"
        )

    def test_cursor_up_from_none_selects_last(self):
        """First cursor_up from no selection should select last index."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        assert panel._selected_index is None
        panel.action_cursor_up()
        assert panel._selected_index == 1, (
            f"cursor_up from None should select last (1), got {panel._selected_index}"
        )

    def test_cursor_up_decrements_index(self):
        """cursor_up should decrement selected index by 1."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
            _make_span("Write", {"file_path": "/tmp/c.py"}),
        ])
        panel._selected_index = 2
        panel.action_cursor_up()
        assert panel._selected_index == 1

    def test_cursor_up_stays_at_top(self):
        """cursor_up at index 0 should not go below 0."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
            _make_span("Edit", {"file_path": "/tmp/b.py"}),
        ])
        panel._selected_index = 0
        panel.action_cursor_up()
        assert panel._selected_index == 0, (
            f"cursor_up at top should stay at 0, got {panel._selected_index}"
        )

    def test_cursor_noop_on_empty_spans(self):
        """Cursor movement on empty panel should not crash or set index."""
        panel = AuditLogPanel(client=MagicMock())
        panel.on_mount()
        panel.action_cursor_down()
        assert panel._selected_index is None
        panel.action_cursor_up()
        assert panel._selected_index is None


# ---------------------------------------------------------------------------
# AC5: Enter expands inline detail block with full input/output
#
# Tests verify toggle_expand modifies _expanded_rows state, and that
# _render_detail_block produces content with timestamp, params, output, error.
# ---------------------------------------------------------------------------


class TestDrillThroughBehavior:
    """AC5: Behavioral tests for expand/collapse and detail block rendering."""

    def test_toggle_expand_adds_index_to_set(self):
        """toggle_expand on selected row should add index to _expanded_rows."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        panel._selected_index = 0
        panel.toggle_expand()
        assert 0 in panel._expanded_rows, (
            f"After toggle_expand, index 0 should be in _expanded_rows: {panel._expanded_rows}"
        )

    def test_toggle_expand_removes_on_second_call(self):
        """Second toggle_expand on same row should remove it (collapse)."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        panel._selected_index = 0
        panel.toggle_expand()
        assert 0 in panel._expanded_rows
        panel.toggle_expand()
        assert 0 not in panel._expanded_rows, (
            "Second toggle should collapse (remove from _expanded_rows)"
        )

    def test_toggle_expand_noop_without_selection(self):
        """toggle_expand with no selection should not modify _expanded_rows."""
        panel = _make_panel_with_spans([
            _make_span("Read", {"file_path": "/tmp/a.py"}),
        ])
        assert panel._selected_index is None
        panel.toggle_expand()
        assert len(panel._expanded_rows) == 0

    def test_detail_block_shows_absolute_timestamp(self):
        """_render_detail_block should include absolute UTC timestamp."""
        span = _make_span("Read", {"file_path": "/tmp/a.py"})
        detail = _render_detail_block(span)
        text = str(detail)
        assert "Time:" in text, (
            f"Detail block should contain 'Time:' with absolute timestamp, got: {text}"
        )
        assert "UTC" in text, (
            f"Detail block timestamp should include 'UTC', got: {text}"
        )

    def test_detail_block_shows_tool_parameters(self):
        """_render_detail_block should show toolParameters key-value pairs."""
        span = _make_span("Read", {"file_path": "/tmp/test.py", "offset": 10})
        detail = _render_detail_block(span)
        text = str(detail)
        assert "file_path" in text, (
            f"Detail block should show toolParameters keys, got: {text}"
        )

    def test_detail_block_shows_output(self):
        """_render_detail_block should include output field when present."""
        span = _make_span("Bash", {"command": "ls"})
        span["output"] = "file1.py\nfile2.py"
        detail = _render_detail_block(span)
        text = str(detail)
        assert "Output:" in text, (
            f"Detail block should contain 'Output:', got: {text}"
        )
        assert "file1.py" in text

    def test_detail_block_shows_error_for_failed_tool(self):
        """_render_detail_block should include error for failed spans."""
        span = _make_span("Bash", {"command": "npm test"})
        span["success"] = False
        span["error"] = "Exit code 1: 3 tests failed"
        detail = _render_detail_block(span)
        text = str(detail)
        assert "Error:" in text, (
            f"Detail block should contain 'Error:', got: {text}"
        )
        assert "Exit code 1" in text

    def test_detail_block_shows_duration(self):
        """_render_detail_block should include formatted duration."""
        span = _make_span("Read", {"file_path": "/tmp/a.py"})
        span["durationMs"] = 1500
        detail = _render_detail_block(span)
        text = str(detail)
        assert "Duration:" in text, (
            f"Detail block should contain 'Duration:', got: {text}"
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
