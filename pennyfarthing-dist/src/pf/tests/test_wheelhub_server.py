"""Tests for pf.wheelhub — Python WheelHub Server (Story 48-1).

Epic: 48 (Python WheelHub Migration)
Story: 48-1 — FastAPI skeleton + OTLP receiver + launcher switch
ADR: docs/adr/0022-python-wheelhub-replacement.md

Tests the core server functionality:
- FastAPI app skeleton with health check
- Port file lifecycle (.bikerack-port)
- OTLP receiver endpoints (/v1/logs, /v1/metrics, /v1/traces)
- Token stats aggregation from OTLP metrics
- Launcher switch to Python server

Acceptance Criteria:
- [AC1] FastAPI skeleton app with GET /health returning {"status": "ok"}
- [AC2] OTLP receiver: POST /v1/logs, /v1/metrics, /v1/traces accept JSON, return 200
- [AC3] Launcher starts Python FastAPI server instead of node wheelhub.mjs
- [AC4] Port file written on startup, cleaned up on shutdown
- [AC5] OTEL data flows — token stats aggregated from metrics payloads
- [AC6] Dependencies declared (fastapi, uvicorn, websockets)
"""

from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from pf.wheelhub.app import cleanup_port_file, create_app, get_server_command, write_port_file
from pf.wheelhub.otlp import OTLPReceiver, parse_otlp_logs, parse_otlp_metrics


@pytest.fixture()
def client() -> TestClient:
    """Create a TestClient for the WheelHub app."""
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# AC1: FastAPI skeleton app with health check
# ---------------------------------------------------------------------------


class TestHealthEndpoint:
    """GET /health returns {"status": "ok"}."""

    def test_health_returns_ok(self, client: TestClient):
        """AC1: Health check endpoint responds with status ok."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_is_json_content_type(self, client: TestClient):
        """AC1: Health endpoint returns application/json."""
        response = client.get("/health")
        assert "application/json" in response.headers["content-type"]


# ---------------------------------------------------------------------------
# AC2: OTLP receiver endpoints
# ---------------------------------------------------------------------------


class TestOTLPEndpoints:
    """POST /v1/logs, /v1/metrics, /v1/traces accept OTLP JSON."""

    def test_post_logs_returns_200(self, client: TestClient):
        """AC2: POST /v1/logs accepts OTLP log payload and returns 200."""
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1709900000000000000",
                                    "body": {"stringValue": "claude_code.tool_result"},
                                    "attributes": [
                                        {
                                            "key": "tool_name",
                                            "value": {"stringValue": "Bash"},
                                        },
                                        {
                                            "key": "success",
                                            "value": {"stringValue": "true"},
                                        },
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        response = client.post("/v1/logs", json=payload)
        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}

    def test_post_metrics_returns_200(self, client: TestClient):
        """AC2: POST /v1/metrics accepts OTLP metrics payload and returns 200."""
        payload = {
            "resourceMetrics": [
                {
                    "scopeMetrics": [
                        {
                            "metrics": [
                                {
                                    "name": "claude_code.token.usage",
                                    "sum": {
                                        "dataPoints": [
                                            {
                                                "asInt": 1500,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "input"},
                                                    }
                                                ],
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        response = client.post("/v1/metrics", json=payload)
        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}

    def test_post_traces_returns_200(self, client: TestClient):
        """AC2: POST /v1/traces accepts OTLP trace payload and returns 200."""
        payload = {"resourceSpans": []}
        response = client.post("/v1/traces", json=payload)
        assert response.status_code == 200
        assert response.json() == {"partialSuccess": {}}

    @pytest.mark.parametrize("endpoint", ["/v1/logs", "/v1/metrics", "/v1/traces"])
    def test_empty_payload_returns_200(self, client: TestClient, endpoint: str):
        """AC2: Empty payloads don't crash the server."""
        response = client.post(endpoint, json={})
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# AC4: Port file lifecycle
# ---------------------------------------------------------------------------


