"""Tests for Frame TUI TUI DebugPanel — Context usage and token stats (Story 103-17).

Port of the React DebugPanel to Frame TUI TUI. The React DebugPanel
(packages/core/src/public/components/panels/DebugPanel.tsx) displays
context usage, tier badges, and token stats via /ws/context and
/ws/token-stats channels.

Verifies:
  AC1: DebugPanel extends BasePanel, registered in Frame TUI TUI
  AC2: Subscribes to /ws/context — displays tokens, percent, tier
  AC3: Subscribes to /ws/token-stats — displays input/output/cache/cost
  AC4: Tier badge with color coding
  AC5: Token stats formatted with locale separators
  AC6: Empty states for missing data
  AC7: Handles malformed/missing data gracefully

Run with: python -m pytest tests/python/test_tui_debug_panel.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from pf.tui.base_panel import PANEL_ICONS, BasePanel
from pf.tui.client import FrameClient

# Import the panel under test — will fail until implemented
from pf.tui.debug_panel import DebugPanel
from rich.console import Console
from textual.widgets import Static

# ---------------------------------------------------------------------------
# Test data fixtures — matching Frame wire formats
# ---------------------------------------------------------------------------

SAMPLE_CONTEXT_INIT: dict[str, Any] = {
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
        "tokenCounts": {
            "agent_definition": 1200,
            "behavior_guide": 800,
            "persona_compressed": 400,
            "session_header": 300,
        },
        "totalTokens": 2700,
    },
}

SAMPLE_CONTEXT_REFRESH: dict[str, Any] = {
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

SAMPLE_CONTEXT_MINIMAL: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 180000,
        "percent": 90,
        "status": "critical",
        "baseline": 8000,
        "usableTokens": 172000,
        "usablePercent": 90,
        "available": 155000,
        "tier": "MINIMAL",
    },
}

SAMPLE_CONTEXT_NO_TIER: dict[str, Any] = {
    "type": "init",
    "context": {
        "tokens": 10000,
        "percent": 5,
        "status": "ok",
    },
}

SAMPLE_TOKEN_STATS: dict[str, Any] = {
    "type": "init",
    "inputTokens": 25000,
    "outputTokens": 12000,
    "cacheReadTokens": 8500,
    "cacheCreationTokens": 3200,
    # Wire key is "totalCost" — see frame/otlp.py:OTLPReceiver and
    # frame/websocket.py:_default_token_stats_data. "totalCostUsd" was never
    # emitted by the producer.
    "totalCost": 0.1234,
}

SAMPLE_TOKEN_STATS_PARTIAL: dict[str, Any] = {
    "type": "init",
    "inputTokens": 5000,
    "outputTokens": 2000,
}

SAMPLE_EMPTY_CONTEXT: dict[str, Any] = {
    "type": "init",
    "context": {},
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


def _render_with_ansi(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output including ANSI codes."""
    console = Console(
        file=StringIO(), force_terminal=True, width=width, color_system="truecolor"
    )
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# AC1: DebugPanel extends BasePanel, registered in Frame TUI TUI
# ---------------------------------------------------------------------------


class TestDebugPanelExists:
    """AC1: DebugPanel implementation exists and follows BasePanel pattern."""

    def test_debug_panel_exists_and_importable(self):
        """DebugPanel should be importable from tui.debug_panel."""
        assert DebugPanel is not None

    def test_inherits_from_base_panel(self):
        """DebugPanel should inherit from BasePanel."""
        assert issubclass(DebugPanel, BasePanel)

    def test_is_textual_widget(self):
        """DebugPanel should be a Textual widget (subclass of Static)."""
        assert issubclass(DebugPanel, Static)

    def test_channel_is_context(self):
        """DebugPanel.channel should be 'context' (primary channel)."""
        assert DebugPanel.channel == "context"

    def test_panel_name_is_debug(self):
        """DebugPanel.panel_name should be 'Debug'."""
        assert DebugPanel.panel_name == "Debug"

    def test_has_icon_from_registry(self):
        """DebugPanel.icon should match the PANEL_ICONS registry."""
        assert DebugPanel.icon == PANEL_ICONS["debug"][0]


# ---------------------------------------------------------------------------
# AC2: Subscribes to /ws/context — displays tokens, percent, tier
# ---------------------------------------------------------------------------


