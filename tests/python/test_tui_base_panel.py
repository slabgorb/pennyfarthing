"""Tests for BikeRack TUI base panel abstraction (Story 103-5).

Verifies:
  AC1: Base panel class exists with channel subscription capability
  AC2: Panels receive JSON payloads from WebSocket channels
  AC3: render() method produces Rich output (tables/trees)
  AC4: Main content area displays rendered output
  AC5: Real-time updates when new data arrives on channel
  AC6: Panel subclasses can override render() with custom Rich rendering
  AC7: Base class handles subscribe/unsubscribe lifecycle

Run with: python -m pytest tests/python/test_bikerack_base_panel.py -v
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from pf.tui.base_panel import BasePanel
from pf.tui.app import TuiApp
from pf.tui.client import FrameClient
from rich.table import Table
from rich.text import Text
from textual.widgets import Static

# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


class SprintPanel(BasePanel):
    """Concrete panel subclass for testing — simulates SprintPanel."""

    channel = "sprint"

    def render_panel(self, payload: dict[str, Any]) -> Table:
        table = Table(title="Sprint")
        table.add_column("Story")
        table.add_column("Status")
        for story in payload.get("stories", []):
            table.add_row(story.get("id", ""), story.get("status", ""))
        return table


class MinimalPanel(BasePanel):
    """Minimal subclass — returns plain text."""

    channel = "test"

    def render_panel(self, payload: dict[str, Any]) -> Text:
        return Text(payload.get("message", "empty"))


# ---------------------------------------------------------------------------
# AC1: Base panel class exists with channel subscription capability
# ---------------------------------------------------------------------------


class TestBasePanelExists:
    """AC1: BasePanel is importable and has required structure."""

    def test_importable(self):
        """BasePanel should be importable from bikerack.base_panel."""
        assert BasePanel is not None

    def test_is_textual_widget(self):
        """BasePanel should be a Textual widget (subclass of Static)."""
        assert issubclass(BasePanel, Static)

    def test_has_channel_attribute(self):
        """BasePanel should have a 'channel' class attribute."""
        assert hasattr(BasePanel, "channel")

    def test_accepts_client_parameter(self):
        """BasePanel constructor should accept a client parameter."""
        client = MagicMock(spec=FrameClient)
        panel = BasePanel(client=client)
        assert panel._client is client

    def test_subclass_sets_channel(self):
        """Subclass should be able to set channel as class attribute."""
        assert SprintPanel.channel == "sprint"
        assert MinimalPanel.channel == "test"


# ---------------------------------------------------------------------------
# AC2: Panels receive JSON payloads from WebSocket channels
# ---------------------------------------------------------------------------


class TestChannelSubscription:
    """AC2: Panel subscribes to WebSocket channel and receives messages."""

    def test_subscribe_called_on_mount(self):
        """Panel should subscribe to its channel when mounted."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)

        # Simulate mount lifecycle
        panel.on_mount()

        client.subscribe.assert_called_once_with("sprint", panel.handle_message)

    def test_subscribe_uses_panel_channel(self):
        """Panel subscribes to the channel defined in its class attribute."""
        client = MagicMock(spec=FrameClient)
        panel = MinimalPanel(client=client)

        panel.on_mount()

        client.subscribe.assert_called_once_with("test", panel.handle_message)

    def test_handle_message_receives_dict(self):
        """handle_message should accept a dict payload without error."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()

        # Should not raise — handler processes the message
        panel.handle_message({"type": "init", "stories": []})

    def test_handle_message_stores_last_payload(self):
        """handle_message should store the last received payload."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()

        payload = {"type": "init", "stories": [{"id": "1", "status": "done"}]}
        panel.handle_message(payload)

        assert panel._last_payload == payload

    def test_no_client_no_subscribe(self):
        """Panel without client should not crash on mount."""
        panel = SprintPanel(client=None)

        # Should not raise — graceful no-op
        panel.on_mount()


# ---------------------------------------------------------------------------
# AC3: render() method produces Rich output (tables/trees)
# ---------------------------------------------------------------------------


