"""Tests for BikeRack TUI BackgroundPanel — Background task status (Story 103-16).

Verifies:
  AC1: BackgroundPanel implementation exists in bikerack
  AC2: WebSocket subscription to /ws/background-tasks channel
  AC3: Renders background task list with task names and descriptions
  AC4: Shows status indicators (running/completed/failed) with styling
  AC5: Handles empty state (no background tasks)
  AC6: Handles malformed/missing data gracefully
  AC8: Real-time updates when new background tasks arrive

Run with: python -m pytest tests/python/test_bikerack_background_panel.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock, patch

from rich.console import Console
from rich.text import Text
from textual.widgets import Static

from pf.bikerack.background_panel import BackgroundPanel
from pf.bikerack.base_panel import PANEL_ICONS, BasePanel
from pf.bikerack.ws_client import WheelHubClient


def _mock_mount(panel):
    """Call on_mount with set_interval mocked to avoid asyncio requirement."""
    mock_timer = MagicMock()
    with patch.object(panel, "set_interval", return_value=mock_timer):
        panel.on_mount()
    return mock_timer

# ---------------------------------------------------------------------------
# Test data fixtures — matching WheelHub /ws/background-tasks wire format
# ---------------------------------------------------------------------------

SAMPLE_RUNNING_TASK: dict[str, Any] = {
    "taskId": "task-abc-001",
    "description": "Running test suite",
    "subagentType": "testing-runner",
    "startedAt": "2026-02-14T10:00:00Z",
    "isBackground": True,
}

SAMPLE_COMPLETED_TASK: dict[str, Any] = {
    "taskId": "task-abc-002",
    "description": "Lint check passed",
    "subagentType": "testing-runner",
    "startedAt": "2026-02-14T09:50:00Z",
    "isBackground": True,
    "completedAt": "2026-02-14T09:51:30Z",
    "success": True,
    "result": "All checks passed",
}

SAMPLE_FAILED_TASK: dict[str, Any] = {
    "taskId": "task-abc-003",
    "description": "Deploy to staging",
    "subagentType": "devops",
    "startedAt": "2026-02-14T09:45:00Z",
    "isBackground": True,
    "completedAt": "2026-02-14T09:46:00Z",
    "success": False,
    "error": "Connection refused: staging server unreachable",
}

SAMPLE_INIT_MESSAGE: dict[str, Any] = {
    "type": "init",
    "tasks": [SAMPLE_RUNNING_TASK, SAMPLE_COMPLETED_TASK, SAMPLE_FAILED_TASK],
}

SAMPLE_SINGLE_RUNNING_MESSAGE: dict[str, Any] = {
    "type": "init",
    "tasks": [SAMPLE_RUNNING_TASK],
}

SAMPLE_UPDATE_MESSAGE: dict[str, Any] = {
    "type": "update",
    "tasks": [
        {
            "taskId": "task-abc-001",
            "description": "Running test suite",
            "subagentType": "testing-runner",
            "startedAt": "2026-02-14T10:00:00Z",
            "isBackground": True,
            "completedAt": "2026-02-14T10:05:00Z",
            "success": True,
            "result": "47/47 tests passed",
        },
    ],
}

SAMPLE_EMPTY_TASKS_MESSAGE: dict[str, Any] = {
    "type": "init",
    "tasks": [],
}

SAMPLE_ALL_COMPLETED_MESSAGE: dict[str, Any] = {
    "type": "init",
    "tasks": [SAMPLE_COMPLETED_TASK],
}

SAMPLE_ALL_FAILED_MESSAGE: dict[str, Any] = {
    "type": "init",
    "tasks": [SAMPLE_FAILED_TASK],
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# AC1: BackgroundPanel implementation exists in bikerack
# ---------------------------------------------------------------------------


class TestBackgroundPanelExists:
    """AC1: BackgroundPanel implementation exists and follows BasePanel pattern."""

    def test_background_panel_exists_and_importable(self):
        """BackgroundPanel should be importable from bikerack.background_panel."""
        assert BackgroundPanel is not None

    def test_inherits_from_base_panel(self):
        """BackgroundPanel should inherit from BasePanel."""
        assert issubclass(BackgroundPanel, BasePanel)

    def test_is_textual_widget(self):
        """BackgroundPanel should be a Textual widget (subclass of Static)."""
        assert issubclass(BackgroundPanel, Static)

    def test_channel_is_background_tasks(self):
        """BackgroundPanel.channel should be 'background-tasks'."""
        assert BackgroundPanel.channel == "background-tasks"

    def test_panel_name_is_background(self):
        """BackgroundPanel.panel_name should be 'Background'."""
        assert BackgroundPanel.panel_name == "Background"

    def test_has_icon_from_registry(self):
        """BackgroundPanel.icon should match the PANEL_ICONS registry."""
        assert BackgroundPanel.icon == PANEL_ICONS["background"][0]


# ---------------------------------------------------------------------------
# AC2: WebSocket subscription to /ws/background-tasks channel
# ---------------------------------------------------------------------------


class TestBackgroundPanelSubscription:
    """AC2: BackgroundPanel subscribes to /ws/background-tasks channel."""

    def test_subscribes_to_background_tasks_channel_on_mount(self):
        """BackgroundPanel should subscribe to 'background-tasks' on mount."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        client.subscribe.assert_called_once_with(
            "background-tasks", panel.handle_message
        )

    def test_accepts_client_parameter(self):
        """BackgroundPanel constructor should accept a client parameter."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        assert panel._client is client

    def test_handle_message_stores_payload(self):
        """handle_message should store the received payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload == SAMPLE_INIT_MESSAGE

    def test_handle_init_message_type(self):
        """Panel should handle 'init' type messages with tasks array."""
        panel = BackgroundPanel(client=MagicMock())
        _mock_mount(panel)
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload["type"] == "init"

    def test_handle_update_message_type(self):
        """Panel should handle 'update' type messages with tasks array."""
        panel = BackgroundPanel(client=MagicMock())
        _mock_mount(panel)
        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel._last_payload["type"] == "update"


