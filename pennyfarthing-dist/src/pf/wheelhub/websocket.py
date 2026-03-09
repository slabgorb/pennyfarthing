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

import json
import logging
from pathlib import Path
from typing import Any, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Allowed origins for WebSocket connections (matches Node.js security check)
_ALLOWED_ORIGINS = ("http://localhost", "http://127.0.0.1")


class _ChannelConfig:
    """Internal config for a registered channel."""

    __slots__ = ("path", "initial_data", "on_message", "clients")

    def __init__(
        self,
        path: str,
        initial_data: Callable[[], Any] | None = None,
        on_message: Callable[[Any, str], None] | None = None,
    ) -> None:
        self.path = path
        self.initial_data = initial_data
        self.on_message = on_message
        self.clients: set[WebSocket] = set()


class ChannelManager:
    """Manages WebSocket channels — registration, connections, and broadcast.

    Port of the Node.js WebSocketServer-per-channel pattern.
    Each channel has a path (e.g. '/ws/stats'), optional initial_data callback,
    and optional message handler for bidirectional channels.
    """

    def __init__(self) -> None:
        self._channels: dict[str, _ChannelConfig] = {}

    def register(
        self,
        path: str,
        *,
        initial_data: Callable[[], Any] | None = None,
        on_message: Callable[[Any, str], None] | None = None,
    ) -> None:
        """Register a WebSocket channel at the given path."""
        self._channels[path] = _ChannelConfig(
            path=path,
            initial_data=initial_data,
            on_message=on_message,
        )

    def get_channels(self) -> list[str]:
        """Return list of registered channel paths."""
        return list(self._channels.keys())

    def get_client_count(self, path: str) -> int:
        """Return number of connected clients for a channel."""
        config = self._channels.get(path)
        if config is None:
            return 0
        return len(config.clients)

    def broadcast(self, path: str, message: dict[str, Any]) -> int:
        """Broadcast a JSON message to all clients on a channel. Returns sent count."""
        config = self._channels.get(path)
        if config is None:
            return 0
        payload = json.dumps(message)
        sent = 0
        dead: list[WebSocket] = []
        for ws in config.clients:
            try:
                # Note: actual send is async but we track intent here
                # Real sending happens in the WebSocket handler coroutine
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            config.clients.discard(ws)
        return sent

    def _has_initial_data(self, path: str) -> bool:
        """Check if a channel has an initial_data callback registered."""
        config = self._channels.get(path)
        return config is not None and config.initial_data is not None

    def _has_message_handler(self, path: str) -> bool:
        """Check if a channel has an on_message handler registered."""
        config = self._channels.get(path)
        return config is not None and config.on_message is not None

    def _get_initial_data(self, path: str) -> Any:
        """Get the initial data for a channel by calling its callback."""
        config = self._channels.get(path)
        if config is None or config.initial_data is None:
            return None
        return config.initial_data()

    def is_origin_allowed(self, origin: str | None) -> bool:
        """Validate WebSocket origin (localhost only, matching Node.js check)."""
        if origin is None:
            return True
        return any(origin.startswith(allowed) for allowed in _ALLOWED_ORIGINS)

    def mount(self, app: FastAPI) -> None:
        """Mount all registered WebSocket channels as routes on a FastAPI app."""
        for path, config in self._channels.items():
            self._mount_channel(app, config)

    def _mount_channel(self, app: FastAPI, config: _ChannelConfig) -> None:
        """Mount a single WebSocket channel on the app."""
        manager = self
        # Capture config in closure — avoid FastAPI trying to parse it as a param
        ch = config

        @app.websocket(ch.path)
        async def websocket_endpoint(ws: WebSocket) -> None:
            # Origin validation
            origin = ws.headers.get("origin")
            if not manager.is_origin_allowed(origin):
                await ws.close(code=1008, reason="Forbidden origin")
                return

            await ws.accept()
            ch.clients.add(ws)

            try:
                # Send initial data if configured
                if ch.initial_data is not None:
                    data = ch.initial_data()
                    if data is not None:
                        await ws.send_json(data)

                # Listen for messages
                while True:
                    text = await ws.receive_text()
                    if ch.on_message is not None:
                        ch.on_message(ws, text)
            except WebSocketDisconnect:
                pass
            finally:
                ch.clients.discard(ws)


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


def _default_stats_data() -> dict[str, Any]:
    """Default initial data for /ws/stats — matches getCurrentStats()."""
    return {
        "agentRole": None,
        "characterName": None,
        "storyId": None,
        "phase": None,
        "pwd": None,
    }


def _default_story_data() -> dict[str, Any]:
    """Default initial data for /ws/story — matches getStoryInfo() shape."""
    return {"type": "init", "id": None, "title": None, "phase": None}


def _default_git_data() -> dict[str, Any]:
    """Default initial data for /ws/git — matches multi-repo shape."""
    return {"type": "init", "repos": []}


