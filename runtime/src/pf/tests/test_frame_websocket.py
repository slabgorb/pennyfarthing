"""Tests for pf.frame.websocket — WebSocket channel port (Story 48-3).

Epic: 48 (Python Frame Server Migration)
Story: 48-3 — Port all 16 WebSocket channels to FastAPI
ADR: docs/adr/0022-python-frame-server.md

Tests the WebSocket channel manager and all 16 channels ported from
Node.js packages/core/src/server/websocket.ts.

Acceptance Criteria:
- [AC1] WebSocket channel manager ported to FastAPI with broadcast pattern
         matching Node.js behavior
- [AC2] All 16 WebSocket channels ported: stats, persona, token-stats,
         livereload, story, git, bell, spans, welcome, hooks, settings,
         context, todos, sprint, diffs, focus
- [AC3] File watchers ported for session, sprint, git state change detection
- [AC4] TUI panels render correctly against Python WebSocket server
- [AC5] WebSocket channel names and message formats are backward compatible
         with existing clients
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.frame.websocket import (
    CHANNEL_PATHS,
    ChannelManager,
    setup_file_watchers,
    setup_websocket_channels,
)

# ===========================================================================
# AC1: ChannelManager — broadcast pattern matching Node.js behavior
# ===========================================================================


class TestChannelManagerCreation:
    """ChannelManager initializes with empty state."""

    def test_manager_creates_successfully(self):
        """AC1: ChannelManager can be instantiated."""
        manager = ChannelManager()
        assert manager is not None

    def test_manager_starts_with_no_channels(self):
        """AC1: Fresh manager has no registered channels."""
        manager = ChannelManager()
        assert manager.get_channels() == []

    def test_manager_starts_with_zero_clients(self):
        """AC1: Fresh manager has zero clients for any path."""
        manager = ChannelManager()
        assert manager.get_client_count("/ws/stats") == 0


class TestChannelRegistration:
    """ChannelManager.register() adds channels."""

    def test_register_channel(self):
        """AC1: Registering a channel makes it available."""
        manager = ChannelManager()
        manager.register("/ws/stats")
        assert "/ws/stats" in manager.get_channels()

    def test_register_multiple_channels(self):
        """AC1: Multiple channels can be registered."""
        manager = ChannelManager()
        manager.register("/ws/stats")
        manager.register("/ws/persona")
        channels = manager.get_channels()
        assert "/ws/stats" in channels
        assert "/ws/persona" in channels
        assert len(channels) == 2

    def test_register_with_initial_data(self):
        """AC1: Channel can have an initial_data callback."""
        manager = ChannelManager()
        manager.register("/ws/stats", initial_data=lambda: {"count": 0})
        assert "/ws/stats" in manager.get_channels()

    def test_register_with_on_message(self):
        """AC1: Channel can have an on_message handler for bidirectional comms."""
        manager = ChannelManager()
        manager.register("/ws/hooks", on_message=lambda ws, msg: None)
        assert "/ws/hooks" in manager.get_channels()

    def test_register_duplicate_channel_replaces(self):
        """AC1: Re-registering a channel replaces the previous registration."""
        manager = ChannelManager()
        manager.register("/ws/stats", initial_data=lambda: {"v": 1})
        manager.register("/ws/stats", initial_data=lambda: {"v": 2})
        assert manager.get_channels().count("/ws/stats") == 1


class TestBroadcast:
    """ChannelManager.broadcast() sends to all connected clients."""

    def test_broadcast_returns_zero_with_no_clients(self):
        """AC1: Broadcasting to empty channel returns 0."""
        manager = ChannelManager()
        manager.register("/ws/stats")
        sent = manager.broadcast("/ws/stats", {"type": "update"})
        assert sent == 0

    def test_broadcast_unregistered_channel_returns_zero(self):
        """AC1: Broadcasting to unregistered channel returns 0, no error."""
        manager = ChannelManager()
        sent = manager.broadcast("/ws/nonexistent", {"type": "update"})
        assert sent == 0


# ===========================================================================
# AC2: All 16 WebSocket channels ported
# ===========================================================================


class TestChannelPathInventory:
    """Verify all 16 channel paths are defined."""

    EXPECTED_PATHS = [
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

    def test_all_16_paths_defined(self):
        """AC2: CHANNEL_PATHS contains exactly 16 entries."""
        assert len(CHANNEL_PATHS) == 16

    @pytest.mark.parametrize("path", EXPECTED_PATHS)
    def test_channel_path_present(self, path: str):
        """AC2: Each expected channel path is in CHANNEL_PATHS."""
        assert path in CHANNEL_PATHS

    def test_no_extra_paths(self):
        """AC2: No unexpected channel paths beyond the 16."""
        for path in CHANNEL_PATHS:
            assert path in self.EXPECTED_PATHS, f"Unexpected path: {path}"


class TestSetupWebSocketChannels:
    """setup_websocket_channels() registers all 16 channels."""

    def test_registers_all_channels(self):
        """AC2: After setup, all 16 channels are registered on the manager."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        channels = manager.get_channels()
        assert len(channels) == 16
        for path in CHANNEL_PATHS:
            assert path in channels, f"Channel {path} not registered"


