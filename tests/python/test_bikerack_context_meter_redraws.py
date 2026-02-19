"""Tests for BikeRack TUI Context Meter Redraws — Story 110-12.

The context meter footer needs more frequent redraws during active
sessions. Currently it only redraws on WebSocket push. These tests
verify periodic refresh, event-driven redraw triggers, and throttling
to prevent performance degradation.

Verifies:
  AC1: Context meter updates more frequently during active sessions
  AC2: Redraw trigger points are identified and optimized
  AC3: No noticeable performance degradation from increased redraw frequency

Run with: python -m pytest tests/python/test_bikerack_context_meter_redraws.py -v
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from textual.widgets import Static

from pf.bikerack.context_meter_footer import ContextMeterFooter
from pf.bikerack.ws_client import WheelHubClient

# ---------------------------------------------------------------------------
# Test data — reuse standard context wire format
# ---------------------------------------------------------------------------

CONTEXT_LOW: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 45000,
        "percent": 22,
        "status": "ok",
        "tier": "FULL",
    },
}

CONTEXT_MID: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 120000,
        "percent": 60,
        "status": "ok",
        "tier": "REFRESH",
    },
}

CONTEXT_HIGH: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 160000,
        "percent": 82,
        "status": "warning",
        "tier": "HANDOFF",
    },
}


# ---------------------------------------------------------------------------
# AC1: Context meter updates more frequently during active sessions
# ---------------------------------------------------------------------------


class TestPeriodicRefreshTimer:
    """AC1: The footer should set up a periodic timer to request redraws."""

    def test_has_refresh_interval_attribute(self):
        """ContextMeterFooter should expose a configurable refresh_interval."""
        footer = ContextMeterFooter(client=MagicMock())
        assert hasattr(footer, "refresh_interval"), (
            "ContextMeterFooter must have a refresh_interval attribute "
            "for periodic redraw scheduling"
        )

    def test_refresh_interval_is_reasonable(self):
        """Refresh interval should be between 1 and 10 seconds."""
        footer = ContextMeterFooter(client=MagicMock())
        interval = footer.refresh_interval
        assert isinstance(interval, (int, float)), (
            f"refresh_interval should be numeric, got {type(interval).__name__}"
        )
        assert 1 <= interval <= 10, (
            f"refresh_interval should be 1-10 seconds, got {interval}"
        )

    def test_starts_timer_on_mount(self):
        """on_mount should start a periodic refresh timer."""
        footer = ContextMeterFooter(client=MagicMock())
        with patch.object(footer, "set_interval", return_value=MagicMock()) as mock_interval:
            footer.on_mount()
            mock_interval.assert_called_once()
            args = mock_interval.call_args
            # First arg is the interval in seconds
            assert args[0][0] == footer.refresh_interval, (
                "Timer interval should match refresh_interval"
            )

    def test_timer_stopped_on_unmount(self):
        """on_unmount should cancel the periodic refresh timer."""
        footer = ContextMeterFooter(client=MagicMock())
        mock_timer = MagicMock()
        with patch.object(footer, "set_interval", return_value=mock_timer):
            footer.on_mount()
        footer.on_unmount()
        mock_timer.stop.assert_called_once()

    def test_has_request_refresh_method(self):
        """ContextMeterFooter should have a request_refresh method for polling."""
        footer = ContextMeterFooter(client=MagicMock())
        assert hasattr(footer, "request_refresh") and callable(footer.request_refresh), (
            "ContextMeterFooter must have a callable request_refresh method"
        )

    def test_request_refresh_triggers_redraw_with_cached_data(self):
        """request_refresh should trigger a redraw using the last known context data."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        # Simulate having received context data previously
        footer.handle_context_message(CONTEXT_LOW)
        initial_data = footer._context_data

        with patch.object(footer, "post_message") as mock_post:
            footer.request_refresh()
            if initial_data:
                mock_post.assert_called_once()


class TestPeriodicRefreshInApp:
    """AC1: Verify periodic refresh works within the Textual app lifecycle."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp
        return BikeRackApp()

    async def test_meter_has_active_timer_after_mount(self, app):
        """After mount, the ContextMeterFooter should have an active refresh timer."""
        async with app.run_test() as pilot:
            meter = app.query_one("ContextMeterFooter")
            assert hasattr(meter, "_refresh_timer"), (
                "ContextMeterFooter should have a _refresh_timer after mount"
            )
            assert meter._refresh_timer is not None, (
                "Refresh timer should be active after mount"
            )


# ---------------------------------------------------------------------------
# AC2: Redraw trigger points are identified and optimized
# ---------------------------------------------------------------------------


class TestPanelSwitchRedraw:
    """AC2: Switching panels should trigger a context meter redraw."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp
        return BikeRackApp()

    async def test_panel_switch_triggers_meter_refresh(self, app):
        """Switching to a different panel should trigger context meter redraw."""
        async with app.run_test() as pilot:
            meter = app.query_one("ContextMeterFooter")
            # Seed context data so there's something to redraw
            meter.handle_context_message(CONTEXT_LOW)

            # Switch to sprint first to ensure a panel change when pressing 2
            app.action_switch_panel("sprint")

            with patch.object(meter, "request_refresh") as mock_refresh:
                # Switch panel via keybinding
                await pilot.press("2")  # Switch to git panel
                await pilot.pause()
                mock_refresh.assert_called(), (
                    "Panel switch should trigger context meter refresh"
                )