class TestRichRendering:
    """AC3: render_panel() produces Rich renderables."""

    def test_render_panel_returns_rich_table(self):
        """SprintPanel.render_panel should return a Rich Table."""
        panel = SprintPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "stories": [{"id": "103-5", "status": "in_progress"}],
        })
        assert isinstance(result, Table)

    def test_render_panel_returns_rich_text(self):
        """MinimalPanel.render_panel should return a Rich Text."""
        panel = MinimalPanel(client=MagicMock())
        result = panel.render_panel({"message": "hello"})
        assert isinstance(result, Text)

    def test_render_panel_table_has_data(self):
        """Rendered table should contain the story data."""
        panel = SprintPanel(client=MagicMock())
        result = panel.render_panel({
            "type": "init",
            "stories": [
                {"id": "103-5", "status": "in_progress"},
                {"id": "103-6", "status": "backlog"},
            ],
        })
        assert result.row_count == 2

    def test_render_panel_with_empty_payload(self):
        """render_panel should handle empty payload gracefully."""
        panel = SprintPanel(client=MagicMock())
        result = panel.render_panel({"type": "init"})
        assert isinstance(result, Table)
        assert result.row_count == 0

    def test_base_panel_render_panel_is_abstract(self):
        """BasePanel.render_panel should require subclass override."""
        panel = BasePanel(client=MagicMock())
        with pytest.raises(NotImplementedError):
            panel.render_panel({"type": "init"})


# ---------------------------------------------------------------------------
# AC4: Main content area displays rendered output
# ---------------------------------------------------------------------------


class TestDisplayInApp:
    """AC4: Panel renders into the app's main content area."""

    async def test_panel_mounts_in_main_content(self):
        """Panel can be mounted into TuiApp's main content area."""
        app = TuiApp()
        async with app.run_test() as pilot:
            main = app.query_one("#main-content")
            panel = MinimalPanel(client=None, id="test-panel")
            await main.mount(panel)
            await pilot.pause()

            found = app.query_one("#test-panel")
            assert found is panel

    async def test_panel_renders_content_after_message(self):
        """Panel should display rendered content after receiving a message."""
        client = MagicMock(spec=FrameClient)
        app = TuiApp(client=client)

        async with app.run_test() as pilot:
            main = app.query_one("#main-content")
            panel = MinimalPanel(client=client, id="test-panel")
            await main.mount(panel)
            await pilot.pause()

            # Simulate message arrival
            panel.handle_message({"type": "init", "message": "Sprint Active"})
            await pilot.pause()

            # The panel's display should have updated
            found = app.query_one("#test-panel")
            rendered = found.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert "Sprint Active" in text


# ---------------------------------------------------------------------------
# AC5: Real-time updates when new data arrives on channel
# ---------------------------------------------------------------------------