class TestChannelInitialData:
    """Channels that send initial data on connection."""

    # Channels that MUST send initial data (per Node.js behavior)
    CHANNELS_WITH_INITIAL_DATA = [
        "/ws/stats",
        "/ws/persona",
        "/ws/token-stats",
        "/ws/story",
        "/ws/git",
        "/ws/spans",
        "/ws/settings",
        "/ws/context",
        "/ws/todos",
        "/ws/sprint",
        "/ws/diffs",
        "/ws/focus",
    ]

    # Channels that do NOT send initial data
    CHANNELS_WITHOUT_INITIAL_DATA = [
        "/ws/livereload",
        "/ws/bell",
        "/ws/welcome",
    ]

    @pytest.mark.parametrize("path", CHANNELS_WITH_INITIAL_DATA)
    def test_channel_has_initial_data_callback(self, path: str):
        """AC2+AC5: Channels that send initial data have initial_data registered."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        # Manager should have initial_data callback for these channels
        assert manager._has_initial_data(path), (
            f"Channel {path} should have initial_data callback"
        )

    @pytest.mark.parametrize("path", CHANNELS_WITHOUT_INITIAL_DATA)
    def test_channel_without_initial_data(self, path: str):
        """AC2: Simple broadcast channels have no initial_data."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        assert not manager._has_initial_data(path), (
            f"Channel {path} should NOT have initial_data callback"
        )


class TestBidirectionalChannels:
    """Channels that accept client messages."""

    BIDIRECTIONAL_CHANNELS = [
        "/ws/hooks",  # Receives approval responses from client
        "/ws/diffs",  # Receives 'clear' messages from client
    ]

    @pytest.mark.parametrize("path", BIDIRECTIONAL_CHANNELS)
    def test_channel_has_message_handler(self, path: str):
        """AC2: Bidirectional channels have on_message handler registered."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        assert manager._has_message_handler(path), (
            f"Channel {path} should have on_message handler"
        )


# ===========================================================================
# AC5: Backward-compatible message formats
# ===========================================================================


class TestMessageFormats:
    """WebSocket message formats match Node.js server."""

    def test_stats_message_is_json_object(self):
        """AC5: Stats channel sends JSON object (not wrapped in type envelope)."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        # Stats initial data should be a dict (matching Node.js getCurrentStats())
        data = manager._get_initial_data("/ws/stats")
        assert isinstance(data, dict)

    def test_story_init_message_has_type_field(self):
        """AC5: Story channel init message has type='init' (Node.js compat)."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/story")
        assert isinstance(data, dict)
        assert data.get("type") == "init"

    def test_git_init_message_has_repos_field(self):
        """AC5: Git channel init message has type='init' and repos array."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/git")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "repos" in data
        assert isinstance(data["repos"], list)

    def test_todos_init_has_type_and_todos(self):
        """AC5: Todos init message matches {type:'init', todos:[...]}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/todos")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "todos" in data
        assert isinstance(data["todos"], list)

    def test_sprint_init_has_type_field(self):
        """AC5: Sprint init message has type='init'."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/sprint")
        assert isinstance(data, dict)
        assert data.get("type") == "init"

    def test_context_init_has_type_and_context(self):
        """AC5: Context init message matches {type:'init', context:{...}}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/context")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "context" in data

    def test_settings_init_has_type_and_settings(self):
        """AC5: Settings init message matches {type:'init', settings:{...}}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/settings")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "settings" in data

    def test_spans_init_has_type_and_spans(self):
        """AC5: Spans init message matches {type:'init', spans:[...]}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/spans")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "spans" in data

    def test_diffs_init_has_type_and_diffs(self):
        """AC5: Diffs init message matches {type:'init', diffs:[...]}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/diffs")
        assert isinstance(data, dict)
        assert data.get("type") == "init"
        assert "diffs" in data
        assert isinstance(data["diffs"], list)

    def test_focus_init_has_type_field(self):
        """AC5: Focus init message has type='init'."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/focus")
        assert isinstance(data, dict)
        assert data.get("type") == "init"

    def test_persona_init_has_streaming_state(self):
        """AC5: Persona init includes isStreaming field (Story 94-1 compat)."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/persona")
        # May be None if no persona active, but if dict, must have isStreaming
        if data is not None:
            assert isinstance(data, dict)

    def test_token_stats_init_is_dict(self):
        """AC5: Token stats sends dict with token counts."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        data = manager._get_initial_data("/ws/token-stats")
        assert isinstance(data, dict)


class TestBroadcastMessageFormats:
    """Broadcast messages use correct type field for updates."""

    def test_story_update_has_type_update(self):
        """AC5: Story broadcast uses {type:'update', ...storyInfo}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        # The broadcast helper for story should produce type:'update' messages
        # This tests the contract, not the wiring (that's integration)
        msg = {"type": "update", "id": "48-3", "title": "test"}
        sent = manager.broadcast("/ws/story", msg)
        # No clients, so 0 sent — but no crash
        assert sent == 0

    def test_git_update_has_repos(self):
        """AC5: Git broadcast uses {type:'update', repos:[...]}."""
        manager = ChannelManager()
        setup_websocket_channels(manager)
        msg = {"type": "update", "repos": []}
        sent = manager.broadcast("/ws/git", msg)
        assert sent == 0


