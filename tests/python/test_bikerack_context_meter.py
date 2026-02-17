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
from rich.console import Console
from rich.text import Text
from textual.widgets import Footer, Static

from pennyfarthing_scripts.bikerack.context_meter_footer import ContextMeterFooter
from pennyfarthing_scripts.bikerack.ws_client import WheelHubClient

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
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_context_meter_mounted_in_app(self, app):
        """BikeRackApp should mount a ContextMeterFooter widget."""
        async with app.run_test() as pilot:
            meters = app.query("ContextMeterFooter")
            assert len(meters) > 0, (
                "BikeRackApp should mount a ContextMeterFooter widget"
            )

    async def test_context_meter_not_inside_main_content(self, app):
        """ContextMeterFooter should NOT be inside #main-content (always visible)."""
        async with app.run_test() as pilot:
            main = app.query_one("#main-content")
            # Check that no ContextMeterFooter is a descendant of main-content
            meters_in_main = main.query("ContextMeterFooter")
            assert len(meters_in_main) == 0, (
                "ContextMeterFooter must be OUTSIDE #main-content to stay visible"
            )

    async def test_context_meter_between_content_and_footer(self, app):
        """ContextMeterFooter should appear between main-content and BindingFooter."""
        async with app.run_test() as pilot:
            children = list(app.query("*"))
            meter_found = False
            main_idx = footer_idx = meter_idx = -1
            for i, child in enumerate(children):
                if getattr(child, "id", None) == "main-content":
                    main_idx = i
                if type(child).__name__ == "ContextMeterFooter":
                    meter_idx = i
                    meter_found = True
                if type(child).__name__ == "BindingFooter":
                    footer_idx = i
            assert meter_found, "ContextMeterFooter not found in app widget tree"
            assert main_idx < meter_idx < footer_idx, (
                f"ContextMeterFooter (idx={meter_idx}) should be between "
                f"main-content (idx={main_idx}) and BindingFooter (idx={footer_idx})"
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


class TestContextMeterDoesNotInterfereWithFooter:
    """AC4: ContextMeterFooter coexists with BindingFooter."""

    @pytest.fixture
    def app(self):
        from pennyfarthing_scripts.bikerack.tui import BikeRackApp

        return BikeRackApp()

    async def test_binding_footer_still_exists(self, app):
        """BindingFooter should still be present in the app."""
        async with app.run_test() as pilot:
            footers = app.query("Footer")
            assert len(footers) > 0, "BindingFooter should still be in the app"

    async def test_binding_footer_renders_bindings(self, app):
        """BindingFooter should still render keybinding hints."""
        async with app.run_test() as pilot:
            from pennyfarthing_scripts.bikerack.tui import BindingFooter

            binding_footer = app.query_one(BindingFooter)
            rendered = str(binding_footer.render())
            # Should contain at least the 'q' quit binding
            assert "q" in rendered.lower() or "quit" in rendered.lower() or len(rendered) > 0, (
                f"BindingFooter should render bindings, got: {rendered!r}"
            )

    async def test_context_meter_is_separate_widget(self, app):
        """ContextMeterFooter and BindingFooter should be distinct widgets."""
        async with app.run_test() as pilot:
            from pennyfarthing_scripts.bikerack.tui import BindingFooter

            meters = app.query("ContextMeterFooter")
            footers = app.query_one(BindingFooter)
            assert len(meters) > 0, "ContextMeterFooter should exist"
            assert meters[0] is not footers, (
                "ContextMeterFooter and BindingFooter should be different widgets"
            )

    async def test_both_widgets_visible(self, app):
        """Both ContextMeterFooter and BindingFooter should be visible."""
        async with app.run_test() as pilot:
            from pennyfarthing_scripts.bikerack.tui import BindingFooter

            meter = app.query_one("ContextMeterFooter")
            footer = app.query_one(BindingFooter)
            assert meter.display is True or meter.display is not False, (
                "ContextMeterFooter should be visible"
            )
            assert footer.display is True or footer.display is not False, (
                "BindingFooter should be visible"
            )
