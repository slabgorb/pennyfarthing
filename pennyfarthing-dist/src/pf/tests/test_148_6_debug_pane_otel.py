"""Tests for Story 148-6: Debug pane not receiving signals from WebSocket.

Bug: The debug pane (DebugPanel) subscribes to the 'token-stats' WebSocket
channel but never receives data because:
  1. /v1/metrics endpoint processes metrics but never broadcasts to token-stats
  2. CHANNEL_FETCHERS has no 'token-stats' entry — no initial data on connect
  3. debug_panel.py reads 'totalCostUsd' but OTLPReceiver stores 'totalCost'

Fix requires:
  - Add broadcast("token-stats", ...) after process_metrics() in app.py
  - Add fetch_token_stats to CHANNEL_FETCHERS keyed to "token-stats"
  - Fix field name in debug_panel.py: totalCostUsd → totalCost
  - DebugPanel._handle_token_stats_message processes broadcasted data correctly

DebugPanel expects token stats with keys: inputTokens, outputTokens,
cacheReadTokens, cacheCreationTokens, totalCost (see otlp.py:202-208).
"""

from __future__ import annotations

from io import StringIO
from typing import Any
from unittest.mock import patch

import pytest
from rich.console import Console
from starlette.testclient import TestClient

from pf.frame.app import create_app
from pf.frame.otlp import OTLPReceiver, parse_otlp_metrics


def _render_to_text(renderable: Any) -> str:
    """Render a Rich renderable to plain text for assertion checks."""
    console = Console(file=StringIO(), width=120, no_color=True)
    console.print(renderable)
    return console.file.getvalue()


# ---------------------------------------------------------------------------
# Helpers: OTLP metrics payload builders
# ---------------------------------------------------------------------------


def _make_metrics_payload(
    input_tokens: int = 1000,
    output_tokens: int = 500,
    cache_read_tokens: int = 200,
    cache_creation_tokens: int = 100,
) -> dict[str, Any]:
    """Build a realistic OTLP metrics payload with claude_code.token.usage."""
    data_points = []
    for token_type, value in [
        ("input", input_tokens),
        ("output", output_tokens),
        ("cacheRead", cache_read_tokens),
        ("cacheCreation", cache_creation_tokens),
    ]:
        data_points.append({
            "attributes": [
                {"key": "type", "value": {"stringValue": token_type}},
            ],
            "asInt": value,
        })

    return {
        "resourceMetrics": [
            {
                "scopeMetrics": [
                    {
                        "metrics": [
                            {
                                "name": "claude_code.token.usage",
                                "sum": {"dataPoints": data_points},
                            }
                        ]
                    }
                ]
            }
        ]
    }


def _make_empty_metrics_payload() -> dict[str, Any]:
    """Build an OTLP metrics payload with no claude_code.token.usage metrics."""
    return {
        "resourceMetrics": [
            {
                "scopeMetrics": [
                    {
                        "metrics": [
                            {
                                "name": "some.other.metric",
                                "sum": {"dataPoints": []},
                            }
                        ]
                    }
                ]
            }
        ]
    }


# ---------------------------------------------------------------------------
# AC1: /v1/metrics endpoint broadcasts to token-stats channel
# ---------------------------------------------------------------------------


class TestMetricsEndpointBroadcast:
    """/v1/metrics must broadcast updated token stats to the 'token-stats' channel."""

    @pytest.fixture()
    def client(self) -> TestClient:
        return TestClient(create_app())

    def test_metrics_endpoint_broadcasts_to_token_stats_channel(
        self, client: TestClient
    ):
        """POST /v1/metrics broadcasts token stats to the 'token-stats' channel."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = _make_metrics_payload(
                input_tokens=1000, output_tokens=500
            )
            response = client.post("/v1/metrics", json=payload)
            assert response.status_code == 200

        # Verify broadcast was called for the token-stats channel
        token_stats_broadcasts = [
            (ch, d) for ch, d in broadcast_calls if ch == "token-stats"
        ]
        assert len(token_stats_broadcasts) >= 1, (
            "Expected broadcast to 'token-stats' channel after processing metrics, "
            f"but got broadcasts to: {[ch for ch, _ in broadcast_calls]}"
        )

    def test_metrics_broadcast_contains_aggregated_stats(self, client: TestClient):
        """Broadcasted token-stats contain the aggregated token counts."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = _make_metrics_payload(
                input_tokens=1500, output_tokens=750
            )
            client.post("/v1/metrics", json=payload)

        token_stats = [d for ch, d in broadcast_calls if ch == "token-stats"]
        assert len(token_stats) >= 1
        stats = token_stats[0]
        assert stats["inputTokens"] >= 1500
        assert stats["outputTokens"] >= 750

    def test_metrics_endpoint_no_broadcast_on_empty_metrics(
        self, client: TestClient
    ):
        """POST /v1/metrics with no token.usage metrics does not broadcast."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = _make_empty_metrics_payload()
            response = client.post("/v1/metrics", json=payload)
            assert response.status_code == 200

        token_stats_broadcasts = [
            (ch, d) for ch, d in broadcast_calls if ch == "token-stats"
        ]
        assert len(token_stats_broadcasts) == 0

    def test_metrics_broadcast_accumulates_across_calls(self, client: TestClient):
        """Multiple /v1/metrics POSTs accumulate token counts."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            client.post(
                "/v1/metrics",
                json=_make_metrics_payload(input_tokens=100, output_tokens=50),
            )
            client.post(
                "/v1/metrics",
                json=_make_metrics_payload(input_tokens=200, output_tokens=100),
            )

        token_stats = [d for ch, d in broadcast_calls if ch == "token-stats"]
        assert len(token_stats) >= 2
        # The last broadcast should have accumulated totals
        last_stats = token_stats[-1]
        assert last_stats["inputTokens"] >= 300
        assert last_stats["outputTokens"] >= 150


