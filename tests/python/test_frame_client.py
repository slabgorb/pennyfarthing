"""Tests for Frame WebSocket client with auto-reconnect (Story 103-2).

Verifies:
  FR3: Python WebSocket client connects to Frame server at configured port
  FR4: Subscribes to panel channels and receives JSON payloads
  AC-dispatch: Dispatches messages to panel renderers
  AC-reconnect: Auto-reconnect on disconnect with backoff strategy
  NFR6: TUI remains responsive while disconnected
  NFR7: Auto-reconnect uses 2-second backoff delay
  NFR8: Connection status updates within 5 seconds
  NFR9: WebSocket client is reusable across all panels
  NFR14: Port configuration sourced from .frame-port or config

Run with: python -m pytest tests/python/test_frame_client.py -v
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# AC-import: Module importable, interface correct
# ---------------------------------------------------------------------------


class TestImportAndInterface:
    """Module and class are importable with expected interface."""

    def test_ws_client_module_importable(self):
        """ws_client module should be importable."""
        from pf.tui import client as ws_client

        assert ws_client is not None

    def test_frame_client_class_exists(self):
        """FrameClient class should be importable."""
        from pf.tui.client import FrameClient

        assert FrameClient is not None

    def test_connection_state_enum_exists(self):
        """ConnectionState enum should have expected members."""
        from pf.tui.client import ConnectionState

        assert hasattr(ConnectionState, "DISCONNECTED")
        assert hasattr(ConnectionState, "CONNECTING")
        assert hasattr(ConnectionState, "CONNECTED")
        assert hasattr(ConnectionState, "RECONNECTING")

    def test_client_has_expected_methods(self):
        """FrameClient should expose connect, disconnect, subscribe, etc."""
        from pf.tui.client import FrameClient

        client = FrameClient()
        assert callable(getattr(client, "connect", None))
        assert callable(getattr(client, "disconnect", None))
        assert callable(getattr(client, "subscribe", None))
        assert callable(getattr(client, "on_state_change", None))
        assert callable(getattr(client, "discover_port", None))

    def test_default_port_constant(self):
        """DEFAULT_PORT should be 2898 (Frame mode)."""
        from pf.tui.client import DEFAULT_PORT

        assert DEFAULT_PORT == 2898

    def test_reconnect_delay_constant(self):
        """RECONNECT_DELAY should be 2.0 seconds."""
        from pf.tui.client import RECONNECT_DELAY

        assert RECONNECT_DELAY == 2.0

    def test_initial_state_is_disconnected(self):
        """New client should start in DISCONNECTED state."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient()
        assert client.state == ConnectionState.DISCONNECTED


# ---------------------------------------------------------------------------
# FR3 / NFR14: Port discovery and configuration
# ---------------------------------------------------------------------------


class TestPortDiscovery:
    """FR3/NFR14: Client discovers port from .frame-port file."""

    def test_discovers_port_from_file(self, tmp_path):
        """discover_port() should read port from .frame-port file."""
        from pf.tui.client import FrameClient

        port_file = tmp_path / ".frame-port"
        port_file.write_text("3456")

        client = FrameClient(project_dir=tmp_path)
        port = client.discover_port()
        assert port == 3456, f"Should read 3456 from port file, got {port}"

    def test_falls_back_to_default_port(self, tmp_path):
        """discover_port() should return DEFAULT_PORT when no port file exists."""
        from pf.tui.client import (
            DEFAULT_PORT,
            FrameClient,
        )

        # No .frame-port file in tmp_path
        client = FrameClient(project_dir=tmp_path)
        port = client.discover_port()
        assert port == DEFAULT_PORT, (
            f"Should fall back to {DEFAULT_PORT}, got {port}"
        )

    def test_uses_explicit_port_over_discovery(self, tmp_path):
        """When port is passed explicitly, discover_port() should return it."""
        from pf.tui.client import FrameClient

        port_file = tmp_path / ".frame-port"
        port_file.write_text("3456")

        client = FrameClient(port=9999, project_dir=tmp_path)
        port = client.discover_port()
        assert port == 9999, (
            f"Explicit port 9999 should override file, got {port}"
        )