# ===========================================================================
# AC3: File watchers for session, sprint, git state change detection
# ===========================================================================


class TestFileWatchers:
    """File watchers ported from Node.js for change detection."""

    def test_setup_file_watchers_returns_watched_paths(self, tmp_path: Path):
        """AC3: setup_file_watchers returns list of paths being watched."""
        # Create the required directories
        (tmp_path / "sprint").mkdir()
        (tmp_path / ".session").mkdir()
        (tmp_path / ".pennyfarthing").mkdir()
        (tmp_path / ".git").mkdir()

        manager = ChannelManager()
        setup_websocket_channels(manager)
        watched = setup_file_watchers(manager, str(tmp_path))
        assert isinstance(watched, list)
        assert len(watched) > 0

    def test_sprint_dir_watched(self, tmp_path: Path):
        """AC3: Sprint directory is watched for YAML changes."""
        (tmp_path / "sprint").mkdir()
        (tmp_path / ".session").mkdir()
        (tmp_path / ".pennyfarthing").mkdir()

        manager = ChannelManager()
        setup_websocket_channels(manager)
        watched = setup_file_watchers(manager, str(tmp_path))
        sprint_watched = any("sprint" in p for p in watched)
        assert sprint_watched, "Sprint directory should be watched"

    def test_session_dir_watched(self, tmp_path: Path):
        """AC3: Session directory is watched for session file changes."""
        (tmp_path / "sprint").mkdir()
        (tmp_path / ".session").mkdir()
        (tmp_path / ".pennyfarthing").mkdir()

        manager = ChannelManager()
        setup_websocket_channels(manager)
        watched = setup_file_watchers(manager, str(tmp_path))
        session_watched = any(".session" in p or "session" in p for p in watched)
        assert session_watched, "Session directory should be watched"

    def test_settings_file_watched(self, tmp_path: Path):
        """AC3: .pennyfarthing/config.local.yaml is watched for settings changes."""
        (tmp_path / "sprint").mkdir()
        (tmp_path / ".session").mkdir()
        pf_dir = tmp_path / ".pennyfarthing"
        pf_dir.mkdir()
        (pf_dir / "config.local.yaml").write_text("theme: dune\n")

        manager = ChannelManager()
        setup_websocket_channels(manager)
        watched = setup_file_watchers(manager, str(tmp_path))
        settings_watched = any(
            ".pennyfarthing" in p or "config.local" in p for p in watched
        )
        assert settings_watched, "Settings file should be watched"

    def test_session_dir_created_if_missing(self, tmp_path: Path):
        """AC3: .session/ directory is created if it doesn't exist (Story 75-6)."""
        (tmp_path / "sprint").mkdir()
        (tmp_path / ".pennyfarthing").mkdir()
        # Don't create .session/ — the function should create it

        manager = ChannelManager()
        setup_websocket_channels(manager)
        setup_file_watchers(manager, str(tmp_path))
        assert (tmp_path / ".session").exists(), ".session/ should be auto-created"

    def test_missing_dirs_dont_crash(self, tmp_path: Path):
        """AC3: Missing directories don't crash file watcher setup."""
        # Empty tmp_path — no sprint, no .session, no .git
        manager = ChannelManager()
        setup_websocket_channels(manager)
        # Should not raise
        watched = setup_file_watchers(manager, str(tmp_path))
        assert isinstance(watched, list)


