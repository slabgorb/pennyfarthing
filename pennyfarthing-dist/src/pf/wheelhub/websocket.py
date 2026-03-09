"""WebSocket channel manager for FastAPI WheelHub — port from Node.js.

Story 48-3: Port all 16 WebSocket channels to FastAPI.
Epic: 48 (Python WheelHub Migration)
ADR: docs/adr/0022-python-wheelhub-replacement.md

Provides:
- ChannelManager: registers channels, manages client connections, broadcasts
- Individual channel handlers for all 16 WebSocket channels
- File watchers for sprint, session, git, and settings changes

Channels ported from packages/core/src/server/websocket.ts:
  stats, persona, token-stats, livereload, story, git, bell, spans,
  welcome, hooks, settings, context, todos, sprint, diffs, focus
"""

from __future__ import annotations

from typing import Any, Callable


class ChannelManager:
    """Manages WebSocket channels — registration, connections, and broadcast.

    Port of the Node.js WebSocketServer-per-channel pattern.
    Each channel has a path (e.g. '/ws/stats'), optional initial_data callback,
    and optional message handler for bidirectional channels.
    """

    def __init__(self) -> None:
        raise NotImplementedError("ChannelManager not yet implemented")

    def register(
        self,
        path: str,
        *,
        initial_data: Callable[[], Any] | None = None,
        on_message: Callable[[Any, str], None] | None = None,
    ) -> None:
        """Register a WebSocket channel at the given path."""
        raise NotImplementedError

    def get_channels(self) -> list[str]:
        """Return list of registered channel paths."""
        raise NotImplementedError

    def get_client_count(self, path: str) -> int:
        """Return number of connected clients for a channel."""
        raise NotImplementedError

    def broadcast(self, path: str, message: dict[str, Any]) -> int:
        """Broadcast a JSON message to all clients on a channel. Returns sent count."""
        raise NotImplementedError


# --- Channel registration helpers ---

CHANNEL_PATHS: list[str] = [
    "/ws/stats",
    "/ws/persona",
    "/ws/token-stats",
    "/ws/livereload",
    "/ws/story",
    "/ws/git",
    "/ws/bell",
    "/ws/spans",
    "/ws/welcome",
    "/ws/hooks",
    "/ws/settings",
    "/ws/context",
    "/ws/todos",
    "/ws/sprint",
    "/ws/diffs",
    "/ws/focus",
]


def setup_websocket_channels(manager: ChannelManager) -> None:
    """Register all 16 WebSocket channels on the manager.

    Port of setupWebSocketServers() from Node.js websocket.ts.
    """
    raise NotImplementedError("setup_websocket_channels not yet implemented")


# --- File watcher stubs ---


def setup_file_watchers(
    manager: ChannelManager, project_dir: str
) -> list[str]:
    """Set up file watchers for sprint, session, git, and settings.

    Returns list of watched paths for verification.
    """
    raise NotImplementedError("setup_file_watchers not yet implemented")