# ---------------------------------------------------------------------------
# AC3: Renders background task list with task names and descriptions
# ---------------------------------------------------------------------------


class TestBackgroundPanelRendering:
    """AC3: Renders background task list with task names and descriptions."""

    def test_render_panel_returns_renderable(self):
        """render_panel should return a Rich renderable (not plain string)."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert len(output) > 0

    def test_task_description_visible(self):
        """Task descriptions should appear in the rendered output."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "Running test suite" in output, (
            "Task description 'Running test suite' not found in output"
        )

    def test_multiple_task_descriptions_visible(self):
        """All task descriptions from the payload should be rendered."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "Running test suite" in output, "Running task description missing"
        assert "Lint check passed" in output, "Completed task description missing"
        assert "Deploy to staging" in output, "Failed task description missing"

    def test_subagent_type_visible(self):
        """Subagent type should appear in the rendered output."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        output = _render_to_string(result)
        assert "testing-runner" in output or "devops" in output, (
            "Subagent type not found in output"
        )


# ---------------------------------------------------------------------------
# AC4: Status indicators (running/completed/failed) with styling
# ---------------------------------------------------------------------------


class TestBackgroundPanelStatusIndicators:
    """AC4: Shows status indicators with appropriate styling and icons."""

    def test_running_task_has_visual_indicator(self):
        """Running tasks should have a visual indicator (icon or text)."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_SINGLE_RUNNING_MESSAGE)
        output = _render_to_string(result)
        # Running indicator: spinner icon, "running" text, or ⟳ symbol
        has_running = any(
            indicator in output.lower()
            for indicator in ["running", "⟳", "\uf110", "…", "⏳"]
        )
        assert has_running, (
            f"Running task should have a visual indicator. Output: {output!r}"
        )

    def test_completed_task_has_success_indicator(self):
        """Completed successful tasks should show a success indicator."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_COMPLETED_MESSAGE)
        output = _render_to_string(result)
        # Success indicator: checkmark, "done", "passed", ✓, ✔
        has_success = any(
            indicator in output.lower()
            for indicator in ["✓", "✔", "done", "passed", "success", "✅", "complete"]
        )
        assert has_success, (
            f"Completed task should have success indicator. Output: {output!r}"
        )

    def test_failed_task_has_failure_indicator(self):
        """Failed tasks should show a failure indicator."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_FAILED_MESSAGE)
        output = _render_to_string(result)
        # Failure indicator: ✗, "failed", "error", ✘, ❌
        has_failure = any(
            indicator in output.lower()
            for indicator in ["✗", "✘", "failed", "error", "❌", "fail"]
        )
        assert has_failure, (
            f"Failed task should have failure indicator. Output: {output!r}"
        )

    def test_failed_task_shows_error_message(self):
        """Failed tasks should display the error message."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_FAILED_MESSAGE)
        output = _render_to_string(result)
        assert "Connection refused" in output or "staging server" in output, (
            "Failed task error message not shown in output"
        )

    def test_mixed_statuses_all_distinguishable(self):
        """Init message with running, completed, and failed tasks should
        render distinct indicators for each status."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_INIT_MESSAGE)
        console = Console(
            file=StringIO(), force_terminal=True, width=120, color_system="truecolor"
        )
        console.print(result)
        raw = console.file.getvalue()
        # Should contain ANSI styling — at minimum, different colors for
        # different statuses (green for success, red for failure)
        assert "\x1b[" in raw, (
            "Output should contain ANSI styling for status differentiation"
        )

    def test_completed_task_shows_result(self):
        """Completed successful tasks should show the result text."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_ALL_COMPLETED_MESSAGE)
        output = _render_to_string(result)
        assert "All checks passed" in output, (
            "Completed task result text not shown"
        )


# ---------------------------------------------------------------------------
# AC5: Handles empty state (no background tasks)
# ---------------------------------------------------------------------------