# ---------------------------------------------------------------------------
# AC2: CHANNEL_FETCHERS includes token-stats fetcher
# ---------------------------------------------------------------------------


class TestTokenStatsFetcher:
    """CHANNEL_FETCHERS must include a 'token-stats' entry for initial data."""

    def test_channel_fetchers_has_token_stats(self):
        """'token-stats' key exists in CHANNEL_FETCHERS."""
        from pf.frame.ws_push import CHANNEL_FETCHERS

        assert "token-stats" in CHANNEL_FETCHERS, (
            "CHANNEL_FETCHERS is missing 'token-stats' — new WebSocket "
            "connections get no initial token stats data"
        )

    def test_token_stats_fetcher_is_callable(self):
        """The token-stats fetcher is a callable function."""
        from pf.frame.ws_push import CHANNEL_FETCHERS

        fetcher = CHANNEL_FETCHERS.get("token-stats")
        assert fetcher is not None, "No token-stats fetcher in CHANNEL_FETCHERS"
        assert callable(fetcher)

    def test_token_stats_fetcher_returns_dict(self):
        """The token-stats fetcher returns a dict with token stat keys."""
        from pf.frame.ws_push import CHANNEL_FETCHERS

        fetcher = CHANNEL_FETCHERS.get("token-stats")
        assert fetcher is not None, "No token-stats fetcher in CHANNEL_FETCHERS"
        result = fetcher()
        assert isinstance(result, dict)

    def test_token_stats_fetcher_reflects_receiver_state(self):
        """After processing metrics, the fetcher returns updated stats."""
        from pf.frame.app import _receiver
        from pf.frame.ws_push import CHANNEL_FETCHERS

        fetcher = CHANNEL_FETCHERS.get("token-stats")
        assert fetcher is not None, "No token-stats fetcher in CHANNEL_FETCHERS"

        # Process some metrics
        _receiver.process_metrics(
            _make_metrics_payload(input_tokens=999, output_tokens=444)
        )

        result = fetcher()
        assert isinstance(result, dict)
        # The fetcher output should contain the receiver's accumulated stats
        # It may be wrapped (e.g., {"type": "init", ...}) or flat
        stats = result.get("stats", result)
        assert stats.get("inputTokens", 0) >= 999 or result.get("inputTokens", 0) >= 999


# ---------------------------------------------------------------------------
# AC3: Field name consistency — totalCost vs totalCostUsd
# ---------------------------------------------------------------------------