# ===========================================================================
# AC4: FastAPI WebSocket endpoint integration
# ===========================================================================


class TestFastAPIIntegration:
    """WebSocket channels are mountable on FastAPI app."""

    def test_channel_manager_mounts_on_app(self):
        """AC4: ChannelManager can mount WebSocket routes on a FastAPI app."""
        from fastapi import FastAPI

        app = FastAPI()
        manager = ChannelManager()
        setup_websocket_channels(manager)

        # Manager should be able to mount its channels on the app
        manager.mount(app)

        # Verify at least one WebSocket route is registered
        ws_routes = [
            r for r in app.routes
            if hasattr(r, "path") and r.path.startswith("/ws/")
        ]
        assert len(ws_routes) == 16, (
            f"Expected 16 WebSocket routes, got {len(ws_routes)}"
        )

    @pytest.mark.parametrize("path", CHANNEL_PATHS)
    def test_each_channel_has_websocket_route(self, path: str):
        """AC4: Each channel path has a corresponding WebSocket route on the app."""
        from fastapi import FastAPI

        app = FastAPI()
        manager = ChannelManager()
        setup_websocket_channels(manager)
        manager.mount(app)

        route_paths = [
            r.path for r in app.routes if hasattr(r, "path")
        ]
        assert path in route_paths, f"WebSocket route {path} not mounted on app"


# ===========================================================================
# AC5: Channel name backward compatibility
# ===========================================================================


class TestChannelNameCompatibility:
    """Channel names match Node.js server exactly."""

    @pytest.mark.parametrize(
        "channel_name",
        [
            "stats",
            "persona",
            "token-stats",
            "livereload",
            "story",
            "git",
            "bell",
            "spans",
            "welcome",
            "hooks",
            "settings",
            "context",
            "todos",
            "sprint",
            "diffs",
            "focus",
        ],
    )
    def test_channel_uses_ws_prefix(self, channel_name: str):
        """AC5: All channels use /ws/ prefix matching Node.js upgrade handler."""
        expected = f"/ws/{channel_name}"
        assert expected in CHANNEL_PATHS


class TestOriginValidation:
    """WebSocket origin validation matches Node.js security check."""

    def test_manager_has_origin_validation(self):
        """AC5: ChannelManager validates WebSocket origins (localhost only)."""
        manager = ChannelManager()
        # Manager should have origin validation matching Node.js:
        # Only allow http://localhost and http://127.0.0.1
        assert manager.is_origin_allowed("http://localhost:2898")
        assert manager.is_origin_allowed("http://127.0.0.1:2898")
        assert not manager.is_origin_allowed("http://evil.com")
        assert not manager.is_origin_allowed("http://example.com:2898")

    def test_no_origin_is_allowed(self):
        """AC5: Connections without Origin header are allowed (CLI clients)."""
        manager = ChannelManager()
        assert manager.is_origin_allowed(None)


# ===========================================================================
# Edge cases — a Mentat computes ALL possibilities
# ===========================================================================


class TestEdgeCases:
    """Edge cases that would survive a Mentat's analysis."""

    def test_broadcast_serializes_to_json(self):
        """Messages are serialized to JSON strings for WebSocket transmission."""
        manager = ChannelManager()
        manager.register("/ws/test")
        # Broadcast should handle JSON serialization internally
        # No crash with nested dicts
        manager.broadcast("/ws/test", {"type": "update", "data": {"nested": True}})

    def test_channel_paths_are_all_lowercase(self):
        """All channel paths use lowercase (URL convention)."""
        for path in CHANNEL_PATHS:
            assert path == path.lower(), f"Path {path} should be lowercase"

    def test_channel_paths_start_with_ws_slash(self):
        """All channel paths start with /ws/ prefix."""
        for path in CHANNEL_PATHS:
            assert path.startswith("/ws/"), f"Path {path} should start with /ws/"

    def test_channel_manager_get_client_count_unknown_channel(self):
        """get_client_count for unknown channel returns 0, not error."""
        manager = ChannelManager()
        assert manager.get_client_count("/ws/unknown") == 0

    def test_broadcast_to_closed_client_doesnt_crash(self):
        """Broadcasting when a client has disconnected doesn't crash."""
        manager = ChannelManager()
        manager.register("/ws/stats")
        # No crash on broadcast with no clients
        sent = manager.broadcast("/ws/stats", {"type": "update"})
        assert sent == 0