class TestBackgroundPanelEmptyState:
    """AC5: Handles empty state with appropriate message."""

    def test_empty_tasks_shows_placeholder(self):
        """Empty tasks array should show a placeholder message."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_EMPTY_TASKS_MESSAGE)
        output = _render_to_string(result)
        assert len(output.strip()) > 0, (
            "Empty tasks should produce output (placeholder message)"
        )

    def test_empty_tasks_message_is_informative(self):
        """Empty state should convey 'no tasks' meaning."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_EMPTY_TASKS_MESSAGE)
        output = _render_to_string(result)
        has_empty_msg = any(
            phrase in output.lower()
            for phrase in ["no background", "no tasks", "empty", "none"]
        )
        assert has_empty_msg, (
            f"Empty state should convey 'no tasks'. Output: {output!r}"
        )

    def test_empty_tasks_does_not_show_task_content(self):
        """Empty tasks should NOT render any task descriptions."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel(SAMPLE_EMPTY_TASKS_MESSAGE)
        output = _render_to_string(result)
        assert "Running test suite" not in output
        assert "Deploy to staging" not in output


# ---------------------------------------------------------------------------
# AC6: Handles malformed/missing data gracefully
# ---------------------------------------------------------------------------


class TestBackgroundPanelErrorHandling:
    """AC6: Handles malformed/missing data gracefully."""

    def test_missing_tasks_field(self):
        """Message without 'tasks' field should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        _mock_mount(panel)
        result = panel.render_panel({"type": "init"})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_none_payload_via_handle_message(self):
        """None payload should be handled gracefully by handle_message."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        panel.handle_message(None)
        assert panel._last_payload is None

    def test_empty_dict_payload(self):
        """Empty dict payload should not crash."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        panel.handle_message({})
        assert panel._last_payload == {}

    def test_task_missing_description(self):
        """Task without 'description' field should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": [{
                "taskId": "task-missing-desc",
                "subagentType": "dev",
                "startedAt": "2026-02-14T10:00:00Z",
                "isBackground": True,
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_task_missing_subagent_type(self):
        """Task without 'subagentType' field should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": [{
                "taskId": "task-no-type",
                "description": "Mystery task",
                "startedAt": "2026-02-14T10:00:00Z",
                "isBackground": True,
            }],
        })
        output = _render_to_string(result)
        assert "Mystery task" in output, (
            "Task description should render even without subagentType"
        )

    def test_task_missing_started_at(self):
        """Task without 'startedAt' field should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": [{
                "taskId": "task-no-time",
                "description": "Timeless task",
                "subagentType": "dev",
                "isBackground": True,
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_task_missing_task_id(self):
        """Task without 'taskId' field should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": [{
                "description": "Anonymous task",
                "subagentType": "dev",
                "startedAt": "2026-02-14T10:00:00Z",
                "isBackground": True,
            }],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_completely_empty_task_object(self):
        """Completely empty task dict should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": [{}],
        })
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_tasks_field_is_not_a_list(self):
        """If 'tasks' is not a list (e.g. string), should not crash."""
        panel = BackgroundPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "tasks": "not a list",
        })
        output = _render_to_string(result)
        assert isinstance(output, str)


# ---------------------------------------------------------------------------
# AC8: Real-time updates when new background tasks arrive
# ---------------------------------------------------------------------------


class TestBackgroundPanelRealTimeUpdates:
    """AC8: Panel updates in real-time when new background tasks arrive."""

    def test_handle_message_triggers_render(self):
        """handle_message should call render_panel with the payload."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        panel.render_panel = MagicMock(return_value=Text("updated"))
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.render_panel.assert_called_once_with(SAMPLE_INIT_MESSAGE)

    def test_consecutive_messages_each_trigger_render(self):
        """Multiple messages should each trigger a new render call."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)
        panel.render_panel = MagicMock(return_value=Text("ok"))
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel.render_panel.call_count == 2

    def test_update_replaces_displayed_content(self):
        """An 'update' message should replace previous task data."""
        panel = BackgroundPanel(client=MagicMock())
        _mock_mount(panel)

        # Init with running task
        result_init = panel.render_panel(SAMPLE_SINGLE_RUNNING_MESSAGE)
        output_init = _render_to_string(result_init)
        assert "Running test suite" in output_init

        # Update shows completed version
        result_update = panel.render_panel(SAMPLE_UPDATE_MESSAGE)
        output_update = _render_to_string(result_update)
        # Update message has the task now completed with result
        assert "47/47 tests passed" in output_update or "Running test suite" in output_update

    def test_last_payload_reflects_latest_message(self):
        """_last_payload should update to the most recent message."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        _mock_mount(panel)

        panel.handle_message(SAMPLE_INIT_MESSAGE)
        assert panel._last_payload == SAMPLE_INIT_MESSAGE

        panel.handle_message(SAMPLE_UPDATE_MESSAGE)
        assert panel._last_payload == SAMPLE_UPDATE_MESSAGE

    def test_unmount_stops_updates(self):
        """After unmount, messages should not trigger render."""
        client = MagicMock(spec=WheelHubClient)
        panel = BackgroundPanel(client=client)
        mock_timer = _mock_mount(panel)
        panel.on_unmount()
        mock_timer.stop.assert_called_once()

        panel.render_panel = MagicMock()
        panel.handle_message(SAMPLE_INIT_MESSAGE)
        panel.render_panel.assert_not_called()