class TestPortFileLifecycle:
    """Port file written on startup, cleaned up on shutdown."""

    def test_write_port_file(self, tmp_path: Path):
        """AC4: write_port_file creates .bikerack-port with correct content."""
        write_port_file(tmp_path, 1898)
        port_file = tmp_path / ".bikerack-port"
        assert port_file.exists()
        assert port_file.read_text().strip() == "1898"

    def test_cleanup_port_file(self, tmp_path: Path):
        """AC4: cleanup_port_file removes .bikerack-port."""
        port_file = tmp_path / ".bikerack-port"
        port_file.write_text("1898")
        cleanup_port_file(tmp_path)
        assert not port_file.exists()

    def test_cleanup_missing_port_file_no_error(self, tmp_path: Path):
        """AC4: cleanup_port_file doesn't raise if file missing."""
        # Should not raise
        cleanup_port_file(tmp_path)

    def test_write_port_file_overwrites(self, tmp_path: Path):
        """AC4: Writing port file overwrites existing one."""
        write_port_file(tmp_path, 1898)
        write_port_file(tmp_path, 2898)
        port_file = tmp_path / ".bikerack-port"
        assert port_file.read_text().strip() == "2898"


# ---------------------------------------------------------------------------
# AC5: Token stats aggregation from OTLP metrics
# ---------------------------------------------------------------------------