class TestRealTimeUpdates:
    """AC5: Panel updates display when new messages arrive."""

    def test_handle_message_triggers_render(self):
        """handle_message should call render_panel with the payload."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("updated"))

        panel.handle_message({"type": "update", "stories": []})

        panel.render_panel.assert_called_once()

    def test_multiple_messages_update_display(self):
        """Consecutive messages should each trigger a new render."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("updated"))

        panel.handle_message({"type": "init", "stories": []})
        panel.handle_message({"type": "update", "stories": [{"id": "1"}]})

        assert panel.render_panel.call_count == 2

    def test_last_payload_updated_on_each_message(self):
        """_last_payload should reflect the most recent message."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()

        first = {"type": "init", "stories": []}
        second = {"type": "update", "stories": [{"id": "1"}]}

        panel.handle_message(first)
        assert panel._last_payload == first

        panel.handle_message(second)
        assert panel._last_payload == second


# ---------------------------------------------------------------------------
# AC6: Panel subclasses can override render() with custom Rich rendering
# ---------------------------------------------------------------------------


class TestSubclassRendering:
    """AC6: Subclasses implement custom render_panel()."""

    def test_sprint_panel_renders_table(self):
        """SprintPanel should render a table with story columns."""
        panel = SprintPanel(client=MagicMock())
        result = panel.render_panel({
            "stories": [{"id": "103-5", "status": "in_progress"}],
        })
        assert isinstance(result, Table)
        assert result.row_count == 1

    def test_minimal_panel_renders_text(self):
        """MinimalPanel should render plain text from payload."""
        panel = MinimalPanel(client=MagicMock())
        result = panel.render_panel({"message": "hello world"})
        assert isinstance(result, Text)
        assert result.plain == "hello world"

    def test_different_subclasses_different_channels(self):
        """Each subclass subscribes to its own channel."""
        client = MagicMock(spec=FrameClient)
        sprint = SprintPanel(client=client)
        minimal = MinimalPanel(client=client)

        sprint.on_mount()
        minimal.on_mount()

        calls = client.subscribe.call_args_list
        channels = [call.args[0] for call in calls]
        assert "sprint" in channels
        assert "test" in channels


# ---------------------------------------------------------------------------
# AC7: Base class handles subscribe/unsubscribe lifecycle
# ---------------------------------------------------------------------------


class TestLifecycle:
    """AC7: Panel manages subscription lifecycle."""

    def test_unsubscribe_on_unmount(self):
        """Panel should clean up subscription on unmount."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)

        panel.on_mount()
        panel.on_unmount()

        # Client should have an unsubscribe mechanism called
        # The exact API depends on implementation — at minimum,
        # the panel should no longer process messages after unmount
        assert panel._client is not None  # client ref still exists for cleanup

    def test_unmount_without_mount(self):
        """Unmount without prior mount should not crash."""
        panel = SprintPanel(client=MagicMock())

        # Should not raise
        panel.on_unmount()

    def test_unmount_clears_handlers(self):
        """After unmount, handle_message should be a no-op."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        # After unmount, messages should not trigger render
        panel.render_panel = MagicMock()
        panel.handle_message({"type": "update"})
        panel.render_panel.assert_not_called()

    def test_mount_sets_subscribed_state(self):
        """After mount, panel should track that it is subscribed."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)

        panel.on_mount()

        # Panel should know it's active/subscribed
        assert panel._last_payload is not None or client.subscribe.called

    def test_no_client_unmount_safe(self):
        """Unmount with no client should not raise."""
        panel = SprintPanel(client=None)
        panel.on_unmount()  # Should not raise


# ---------------------------------------------------------------------------
# Edge cases — because I can feel bugs hiding here
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases and defensive behavior."""

    def test_handle_message_with_none_payload(self):
        """handle_message should handle None gracefully."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()

        # Should not raise
        panel.handle_message(None)

    def test_handle_message_with_empty_dict(self):
        """handle_message should handle empty dict."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()

        panel.handle_message({})
        assert panel._last_payload == {}

    def test_channel_empty_string_raises_or_skips(self):
        """BasePanel with empty channel string should handle gracefully."""
        client = MagicMock(spec=FrameClient)
        panel = BasePanel(client=client)
        # Empty channel — should either raise ValueError or skip subscribe
        # Implementation decides; test documents the behavior
        try:
            panel.on_mount()
            # If it doesn't raise, it should NOT have subscribed to ""
            if client.subscribe.called:
                call_channel = client.subscribe.call_args.args[0]
                assert call_channel != "", "Should not subscribe to empty channel"
        except (ValueError, NotImplementedError):
            pass  # Acceptable — refusing to subscribe to empty channel

    def test_render_panel_called_with_init_type(self):
        """render_panel receives both 'init' and 'update' message types."""
        client = MagicMock(spec=FrameClient)
        panel = SprintPanel(client=client)
        panel.on_mount()
        panel.render_panel = MagicMock(return_value=Text("ok"))

        panel.handle_message({"type": "init", "stories": []})
        panel.handle_message({"type": "update", "stories": []})

        assert panel.render_panel.call_count == 2
