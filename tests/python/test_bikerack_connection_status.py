"""Tests for BikeRack TUI connection status indicator (Story 103-4).

Verifies:
  AC1: TUI header shows connection status indicator
  AC2: Indicator displays three states: connected (green), disconnected (red), reconnecting (yellow)
  AC3: Connection status updates within 5 seconds of WheelHub state change
  AC4: TUI remains responsive while disconnected
  AC5: Connection status persists through panel switches

Run with: python -m pytest tests/python/test_bikerack_connection_status.py -v
"""

from unittest.mock import AsyncMock, patch

import pytest
from textual.widgets import Static

from pennyfarthing_scripts.bikerack.tui import (
    BikeRackApp,
    ConnectionStatus,
    STATE_DISPLAY,
)
from pennyfarthing_scripts.bikerack.ws_client import ConnectionState, WheelHubClient


class TestConnectionStatusWidget:
    """AC1 & AC2: Connection status indicator displays correct states."""

    @pytest.fixture
    def app(self):
        return BikeRackApp()

    async def test_connection_status_widget_exists(self, app):
        """AC1: TUI header area has a connection status widget."""
        async with app.run_test() as pilot:
            status = app.query("#connection-status")
            assert len(status) > 0

    async def test_widget_is_connection_status_type(self, app):
        """Widget should be a ConnectionStatus instance."""
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status")
            assert isinstance(widget, ConnectionStatus)

    async def test_default_state_is_disconnected(self, app):
        """Default state should be DISCONNECTED."""
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            assert widget.connection_state == ConnectionState.DISCONNECTED

    async def test_disconnected_shows_indicator(self, app):
        """AC2: Disconnected state shows indicator text."""
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status")
            rendered = widget.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert "Disconnected" in text

    async def test_connected_state(self, app):
        """AC2: Connected state shows green indicator."""
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = ConnectionState.CONNECTED
            await pilot.pause()
            rendered = widget.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert "Connected" in text

    async def test_reconnecting_state(self, app):
        """AC2: Reconnecting state shows yellow indicator."""
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = ConnectionState.RECONNECTING
            await pilot.pause()
            rendered = widget.render()
            text = rendered.plain if hasattr(rendered, "plain") else str(rendered)
            assert "Reconnecting" in text

    async def test_all_states_have_display_mapping(self):
        """Every ConnectionState should have a display string."""
        for state in ConnectionState:
            assert state in STATE_DISPLAY, f"Missing display mapping for {state}"


class TestConnectionStatusWithClient:
    """AC3: Connection status updates from WheelHub state changes."""

    async def test_client_connected_updates_widget(self):
        """AC3: Widget updates when client transitions to CONNECTED."""
        client = WheelHubClient(port=9999)
        app = BikeRackApp(client=client)

        with patch.object(client, "connect", new_callable=AsyncMock):
            async with app.run_test() as pilot:
                widget = app.query_one("#connection-status", ConnectionStatus)
                client._set_state(ConnectionState.CONNECTED)
                await pilot.pause()
                assert widget.connection_state == ConnectionState.CONNECTED

    async def test_client_reconnecting_updates_widget(self):
        """AC3: Widget updates when client transitions to RECONNECTING."""
        client = WheelHubClient(port=9999)
        app = BikeRackApp(client=client)

        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            client._set_state(ConnectionState.RECONNECTING)
            await pilot.pause()
            assert widget.connection_state == ConnectionState.RECONNECTING

    async def test_client_disconnected_updates_widget(self):
        """AC3: Widget updates when client transitions to DISCONNECTED."""
        client = WheelHubClient(port=9999)
        app = BikeRackApp(client=client)

        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            # Transition through connected first, then back to disconnected
            client._set_state(ConnectionState.CONNECTED)
            await pilot.pause()
            client._set_state(ConnectionState.DISCONNECTED)
            await pilot.pause()
            assert widget.connection_state == ConnectionState.DISCONNECTED


class TestTUIResponsiveness:
    """AC4: TUI remains responsive while disconnected."""

    async def test_quit_works_while_disconnected(self):
        """TUI responds to quit binding while disconnected."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            assert widget.connection_state == ConnectionState.DISCONNECTED
            await pilot.press("q")
            assert pilot.app._exit

    async def test_app_without_client_is_functional(self):
        """App is fully functional without a WheelHub client."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            assert len(app.query("Header")) > 0
            assert len(app.query("Footer")) > 0
            assert len(app.query("#connection-status")) > 0
            assert len(app.query("#main-content")) > 0


class TestConnectionStatusPersistence:
    """AC5: Connection status persists through panel switches."""

    async def test_status_outside_main_content(self):
        """Connection status widget is NOT inside #main-content."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            main = app.query_one("#main-content")
            status_in_main = main.query("#connection-status")
            assert len(status_in_main) == 0, (
                "Connection status should be outside #main-content"
            )

    async def test_status_persists_after_content_change(self):
        """Connection status remains after main content area changes."""
        app = BikeRackApp()
        async with app.run_test() as pilot:
            widget = app.query_one("#connection-status", ConnectionStatus)
            widget.connection_state = ConnectionState.CONNECTED
            await pilot.pause()

            # Simulate panel switch (changes visible content in #main-content)
            app.action_switch_panel("git")
            await pilot.pause()

            # Connection status should still be there and connected
            widget = app.query_one("#connection-status", ConnectionStatus)
            assert widget.connection_state == ConnectionState.CONNECTED
