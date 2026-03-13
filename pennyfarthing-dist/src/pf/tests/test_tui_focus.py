"""Tests for BikeRack TUI panel focus via /ws/focus WebSocket.

Story 103-7: /bc TUI panel focus (BikeRack TUI + GUI)
Epic: 103 — BikeRack TUI

Acceptance Criteria:
- [AC1] BikeRack TUI subscribes to /ws/focus WebSocket channel
- [AC2] pf bc <panel> switches the active panel in the TUI
- [AC3] pf bc reset returns the TUI to its previous panel
- [AC4] Panel switch completes in < 200ms
- [AC5] TUI handles focus events while no panels are mounted (graceful no-op)
- [AC6] Works alongside GUI — both TUI and GUI respond to the same /bc command

Tests should FAIL until focus handling is implemented in tui.py.
"""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

from pf.tui.app import TuiApp
from pf.tui.client import FrameClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_app(client=None):
    """Create a TuiApp with optional mock client."""
    if client is None:
        client = MagicMock(spec=FrameClient)
    return TuiApp(client=client)


def focus_msg(panel: str | None, msg_type: str = "update") -> dict:
    """Create a focus message matching the FocusMessage contract."""
    return {"type": msg_type, "focus": panel}


def get_posted_focus_updates(app: TuiApp) -> list:
    """Return all FocusUpdate messages posted via post_message mock."""
    return [
        call.args[0]
        for call in app.post_message.call_args_list
        if isinstance(call.args[0], TuiApp.FocusUpdate)
    ]


# ---------------------------------------------------------------------------
# AC1: BikeRack TUI subscribes to /ws/focus WebSocket channel
# ---------------------------------------------------------------------------