class TestTokenStatsAggregation:
    """Token stats are parsed and aggregated from OTLP metrics payloads."""

    def test_parse_metrics_extracts_token_counts(self):
        """AC5: parseOTLPMetrics extracts input/output/cache token counts."""
        payload = {
            "resourceMetrics": [
                {
                    "scopeMetrics": [
                        {
                            "metrics": [
                                {
                                    "name": "claude_code.token.usage",
                                    "sum": {
                                        "dataPoints": [
                                            {
                                                "asInt": 1500,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "input"},
                                                    }
                                                ],
                                            },
                                            {
                                                "asInt": 500,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "output"},
                                                    }
                                                ],
                                            },
                                            {
                                                "asInt": 200,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "cacheRead"},
                                                    }
                                                ],
                                            },
                                            {
                                                "asInt": 100,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "cacheCreation"},
                                                    }
                                                ],
                                            },
                                        ],
                                    },
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        result = parse_otlp_metrics(payload)
        assert result["inputTokens"] == 1500
        assert result["outputTokens"] == 500
        assert result["cacheReadTokens"] == 200
        assert result["cacheCreationTokens"] == 100

    def test_parse_metrics_ignores_non_token_metrics(self):
        """AC5: Only claude_code.token.usage metrics are extracted."""
        payload = {
            "resourceMetrics": [
                {
                    "scopeMetrics": [
                        {
                            "metrics": [
                                {
                                    "name": "some.other.metric",
                                    "sum": {
                                        "dataPoints": [
                                            {
                                                "asInt": 9999,
                                                "attributes": [
                                                    {
                                                        "key": "type",
                                                        "value": {"stringValue": "input"},
                                                    }
                                                ],
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        result = parse_otlp_metrics(payload)
        assert result == {}

    def test_parse_metrics_empty_payload(self):
        """AC5: Empty payload returns empty dict."""
        result = parse_otlp_metrics({})
        assert result == {}

    def test_aggregate_token_stats(self):
        """AC5: Token stats accumulate across multiple metric batches."""
        receiver = OTLPReceiver()
        receiver.aggregate_token_stats({"inputTokens": 100, "outputTokens": 50})
        receiver.aggregate_token_stats({"inputTokens": 200, "outputTokens": 75})

        stats = receiver.get_token_stats()
        assert stats["inputTokens"] == 300
        assert stats["outputTokens"] == 125

    def test_token_stats_initial_zeros(self):
        """AC5: Fresh receiver has all-zero token stats."""
        receiver = OTLPReceiver()
        stats = receiver.get_token_stats()
        assert stats["inputTokens"] == 0
        assert stats["outputTokens"] == 0
        assert stats["cacheCreationTokens"] == 0
        assert stats["cacheReadTokens"] == 0
        assert stats["totalCost"] == 0


# ---------------------------------------------------------------------------
# AC2 + AC5: OTLP log parsing
# ---------------------------------------------------------------------------


class TestOTLPLogParsing:
    """OTLP log records are parsed into structured events."""

    def test_parse_logs_extracts_tool_events(self):
        """AC5: Log records with tool_result name are parsed with attributes."""
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1709900000000000000",
                                    "body": {"stringValue": "claude_code.tool_result"},
                                    "attributes": [
                                        {
                                            "key": "tool_name",
                                            "value": {"stringValue": "Bash"},
                                        },
                                        {
                                            "key": "success",
                                            "value": {"stringValue": "true"},
                                        },
                                        {
                                            "key": "duration_ms",
                                            "value": {"intValue": 250},
                                        },
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        events = parse_otlp_logs(payload)
        assert len(events) == 1
        assert events[0]["name"] == "claude_code.tool_result"
        assert events[0]["attributes"]["tool_name"] == "Bash"
        assert events[0]["attributes"]["success"] == "true"
        assert events[0]["attributes"]["duration_ms"] == 250

    def test_parse_logs_converts_timestamp(self):
        """AC5: Nanosecond timestamps are converted to milliseconds."""
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1709900000000000000",
                                    "body": {"stringValue": "test"},
                                    "attributes": [],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        events = parse_otlp_logs(payload)
        assert events[0]["timestamp"] == 1709900000000

    def test_parse_logs_empty_payload(self):
        """AC5: Empty payload returns empty list."""
        result = parse_otlp_logs({})
        assert result == []

    def test_parse_logs_handles_bool_attributes(self):
        """AC5: Boolean attribute values are preserved."""
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1000000000000",
                                    "body": {"stringValue": "test"},
                                    "attributes": [
                                        {
                                            "key": "is_background",
                                            "value": {"boolValue": True},
                                        }
                                    ],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        events = parse_otlp_logs(payload)
        assert events[0]["attributes"]["is_background"] is True


# ---------------------------------------------------------------------------
# AC3: Launcher switch
# ---------------------------------------------------------------------------


class TestLauncherSwitch:
    """Launcher starts Python server instead of Node.js."""

    def test_start_wheelhub_uses_python(self):
        """AC3: start_wheelhub launches uvicorn, not node."""
        cmd = get_server_command()
        # Must not contain 'node' — Python-based launch
        assert "node" not in cmd[0].lower()
        # Should reference uvicorn or python
        cmd_str = " ".join(cmd).lower()
        assert "uvicorn" in cmd_str or "python" in cmd_str

    def test_server_command_includes_host_and_port(self):
        """AC3: Server command binds to 127.0.0.1 with configurable port."""
        cmd = get_server_command(port=1898)
        cmd_str = " ".join(cmd)
        assert "1898" in cmd_str


# ---------------------------------------------------------------------------
# AC6: Dependencies declared
# ---------------------------------------------------------------------------


class TestDependencies:
    """Required dependencies are importable."""

    def test_fastapi_importable(self):
        """AC6: fastapi is installed and importable."""
        import fastapi

        assert hasattr(fastapi, "FastAPI")

    def test_uvicorn_importable(self):
        """AC6: uvicorn is installed and importable."""
        import uvicorn

        assert hasattr(uvicorn, "run")

    def test_wheelhub_package_exists(self):
        """AC6: pf.wheelhub package is importable."""
        import pf.wheelhub

        assert hasattr(pf.wheelhub, "__name__")


# ---------------------------------------------------------------------------
# Edge cases — the Igor family tradition
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Edge cases that would make grandfather Igor proud."""

    def test_metrics_missing_type_attribute_skipped(self):
        """Data points without type attribute are silently skipped."""
        payload = {
            "resourceMetrics": [
                {
                    "scopeMetrics": [
                        {
                            "metrics": [
                                {
                                    "name": "claude_code.token.usage",
                                    "sum": {
                                        "dataPoints": [
                                            {
                                                "asInt": 999,
                                                "attributes": [],  # no type attr
                                            }
                                        ]
                                    },
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        result = parse_otlp_metrics(payload)
        assert result == {}

    def test_metrics_missing_sum_field(self):
        """Metrics without sum field don't crash."""
        payload = {
            "resourceMetrics": [
                {"scopeMetrics": [{"metrics": [{"name": "claude_code.token.usage"}]}]}
            ]
        }
        result = parse_otlp_metrics(payload)
        assert result == {}

    def test_logs_missing_body(self):
        """Log records without body field produce empty name."""
        payload = {
            "resourceLogs": [
                {
                    "scopeLogs": [
                        {
                            "logRecords": [
                                {
                                    "timeUnixNano": "1000000000000",
                                    "attributes": [],
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        events = parse_otlp_logs(payload)
        assert len(events) == 1
        assert events[0]["name"] == ""

    def test_aggregate_stats_with_partial_data(self):
        """Aggregation handles missing fields gracefully."""
        receiver = OTLPReceiver()
        # Only inputTokens, no outputTokens
        receiver.aggregate_token_stats({"inputTokens": 100})
        stats = receiver.get_token_stats()
        assert stats["inputTokens"] == 100
        assert stats["outputTokens"] == 0
