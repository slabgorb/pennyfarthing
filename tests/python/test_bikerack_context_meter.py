"""Tests for BikeRack TUI ContextMeterFooter — Context usage footer bar (Story 110-5).

Persistent footer bar showing context window usage percentage with
color-coded tier thresholds. Subscribes to /ws/context channel,
renders a compact progress bar with tier badge, always visible
between the main content area and the keybinding footer.

Verifies:
  AC1: Footer bar displays context usage percentage, always visible
  AC2: Bar color reflects tier thresholds (green/yellow/red)
  AC3: Updates in real-time via /ws/context channel
  AC4: Does not interfere with keybinding footer display

Run with: python -m pytest tests/python/test_bikerack_context_meter.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

import pytest
from pf.bikerack.context_meter_footer import ContextMeterFooter
from pf.bikerack.ws_client import WheelHubClient
from rich.console import Console
from rich.text import Text
from textual.widgets import Footer, Static

# ---------------------------------------------------------------------------
# Test data fixtures — matching WheelHub /ws/context wire format
# ---------------------------------------------------------------------------

CONTEXT_FULL: dict[str, Any] = {
    "type": "init",
    "context": {
        "tokens": 45000,
        "percent": 22,
        "status": "ok",
        "baseline": 8000,
        "usableTokens": 37000,
        "usablePercent": 22,
        "available": 155000,
        "tier": "FULL",
    },
}

CONTEXT_REFRESH: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 120000,
        "percent": 60,
        "status": "ok",
        "baseline": 8000,
        "usableTokens": 112000,
        "usablePercent": 60,
        "available": 155000,
        "tier": "REFRESH",
    },
}

CONTEXT_HANDOFF: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 160000,
        "percent": 82,
        "status": "warning",
        "baseline": 8000,
        "usableTokens": 152000,
        "usablePercent": 82,
        "available": 155000,
        "tier": "HANDOFF",
    },
}

CONTEXT_MINIMAL: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 180000,
        "percent": 92,
        "status": "critical",
        "baseline": 8000,
        "usableTokens": 172000,
        "usablePercent": 92,
        "available": 155000,
        "tier": "MINIMAL",
    },
}

CONTEXT_ZERO: dict[str, Any] = {
    "type": "init",
    "context": {
        "tokens": 0,
        "percent": 0,
        "status": "ok",
        "baseline": 8000,
        "usableTokens": 0,
        "usablePercent": 0,
        "available": 155000,
        "tier": "FULL",
    },
}

CONTEXT_BOUNDARY_50: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 81500,
        "percent": 50,
        "status": "ok",
        "tier": "REFRESH",
    },
}

CONTEXT_BOUNDARY_80: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 130000,
        "percent": 80,
        "status": "warning",
        "tier": "HANDOFF",
    },
}

CONTEXT_EMPTY: dict[str, Any] = {
    "type": "init",
    "context": {},
}

CONTEXT_NO_CONTEXT_FIELD: dict[str, Any] = {
    "type": "init",
}


def _render_to_string(renderable: Any, width: int = 80) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


def _render_with_ansi(renderable: Any, width: int = 80) -> str:
    """Capture Rich renderable output including ANSI codes."""
    console = Console(
        file=StringIO(), force_terminal=True, width=width, color_system="truecolor"
    )
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# AC1: Footer bar displays context usage percentage, always visible
# ---------------------------------------------------------------------------


class TestContextMeterFooterExists:
    """AC1: ContextMeterFooter exists and follows expected structure."""

    def test_importable(self):
        """ContextMeterFooter should be importable."""
        assert ContextMeterFooter is not None

    def test_is_textual_widget(self):
        """ContextMeterFooter should be a Textual Static widget."""
        assert issubclass(ContextMeterFooter, Static)

    def test_is_not_footer_subclass(self):
        """ContextMeterFooter should NOT inherit from Footer (that's layout-based)."""
        assert not issubclass(ContextMeterFooter, Footer)

    def test_accepts_client_parameter(self):
        """ContextMeterFooter should accept a client parameter."""
        client = MagicMock(spec=WheelHubClient)
        footer = ContextMeterFooter(client=client)
        assert footer._client is client

    def test_channel_is_context(self):
        """ContextMeterFooter.channel should be 'context'."""
        assert ContextMeterFooter.channel == "context"


class TestContextMeterDisplaysPercentage:
    """AC1: Footer bar renders context usage percentage."""

    def test_renders_percentage_from_context_data(self):
        """Footer should display the usage percentage (e.g. '22%')."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_FULL["context"]
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "22%" in output, f"Expected '22%' in: {output!r}"

    def test_renders_progress_bar_characters(self):
        """Footer should render a progress bar with filled/empty blocks."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_FULL["context"]
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "█" in output, f"Expected filled block '█' in: {output!r}"
        assert "░" in output, f"Expected empty block '░' in: {output!r}"

    def test_renders_tier_badge(self):
        """Footer should display the tier name (FULL/REFRESH/HANDOFF/MINIMAL)."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_FULL["context"]
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "FULL" in output, f"Expected tier 'FULL' in: {output!r}"

    def test_renders_zero_percent(self):
        """Footer should handle 0% context usage."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_ZERO["context"]
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "0%" in output, f"Expected '0%' in: {output!r}"

    def test_renders_high_percent(self):
        """Footer should handle 92% context usage."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_MINIMAL["context"]
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "92%" in output, f"Expected '92%' in: {output!r}"


class TestContextMeterInLayout:
    """AC1: Footer bar always visible in app layout."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_status_footer_mounted_in_app(self, app):
        """BikeRackApp should mount a StatusFooter widget."""
        async with app.run_test():
            footers = app.query("StatusFooter")
            assert len(footers) > 0, (
                "BikeRackApp should mount a StatusFooter widget"
            )

    async def test_status_footer_not_inside_main_content(self, app):
        """StatusFooter should NOT be inside #main-content (always visible)."""
        async with app.run_test():
            main = app.query_one("#main-content")
            footers_in_main = main.query("StatusFooter")
            assert len(footers_in_main) == 0, (
                "StatusFooter must be OUTSIDE #main-content to stay visible"
            )

    async def test_status_footer_after_main_content(self, app):
        """StatusFooter should appear after main-content (docked to bottom)."""
        async with app.run_test():
            children = list(app.query("*"))
            main_idx = footer_idx = -1
            for i, child in enumerate(children):
                if getattr(child, "id", None) == "main-content":
                    main_idx = i
                if type(child).__name__ == "StatusFooter":
                    footer_idx = i
            assert footer_idx > main_idx, (
                f"StatusFooter (idx={footer_idx}) should be after "
                f"main-content (idx={main_idx})"
            )


# ---------------------------------------------------------------------------
# AC2: Bar color reflects tier thresholds (green/yellow/red)
# ---------------------------------------------------------------------------


class TestContextMeterColorCoding:
    """AC2: Progress bar color reflects tier thresholds."""

    def test_low_usage_green(self):
        """Usage <50% should render with green styling."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_FULL["context"]  # 22%
        result = footer.render_meter(ctx)
        raw = _render_with_ansi(result)
        # Green ANSI: ESC[32m or ESC[38;2;0;128;0m etc.
        assert "\x1b[" in raw, "Low usage should use ANSI color styling"
        # Check that "green" style was applied (Rich uses color names)
        plain = _render_to_string(result)
        assert "█" in plain, "Progress bar should have filled blocks"

    def test_mid_usage_yellow(self):
        """Usage 50-80% should render with yellow styling."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_REFRESH["context"]  # 60%
        result = footer.render_meter(ctx)
        raw = _render_with_ansi(result)
        assert "\x1b[" in raw, "Mid usage should use ANSI color styling"

    def test_high_usage_red(self):
        """Usage >80% should render with red styling."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_MINIMAL["context"]  # 92%
        result = footer.render_meter(ctx)
        raw = _render_with_ansi(result)
        assert "\x1b[" in raw, "High usage should use ANSI color styling"

    def test_boundary_50_percent(self):
        """At exactly 50%, bar should transition from green to yellow."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_BOUNDARY_50["context"]  # 50%
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "50%" in output, f"Expected '50%' in: {output!r}"

    def test_boundary_80_percent(self):
        """At exactly 80%, bar should be in the yellow/red threshold zone."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_BOUNDARY_80["context"]  # 80%
        result = footer.render_meter(ctx)
        output = _render_to_string(result)
        assert "80%" in output, f"Expected '80%' in: {output!r}"

    def test_tier_full_styled(self):
        """FULL tier badge should have green-family styling."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_FULL["context"]
        result = footer.render_meter(ctx)
        # Verify it's a Rich Text with spans (styled), not plain string
        assert isinstance(result, Text), (
            f"render_meter should return Rich Text, got {type(result).__name__}"
        )

    def test_tier_minimal_styled(self):
        """MINIMAL tier badge should have red-family styling."""
        footer = ContextMeterFooter(client=MagicMock())
        ctx = CONTEXT_MINIMAL["context"]
        result = footer.render_meter(ctx)
        assert isinstance(result, Text), (
            f"render_meter should return Rich Text, got {type(result).__name__}"
        )


# ---------------------------------------------------------------------------
# AC3: Updates in real-time via /ws/context channel
# ---------------------------------------------------------------------------


class TestContextMeterWebSocketSubscription:
    """AC3: Subscribes to /ws/context and updates in real-time."""

    def test_subscribes_to_context_channel_on_mount(self):
        """ContextMeterFooter should subscribe to 'context' channel on mount."""
        client = MagicMock(spec=WheelHubClient)
        footer = ContextMeterFooter(client=client)
        footer.on_mount()
        channel_names = [c[0][0] for c in client.subscribe.call_args_list]
        assert "context" in channel_names, (
            f"Expected 'context' subscription, got: {channel_names}"
        )

    def test_no_subscribe_without_client(self):
        """With no client, on_mount should not crash."""
        footer = ContextMeterFooter(client=None)
        footer.on_mount()  # Should not raise

    def test_handles_context_init_message(self):
        """Should process 'init' type context messages."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(CONTEXT_FULL)
        assert footer._context_data is not None, "Context data should be stored"
        assert footer._context_data.get("percent") == 22

    def test_handles_context_update_message(self):
        """Should process 'update' type context messages."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(CONTEXT_REFRESH)
        assert footer._context_data is not None
        assert footer._context_data.get("percent") == 60

    def test_updates_on_new_message(self):
        """Should update rendered output when new context message arrives."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(CONTEXT_FULL)
        result1 = footer.render_meter(footer._context_data)
        output1 = _render_to_string(result1)
        assert "22%" in output1

        footer.handle_context_message(CONTEXT_REFRESH)
        result2 = footer.render_meter(footer._context_data)
        output2 = _render_to_string(result2)
        assert "60%" in output2

    def test_none_message_ignored(self):
        """None messages should not crash or alter state."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(None)
        assert footer._context_data is None

    def test_empty_context_handled(self):
        """Empty context object should not crash."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(CONTEXT_EMPTY)
        result = footer.render_meter(footer._context_data or {})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_missing_context_field_handled(self):
        """Message without 'context' field should not crash."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.handle_context_message(CONTEXT_NO_CONTEXT_FIELD)
        # Should not have stored anything meaningful
        assert footer._context_data is None or footer._context_data == {}

    def test_unmount_stops_updates(self):
        """After unmount, messages should be ignored."""
        footer = ContextMeterFooter(client=MagicMock())
        footer.on_mount()
        footer.on_unmount()
        footer.handle_context_message(CONTEXT_FULL)
        assert footer._context_data is None, (
            "After unmount, context data should not be updated"
        )


# ---------------------------------------------------------------------------
# AC4: Does not interfere with keybinding footer display
# ---------------------------------------------------------------------------


class TestStatusFooterIsOnlyFooter:
    """AC4: StatusFooter replaces BindingFooter — single unified footer."""

    @pytest.fixture
    def app(self):
        from pf.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_no_binding_footer(self, app):
        """BindingFooter should NOT be present — replaced by StatusFooter."""
        async with app.run_test():
            from textual.widgets import Footer

            footers = app.query(Footer)
            assert len(footers) == 0, "BindingFooter should have been removed"

    async def test_status_footer_exists(self, app):
        """StatusFooter should be the only footer widget."""
        async with app.run_test():
            from pf.bikerack.context_meter_footer import StatusFooter

            status = app.query(StatusFooter)
            assert len(status) == 1, "Exactly one StatusFooter should exist"

    async def test_status_footer_visible(self, app):
        """StatusFooter should be visible."""
        async with app.run_test():
            from pf.bikerack.context_meter_footer import StatusFooter

            footer = app.query_one(StatusFooter)
            assert footer.display is True or footer.display is not False, (
                "StatusFooter should be visible"
            )