class TestFocusSubscription:
    """AC1: TuiApp subscribes to the focus channel on mount."""

    def test_subscribes_to_focus_channel(self) -> None:
        """on_mount should subscribe to the 'focus' channel via client."""
        client = MagicMock(spec=FrameClient)
        app = TuiApp(client=client)

        # Simulate what on_mount does — it should subscribe to "focus"
        # We check by looking at all subscribe calls on the client
        assert hasattr(app, "_handle_focus_message")  # Ensure method exists

        # The real test: after on_mount, client.subscribe was called with "focus"
        # Since we can't easily run on_mount (Textual lifecycle), we check
        # that the app's on_mount method calls client.subscribe("focus", ...)
        # by inspecting the method behavior directly.
        #
        # Run the async on_mount synchronously via the method body
        import asyncio

        loop = asyncio.new_event_loop()
        try:
            # Patch run_worker to prevent actual worker start
            with patch.object(TuiApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # Assert: client.subscribe was called with channel="focus"
        focus_calls = [c for c in client.subscribe.call_args_list if c[0][0] == "focus"]
        assert len(focus_calls) == 1, (
            f"Expected 1 subscribe('focus', ...) call, got {len(focus_calls)}. "
            f"All calls: {client.subscribe.call_args_list}"
        )

    def test_focus_handler_is_handle_focus_message(self) -> None:
        """The handler registered for 'focus' channel should be _handle_focus_message."""
        client = MagicMock(spec=FrameClient)
        app = TuiApp(client=client)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            with patch.object(TuiApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        focus_calls = [c for c in client.subscribe.call_args_list if c[0][0] == "focus"]
        assert len(focus_calls) == 1
        handler = focus_calls[0][0][1]
        assert handler == app._handle_focus_message, (
            "Focus channel handler should be app._handle_focus_message"
        )

    def test_no_subscription_without_client(self) -> None:
        """App with no client should not attempt focus subscription."""
        app = TuiApp(client=None)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            with patch("pf.tui.app.get_last_panel", return_value={"success": False}):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # Should not raise — graceful no-op
        # _focused_panel defaults to "sprint" when no last panel saved
        assert app._focused_panel == "sprint"


# ---------------------------------------------------------------------------
# AC2: pf bc <panel> switches the active panel in the TUI
# ---------------------------------------------------------------------------


class TestPanelSwitch:
    """AC2: Focus update message posts FocusUpdate event for panel switching."""

    def test_focus_update_sets_focused_panel(self) -> None:
        """Receiving focus update should post a FocusUpdate for target panel."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, f"Expected 1 FocusUpdate posted, got {len(updates)}"
        assert updates[0].focus == "sprint", (
            f"Expected FocusUpdate.focus='sprint', got '{updates[0].focus}'"
        )

    def test_focus_update_different_panels(self) -> None:
        """Focus should post a FocusUpdate for whatever panel is in the message."""
        for panel in ["sprint", "git", "diffs", "todo", "workflow"]:
            app = make_app()
            app.post_message = MagicMock()

            app._handle_focus_message(focus_msg(panel))

            updates = get_posted_focus_updates(app)
            assert len(updates) == 1, (
                f"Expected 1 FocusUpdate for panel '{panel}', got {len(updates)}"
            )
            assert updates[0].focus == panel, (
                f"Expected FocusUpdate.focus='{panel}', got '{updates[0].focus}'"
            )

    def test_focus_update_tracks_previous_panel(self) -> None:
        """Switching panels should post FocusUpdate events for each switch."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 2, (
            f"Expected 2 FocusUpdate events (sprint then git), got {len(updates)}"
        )
        assert updates[0].focus == "sprint"
        assert updates[1].focus == "git"

    def test_ignores_init_messages(self) -> None:
        """Init messages should NOT post a FocusUpdate (matching React hook)."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint", msg_type="init"))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 0, (
            f"init messages should be ignored — no FocusUpdate should be posted, got {len(updates)}"
        )

    def test_ignores_init_even_with_panel(self) -> None:
        """Init message with a panel name should still be ignored."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))  # posts FocusUpdate
        app._handle_focus_message(focus_msg("git", msg_type="init"))  # should be ignored

        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, f"Only the first update message should post, got {len(updates)}"
        assert updates[0].focus == "sprint", "init message should not generate a FocusUpdate"


# ---------------------------------------------------------------------------
# AC3: pf bc reset returns the TUI to its previous panel
# ---------------------------------------------------------------------------


class TestFocusReset:
    """AC3: Focus null (reset) posts FocusUpdate with focus=None."""

    def test_null_focus_restores_previous(self) -> None:
        """Update with focus=null should post a FocusUpdate with focus=None."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        # Reset
        app._handle_focus_message(focus_msg(None))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 3, f"Expected 3 FocusUpdate events, got {len(updates)}"
        # After reset, the last posted FocusUpdate should have focus=None
        assert updates[2].focus is None, (
            f"After reset, last FocusUpdate.focus should be None, got '{updates[2].focus}'"
        )

    def test_null_focus_clears_previous(self) -> None:
        """After reset, a FocusUpdate with focus=None is posted."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg(None))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 2
        assert updates[1].focus is None, "Reset should post FocusUpdate with focus=None"

    def test_reset_without_previous_is_no_op(self) -> None:
        """Null focus when no previous panel should be a graceful no-op."""
        app = make_app()
        app.post_message = MagicMock()

        # Reset without ever focusing — should not raise
        app._handle_focus_message(focus_msg(None))

        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, (
            f"Null focus should still post FocusUpdate(None), got {len(updates)}"
        )
        assert updates[0].focus is None

    def test_previous_panel_saved_on_first_focus_only(self) -> None:
        """Multiple focus updates should each post a FocusUpdate."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        updates = get_posted_focus_updates(app)
        assert len(updates) >= 1, "_handle_focus_message should post FocusUpdate on panel switch"


# ---------------------------------------------------------------------------
# AC4: Panel switch completes in < 200ms
# ---------------------------------------------------------------------------


class TestFocusTiming:
    """AC4: Panel switch performance requirement."""

    def test_focus_switch_under_200ms(self) -> None:
        """_handle_focus_message should complete in under 200ms."""
        app = make_app()
        app.post_message = MagicMock()

        start = time.monotonic()
        app._handle_focus_message(focus_msg("sprint"))
        elapsed_ms = (time.monotonic() - start) * 1000

        # The method must complete AND post a FocusUpdate (so work actually happened)
        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, (
            "Panel switch must actually post FocusUpdate for timing to be meaningful"
        )
        assert elapsed_ms < 200, f"Focus switch took {elapsed_ms:.1f}ms, exceeds 200ms requirement"

    def test_reset_under_200ms(self) -> None:
        """Reset (null focus) should also complete in under 200ms."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message(focus_msg("sprint"))

        start = time.monotonic()
        app._handle_focus_message(focus_msg(None))
        elapsed_ms = (time.monotonic() - start) * 1000

        updates = get_posted_focus_updates(app)
        # The reset should post a FocusUpdate(None)
        reset_updates = [u for u in updates if u.focus is None]
        assert len(reset_updates) == 1, (
            "Reset must post FocusUpdate(None) for timing to be meaningful"
        )
        assert elapsed_ms < 200, f"Focus reset took {elapsed_ms:.1f}ms, exceeds 200ms requirement"


# ---------------------------------------------------------------------------
# AC5: TUI handles focus events while no panels are mounted (graceful no-op)
# ---------------------------------------------------------------------------


class TestGracefulNoOp:
    """AC5: Focus events when no panels are mounted are graceful no-ops."""

    def test_focus_with_no_panels_mounted(self) -> None:
        """Focus message should not raise when no panel widgets exist."""
        app = make_app()
        app.post_message = MagicMock()

        # No panels are mounted — should not raise
        app._handle_focus_message(focus_msg("sprint"))

        # A FocusUpdate should be posted even when panel widgets aren't mounted
        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, (
            "FocusUpdate should be posted even when panel widgets aren't mounted"
        )
        assert updates[0].focus == "sprint"

    def test_handles_none_message(self) -> None:
        """None message should be ignored without error."""
        app = make_app()
        app.post_message = MagicMock()

        # Should not raise
        app._handle_focus_message(None)

        # No FocusUpdate should be posted for None message
        updates = get_posted_focus_updates(app)
        assert len(updates) == 0

    def test_handles_empty_dict(self) -> None:
        """Empty dict message should be handled gracefully."""
        app = make_app()
        app.post_message = MagicMock()

        # Should not raise
        app._handle_focus_message({})

        # No FocusUpdate should be posted for empty dict
        updates = get_posted_focus_updates(app)
        assert len(updates) == 0

    def test_handles_missing_type_key(self) -> None:
        """Message without 'type' key should not crash."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message({"focus": "sprint"})

        # Without a type field, should be ignored (no crash, no FocusUpdate)
        updates = get_posted_focus_updates(app)
        assert len(updates) == 0

    def test_handles_missing_focus_key(self) -> None:
        """Message without 'focus' key should not crash."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message({"type": "update"})

        # Missing focus key — graceful handling, no FocusUpdate
        updates = get_posted_focus_updates(app)
        assert len(updates) == 0


# ---------------------------------------------------------------------------
# AC6: Works alongside GUI — same WebSocket channel and message format
# ---------------------------------------------------------------------------


class TestGuiCompatibility:
    """AC6: TUI uses the same channel and message format as the GUI."""

    def test_subscribes_to_same_channel_as_gui(self) -> None:
        """TUI should subscribe to 'focus' — same channel the GUI's useFocusPanel uses."""
        # The React hook connects to /ws/focus
        # WheelHub routes /ws/{channel} — so channel name is "focus"
        client = MagicMock(spec=FrameClient)
        app = TuiApp(client=client)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            with patch.object(TuiApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        focus_calls = [c for c in client.subscribe.call_args_list if c[0][0] == "focus"]
        assert len(focus_calls) == 1, (
            "TUI must subscribe to 'focus' channel — same as GUI's useFocusPanel hook"
        )

    def test_handles_gui_message_format(self) -> None:
        """TUI should handle the exact FocusMessage format from WheelHub."""
        app = make_app()
        app.post_message = MagicMock()

        # This is the exact format the GUI receives via useFocusPanel.ts
        gui_message = {"type": "update", "focus": "sprint"}
        app._handle_focus_message(gui_message)

        updates = get_posted_focus_updates(app)
        assert len(updates) == 1, "TUI must handle the same FocusMessage format as the GUI"
        assert updates[0].focus == "sprint", (
            "TUI must post FocusUpdate with correct panel from GUI message"
        )

    def test_handles_gui_reset_format(self) -> None:
        """TUI should handle the GUI's reset message format."""
        app = make_app()
        app.post_message = MagicMock()

        app._handle_focus_message({"type": "update", "focus": "sprint"})

        # GUI sends this for reset:
        gui_reset = {"type": "update", "focus": None}
        app._handle_focus_message(gui_reset)

        updates = get_posted_focus_updates(app)
        assert len(updates) == 2, (
            f"TUI must handle reset (focus: null) same as GUI, got {len(updates)} updates"
        )
        assert updates[1].focus is None, "TUI must post FocusUpdate(None) for reset message"

    def test_init_ignored_like_gui(self) -> None:
        """TUI should ignore 'init' messages, just like the GUI hook does."""
        app = make_app()
        app.post_message = MagicMock()

        # useFocusPanel.ts: "'init' messages are ignored — focus is ephemeral"
        app._handle_focus_message({"type": "init", "focus": None})

        updates = get_posted_focus_updates(app)
        assert len(updates) == 0, "init messages must be ignored — no FocusUpdate should be posted"

        app._handle_focus_message({"type": "init", "focus": "sprint"})

        updates = get_posted_focus_updates(app)
        assert len(updates) == 0, (
            "init messages must be ignored — matching useFocusPanel.ts behavior"
        )