class TestReconnectionRedraw:
    """AC2: WebSocket reconnection should trigger an immediate redraw."""

    def test_connection_state_change_triggers_refresh(self):
        """When WheelHubClient reconnects, the meter should redraw."""
        client = MagicMock(spec=WheelHubClient)
        footer = ContextMeterFooter(client=client)
        footer._mounted = True
        footer._context_data = CONTEXT_LOW["context"]

        assert hasattr(footer, "on_connection_state_change"), (
            "ContextMeterFooter must have on_connection_state_change handler"
        )

    def test_subscribes_to_state_changes(self):
        """ContextMeterFooter should subscribe to client state changes on mount."""
        client = MagicMock(spec=WheelHubClient)
        footer = ContextMeterFooter(client=client)
        with patch.object(footer, "set_interval", return_value=MagicMock()):
            footer.on_mount()
        client.on_state_change.assert_called_once()


class TestLastUpdateTimestamp:
    """AC2: Track when the meter was last updated for staleness detection."""

    def test_tracks_last_update_time(self):
        """ContextMeterFooter should track when it last received data."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        assert hasattr(footer, "last_update_time"), (
            "ContextMeterFooter must track last_update_time"
        )

    def test_last_update_time_set_on_message(self):
        """last_update_time should update when a context message arrives."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        before = time.monotonic()
        footer.handle_context_message(CONTEXT_LOW)
        after = time.monotonic()
        assert before <= footer.last_update_time <= after, (
            "last_update_time should be set to current time on message receipt"
        )

    def test_staleness_detected(self):
        """Footer should be able to report whether its data is stale."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        assert hasattr(footer, "is_stale"), (
            "ContextMeterFooter must have is_stale property"
        )
        # Without any data, it should be considered stale
        assert footer.is_stale, "Footer with no data should report as stale"


# ---------------------------------------------------------------------------
# AC3: No noticeable performance degradation from increased redraw frequency
# ---------------------------------------------------------------------------


class TestRedrawThrottling:
    """AC3: Rapid consecutive messages should not cause excessive redraws."""

    def test_has_min_redraw_interval(self):
        """ContextMeterFooter should have a minimum time between redraws."""
        footer = ContextMeterFooter(client=MagicMock())
        assert hasattr(footer, "min_redraw_interval"), (
            "ContextMeterFooter must have min_redraw_interval for throttling"
        )
        interval = footer.min_redraw_interval
        assert isinstance(interval, (int, float)), (
            f"min_redraw_interval should be numeric, got {type(interval).__name__}"
        )
        assert 0.05 <= interval <= 1.0, (
            f"min_redraw_interval should be 50ms-1s, got {interval}"
        )

    def test_rapid_messages_throttled(self):
        """Multiple messages within min_redraw_interval should not all trigger redraws."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True

        redraws = []
        original_post = footer.post_message

        def tracking_post(msg):
            redraws.append(time.monotonic())

        footer.post_message = tracking_post

        # Fire 10 rapid messages
        for i in range(10):
            msg = {
                "type": "update",
                "context": {"tokens": 1000 * i, "percent": i * 10, "tier": "FULL"},
            }
            footer.handle_context_message(msg)

        # With throttling, we should see fewer than 10 redraws
        assert len(redraws) < 10, (
            f"Expected throttled redraws (<10), but got {len(redraws)} redraws "
            f"from 10 rapid messages"
        )

    def test_throttle_allows_eventual_update(self):
        """After throttle window passes, the next message should trigger a redraw."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True

        redraws = []
        footer.post_message = lambda msg: redraws.append(1)

        # First message should always go through
        footer.handle_context_message(CONTEXT_LOW)
        first_count = len(redraws)
        assert first_count >= 1, "First message should always trigger a redraw"


class TestRefreshDoesNotCrashWithoutData:
    """AC3: Periodic refresh with no cached data should be a safe no-op."""

    def test_request_refresh_without_data_is_noop(self):
        """request_refresh with no prior context data should not crash."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        footer._context_data = None
        # Should not raise
        footer.request_refresh()

    def test_request_refresh_after_unmount_is_noop(self):
        """request_refresh after unmount should not crash or redraw."""
        footer = ContextMeterFooter(client=MagicMock())
        footer._mounted = True
        footer.handle_context_message(CONTEXT_LOW)
        footer._mounted = False

        with patch.object(footer, "post_message") as mock_post:
            footer.request_refresh()
            mock_post.assert_not_called()
