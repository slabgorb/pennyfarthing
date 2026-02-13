"""WheelHub WebSocket client with auto-reconnect.

Story 103-2: Python WebSocket client that connects to WheelHub,
subscribes to panel channels, receives JSON payloads, dispatches
to handlers, and auto-reconnects on disconnect with backoff.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any, Callable


class ConnectionState(Enum):
    """WebSocket connection states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"


# Default port for BikeRack mode
DEFAULT_PORT = 2898

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
        self._handlers: dict[str, list[MessageHandler]] = {}
        self._state_callbacks: list[StateChangeCallback] = []

    @property
    def state(self) -> ConnectionState:
        """Current connection state."""
        return self._state

    @property
    def port(self) -> int | None:
        """Configured port, if any."""
        return self._port

    def discover_port(self) -> int:
        """Read port from .bikerack-port file, fallback to DEFAULT_PORT."""
        return DEFAULT_PORT

    def subscribe(self, channel: str, handler: MessageHandler) -> None:
        """Register a handler for messages on a channel."""

    async def connect(self) -> None:
        """Connect to WheelHub and start receiving messages."""

    async def disconnect(self) -> None:
        """Disconnect from WheelHub and cancel reconnect timers."""

    def on_state_change(self, callback: StateChangeCallback) -> None:
        """Register a callback for connection state changes."""