class TestDebugPanelContextSubscription:
    """AC2: DebugPanel subscribes to /ws/context channel."""

    def test_subscribes_to_context_channel_on_mount(self):
        """DebugPanel should subscribe to 'context' channel on mount."""
        client = MagicMock(spec=FrameClient)
        panel = DebugPanel(client=client)
        panel.on_mount()
        # Should subscribe to at least 'context'
        channel_names = [c[0][0] for c in client.subscribe.call_args_list]
        assert "context" in channel_names

    def test_context_data_renders_tokens(self):
        """Context data should show token count."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "45" in output, f"Token count 45,000 not found in: {output!r}"

    def test_context_data_renders_percent(self):
        """Context data should show usage percentage."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "22%" in output, f"Percentage '22%' not found in: {output!r}"

    def test_context_data_renders_tier(self):
        """Context data should show the current tier."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, f"Tier 'FULL' not found in: {output!r}"


# ---------------------------------------------------------------------------
# AC3: Subscribes to /ws/token-stats — displays input/output/cache/cost
# ---------------------------------------------------------------------------


class TestDebugPanelTokenStatsSubscription:
    """AC3: DebugPanel subscribes to /ws/token-stats channel."""

    def test_subscribes_to_token_stats_channel_on_mount(self):
        """DebugPanel should subscribe to 'token-stats' channel on mount."""
        client = MagicMock(spec=FrameClient)
        panel = DebugPanel(client=client)
        panel.on_mount()
        channel_names = [c[0][0] for c in client.subscribe.call_args_list]
        assert "token-stats" in channel_names

    def test_subscribes_to_both_channels(self):
        """DebugPanel should subscribe to both 'context' and 'token-stats'."""
        client = MagicMock(spec=FrameClient)
        panel = DebugPanel(client=client)
        panel.on_mount()
        channel_names = [c[0][0] for c in client.subscribe.call_args_list]
        assert "context" in channel_names
        assert "token-stats" in channel_names

    def test_token_stats_renders_input_tokens(self):
        """Token stats should show input token count."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "25" in output, f"Input tokens 25,000 not found in: {output!r}"

    def test_token_stats_renders_output_tokens(self):
        """Token stats should show output token count."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "12" in output, f"Output tokens 12,000 not found in: {output!r}"

    def test_token_stats_renders_cost(self):
        """Token stats should show cost when available."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "0.12" in output, f"Cost $0.1234 not found in: {output!r}"

    def test_token_stats_renders_cache_tokens(self):
        """Token stats should show cache read/write tokens."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "8" in output, f"Cache read tokens 8,500 not found in: {output!r}"


# ---------------------------------------------------------------------------
# AC4: Tier badge with color coding
# ---------------------------------------------------------------------------


class TestDebugPanelTierDisplay:
    """AC4: Tier badge with color coding."""

    def test_full_tier_displayed(self):
        """FULL tier should be displayed."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output

    def test_refresh_tier_displayed(self):
        """REFRESH tier should be displayed."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_REFRESH)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "REFRESH" in output

    def test_minimal_tier_displayed(self):
        """MINIMAL tier should be displayed."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_MINIMAL)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "MINIMAL" in output

    def test_tier_uses_ansi_styling(self):
        """Tier badges should use ANSI color styling."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        raw = _render_with_ansi(result)
        assert "\x1b[" in raw, "Tier should use ANSI color styling"

    def test_no_tier_gracefully_handled(self):
        """Missing tier in context data should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_NO_TIER)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert isinstance(output, str)
        # Should still show tokens/percent even without tier
        assert "10" in output


# ---------------------------------------------------------------------------
# AC5: Token stats formatted with locale separators
# ---------------------------------------------------------------------------


class TestDebugPanelFormatting:
    """AC5: Token values formatted with locale separators."""

    def test_large_token_count_formatted(self):
        """Large token counts should use comma separators (e.g. 25,000)."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # 45000 should be formatted as 45,000
        assert "45,000" in output, f"Expected '45,000' in: {output!r}"

    def test_cost_formatted_with_decimal(self):
        """Cost should be formatted with $ and decimal places."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "$" in output, f"Expected '$' prefix in: {output!r}"


# ---------------------------------------------------------------------------
# AC6: Empty states for missing data
# ---------------------------------------------------------------------------


class TestDebugPanelEmptyState:
    """AC6: Empty states for missing data."""

    def test_no_data_shows_placeholder(self):
        """No context or token data should show a placeholder message."""
        panel = DebugPanel(client=MagicMock())
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert len(output.strip()) > 0, "Empty state should produce output"

    def test_empty_context_shows_something(self):
        """Empty context object should not crash and show placeholder."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_EMPTY_CONTEXT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_partial_token_stats_renders(self):
        """Partial token stats (only input/output) should render without crash."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS_PARTIAL)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "5" in output, "Partial stats should still render available data"


# ---------------------------------------------------------------------------
# AC7: Handles malformed/missing data gracefully
# ---------------------------------------------------------------------------


class TestDebugPanelErrorHandling:
    """AC7: Handles malformed/missing data gracefully."""

    def test_none_context_message(self):
        """None context message should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel.on_mount()
        panel._handle_context_message(None)
        assert panel._context_data is None

    def test_none_token_stats_message(self):
        """None token stats message should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel.on_mount()
        panel._handle_token_stats_message(None)
        assert panel._token_stats is None

    def test_context_missing_context_field(self):
        """Message without 'context' field should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message({"type": "init"})
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_empty_dict_context(self):
        """Empty dict for context should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message({})
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_token_stats_non_numeric_values(self):
        """Non-numeric token values should not crash."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message({
            "type": "init",
            "inputTokens": "not a number",
            "outputTokens": None,
        })
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert isinstance(output, str)

    def test_unmount_stops_updates(self):
        """After unmount, context messages should not trigger render."""
        client = MagicMock(spec=FrameClient)
        panel = DebugPanel(client=client)
        panel.on_mount()
        panel.on_unmount()

        panel.render_panel = MagicMock()
        panel.handle_message(SAMPLE_CONTEXT_INIT)
        panel.render_panel.assert_not_called()


# ---------------------------------------------------------------------------
# Combined rendering: both channels feed one display
# ---------------------------------------------------------------------------


class TestDebugPanelCombinedView:
    """Both context and token stats render together."""

    def test_both_data_sources_in_output(self):
        """When both context and token stats are set, both appear in output."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Context data
        assert "FULL" in output, "Tier should appear"
        assert "45,000" in output, "Context tokens should appear"
        # Token stats
        assert "$" in output, "Cost should appear"

    def test_context_only_renders_without_token_stats(self):
        """Context data alone should render fine without token stats."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(SAMPLE_CONTEXT_INIT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output
        assert "45,000" in output

    def test_token_stats_only_renders_without_context(self):
        """Token stats alone should render fine without context data."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_token_stats_message(SAMPLE_TOKEN_STATS)
        result = panel.render_panel({})
        output = _render_to_string(result)
        assert "$" in output or "25" in output
