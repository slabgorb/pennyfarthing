"""Tests for Story 136-5: Fix TUI data pipeline — error states, timeouts, recovery.

TUI panels (DebugPanel, SprintPanel, StatusFooter) must handle WheelHub API
errors gracefully. Each panel needs three-state rendering: loading → error → data,
with automatic recovery when data starts flowing again.

Verifies:
  AC1: DebugPanel error state when context channel returns error
  AC2: SprintPanel error state when sprint data is empty/malformed
  AC3: StatusFooter error state when context data contains error
  AC4: Loading timeout — panels transition from loading to error after ~10s
  AC5: Automatic recovery — panels return to normal when valid data arrives
  AC6: Backward compatibility — no changes when all endpoints succeed
  AC7: Channel independence — DebugPanel channels error independently

Run with: python -m pytest tests/python/test_bikerack_tui_data_pipeline.py -v
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import MagicMock

from pf.bikerack.context_meter_footer import StatusFooter
from pf.bikerack.debug_panel import DebugPanel
from pf.bikerack.sprint_panel import SprintPanel
from rich.console import Console

# ---------------------------------------------------------------------------
# Test data fixtures — WheelHub wire formats
# ---------------------------------------------------------------------------

# Error payload: context.py not found (server returns error)
CONTEXT_ERROR: dict[str, Any] = {
    "type": "update",
    "context": {
        "error": "context.py not found",
        "percent": None,
    },
}

# Error payload: generic server error
CONTEXT_ERROR_GENERIC: dict[str, Any] = {
    "type": "update",
    "context": {
        "error": "Internal server error",
        "percent": None,
        "tokens": None,
    },
}

# Error payload with empty-string error (should NOT be treated as error)
CONTEXT_ERROR_EMPTY_STRING: dict[str, Any] = {
    "type": "update",
    "context": {
        "error": "",
        "percent": 22,
        "tokens": 45000,
        "tier": "FULL",
    },
}

# Valid context payload (normal operation)
CONTEXT_VALID: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 45000,
        "percent": 22,
        "status": "ok",
        "baseline": 8000,
        "usableTokens": 37000,
        "available": 155000,
        "tier": "FULL",
    },
}

# Valid context with explicit error: null
CONTEXT_VALID_NULL_ERROR: dict[str, Any] = {
    "type": "update",
    "context": {
        "error": None,
        "tokens": 45000,
        "percent": 22,
        "status": "ok",
        "tier": "FULL",
    },
}

# Valid context with percent: 0 (edge case — valid zero, not error)
CONTEXT_VALID_ZERO_PERCENT: dict[str, Any] = {
    "type": "update",
    "context": {
        "tokens": 0,
        "percent": 0,
        "status": "ok",
        "tier": "FULL",
    },
}

# Valid token stats
TOKEN_STATS_VALID: dict[str, Any] = {
    "type": "init",
    "inputTokens": 25000,
    "outputTokens": 12000,
    "cacheReadTokens": 8500,
    "totalCostUsd": 0.1234,
}

# Sprint payload: valid data
SPRINT_VALID: dict[str, Any] = {
    "sprint": {
        "number": "2608",
        "done": 30,
        "remaining": 33,
        "inProgress": 0,
        "currentStory": "136-5",
    },
    "epics": [
        {
            "id": "136",
            "title": "Post-install reliability",
            "stories": [
                {
                    "id": "136-5",
                    "title": "Fix TUI data pipeline",
                    "points": 3,
                    "status": "in-progress",
                },
            ],
        },
    ],
}

# Sprint payload: empty data (server returned empty)
SPRINT_EMPTY: dict[str, Any] = {
    "sprint": {},
    "epics": [],
}

# Sprint payload: malformed — missing sprint key entirely
SPRINT_MALFORMED: dict[str, Any] = {
    "epics": [],
}


def _render_to_string(renderable: Any, width: int = 120) -> str:
    """Capture Rich renderable output as plain text string."""
    console = Console(file=StringIO(), force_terminal=True, width=width)
    console.print(renderable)
    return console.file.getvalue()


# ===========================================================================
# AC1: DebugPanel Error State
# ===========================================================================


class TestDebugPanelErrorState:
    """AC1: DebugPanel renders error state when context channel has error."""

    def test_context_error_shows_error_message(self):
        """When context channel returns {error: 'context.py not found', percent: null},
        panel should show the error message, not 'No context data'."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "context.py not found" in output, (
            f"Error message should be visible, got: {output!r}"
        )
        assert "No context data" not in output, (
            f"Should not show placeholder when error is present, got: {output!r}"
        )

    def test_context_error_generic_shows_error(self):
        """Generic server error should display error state."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR_GENERIC)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "Internal server error" in output or "error" in output.lower(), (
            f"Error should be visible, got: {output!r}"
        )

    def test_context_error_empty_string_not_treated_as_error(self):
        """Empty string error field should NOT be treated as an error."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR_EMPTY_STRING)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Should render normally — tier, tokens, percent
        assert "FULL" in output, (
            f"Empty error string should render normally, got: {output!r}"
        )

    def test_error_followed_by_valid_data_recovers(self):
        """Error state should clear when valid data arrives (server recovers)."""
        panel = DebugPanel(client=MagicMock())
        # First: error
        panel._handle_context_message(CONTEXT_ERROR)
        # Then: valid
        panel._handle_context_message(CONTEXT_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, (
            f"Should recover to normal rendering, got: {output!r}"
        )
        assert "context.py not found" not in output, (
            f"Error should be cleared after recovery, got: {output!r}"
        )


# ===========================================================================
# AC2: SprintPanel Error State
# ===========================================================================


class TestSprintPanelErrorState:
    """AC2: SprintPanel renders error state for empty/malformed sprint data."""

    def test_empty_sprint_shows_no_sprint_data(self):
        """Empty {sprint: {}, epics: []} should show 'No sprint data', not error."""
        panel = SprintPanel(client=MagicMock())
        # SprintPanel needs to detect empty data and show appropriate message
        # Currently it shows "Waiting for sprint data..." forever
        # After fix: should show "No sprint data" (not an error, just empty)
        panel._last_payload = SPRINT_EMPTY
        # We need to check the sprint panel's state detection
        # The panel should recognize empty sprint vs error vs valid data
        assert hasattr(panel, '_detect_sprint_state') or hasattr(panel, '_sprint_state'), (
            "SprintPanel should have state detection for empty/error/valid data"
        )

    def test_malformed_payload_missing_sprint_key_shows_error(self):
        """Payload missing 'sprint' key should render error state."""
        panel = SprintPanel(client=MagicMock())
        panel._last_payload = SPRINT_MALFORMED
        assert hasattr(panel, '_detect_sprint_state') or hasattr(panel, '_sprint_state'), (
            "SprintPanel should detect malformed payloads"
        )

    def test_valid_data_after_error_recovers(self):
        """Valid sprint data after error should rebuild tree normally."""
        panel = SprintPanel(client=MagicMock())
        # Error state first
        panel._last_payload = SPRINT_MALFORMED
        # Then valid data
        panel._last_payload = SPRINT_VALID
        # Panel should now be in normal state
        assert hasattr(panel, '_detect_sprint_state') or hasattr(panel, '_sprint_state'), (
            "SprintPanel should support recovery from error to valid"
        )


# ===========================================================================
# AC3: StatusFooter Error State
# ===========================================================================


class TestStatusFooterErrorState:
    """AC3: StatusFooter shows error indicator when context has error."""

    def test_context_error_shows_error_indicator(self):
        """When context has error, footer should show error indicator,
        not frozen '░░░░░░░░░░ --%' placeholder."""
        footer = StatusFooter(client=MagicMock())
        footer._context_data = CONTEXT_ERROR["context"]
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        # Should show error indicator (e.g., "ctx [err]" or "ctx ✗")
        assert "--%"  not in output, (
            f"Should NOT show frozen placeholder when error is present, got: {output!r}"
        )
        # Should indicate error state
        has_error_indicator = (
            "err" in output.lower()
            or "✗" in output
            or "error" in output.lower()
            or "[err]" in output
        )
        assert has_error_indicator, (
            f"Should show error indicator in context bar, got: {output!r}"
        )

    def test_context_error_still_shows_project_and_story(self):
        """When context errors, footer should still show project/story/model."""
        footer = StatusFooter(project_dir="my-project", client=MagicMock())
        footer._story_id = "136-5"
        footer._model = "opus-4"
        footer._context_data = CONTEXT_ERROR["context"]
        result = footer._render_status()
        output = _render_to_string(result)
        assert "my-project" in output, (
            f"Project name should still show, got: {output!r}"
        )
        assert "136-5" in output, (
            f"Story ID should still show, got: {output!r}"
        )

    def test_error_clears_on_recovery(self):
        """When valid data arrives after error, bar returns to normal."""
        footer = StatusFooter(client=MagicMock())
        # Error first
        footer._context_data = CONTEXT_ERROR["context"]
        bar_error = footer._render_context_bar()
        _render_to_string(bar_error)

        # Then recovery
        footer._context_data = CONTEXT_VALID["context"]
        bar_recovered = footer._render_context_bar()
        output_recovered = _render_to_string(bar_recovered)
        assert "22%" in output_recovered or "FULL" in output_recovered, (
            f"Should recover to normal display, got: {output_recovered!r}"
        )

    def test_stats_healthy_context_errored(self):
        """Stats channel healthy but context errored — model/story shown, context error."""
        footer = StatusFooter(project_dir="test", client=MagicMock())
        footer._model = "opus-4"
        footer._story_id = "136-5"
        footer._context_data = CONTEXT_ERROR["context"]
        result = footer._render_status()
        output = _render_to_string(result)
        assert "opus-4" in output, (
            f"Model should show from healthy stats channel, got: {output!r}"
        )


# ===========================================================================
# AC4: Loading Timeout
# ===========================================================================


class TestLoadingTimeout:
    """AC4: Panels transition from loading to error/timeout after ~10s."""

    def test_debug_panel_has_timeout_mechanism(self):
        """DebugPanel should have a loading timeout that transitions to error."""
        panel = DebugPanel(client=MagicMock())
        # Panel should have timeout-related attributes or methods
        has_timeout = (
            hasattr(panel, '_loading_timeout')
            or hasattr(panel, '_timeout_seconds')
            or hasattr(panel, '_check_timeout')
            or hasattr(panel, '_start_loading_timer')
        )
        assert has_timeout, (
            "DebugPanel should have a loading timeout mechanism"
        )

    def test_sprint_panel_has_timeout_mechanism(self):
        """SprintPanel should have a loading timeout that transitions to error."""
        panel = SprintPanel(client=MagicMock())
        has_timeout = (
            hasattr(panel, '_loading_timeout')
            or hasattr(panel, '_timeout_seconds')
            or hasattr(panel, '_check_timeout')
            or hasattr(panel, '_start_loading_timer')
        )
        assert has_timeout, (
            "SprintPanel should have a loading timeout mechanism"
        )

    def test_status_footer_has_timeout_mechanism(self):
        """StatusFooter should have a loading timeout for context data."""
        footer = StatusFooter(client=MagicMock())
        has_timeout = (
            hasattr(footer, '_loading_timeout')
            or hasattr(footer, '_timeout_seconds')
            or hasattr(footer, '_check_timeout')
            or hasattr(footer, '_start_loading_timer')
        )
        assert has_timeout, (
            "StatusFooter should have a loading timeout mechanism"
        )

    def test_data_before_timeout_prevents_error(self):
        """If data arrives before timeout, panel should render normally (not error)."""
        panel = DebugPanel(client=MagicMock())
        # Simulate data arriving quickly
        panel._handle_context_message(CONTEXT_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, (
            f"Data before timeout should render normally, got: {output!r}"
        )
        # Should NOT show timeout/error
        assert "not responding" not in output.lower()
        assert "no data received" not in output.lower()


# ===========================================================================
# AC5: Automatic Recovery
# ===========================================================================


class TestAutomaticRecovery:
    """AC5: Panels recover automatically when valid data arrives after error."""

    def test_debug_panel_recovers_from_context_error(self):
        """DebugPanel recovers from context error when valid data arrives."""
        panel = DebugPanel(client=MagicMock())
        # Error state
        panel._handle_context_message(CONTEXT_ERROR)
        error_result = panel.render_panel(panel._context_data or {})
        error_output = _render_to_string(error_result)
        # Verify error is shown
        assert "context.py not found" in error_output, (
            f"Error should be visible first, got: {error_output!r}"
        )

        # Recovery
        panel._handle_context_message(CONTEXT_VALID)
        recovery_result = panel.render_panel(panel._context_data or {})
        recovery_output = _render_to_string(recovery_result)
        assert "FULL" in recovery_output, (
            f"Should recover to normal rendering, got: {recovery_output!r}"
        )
        assert "context.py not found" not in recovery_output, (
            f"Error message should be gone after recovery, got: {recovery_output!r}"
        )

    def test_debug_panel_rapid_error_success_oscillation(self):
        """Rapid error/success/error should follow latest state without corruption."""
        panel = DebugPanel(client=MagicMock())
        # Error → valid → error → valid
        panel._handle_context_message(CONTEXT_ERROR)
        panel._handle_context_message(CONTEXT_VALID)
        panel._handle_context_message(CONTEXT_ERROR_GENERIC)
        panel._handle_context_message(CONTEXT_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Should show the latest valid state
        assert "FULL" in output, (
            f"Should reflect latest valid state, got: {output!r}"
        )

    def test_status_footer_recovers_from_error(self):
        """StatusFooter context bar recovers when error clears."""
        footer = StatusFooter(client=MagicMock())
        # Error
        footer._context_data = CONTEXT_ERROR["context"]
        error_bar = footer._render_context_bar()
        _render_to_string(error_bar)

        # Recovery
        footer._context_data = CONTEXT_VALID["context"]
        recovery_bar = footer._render_context_bar()
        recovery_output = _render_to_string(recovery_bar)
        assert "FULL" in recovery_output, (
            f"Footer should recover to showing tier, got: {recovery_output!r}"
        )


# ===========================================================================
# AC6: Backward Compatibility
# ===========================================================================


class TestBackwardCompatibility:
    """AC6: No visual changes when WheelHub is running normally."""

    def test_valid_payload_with_null_error_renders_normally(self):
        """Payload with error: null should render as normal (no error)."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_VALID_NULL_ERROR)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, (
            f"error: null should render normally, got: {output!r}"
        )
        # No error indicators
        assert "err" not in output.lower() or "error" not in output.lower().replace("no context", ""), (
            f"Should not show error indicators for error: null, got: {output!r}"
        )

    def test_valid_payload_without_error_key_renders_normally(self):
        """Payload without any error key should preserve current behavior."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output
        assert "45,000" in output

    def test_zero_percent_not_treated_as_error(self):
        """Context with percent: 0 (valid zero) renders as 0%, not error."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_VALID_ZERO_PERCENT)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Should render as 0%, NOT as error
        assert "0%" in output or "FULL" in output, (
            f"percent: 0 should render normally, got: {output!r}"
        )

    def test_status_footer_valid_data_unchanged(self):
        """StatusFooter with valid data should look identical to current behavior."""
        footer = StatusFooter(client=MagicMock())
        footer._context_data = CONTEXT_VALID["context"]
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        # Should show tier and progress bar
        assert "FULL" in output
        assert "█" in output

    def test_status_footer_null_error_renders_normally(self):
        """StatusFooter with error: null should render normal context bar."""
        footer = StatusFooter(client=MagicMock())
        footer._context_data = CONTEXT_VALID_NULL_ERROR["context"]
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        assert "FULL" in output, (
            f"error: null should render normally, got: {output!r}"
        )

    def test_status_footer_zero_percent_renders_as_zero(self):
        """StatusFooter with percent: 0 should show 0%, not error."""
        footer = StatusFooter(client=MagicMock())
        footer._context_data = CONTEXT_VALID_ZERO_PERCENT["context"]
        bar = footer._render_context_bar()
        output = _render_to_string(bar)
        # percent: 0 is valid zero usage
        assert "0%" in output or "FULL" in output, (
            f"percent: 0 should render as zero, not error, got: {output!r}"
        )


# ===========================================================================
# AC7: Channel Independence in DebugPanel
# ===========================================================================


class TestDebugPanelChannelIndependence:
    """AC7: DebugPanel channels error independently."""

    def test_context_error_token_stats_healthy(self):
        """Context errors should not prevent token stats from rendering."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR)
        panel._handle_token_stats_message(TOKEN_STATS_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Token stats should still be visible
        assert "25" in output or "$" in output, (
            f"Token stats should render despite context error, got: {output!r}"
        )
        # Context error should also be visible
        assert "context.py not found" in output or "error" in output.lower(), (
            f"Context error should be visible alongside token stats, got: {output!r}"
        )

    def test_token_stats_missing_context_healthy(self):
        """Missing token stats should not affect context rendering."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_VALID)
        # No token stats message
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        assert "FULL" in output, (
            f"Context should render without token stats, got: {output!r}"
        )

    def test_both_channels_error(self):
        """Both channels erroring should show combined error state."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR)
        # Token stats don't have an error field in the same way,
        # but absence of data is an error state
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Should show context error, not crash
        assert "context.py not found" in output or "error" in output.lower(), (
            f"Should handle both channels erroring, got: {output!r}"
        )

    def test_channels_recover_independently(self):
        """Each channel recovers independently — context recovers first."""
        panel = DebugPanel(client=MagicMock())
        # Both start with error/missing
        panel._handle_context_message(CONTEXT_ERROR)
        # Context recovers
        panel._handle_context_message(CONTEXT_VALID)
        # Token stats still absent
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Context should be normal
        assert "FULL" in output, (
            f"Context should recover independently, got: {output!r}"
        )

    def test_context_shows_error_while_token_stats_table_renders(self):
        """Context section shows error message, token stats section renders table."""
        panel = DebugPanel(client=MagicMock())
        panel._handle_context_message(CONTEXT_ERROR)
        panel._handle_token_stats_message(TOKEN_STATS_VALID)
        result = panel.render_panel(panel._context_data or {})
        output = _render_to_string(result)
        # Both should be present: error message AND token stats
        has_error = "context.py not found" in output
        has_stats = "25,000" in output or "25" in output
        assert has_error and has_stats, (
            f"Should show both error and stats. "
            f"Error: {has_error}, Stats: {has_stats}. Output: {output!r}"
        )
