"""Tests for Story 148-5: Audit log pane not recording OTEL traces via WebSocket.

Bug: The audit log TUI pane (AuditLogPanel) subscribes to the 'spans' WebSocket
channel but never receives data because:
  1. process_traces() is a no-op (otlp.py:117)
  2. process_logs() return value is discarded in the endpoint (app.py:138)
  3. _enriched_spans in state.py is never populated
  4. No broadcast path from OTLP endpoints to the spans WebSocket channel

Fix requires:
  - Implement parse_otlp_traces() to extract tool spans from OTLP trace payloads
  - Implement process_traces() to parse + store + broadcast spans
  - Wire process_logs() to convert tool_result events into spans and broadcast
  - Expose get_spans() on OTLPReceiver for the ws_push fetcher
  - Bound the span buffer to prevent unbounded memory growth

AuditLogPanel expects spans with keys: toolName, timestamp, durationMs, success,
input, toolParameters (see audit_log_panel.py:385-406).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app
from pf.frame.otlp import OTLPReceiver, parse_otlp_traces

# ---------------------------------------------------------------------------
# Helpers: OTLP payload builders
# ---------------------------------------------------------------------------


def _make_trace_payload(
    tool_name: str = "Bash",
    duration_ns: int = 250_000_000,  # 250ms
    success: bool = True,
    start_time_ns: int = 1709900000000000000,
    attributes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a realistic OTLP trace payload with a tool span."""
    end_time_ns = start_time_ns + duration_ns
    span_attrs = [
        {"key": "tool_name", "value": {"stringValue": tool_name}},
        {"key": "success", "value": {"boolValue": success}},
    ]
    if attributes:
        span_attrs.extend(attributes)

    return {
        "resourceSpans": [
            {
                "scopeSpans": [
                    {
                        "spans": [
                            {
                                "name": f"tool.{tool_name}",
                                "startTimeUnixNano": str(start_time_ns),
                                "endTimeUnixNano": str(end_time_ns),
                                "attributes": span_attrs,
                            }
                        ]
                    }
                ]
            }
        ]
    }


def _make_log_payload_tool_result(
    tool_name: str = "Read",
    success: bool = True,
    duration_ms: int = 42,
    timestamp_ns: int = 1709900000000000000,
    input_text: str = "/some/file.py",
) -> dict[str, Any]:
    """Build an OTLP log payload with a claude_code.tool_result event."""
    return {
        "resourceLogs": [
            {
                "scopeLogs": [
                    {
                        "logRecords": [
                            {
                                "timeUnixNano": str(timestamp_ns),
                                "body": {"stringValue": "claude_code.tool_result"},
                                "attributes": [
                                    {"key": "tool_name", "value": {"stringValue": tool_name}},
                                    {"key": "success", "value": {"boolValue": success}},
                                    {"key": "duration_ms", "value": {"intValue": duration_ms}},
                                    {"key": "input", "value": {"stringValue": input_text}},
                                ],
                            }
                        ]
                    }
                ]
            }
        ]
    }


# ---------------------------------------------------------------------------
# AC1: parse_otlp_traces extracts spans from OTLP trace payloads
# ---------------------------------------------------------------------------