# ---------------------------------------------------------------------------
# FR3: Connection lifecycle
# ---------------------------------------------------------------------------


class TestConnection:
    """FR3: Client connects to Frame WebSocket server."""

    async def test_connect_transitions_to_connected(self):
        """connect() should transition state to CONNECTED."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient(port=2898)

        with patch(
            "pf.tui.client.websockets", create=True
        ):
            await client.connect()

        assert client.state == ConnectionState.CONNECTED, (
            f"State should be CONNECTED after connect(), got {client.state}"
        )

    async def test_connect_uses_correct_ws_url(self):
        """connect() should connect to ws://localhost:{port}/ws/{channel}."""
        from pf.tui.client import FrameClient

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())

        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(side_effect=asyncio.CancelledError())
        mock_ws.close = AsyncMock()

        with patch(
            "pf.tui.client.websockets",
            create=True,
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        # Should have attempted to connect to the sprint channel
        mock_ws_mod.connect.assert_any_call("ws://localhost:2898/ws/sprint")

    async def test_disconnect_transitions_to_disconnected(self):
        """disconnect() should transition state to DISCONNECTED."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient(port=2898)

        with patch(
            "pf.tui.client.websockets", create=True
        ):
            await client.connect()
            await client.disconnect()

        assert client.state == ConnectionState.DISCONNECTED, (
            f"State should be DISCONNECTED after disconnect(), got {client.state}"
        )


# ---------------------------------------------------------------------------
# FR4 / AC-dispatch: Message handling and dispatch
# ---------------------------------------------------------------------------


class TestMessageHandling:
    """FR4: Subscribes to channels and dispatches JSON messages."""

    async def test_dispatches_init_message_to_handler(self):
        """Handler should receive parsed 'init' messages."""
        from pf.tui.client import FrameClient

        handler = MagicMock()
        client = FrameClient(port=2898)
        client.subscribe("sprint", handler)

        init_msg = {"type": "init", "sprint": {"name": "2606"}}

        # Simulate receiving a message
        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(
            side_effect=[json.dumps(init_msg), asyncio.CancelledError()]
        )
        mock_ws.close = AsyncMock()

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        handler.assert_called_with(init_msg)

    async def test_dispatches_update_message_to_handler(self):
        """Handler should receive parsed 'update' messages."""
        from pf.tui.client import FrameClient

        handler = MagicMock()
        client = FrameClient(port=2898)
        client.subscribe("git", handler)

        update_msg = {"type": "update", "repos": [{"name": "pennyfarthing"}]}

        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(
            side_effect=[json.dumps(update_msg), asyncio.CancelledError()]
        )
        mock_ws.close = AsyncMock()

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        handler.assert_called_with(update_msg)

    async def test_multiple_handlers_for_same_channel(self):
        """Multiple handlers on same channel should all be called."""
        from pf.tui.client import FrameClient

        handler_a = MagicMock()
        handler_b = MagicMock()
        client = FrameClient(port=2898)
        client.subscribe("sprint", handler_a)
        client.subscribe("sprint", handler_b)

        msg = {"type": "init", "sprint": {"name": "2606"}}

        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(
            side_effect=[json.dumps(msg), asyncio.CancelledError()]
        )
        mock_ws.close = AsyncMock()

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        handler_a.assert_called_with(msg)
        handler_b.assert_called_with(msg)

    async def test_ignores_malformed_json(self):
        """Malformed JSON should not crash the client."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        handler = MagicMock()
        client = FrameClient(port=2898)
        client.subscribe("sprint", handler)

        mock_ws = AsyncMock()
        mock_ws.recv = AsyncMock(
            side_effect=["not valid json{{{", asyncio.CancelledError()]
        )
        mock_ws.close = AsyncMock()

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        handler.assert_not_called()
        # Client should still be alive, not crashed
        assert client.state in (
            ConnectionState.CONNECTED,
            ConnectionState.DISCONNECTED,
        )


# ---------------------------------------------------------------------------
# AC-reconnect / NFR7: Auto-reconnect with 2s backoff
# ---------------------------------------------------------------------------


class TestAutoReconnect:
    """AC-reconnect/NFR7: Auto-reconnect on disconnect with 2s backoff."""

    async def test_reconnects_on_unexpected_close(self):
        """Client should attempt reconnect when server closes connection."""
        from pf.tui.client import (
            FrameClient,
        )

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())

        connect_count = 0

        async def mock_connect_fn(*args, **kwargs):
            nonlocal connect_count
            connect_count += 1
            mock_ws = AsyncMock()
            if connect_count == 1:
                # First connection closes unexpectedly
                mock_ws.recv = AsyncMock(
                    side_effect=Exception("Connection closed")
                )
            else:
                # Second connection stays open
                mock_ws.recv = AsyncMock(
                    side_effect=asyncio.CancelledError()
                )
            mock_ws.close = AsyncMock()
            return mock_ws

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(side_effect=mock_connect_fn)
            try:
                await asyncio.wait_for(client.connect(), timeout=5.0)
            except (TimeoutError, asyncio.CancelledError):
                pass

        assert connect_count >= 2, (
            f"Should reconnect at least once, got {connect_count} connections"
        )

    async def test_reconnect_uses_two_second_delay(self):
        """Reconnect delay should be ~2 seconds (NFR7)."""
        from pf.tui.client import FrameClient

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())

        timestamps = []


        async def mock_sleep(delay):
            timestamps.append(delay)
            # Don't actually sleep in tests
            return

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws = AsyncMock()
            mock_ws.recv = AsyncMock(
                side_effect=Exception("Connection closed")
            )
            mock_ws.close = AsyncMock()
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)

            with patch(
                "pf.tui.client.asyncio.sleep",
                side_effect=mock_sleep,
            ):
                try:
                    await asyncio.wait_for(client.connect(), timeout=1.0)
                except (TimeoutError, asyncio.CancelledError):
                    pass

        assert len(timestamps) > 0, "Should have slept at least once for reconnect"
        assert timestamps[0] == pytest.approx(2.0, abs=0.1), (
            f"Reconnect delay should be ~2.0s, got {timestamps[0]}s"
        )

    async def test_no_reconnect_after_explicit_disconnect(self):
        """After explicit disconnect(), no reconnect should be attempted."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())

        connect_count = 0

        async def mock_connect_fn(*args, **kwargs):
            nonlocal connect_count
            connect_count += 1
            mock_ws = AsyncMock()
            mock_ws.recv = AsyncMock(side_effect=asyncio.CancelledError())
            mock_ws.close = AsyncMock()
            return mock_ws

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(side_effect=mock_connect_fn)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        await client.disconnect()
        initial_count = connect_count

        # Wait a bit to confirm no reconnect happens
        await asyncio.sleep(0.1)

        assert connect_count == initial_count, (
            f"No reconnect should happen after disconnect, "
            f"had {initial_count} before, {connect_count} after"
        )
        assert client.state == ConnectionState.DISCONNECTED


# ---------------------------------------------------------------------------
# NFR8: Connection state and callbacks
# ---------------------------------------------------------------------------


class TestConnectionState:
    """NFR8: Connection status updates and state change callbacks."""

    async def test_state_change_callback_fires(self):
        """on_state_change callback should fire on state transitions."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        states_seen: list[ConnectionState] = []
        client = FrameClient(port=2898)
        client.on_state_change(lambda s: states_seen.append(s))

        with patch(
            "pf.tui.client.websockets", create=True
        ):
            await client.connect()

        assert ConnectionState.CONNECTED in states_seen, (
            f"Should have seen CONNECTED state, got {states_seen}"
        )

    async def test_state_is_reconnecting_during_backoff(self):
        """State should be RECONNECTING during backoff wait."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        states_seen: list[ConnectionState] = []
        client = FrameClient(port=2898)
        client.on_state_change(lambda s: states_seen.append(s))
        client.subscribe("sprint", MagicMock())

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws = AsyncMock()
            mock_ws.recv = AsyncMock(
                side_effect=Exception("Connection closed")
            )
            mock_ws.close = AsyncMock()
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)

            with patch(
                "pf.tui.client.asyncio.sleep",
                new_callable=AsyncMock,
            ):
                try:
                    await asyncio.wait_for(client.connect(), timeout=1.0)
                except (TimeoutError, asyncio.CancelledError):
                    pass

        assert ConnectionState.RECONNECTING in states_seen, (
            f"Should have seen RECONNECTING state, got {states_seen}"
        )


# ---------------------------------------------------------------------------
# NFR9: Reusable across panels (multi-channel)
# ---------------------------------------------------------------------------


class TestMultiChannel:
    """NFR9: WebSocket client is reusable across all panels."""

    async def test_subscribe_to_multiple_channels(self):
        """Client should accept subscriptions to multiple channels."""
        from pf.tui.client import FrameClient

        client = FrameClient(port=2898)

        sprint_handler = MagicMock()
        git_handler = MagicMock()
        diffs_handler = MagicMock()

        client.subscribe("sprint", sprint_handler)
        client.subscribe("git", git_handler)
        client.subscribe("diffs", diffs_handler)

        # All subscriptions should be registered
        assert len(client._handlers) == 3, (
            f"Should have 3 channel subscriptions, got {len(client._handlers)}"
        )

    async def test_channels_receive_independent_messages(self):
        """Each channel should only dispatch to its own handlers."""
        from pf.tui.client import FrameClient

        sprint_handler = MagicMock()
        git_handler = MagicMock()
        client = FrameClient(port=2898)
        client.subscribe("sprint", sprint_handler)
        client.subscribe("git", git_handler)

        sprint_msg = {"type": "init", "sprint": {"name": "2606"}}
        git_msg = {"type": "init", "repos": []}

        # Simulate sprint channel receiving a message
        # After connect, sprint handler should get sprint_msg, not git_msg
        mock_sprint_ws = AsyncMock()
        mock_sprint_ws.recv = AsyncMock(
            side_effect=[json.dumps(sprint_msg), asyncio.CancelledError()]
        )
        mock_sprint_ws.close = AsyncMock()

        mock_git_ws = AsyncMock()
        mock_git_ws.recv = AsyncMock(
            side_effect=[json.dumps(git_msg), asyncio.CancelledError()]
        )
        mock_git_ws.close = AsyncMock()

        call_count = 0

        async def mock_connect_fn(url, **kwargs):
            nonlocal call_count
            call_count += 1
            if "sprint" in url:
                return mock_sprint_ws
            elif "git" in url:
                return mock_git_ws
            raise ValueError(f"Unexpected URL: {url}")

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(side_effect=mock_connect_fn)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        # Sprint handler gets sprint msg, not git msg
        sprint_handler.assert_called_with(sprint_msg)
        # Git handler gets git msg, not sprint msg
        git_handler.assert_called_with(git_msg)


# ---------------------------------------------------------------------------
# Story 120-4: Per-channel state isolation (flicker fix)
# ---------------------------------------------------------------------------


class TestChannelStateIsolation:
    """Story 120-4: One failing channel must not corrupt aggregate state."""

    async def test_failing_channel_does_not_override_connected(self):
        """Aggregate stays CONNECTED when one channel fails but another succeeds."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        states_seen: list[ConnectionState] = []
        client = FrameClient(port=2898)
        client.on_state_change(lambda s: states_seen.append(s))
        client.subscribe("sprint", MagicMock())
        client.subscribe("bad-channel", MagicMock())

        mock_good_ws = AsyncMock()
        mock_good_ws.recv = AsyncMock(side_effect=asyncio.CancelledError())
        mock_good_ws.close = AsyncMock()

        async def mock_connect_fn(url, **kwargs):
            if "sprint" in url:
                return mock_good_ws
            # bad-channel always fails
            raise ConnectionRefusedError("No such channel")

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(side_effect=mock_connect_fn)
            with patch(
                "pf.tui.client.asyncio.sleep",
                new_callable=AsyncMock,
            ):
                try:
                    await asyncio.wait_for(client.connect(), timeout=1.0)
                except (TimeoutError, asyncio.CancelledError):
                    pass

        # The aggregate should be CONNECTED because sprint succeeded,
        # even though bad-channel keeps failing
        assert client.state == ConnectionState.CONNECTED, (
            f"Aggregate should be CONNECTED when one channel is up, "
            f"got {client.state}"
        )

    async def test_all_channels_failing_shows_reconnecting(self):
        """Aggregate is RECONNECTING when all channels fail."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient(port=2898)
        client.subscribe("bad-a", MagicMock())
        client.subscribe("bad-b", MagicMock())

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(
                side_effect=ConnectionRefusedError("No such channel")
            )
            with patch(
                "pf.tui.client.asyncio.sleep",
                new_callable=AsyncMock,
            ):
                try:
                    await asyncio.wait_for(client.connect(), timeout=1.0)
                except (TimeoutError, asyncio.CancelledError):
                    pass

        assert client.state == ConnectionState.RECONNECTING, (
            f"Should be RECONNECTING when all channels fail, got {client.state}"
        )

    def test_set_state_deduplicates_callbacks(self):
        """_set_state should not fire callback when state hasn't changed."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        states_seen: list[ConnectionState] = []
        client = FrameClient(port=2898)
        client.on_state_change(lambda s: states_seen.append(s))

        client._set_state(ConnectionState.CONNECTED)
        client._set_state(ConnectionState.CONNECTED)
        client._set_state(ConnectionState.CONNECTED)

        assert states_seen == [ConnectionState.CONNECTED], (
            f"Should fire only once for same state, got {states_seen}"
        )