class TestFieldNameConsistency:
    """debug_panel.py must use the same field name as OTLPReceiver."""

    def test_receiver_uses_total_cost_key(self):
        """OTLPReceiver._token_stats uses 'totalCost' as the cost key."""
        receiver = OTLPReceiver()
        stats = receiver.get_token_stats()
        assert "totalCost" in stats, (
            f"Expected 'totalCost' in receiver stats, got keys: {list(stats.keys())}"
        )

    def test_render_token_stats_reads_total_cost(self):
        """_render_token_stats reads 'totalCost', not 'totalCostUsd'."""
        from pf.tui.debug_panel import _render_token_stats

        stats = {
            "inputTokens": 1000,
            "outputTokens": 500,
            "cacheReadTokens": 200,
            "cacheCreationTokens": 100,
            "totalCost": 0.0042,
        }
        result = _render_token_stats(stats)
        rendered_text = _render_to_text(result)
        assert "$0.0042" in rendered_text, (
            f"Expected cost '$0.0042' in rendered output but got: {rendered_text}. "
            "This fails if _render_token_stats reads 'totalCostUsd' instead of 'totalCost'."
        )

    def test_render_token_stats_does_not_use_total_cost_usd(self):
        """Verify that providing only totalCostUsd (wrong key) does NOT render cost."""
        from pf.tui.debug_panel import _render_token_stats

        stats_wrong_key = {
            "inputTokens": 1000,
            "outputTokens": 500,
            "totalCostUsd": 0.0042,  # Wrong key name
        }
        result = _render_token_stats(stats_wrong_key)
        rendered_text = _render_to_text(result)
        # If debug_panel correctly reads 'totalCost', this should NOT show $0.0042
        # because the key is 'totalCostUsd' (wrong). If this test PASSES,
        # that means the code still reads the wrong key.
        assert "$0.0042" not in rendered_text, (
            "_render_token_stats is reading 'totalCostUsd' (wrong key) — "
            "it should read 'totalCost' to match OTLPReceiver"
        )


# ---------------------------------------------------------------------------
# AC4: DebugPanel handles token-stats messages correctly
# ---------------------------------------------------------------------------


class TestDebugPanelTokenStats:
    """DebugPanel processes token-stats WebSocket messages."""

    def test_handle_token_stats_stores_data(self):
        """_handle_token_stats_message stores the message for rendering."""
        from pf.tui.debug_panel import DebugPanel

        panel = DebugPanel(client=None)
        message = {
            "inputTokens": 500,
            "outputTokens": 250,
            "cacheReadTokens": 100,
            "cacheCreationTokens": 50,
            "totalCost": 0.001,
        }
        panel._handle_token_stats_message(message)
        assert panel._token_stats is not None
        assert panel._token_stats["inputTokens"] == 500

    def test_handle_token_stats_none_message_no_crash(self):
        """None message is safely ignored."""
        from pf.tui.debug_panel import DebugPanel

        panel = DebugPanel(client=None)
        panel._handle_token_stats_message(None)
        assert panel._token_stats is None

    def test_render_normal_shows_token_stats(self):
        """When token stats are present, _render_normal includes them."""
        from pf.tui.debug_panel import DebugPanel

        panel = DebugPanel(client=None)
        panel._token_stats = {
            "inputTokens": 1000,
            "outputTokens": 500,
            "cacheReadTokens": 200,
            "cacheCreationTokens": 100,
            "totalCost": 0.0042,
        }
        result = panel._render_normal({})
        rendered = _render_to_text(result)
        assert "1,000" in rendered, (
            f"Expected formatted input tokens '1,000' in output: {rendered}"
        )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestTokenStatsEdgeCases:
    """Edge cases for token stats processing and display."""

    def test_parse_metrics_zero_values(self):
        """Zero token counts are correctly parsed."""
        payload = _make_metrics_payload(
            input_tokens=0, output_tokens=0,
            cache_read_tokens=0, cache_creation_tokens=0,
        )
        result = parse_otlp_metrics(payload)
        assert result["inputTokens"] == 0
        assert result["outputTokens"] == 0

    def test_parse_metrics_empty_payload(self):
        """Empty resourceMetrics returns empty dict."""
        assert parse_otlp_metrics({}) == {}
        assert parse_otlp_metrics({"resourceMetrics": []}) == {}

    def test_receiver_accumulates_across_multiple_metrics(self):
        """Multiple process_metrics calls accumulate token counts."""
        receiver = OTLPReceiver()
        receiver.process_metrics(
            _make_metrics_payload(input_tokens=100, output_tokens=50)
        )
        receiver.process_metrics(
            _make_metrics_payload(input_tokens=200, output_tokens=100)
        )
        stats = receiver.get_token_stats()
        assert stats["inputTokens"] == 300
        assert stats["outputTokens"] == 150

    def test_render_token_stats_with_no_data(self):
        """Empty stats dict renders 'No token stats' message."""
        from pf.tui.debug_panel import _render_token_stats

        result = _render_token_stats({})
        rendered = _render_to_text(result)
        assert "No token stats" in rendered

    def test_receiver_get_token_stats_returns_copy(self):
        """get_token_stats returns a copy, not a reference to internal state."""
        receiver = OTLPReceiver()
        stats = receiver.get_token_stats()
        stats["inputTokens"] = 99999
        assert receiver.get_token_stats()["inputTokens"] == 0

    def test_process_metrics_returns_none(self):
        """process_metrics returns None (caller must get stats separately)."""
        receiver = OTLPReceiver()
        result = receiver.process_metrics(
            _make_metrics_payload(input_tokens=100)
        )
        assert result is None
