"""
Tests for handoff marker generation across all 6 environment combos.

Story: 110-8 (CLI Relay Handoff Fix)

Tests the generate_marker() function with mocked check_context() to verify
correct AGENT_COMMAND output for each environment combination:

1. CLI + relay ON + context OK → action: "inline_handoff"
2. CLI + relay ON + context HIGH → action: "tirepump_handoff"
3. CLI + relay OFF → fallback text, no action
4. Cyclist + relay ON → CYCLIST:HANDOFF marker
5. Cyclist + relay ON + tirepump → CYCLIST:CONTEXT_CLEAR marker
6. Cyclist + relay OFF → CYCLIST:QUESTION:yesno marker

Run with: python -m pytest tests/python/test_handoff_marker.py -v
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from pf.context import ContextResult
from pf.handoff.marker import generate_marker


def _make_ctx(
    *,
    relay_mode: bool = False,
    is_cyclist: bool = False,
    use_tirepump: bool = False,
    usable_percent: int = 30,
    error: str | None = None,
) -> ContextResult:
    """Build a ContextResult with the given settings."""
    return ContextResult(
        usable_percent=usable_percent,
        relay_mode=relay_mode,
        is_cyclist=is_cyclist,
        use_tirepump=use_tirepump,
        error=error,
    )


# =============================================================================
# 1. CLI + relay ON + context OK → action: "inline_handoff"
# =============================================================================


class TestCliRelayOnContextOk:
    """Non-Cyclist, relay on, context below threshold."""

    def test_returns_inline_handoff_action(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert 'action: "inline_handoff"' in result

    def test_has_activation_command(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "pf agent start dev --tier handoff --quiet" in result

    def test_has_next_agent(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("tea")

        assert 'next_agent: "tea"' in result

    def test_has_relay_mode_true(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "relay_mode: true" in result

    def test_no_cyclist_markers(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "CYCLIST:" not in result


# =============================================================================
# 2. CLI + relay ON + context HIGH → action: "tirepump_handoff"
# =============================================================================


class TestCliRelayOnContextHigh:
    """Non-Cyclist, relay on, context above tirepump threshold."""

    def test_returns_tirepump_handoff_action(self):
        ctx = _make_ctx(
            relay_mode=True, is_cyclist=False,
            use_tirepump=True, usable_percent=75,
        )
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("reviewer")

        assert 'action: "tirepump_handoff"' in result

    def test_fallback_mentions_clear(self):
        ctx = _make_ctx(
            relay_mode=True, is_cyclist=False,
            use_tirepump=True, usable_percent=75,
        )
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("reviewer")

        assert "/clear" in result

    def test_has_next_agent(self):
        ctx = _make_ctx(
            relay_mode=True, is_cyclist=False,
            use_tirepump=True, usable_percent=75,
        )
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("reviewer")

        assert 'next_agent: "reviewer"' in result

    def test_no_activation_command(self):
        """tirepump_handoff should not have activation_command — user must /clear first."""
        ctx = _make_ctx(
            relay_mode=True, is_cyclist=False,
            use_tirepump=True, usable_percent=75,
        )
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("reviewer")

        assert "activation_command" not in result


# =============================================================================
# 3. CLI + relay OFF → fallback text, no action
# =============================================================================


class TestCliRelayOff:
    """Non-Cyclist, relay off — manual handoff."""

    def test_no_action_field(self):
        ctx = _make_ctx(relay_mode=False, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "action:" not in result

    def test_has_fallback_with_slash_command(self):
        ctx = _make_ctx(relay_mode=False, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "/pf-dev" in result

    def test_relay_mode_false(self):
        ctx = _make_ctx(relay_mode=False, is_cyclist=False, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "relay_mode: false" in result


# =============================================================================
# 4. Cyclist + relay ON → CYCLIST:HANDOFF marker
# =============================================================================


class TestCyclistRelayOn:
    """Cyclist environment, relay on, context OK."""

    def test_has_handoff_marker(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=True, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "CYCLIST:HANDOFF:/pf-dev" in result

    def test_is_cyclist_block(self):
        ctx = _make_ctx(relay_mode=True, is_cyclist=True, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "AGENT_COMMAND:" in result
        assert 'marker:' in result


# =============================================================================
# 5. Cyclist + relay ON + tirepump → CYCLIST:CONTEXT_CLEAR marker
# =============================================================================


class TestCyclistRelayOnTirepump:
    """Cyclist environment, relay on, high context triggers TirePump."""

    def test_has_context_clear_marker(self):
        ctx = _make_ctx(
            relay_mode=True, is_cyclist=True,
            use_tirepump=True, usable_percent=75,
        )
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "CYCLIST:CONTEXT_CLEAR:/pf-dev" in result


# =============================================================================
# 6. Cyclist + relay OFF → CYCLIST:QUESTION:yesno marker
# =============================================================================


class TestCyclistRelayOff:
    """Cyclist environment, relay off — ask for confirmation."""

    def test_has_question_marker(self):
        ctx = _make_ctx(relay_mode=False, is_cyclist=True, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "CYCLIST:QUESTION:yesno" in result

    def test_has_question_text(self):
        ctx = _make_ctx(relay_mode=False, is_cyclist=True, usable_percent=30)
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "hand off" in result.lower() or "Hand off" in result


# =============================================================================
# Edge cases
# =============================================================================


class TestEdgeCases:
    """Error and edge case handling."""

    def test_error_marker(self):
        result = generate_marker(error="Tests failing")
        assert "AGENT_COMMAND:" in result
        assert "Tests failing" in result
        assert "error: true" in result

    def test_no_agent_no_error(self):
        result = generate_marker(None)
        assert "error: true" in result
        assert "No next agent" in result

    def test_context_error_still_produces_marker(self):
        """When context check fails, should still produce a usable marker."""
        ctx = _make_ctx(relay_mode=False, is_cyclist=False, error="no_transcript")
        with patch("pf.handoff.marker.check_context", return_value=ctx):
            result = generate_marker("dev")

        assert "AGENT_COMMAND:" in result
        assert "/pf-dev" in result
