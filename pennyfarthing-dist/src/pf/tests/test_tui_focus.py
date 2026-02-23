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

from pf.bikerack.tui import BikeRackApp
from pf.bikerack.ws_client import WheelHubClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_app(client=None):
    """Create a BikeRackApp with optional mock client."""
    if client is None:
        client = MagicMock(spec=WheelHubClient)
    return BikeRackApp(client=client)


def focus_msg(panel: str | None, msg_type: str = "update") -> dict:
    """Create a focus message matching the FocusMessage contract."""
    return {"type": msg_type, "focus": panel}


# ---------------------------------------------------------------------------
# AC1: BikeRack TUI subscribes to /ws/focus WebSocket channel
# ---------------------------------------------------------------------------


class TestFocusSubscription:
    """AC1: BikeRackApp subscribes to the focus channel on mount."""

    def test_subscribes_to_focus_channel(self) -> None:
        """on_mount should subscribe to the 'focus' channel via client."""
        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

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
            with patch.object(BikeRackApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # Assert: client.subscribe was called with channel="focus"
        focus_calls = [
            c for c in client.subscribe.call_args_list if c[0][0] == "focus"
        ]
        assert len(focus_calls) == 1, (
            f"Expected 1 subscribe('focus', ...) call, got {len(focus_calls)}. "
            f"All calls: {client.subscribe.call_args_list}"
        )

    def test_focus_handler_is_handle_focus_message(self) -> None:
        """The handler registered for 'focus' channel should be _handle_focus_message."""
        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            with patch.object(BikeRackApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        focus_calls = [
            c for c in client.subscribe.call_args_list if c[0][0] == "focus"
        ]
        assert len(focus_calls) == 1
        handler = focus_calls[0][0][1]
        assert handler == app._handle_focus_message, (
            "Focus channel handler should be app._handle_focus_message"
        )

    def test_no_subscription_without_client(self) -> None:
        """App with no client should not attempt focus subscription."""
        app = BikeRackApp(client=None)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        # Should not raise — graceful no-op
        assert app._focused_panel is None


# ---------------------------------------------------------------------------
# AC2: pf bc <panel> switches the active panel in the TUI
# ---------------------------------------------------------------------------


class TestPanelSwitch:
    """AC2: Focus update message switches the active panel."""

    def test_focus_update_sets_focused_panel(self) -> None:
        """Receiving focus update should set _focused_panel to target panel."""
        app = make_app()

        app._handle_focus_message(focus_msg("sprint"))

        assert app._focused_panel == "sprint", (
            f"Expected _focused_panel='sprint', got '{app._focused_panel}'"
        )

    def test_focus_update_different_panels(self) -> None:
        """Focus should track whatever panel is in the message."""
        app = make_app()

        for panel in ["sprint", "git", "diffs", "todo", "workflow"]:
            app._handle_focus_message(focus_msg(panel))
            assert app._focused_panel == panel, (
                f"Expected _focused_panel='{panel}', got '{app._focused_panel}'"
            )

    def test_focus_update_tracks_previous_panel(self) -> None:
        """Switching panels should save the previous panel."""
        app = make_app()

        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        assert app._previous_panel == "sprint", (
            f"Expected _previous_panel='sprint' after switching to 'git', "
            f"got '{app._previous_panel}'"
        )

    def test_ignores_init_messages(self) -> None:
        """Init messages should NOT change focused panel (matching React hook)."""
        app = make_app()

        app._handle_focus_message(focus_msg("sprint", msg_type="init"))

        assert app._focused_panel is None, (
            "init messages should be ignored — focus is ephemeral, not persistent"
        )

    def test_ignores_init_even_with_panel(self) -> None:
        """Init message with a panel name should still be ignored."""
        app = make_app()
        app._handle_focus_message(focus_msg("sprint"))  # Set a focus first

        app._handle_focus_message(focus_msg("git", msg_type="init"))

        assert app._focused_panel == "sprint", (
            "init message should not override existing focus"
        )


# ---------------------------------------------------------------------------
# AC3: pf bc reset returns the TUI to its previous panel
# ---------------------------------------------------------------------------


class TestFocusReset:
    """AC3: Focus null (reset) restores the previous panel."""

    def test_null_focus_restores_previous(self) -> None:
        """Update with focus=null should restore the previous panel."""
        app = make_app()
        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        # Reset
        app._handle_focus_message(focus_msg(None))

        # After reset, the focused_panel should reflect restoration
        # to the state before focus mode
        assert app._focused_panel is None, (
            "After reset, _focused_panel should be None (not in focus mode)"
        )

    def test_null_focus_clears_previous(self) -> None:
        """After reset, _previous_panel should be cleared."""
        app = make_app()
        app._handle_focus_message(focus_msg("sprint"))

        app._handle_focus_message(focus_msg(None))

        assert app._previous_panel is None, (
            "After reset, _previous_panel should be cleared"
        )

    def test_reset_without_previous_is_no_op(self) -> None:
        """Null focus when no previous panel should be a graceful no-op."""
        app = make_app()

        # Reset without ever focusing — should not raise
        app._handle_focus_message(focus_msg(None))

        assert app._focused_panel is None
        assert app._previous_panel is None

    def test_previous_panel_saved_on_first_focus_only(self) -> None:
        """Previous panel ref should be stashed on first focus, not overwritten."""
        app = make_app()

        # Simulate: no panel active, then focus sprint, then focus git
        app._handle_focus_message(focus_msg("sprint"))
        app._handle_focus_message(focus_msg("git"))

        # _previous_panel should still point to what was active before
        # the first focus switch (stash pattern from useFocusPanel.ts)
        assert app._previous_panel is not None, (
            "_previous_panel should be set after panel switch"
        )


# ---------------------------------------------------------------------------
# AC4: Panel switch completes in < 200ms
# ---------------------------------------------------------------------------


class TestFocusTiming:
    """AC4: Panel switch performance requirement."""

    def test_focus_switch_under_200ms(self) -> None:
        """_handle_focus_message should complete in under 200ms."""
        app = make_app()

        start = time.monotonic()
        app._handle_focus_message(focus_msg("sprint"))
        elapsed_ms = (time.monotonic() - start) * 1000

        # The method must complete AND actually do work (set _focused_panel)
        assert app._focused_panel == "sprint", (
            "Panel switch must actually happen for timing to be meaningful"
        )
        assert elapsed_ms < 200, (
            f"Focus switch took {elapsed_ms:.1f}ms, exceeds 200ms requirement"
        )

    def test_reset_under_200ms(self) -> None:
        """Reset (null focus) should also complete in under 200ms."""
        app = make_app()
        app._handle_focus_message(focus_msg("sprint"))

        start = time.monotonic()
        app._handle_focus_message(focus_msg(None))
        elapsed_ms = (time.monotonic() - start) * 1000

        assert app._focused_panel is None, (
            "Reset must actually clear focus for timing to be meaningful"
        )
        assert elapsed_ms < 200, (
            f"Focus reset took {elapsed_ms:.1f}ms, exceeds 200ms requirement"
        )


# ---------------------------------------------------------------------------
# AC5: TUI handles focus events while no panels are mounted (graceful no-op)
# ---------------------------------------------------------------------------


class TestGracefulNoOp:
    """AC5: Focus events when no panels are mounted are graceful no-ops."""

    def test_focus_with_no_panels_mounted(self) -> None:
        """Focus message should not raise when no panel widgets exist."""
        app = make_app()

        # No panels are mounted — should not raise
        app._handle_focus_message(focus_msg("sprint"))

        # Even though no panel widget exists, the tracking state should update
        assert app._focused_panel == "sprint", (
            "Focus state should track even when panel widgets aren't mounted"
        )

    def test_handles_none_message(self) -> None:
        """None message should be ignored without error."""
        app = make_app()

        # Should not raise
        app._handle_focus_message(None)

        assert app._focused_panel is None

    def test_handles_empty_dict(self) -> None:
        """Empty dict message should be handled gracefully."""
        app = make_app()

        # Should not raise
        app._handle_focus_message({})

        assert app._focused_panel is None

    def test_handles_missing_type_key(self) -> None:
        """Message without 'type' key should not crash."""
        app = make_app()

        app._handle_focus_message({"focus": "sprint"})

        # Without a type field, should be ignored (no crash)
        assert app._focused_panel is None

    def test_handles_missing_focus_key(self) -> None:
        """Message without 'focus' key should not crash."""
        app = make_app()

        app._handle_focus_message({"type": "update"})

        # Missing focus key — graceful handling
        assert app._focused_panel is None


# ---------------------------------------------------------------------------
# AC6: Works alongside GUI — same WebSocket channel and message format
# ---------------------------------------------------------------------------


class TestGuiCompatibility:
    """AC6: TUI uses the same channel and message format as the GUI."""

    def test_subscribes_to_same_channel_as_gui(self) -> None:
        """TUI should subscribe to 'focus' — same channel the GUI's useFocusPanel uses."""
        # The React hook connects to /ws/focus
        # WheelHub routes /ws/{channel} — so channel name is "focus"
        client = MagicMock(spec=WheelHubClient)
        app = BikeRackApp(client=client)

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            with patch.object(BikeRackApp, "run_worker"):
                loop.run_until_complete(app.on_mount())
        finally:
            loop.close()

        focus_calls = [
            c for c in client.subscribe.call_args_list if c[0][0] == "focus"
        ]
        assert len(focus_calls) == 1, (
            "TUI must subscribe to 'focus' channel — same as GUI's useFocusPanel hook"
        )

    def test_handles_gui_message_format(self) -> None:
        """TUI should handle the exact FocusMessage format from WheelHub."""
        app = make_app()

        # This is the exact format the GUI receives via useFocusPanel.ts
        gui_message = {"type": "update", "focus": "sprint"}
        app._handle_focus_message(gui_message)

        assert app._focused_panel == "sprint", (
            "TUI must handle the same FocusMessage format as the GUI"
        )

    def test_handles_gui_reset_format(self) -> None:
        """TUI should handle the GUI's reset message format."""
        app = make_app()
        app._handle_focus_message({"type": "update", "focus": "sprint"})

        # GUI sends this for reset:
        gui_reset = {"type": "update", "focus": None}
        app._handle_focus_message(gui_reset)

        assert app._focused_panel is None, (
            "TUI must handle reset (focus: null) same as GUI"
        )

    def test_init_ignored_like_gui(self) -> None:
        """TUI should ignore 'init' messages, just like the GUI hook does."""
        app = make_app()

        # useFocusPanel.ts: "'init' messages are ignored — focus is ephemeral"
        app._handle_focus_message({"type": "init", "focus": None})

        assert app._focused_panel is None

        app._handle_focus_message({"type": "init", "focus": "sprint"})

        assert app._focused_panel is None, (
            "init messages must be ignored — matching useFocusPanel.ts behavior"
        )
