"""WheelHub WebSocket client with auto-reconnect.

Story 103-2: Python WebSocket client that connects to WheelHub,
subscribes to panel channels, receives JSON payloads, dispatches
to handlers, and auto-reconnects on disconnect with backoff.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from enum import Enum
from pathlib import Path
from typing import Any

import websockets


class ConnectionState(Enum):
    """WebSocket connection states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


# Reconnect delay in seconds (matches React hook pattern)
RECONNECT_DELAY = 2.0

# Type alias for message handlers
MessageHandler = Callable[[dict[str, Any]], None]
StateChangeCallback = Callable[[ConnectionState], None]


class WheelHubClient:
    """WebSocket client for WheelHub server.

    Connects to WheelHub, subscribes to channels, dispatches
    JSON messages to registered handlers, auto-reconnects on disconnect.
    """

    def __init__(
        self,
        port: int | None = None,
        project_dir: Path | None = None,
    ) -> None:
        self._port = port
        self._project_dir = project_dir
        self._state = ConnectionState.DISCONNECTED
        self._channel_states: dict[str, ConnectionState] = {}
        self._handlers: dict[str, list[MessageHandler]] = {}
        self._state_callbacks: list[StateChangeCallback] = []
        self._connections: dict[str, Any] = {}
        self._tasks: list[asyncio.Task] = []
        self._stopped = False

    @property
    def state(self) -> ConnectionState:
        """Current connection state."""
        return self._state

    @property
    def port(self) -> int | None:
        """Configured port, if any."""
        return self._port

    def _set_state(self, new_state: ConnectionState) -> None:
        """Transition to a new state and notify callbacks."""
        if new_state == self._state:
            return
        self._state = new_state
        for cb in self._state_callbacks:
            cb(new_state)

    def _set_channel_state(self, channel: str, new_state: ConnectionState) -> None:
        """Update per-channel state and recompute aggregate.

        The aggregate state is CONNECTED if at least one channel is
        connected, so a single failing channel cannot drag the UI to
        RECONNECTING while other channels are healthy.
        """
        self._channel_states[channel] = new_state
        states = set(self._channel_states.values())
        if ConnectionState.CONNECTED in states:
            aggregate = ConnectionState.CONNECTED
        elif ConnectionState.RECONNECTING in states:
            aggregate = ConnectionState.RECONNECTING
        else:
            aggregate = ConnectionState.DISCONNECTED
        self._set_state(aggregate)

    def discover_port(self) -> int:
        """Read port from .bikerack-port file. Raises if no port source available.

        Priority: explicit port > port file. No default fallback.
        """
        if self._port is not None:
            return self._port
        if self._project_dir is not None:
            port_file = self._project_dir / ".bikerack-port"
            if port_file.exists():
                text = port_file.read_text().strip()
                try:
                    return int(text)
                except ValueError as err:
                    raise RuntimeError(f"Invalid port in {port_file}: {text!r}") from err
            raise FileNotFoundError(
                f"No .bikerack-port file in {self._project_dir}. "
                "Is WheelHub running? Start it with: pf bikerack start"
            )
        raise RuntimeError("No port source available: no explicit port and no project_dir set")

    def subscribe(self, channel: str, handler: MessageHandler) -> None:
        """Register a handler for messages on a channel."""
        if channel not in self._handlers:
            self._handlers[channel] = []
        self._handlers[channel].append(handler)

    def on_state_change(self, callback: StateChangeCallback) -> None:
        """Register a callback for connection state changes."""
        self._state_callbacks.append(callback)

    async def connect(self) -> None:
        """Connect to WheelHub and start receiving messages.

        Blocks while channel recv loops are running. Returns when all
        loops complete (via CancelledError or disconnect).
        """
        self._stopped = False
        port = self.discover_port()
        self._port = port

        if not self._handlers:
            self._set_state(ConnectionState.CONNECTED)
            return

        async def channel_loop(channel: str, handlers: list[MessageHandler]) -> None:
            while not self._stopped:
                try:
                    url = f"ws://localhost:{port}/ws/{channel}"
                    ws = await websockets.connect(url)
                    self._connections[channel] = ws
                    self._set_channel_state(channel, ConnectionState.CONNECTED)
                    while True:
                        raw = await ws.recv()
                        try:
                            msg = json.loads(raw)
                            for h in handlers:
                                h(msg)
                        except (json.JSONDecodeError, TypeError):
                            pass
                except asyncio.CancelledError:
                    raise
                except Exception:
                    if self._stopped:
                        break
                    self._set_channel_state(channel, ConnectionState.RECONNECTING)
                    _sleep = asyncio.create_task(asyncio.sleep(RECONNECT_DELAY))
                    try:
                        await _sleep
                    except asyncio.CancelledError:
                        _sleep.cancel()
                        raise

        self._tasks = [
            asyncio.create_task(channel_loop(ch, hs)) for ch, hs in self._handlers.items()
        ]

        results = await asyncio.gather(*self._tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, asyncio.CancelledError):
                raise r

    async def disconnect(self) -> None:
        """Disconnect from WheelHub and cancel reconnect timers."""
        self._stopped = True

        for task in self._tasks:
            task.cancel()

        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks = []

        for ws in self._connections.values():
            try:
                await ws.close()
            except Exception:
                pass
        self._connections = {}
        self._channel_states = {}

        self._set_state(ConnectionState.DISCONNECTED)