class TestParseOTLPTraces:
    """parse_otlp_traces converts OTLP trace payload to AuditLogPanel span format."""

    def test_extracts_tool_span(self):
        """A trace span with tool_name attribute produces a span dict."""
        payload = _make_trace_payload(tool_name="Bash", duration_ns=250_000_000)
        spans = parse_otlp_traces(payload)
        assert len(spans) == 1
        span = spans[0]
        assert span["toolName"] == "Bash"

    def test_computes_duration_ms(self):
        """Duration is computed from start/end timestamps in milliseconds."""
        payload = _make_trace_payload(duration_ns=500_000_000)  # 500ms
        spans = parse_otlp_traces(payload)
        assert spans[0]["durationMs"] == 500

    def test_computes_timestamp_ms(self):
        """Timestamp is converted from nanoseconds to milliseconds."""
        payload = _make_trace_payload(start_time_ns=1709900000000000000)
        spans = parse_otlp_traces(payload)
        assert spans[0]["timestamp"] == 1709900000000

    def test_preserves_success_flag(self):
        """Success boolean is preserved on the span."""
        payload_ok = _make_trace_payload(success=True)
        payload_fail = _make_trace_payload(success=False)
        assert parse_otlp_traces(payload_ok)[0]["success"] is True
        assert parse_otlp_traces(payload_fail)[0]["success"] is False

    def test_extracts_input_attribute(self):
        """Input attribute from span is included when present."""
        payload = _make_trace_payload(
            tool_name="Read",
            attributes=[{"key": "input", "value": {"stringValue": "/path/to/file.py"}}],
        )
        spans = parse_otlp_traces(payload)
        assert spans[0]["input"] == "/path/to/file.py"

    def test_extracts_tool_parameters(self):
        """toolParameters JSON attribute is preserved when present."""
        params_json = '{"file_path": "/foo.py", "offset": 10}'
        payload = _make_trace_payload(
            tool_name="Read",
            attributes=[{"key": "toolParameters", "value": {"stringValue": params_json}}],
        )
        spans = parse_otlp_traces(payload)
        assert spans[0]["toolParameters"] == params_json

    def test_multiple_spans_in_payload(self):
        """Multiple spans within the same scopeSpans are all extracted."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "tool.Read",
                                    "startTimeUnixNano": "1000000000000",
                                    "endTimeUnixNano": "1000050000000",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Read"}},
                                    ],
                                },
                                {
                                    "name": "tool.Bash",
                                    "startTimeUnixNano": "2000000000000",
                                    "endTimeUnixNano": "2000100000000",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Bash"}},
                                    ],
                                },
                            ]
                        }
                    ]
                }
            ]
        }
        spans = parse_otlp_traces(payload)
        assert len(spans) == 2
        assert spans[0]["toolName"] == "Read"
        assert spans[1]["toolName"] == "Bash"

    def test_skips_spans_without_tool_name(self):
        """Spans without a tool_name attribute are excluded."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "http.request",
                                    "startTimeUnixNano": "1000000000000",
                                    "endTimeUnixNano": "1000050000000",
                                    "attributes": [
                                        {"key": "http.method", "value": {"stringValue": "GET"}},
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        spans = parse_otlp_traces(payload)
        assert len(spans) == 0

    def test_empty_payload_returns_empty(self):
        """Empty resourceSpans returns empty list."""
        assert parse_otlp_traces({}) == []
        assert parse_otlp_traces({"resourceSpans": []}) == []

    def test_missing_timestamps_uses_defaults(self):
        """Spans with missing timestamps still parse without crashing."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "tool.Bash",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Bash"}},
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        spans = parse_otlp_traces(payload)
        assert len(spans) == 1
        assert spans[0]["toolName"] == "Bash"
        assert "durationMs" in spans[0]
        assert "timestamp" in spans[0]


# ---------------------------------------------------------------------------
# AC2: OTLPReceiver.process_traces stores spans
# ---------------------------------------------------------------------------


class TestReceiverProcessTraces:
    """process_traces parses, stores, and returns spans."""

    def test_process_traces_stores_spans(self):
        """Calling process_traces populates the internal span buffer."""
        receiver = OTLPReceiver()
        payload = _make_trace_payload(tool_name="Bash")
        receiver.process_traces(payload)
        spans = receiver.get_spans()
        assert len(spans) == 1
        assert spans[0]["toolName"] == "Bash"

    def test_process_traces_returns_new_spans(self):
        """process_traces returns the list of newly parsed spans."""
        receiver = OTLPReceiver()
        payload = _make_trace_payload(tool_name="Read")
        result = receiver.process_traces(payload)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["toolName"] == "Read"

    def test_process_traces_accumulates(self):
        """Multiple process_traces calls accumulate spans."""
        receiver = OTLPReceiver()
        receiver.process_traces(_make_trace_payload(tool_name="Bash"))
        receiver.process_traces(_make_trace_payload(tool_name="Read"))
        spans = receiver.get_spans()
        assert len(spans) == 2

    def test_get_spans_returns_copy(self):
        """get_spans returns a copy, not a reference to internal buffer."""
        receiver = OTLPReceiver()
        receiver.process_traces(_make_trace_payload(tool_name="Bash"))
        spans = receiver.get_spans()
        spans.clear()
        assert len(receiver.get_spans()) == 1


# ---------------------------------------------------------------------------
# AC3: OTLPReceiver.process_logs converts tool_result events to spans
# ---------------------------------------------------------------------------


class TestReceiverProcessLogsToSpans:
    """process_logs converts tool_result log events into spans for the audit log."""

    def test_tool_result_log_produces_span(self):
        """A claude_code.tool_result log event is converted to a span."""
        receiver = OTLPReceiver()
        payload = _make_log_payload_tool_result(
            tool_name="Read", success=True, duration_ms=42
        )
        receiver.process_logs(payload)
        spans = receiver.get_spans()
        assert len(spans) == 1
        span = spans[0]
        assert span["toolName"] == "Read"
        assert span["success"] is True
        assert span["durationMs"] == 42

    def test_tool_result_log_preserves_input(self):
        """Input text from log attributes is preserved on the span."""
        receiver = OTLPReceiver()
        payload = _make_log_payload_tool_result(
            tool_name="Read", input_text="/foo/bar.py"
        )
        receiver.process_logs(payload)
        spans = receiver.get_spans()
        assert spans[0]["input"] == "/foo/bar.py"

    def test_non_tool_result_logs_ignored(self):
        """Log events that aren't claude_code.tool_result don't produce spans."""
        receiver = OTLPReceiver()
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1000000000000",
                                    "body": {"stringValue": "some.other.event"},
                                    "attributes": [],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        receiver.process_logs(payload)
        assert len(receiver.get_spans()) == 0

    def test_logs_and_traces_share_span_buffer(self):
        """Both traces and logs contribute to the same span buffer."""
        receiver = OTLPReceiver()
        receiver.process_traces(_make_trace_payload(tool_name="Bash"))
        receiver.process_logs(
            _make_log_payload_tool_result(tool_name="Read")
        )
        spans = receiver.get_spans()
        assert len(spans) == 2
        tool_names = {s["toolName"] for s in spans}
        assert tool_names == {"Bash", "Read"}


# ---------------------------------------------------------------------------
# AC4: Span buffer is bounded
# ---------------------------------------------------------------------------


class TestSpanBufferBound:
    """Span buffer doesn't grow without limit."""

    def test_span_buffer_bounded(self):
        """Span buffer is capped at MAX_SPANS (oldest evicted first)."""
        receiver = OTLPReceiver()
        # Push more spans than the limit
        for i in range(600):
            receiver.process_traces(
                _make_trace_payload(
                    tool_name=f"Tool{i}",
                    start_time_ns=1000000000000 + i * 1000000,
                )
            )
        spans = receiver.get_spans()
        assert len(spans) <= 500  # MAX_SPANS should be reasonable (≤500)
        # Most recent spans should be kept
        assert spans[-1]["toolName"] == "Tool599"


# ---------------------------------------------------------------------------
# AC5: Integration — OTLP endpoints broadcast to spans WebSocket channel
# ---------------------------------------------------------------------------


class TestOTLPEndpointBroadcast:
    """OTLP endpoints broadcast parsed spans to the 'spans' WebSocket channel."""

    @pytest.fixture()
    def client(self) -> TestClient:
        return TestClient(create_app())

    def test_traces_endpoint_broadcasts_to_spans_channel(self, client: TestClient):
        """POST /v1/traces broadcasts new spans to the 'spans' WebSocket channel."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = _make_trace_payload(tool_name="Bash")
            response = client.post("/v1/traces", json=payload)
            assert response.status_code == 200

        # Verify broadcast was called for the spans channel
        spans_broadcasts = [(ch, d) for ch, d in broadcast_calls if ch == "spans"]
        assert len(spans_broadcasts) >= 1
        channel, data = spans_broadcasts[0]
        assert data["type"] == "span"
        assert data["span"]["toolName"] == "Bash"

    def test_logs_endpoint_broadcasts_tool_results_to_spans_channel(self, client: TestClient):
        """POST /v1/logs broadcasts tool_result events to 'spans' channel."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = _make_log_payload_tool_result(tool_name="Read", duration_ms=42)
            response = client.post("/v1/logs", json=payload)
            assert response.status_code == 200

        spans_broadcasts = [(ch, d) for ch, d in broadcast_calls if ch == "spans"]
        assert len(spans_broadcasts) >= 1
        channel, data = spans_broadcasts[0]
        assert data["type"] == "span"
        assert data["span"]["toolName"] == "Read"

    def test_logs_endpoint_does_not_broadcast_non_tool_events(self, client: TestClient):
        """POST /v1/logs with non-tool events does not broadcast to spans."""
        from pf.frame import app as app_module

        broadcast_calls: list[tuple[str, dict]] = []

        async def mock_broadcast(channel: str, data: dict) -> None:
            broadcast_calls.append((channel, data))

        with patch.object(app_module, "broadcast", mock_broadcast):
            payload = {
                "resourceLogs": [
                    {
                        "scopeLogs": [
                            {
                                "logRecords": [
                                    {
                                        "timeUnixNano": "1000000000000",
                                        "body": {"stringValue": "generic.log.event"},
                                        "attributes": [],
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
            response = client.post("/v1/logs", json=payload)
            assert response.status_code == 200

        spans_broadcasts = [(ch, d) for ch, d in broadcast_calls if ch == "spans"]
        assert len(spans_broadcasts) == 0


# ---------------------------------------------------------------------------
# AC6: fetch_spans returns accumulated OTEL data
# ---------------------------------------------------------------------------


class TestFetchSpansIntegration:
    """The ws_push fetch_spans function returns data from OTLPReceiver."""

    def test_fetch_spans_reflects_received_traces(self):
        """After processing traces, fetch_spans returns the accumulated spans."""
        from pf.frame.app import _receiver

        # Clear any prior state
        initial_count = len(_receiver.get_spans())

        _receiver.process_traces(_make_trace_payload(tool_name="Glob"))
        spans = _receiver.get_spans()
        assert len(spans) > initial_count
        assert any(s["toolName"] == "Glob" for s in spans)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases for trace parsing and span generation."""

    def test_trace_span_with_zero_duration(self):
        """A span with start == end has 0ms duration."""
        payload = _make_trace_payload(duration_ns=0)
        spans = parse_otlp_traces(payload)
        assert spans[0]["durationMs"] == 0

    def test_trace_span_with_very_long_duration(self):
        """Very long durations (minutes) are handled correctly."""
        payload = _make_trace_payload(duration_ns=120_000_000_000)  # 120 seconds
        spans = parse_otlp_traces(payload)
        assert spans[0]["durationMs"] == 120_000

    def test_trace_with_nested_scope_spans(self):
        """Multiple scopeSpans within a single resourceSpan are all processed."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "tool.Read",
                                    "startTimeUnixNano": "1000000000000",
                                    "endTimeUnixNano": "1000050000000",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Read"}},
                                    ],
                                }
                            ]
                        },
                        {
                            "spans": [
                                {
                                    "name": "tool.Write",
                                    "startTimeUnixNano": "2000000000000",
                                    "endTimeUnixNano": "2000100000000",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Write"}},
                                    ],
                                }
                            ]
                        },
                    ]
                }
            ]
        }
        spans = parse_otlp_traces(payload)
        assert len(spans) == 2

    def test_success_as_string_true(self):
        """Success attribute as string 'true' is handled."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "tool.Bash",
                                    "startTimeUnixNano": "1000000000000",
                                    "endTimeUnixNano": "1000050000000",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Bash"}},
                                        {"key": "success", "value": {"stringValue": "true"}},
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        spans = parse_otlp_traces(payload)
        assert spans[0]["success"] is True

    def test_malformed_timestamp_no_crash(self):
        """Non-numeric timestamps don't crash the parser."""
        payload = {
            "resourceSpans": [
                {
                    "scopeSpans": [
                        {
                            "spans": [
                                {
                                    "name": "tool.Bash",
                                    "startTimeUnixNano": "not-a-number",
                                    "endTimeUnixNano": "also-bad",
                                    "attributes": [
                                        {"key": "tool_name", "value": {"stringValue": "Bash"}},
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        # Should not raise
        spans = parse_otlp_traces(payload)
        assert len(spans) == 1
        assert spans[0]["toolName"] == "Bash"