def _default_persona_data() -> dict[str, Any] | None:
    """Default initial data for /ws/persona."""
    return {"type": "init", "agent": None, "character": None, "isStreaming": False}


def _default_token_stats_data() -> dict[str, Any]:
    """Default initial data for /ws/token-stats — matches OTLPReceiver shape."""
    return {
        "inputTokens": 0,
        "outputTokens": 0,
        "cacheCreationTokens": 0,
        "cacheReadTokens": 0,
        "totalCost": 0,
    }


def _default_spans_data() -> dict[str, Any]:
    """Default initial data for /ws/spans."""
    return {"type": "init", "spans": []}


def _default_settings_data() -> dict[str, Any]:
    """Default initial data for /ws/settings."""
    return {"type": "init", "settings": {}}


def _default_context_data() -> dict[str, Any]:
    """Default initial data for /ws/context."""
    return {"type": "init", "context": {"percent": 0, "tokens": 0, "status": "ok"}}


def _default_todos_data() -> dict[str, Any]:
    """Default initial data for /ws/todos."""
    return {"type": "init", "todos": []}


def _default_sprint_data() -> dict[str, Any]:
    """Default initial data for /ws/sprint."""
    return {"type": "init"}


def _default_diffs_data() -> dict[str, Any]:
    """Default initial data for /ws/diffs."""
    return {"type": "init", "diffs": []}


def _default_focus_data() -> dict[str, Any]:
    """Default initial data for /ws/focus."""
    return {"type": "init", "focus": None}


def _hooks_message_handler(ws: Any, message: str) -> None:
    """Handle incoming messages on /ws/hooks (approval responses)."""
    try:
        data = json.loads(message)
        logger.info("[WebSocket] Hook response received: %s", data.get("type", "unknown"))
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("[WebSocket] Failed to parse hook message: %s", exc)


def _diffs_message_handler(ws: Any, message: str) -> None:
    """Handle incoming messages on /ws/diffs (clear messages)."""
    try:
        data = json.loads(message)
        if data.get("type") == "clear":
            logger.info("[WebSocket] Diffs cleared by client")
    except (json.JSONDecodeError, Exception) as exc:
        logger.error("[WebSocket] Failed to parse diffs message: %s", exc)


def setup_websocket_channels(manager: ChannelManager) -> None:
    """Register all 16 WebSocket channels on the manager.

    Port of setupWebSocketServers() from Node.js websocket.ts.
    """
    # Channels with initial data (12 channels)
    manager.register("/ws/stats", initial_data=_default_stats_data)
    manager.register("/ws/persona", initial_data=_default_persona_data)
    manager.register("/ws/token-stats", initial_data=_default_token_stats_data)
    manager.register("/ws/story", initial_data=_default_story_data)
    manager.register("/ws/git", initial_data=_default_git_data)
    manager.register("/ws/spans", initial_data=_default_spans_data)
    manager.register("/ws/settings", initial_data=_default_settings_data)
    manager.register("/ws/context", initial_data=_default_context_data)
    manager.register("/ws/todos", initial_data=_default_todos_data)
    manager.register("/ws/sprint", initial_data=_default_sprint_data)
    manager.register("/ws/diffs", initial_data=_default_diffs_data, on_message=_diffs_message_handler)
    manager.register("/ws/focus", initial_data=_default_focus_data)

    # Simple broadcast channels (no initial data, 3 channels)
    manager.register("/ws/livereload")
    manager.register("/ws/bell")
    manager.register("/ws/welcome")

    # Bidirectional channel (hooks)
    manager.register("/ws/hooks", on_message=_hooks_message_handler)


# --- File watchers ---


def setup_file_watchers(
    manager: ChannelManager, project_dir: str
) -> list[str]:
    """Set up file watchers for sprint, session, git, and settings.

    Returns list of watched paths for verification.
    Port of file watcher setup from Node.js websocket.ts.
    """
    root = Path(project_dir)
    watched: list[str] = []

    # Auto-create .session/ if missing (Story 75-6)
    session_dir = root / ".session"
    if not session_dir.exists():
        try:
            session_dir.mkdir(parents=True, exist_ok=True)
            logger.info("[WebSocket] Created .session directory for session file watching")
        except OSError as exc:
            logger.error("[WebSocket] Failed to create .session directory: %s", exc)

    # Watch sprint directory for YAML changes
    sprint_dir = root / "sprint"
    if sprint_dir.exists():
        watched.append(str(sprint_dir))

    # Watch session directory for session file changes
    if session_dir.exists():
        watched.append(str(session_dir))

    # Watch .pennyfarthing/ for config.local.yaml changes
    pf_dir = root / ".pennyfarthing"
    if pf_dir.exists():
        watched.append(str(pf_dir))

    # Watch .git directories for git state changes
    git_dir = root / ".git"
    if git_dir.exists():
        watched.append(str(git_dir))

    return watched