# ---------------------------------------------------------------------------
# Clean shutdown
# ---------------------------------------------------------------------------


class TestCleanShutdown:
    """Client shuts down cleanly, cancelling reconnect timers."""

    async def test_disconnect_cancels_reconnect_timer(self):
        """disconnect() should cancel any pending reconnect."""
        from pf.tui.client import (
            ConnectionState,
            FrameClient,
        )

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())

        sleep_cancelled = False
        _real_sleep = asyncio.sleep  # Capture before patch replaces it

        async def mock_sleep(delay):
            nonlocal sleep_cancelled
            try:
                await _real_sleep(delay)
            except asyncio.CancelledError:
                sleep_cancelled = True
                raise

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws = AsyncMock()
            mock_ws.recv = AsyncMock(
                side_effect=Exception("Connection closed")
            )
            mock_ws.close = AsyncMock()
            mock_ws_mod.connect = AsyncMock(return_value=mock_ws)

            with patch(
                "pf.tui.client.asyncio.sleep",
                side_effect=mock_sleep,
            ):
                connect_task = asyncio.create_task(client.connect())
                await _real_sleep(0.05)  # Let it start
                await client.disconnect()
                try:
                    await asyncio.wait_for(connect_task, timeout=1.0)
                except (TimeoutError, asyncio.CancelledError):
                    pass

        assert client.state == ConnectionState.DISCONNECTED

    async def test_disconnect_closes_all_connections(self):
        """disconnect() should close WebSocket connections for all channels."""
        from pf.tui.client import FrameClient

        client = FrameClient(port=2898)
        client.subscribe("sprint", MagicMock())
        client.subscribe("git", MagicMock())

        mock_ws_sprint = AsyncMock()
        mock_ws_sprint.recv = AsyncMock(side_effect=asyncio.CancelledError())
        mock_ws_sprint.close = AsyncMock()

        mock_ws_git = AsyncMock()
        mock_ws_git.recv = AsyncMock(side_effect=asyncio.CancelledError())
        mock_ws_git.close = AsyncMock()

        async def mock_connect_fn(url, **kwargs):
            if "sprint" in url:
                return mock_ws_sprint
            elif "git" in url:
                return mock_ws_git
            raise ValueError(f"Unexpected URL: {url}")

        with patch(
            "pf.tui.client.websockets", create=True
        ) as mock_ws_mod:
            mock_ws_mod.connect = AsyncMock(side_effect=mock_connect_fn)
            try:
                await client.connect()
            except asyncio.CancelledError:
                pass

        await client.disconnect()

        mock_ws_sprint.close.assert_called()
        mock_ws_git.close.assert_called()
